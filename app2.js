const fs=require('fs');
const o=JSON.parse(fs.readFileSync('salida.json','utf8'));
const COPAS=(()=>{try{return JSON.parse(fs.readFileSync('dataCopas.json','utf8')).equipos||{};}catch(e){return {};}})();

// ---- payload compacto ----
const slim=x=>({
 id:x.id,n:x.nombre,eq:x.equipo,pos:x.pos,riv:x.rival,cond:x.condicion[0],
 ep:x.EP,epr:x.EPreal,pj_:x.pJuega,sc:x.score,fi:x.ficha,
 pvi:x.pVI,lg:x.lamGol,pfig:x.pFigura,ta:x.tasaTA,
 piso:x.piso,techo:x.techo,perf:x.perfil||'',pe:x.pisoEquipo||null,
 rot:x.rotacion||0,rotr:x.rotacionRival||0,nrot:x.notaRotacion||'',
 pr:x.precio,ind:x.individual,me:x.miEquipo,er:x.elRival,
 met:x.miEquipoTotal,ert:x.elRivalTotal,an:x.anomalia,anr:x.anomaliaRival,
 des:(x.desglose||[]).map(d=>[d[0],+Number(d[1]).toFixed(2),d[2]]),
 lam:{f:x.lam.lamFor,c:x.lam.lamAgainst,w:x.lam.pWin,d:x.lam.pDraw,mk:x.lam.tieneMercado}
});
const D={ARQ:o.rankings.ARQ.map(slim),DEF:o.rankings.DEF.map(slim),VOL:o.rankings.VOL.map(slim),DEL:o.rankings.DEL.map(slim)};
const ESQ=o.esquema.todos.map(e=>({e:e.esquema,ids:e.once.map(x=>x.id)}));
const LIGA=o.liga, PRES=65000000;
const COP=Object.values(COPAS).map(c=>({eq:c.equipo,r:c.indiceRotacion,d:c.diasDescanso,det:c.detalle}));

// --- que mide cada puesto: aporte medio y cuanto SEPARA cada termino ---
const APORTES={};
['ARQ','DEF','VOL','DEL'].forEach(pos=>{
  const g=o.rankings[pos].filter(x=>x.pJuega>0.5);
  const term={};
  g.forEach(x=>x.desglose.forEach(d=>{(term[d[0]]=term[d[0]]||[]).push(d[1]);}));
  Object.keys(term).forEach(k=>{while(term[k].length<g.length)term[k].push(0);});
  const filas=Object.entries(term).map(([k,v])=>{
    const m=v.reduce((a,b)=>a+b,0)/v.length, sv=[...v].sort((a,b)=>a-b);
    const p10=sv[Math.floor(v.length*.1)], p90=sv[Math.floor(v.length*.9)];
    return {k,m:+m.toFixed(2),p10:+p10.toFixed(2),p90:+p90.toFixed(2),rango:+(p90-p10).toFixed(2)};
  });
  const sm=filas.reduce((a,b)=>a+Math.abs(b.m),0), sr=filas.reduce((a,b)=>a+b.rango,0);
  filas.forEach(f=>{f.pctPje=+(100*Math.abs(f.m)/sm).toFixed(1); f.pctSep=+(100*f.rango/sr).toFixed(1);});
  filas.sort((a,b)=>b.pctSep-a.pctSep);
  const eps=g.map(x=>x.EP).sort((a,b)=>a-b);
  APORTES[pos]={n:g.length, filas, epMedio:+(eps.reduce((a,b)=>a+b,0)/eps.length).toFixed(2),
    epP10:+eps[Math.floor(eps.length*.1)].toFixed(2), epP90:+eps[Math.floor(eps.length*.9)].toFixed(2)};
});

// --- precio vs puntos: tramos, gangas y caros que no rinden ---
const TIT=['ARQ','DEF','VOL','DEL'].flatMap(p=>o.rankings[p]).filter(x=>x.precio!=null&&x.pJuega>0.5);
const corr=(a,b)=>{const n=a.length,ma=a.reduce((x,y)=>x+y,0)/n,mb=b.reduce((x,y)=>x+y,0)/n;
 let sa=0,sb=0,sab=0;for(let i=0;i<n;i++){sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2;sab+=(a[i]-ma)*(b[i]-mb);}return sab/Math.sqrt(sa*sb);};
const CORRS={}; ['ARQ','DEF','VOL','DEL'].forEach(pos=>{const g=TIT.filter(x=>x.pos===pos);
  CORRS[pos]= g.length>12 ? +corr(g.map(x=>x.precio),g.map(x=>x.EP)).toFixed(3) : null;});
const TRAMOS=[[0,1e6],[1e6,2e6],[2e6,3.5e6],[3.5e6,5e6],[5e6,99e6]].map(([a,b])=>{
  const g=TIT.filter(x=>x.precio>=a&&x.precio<b);
  return {a,b,n:g.length, ep:g.length?+(g.reduce((s,x)=>s+x.EPreal,0)/g.length).toFixed(2):0};
}).filter(t=>t.n);
const GANGAS=TIT.filter(x=>x.EPreal>=5).map(x=>({n:x.nombre,eq:x.equipo,pos:x.pos,pr:x.precio,ep:x.EPreal,
  vpm:+(x.EPreal/(x.precio/1e6)).toFixed(2)})).sort((a,b)=>b.vpm-a.vpm).slice(0,10);
const CAROS=TIT.filter(x=>x.precio>=5e6).sort((a,b)=>a.EPreal-b.EPreal).slice(0,8)
  .map(x=>({n:x.nombre,eq:x.equipo,pos:x.pos,pr:x.precio,ep:x.EPreal,
            pu:o.rankings[x.pos].findIndex(y=>y.id===x.id)+1, tot:o.rankings[x.pos].length}));

const html=`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gran DT · Analizador</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--plane:#f9f9f7;--ink:#0b0b0b;--ink2:#52514e;--mut:#898781;
--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10);--hov:#f0efec;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--good:#0ca30c;--crit:#d03b3b;--warn:#fab219;--seq:#256abf}
@media(prefers-color-scheme:dark){:root:where(:not([data-theme=light])){color-scheme:dark;--surface:#1a1a19;--plane:#0d0d0d;
--ink:#fff;--ink2:#c3c2b7;--mut:#898781;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);--hov:#262624;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--seq:#3987e5}}
*{box-sizing:border-box}
body{margin:0;background:var(--plane);color:var(--ink);font:14.5px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:22px 18px 70px}
h1{font-size:23px;margin:0 0 2px;letter-spacing:-.02em}
.sub{color:var(--ink2);margin:0 0 20px;font-size:13.5px}
h2{font-size:16px;margin:30px 0 4px;letter-spacing:-.01em}
.note{color:var(--ink2);font-size:12.8px;margin:0 0 12px;max-width:78ch}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:12px}
.pad{padding:14px 16px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}
.tile{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:12px 14px}
.tile .k{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
.tile .v{font-size:25px;font-weight:650;letter-spacing:-.02em;margin-top:2px}
.tile .v small{font-size:13px;font-weight:500;color:var(--ink2)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
button,select,input{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--ring);border-radius:8px;padding:6px 12px;cursor:pointer}
input{cursor:text;min-width:200px}
button:hover,select:hover{background:var(--hov)}
button.on{background:var(--s1);color:#fff;border-color:transparent}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--grid);white-space:nowrap;cursor:pointer;user-select:none}
th:hover{color:var(--ink)}
td{padding:8px 10px;border-bottom:1px solid var(--grid);vertical-align:middle}
tbody tr{cursor:pointer}
tbody tr:hover{background:var(--hov)}
tbody tr.sel{background:var(--hov);box-shadow:inset 3px 0 0 var(--s1)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rk{color:var(--mut);width:32px;font-variant-numeric:tabular-nums}
.eq{color:var(--ink2);font-size:12px}
.mut{color:var(--mut);font-size:12px}
.bar{display:block;height:5px;border-radius:0 3px 3px 0;background:var(--seq);margin-top:4px;margin-left:auto}
.tag{display:inline-block;font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:999px;white-space:nowrap;border:1px solid var(--ring)}
.t3{color:var(--s3)}.t1{color:var(--s1)}.t2{color:var(--s2)}.t0{color:var(--mut)}
.warnp{color:var(--crit);font-weight:600}
#detalle{position:sticky;top:14px}
.grid2{display:grid;grid-template-columns:1.35fr .95fr;gap:16px;align-items:start}
@media(max-width:980px){.grid2{grid-template-columns:1fr}#detalle{position:static}}
.dt h3{margin:0 0 2px;font-size:16px;letter-spacing:-.01em}
.dt .who{color:var(--ink2);font-size:12.5px;margin-bottom:12px}
.blk{margin-top:14px}
.blk .bt{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:600;margin-bottom:5px}
.kv{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:13px}
.kv .k{color:var(--ink2)}
.kv .v{text-align:right;font-variant-numeric:tabular-nums;font-weight:550}
.kv .sep{grid-column:1/-1;height:1px;background:var(--grid);margin:5px 0}
.ep td:first-child{color:var(--ink2)}
table.ep{font-size:12.8px}
table.ep td{padding:4px 0;border:0}
table.ep tr.tot td{border-top:1px solid var(--grid);padding-top:6px;font-weight:650}
ol.once{list-style:none;margin:0;padding:0}
ol.once li{display:grid;grid-template-columns:40px 1fr auto auto 30px;gap:9px;align-items:center;padding:7px 12px;border-bottom:1px solid var(--grid)}
ol.once li:last-child{border-bottom:0}
.pos{font-size:10px;font-weight:700;letter-spacing:.05em;color:var(--mut)}
.cap{background:var(--s1);color:#fff;font-size:9.5px;font-weight:700;border-radius:4px;padding:1px 5px;margin-left:4px}
.sw{background:none;border:0;color:var(--mut);font-size:15px;padding:2px 6px;line-height:1}
.sw:hover{color:var(--s1);background:none}
.ep2{font-variant-numeric:tabular-nums;font-weight:600;min-width:44px;text-align:right}
.pz{font-variant-numeric:tabular-nums;font-size:12px;color:var(--ink2);min-width:74px;text-align:right}
dialog{border:1px solid var(--ring);border-radius:14px;background:var(--surface);color:var(--ink);padding:0;max-width:640px;width:94%}
dialog::backdrop{background:rgba(0,0,0,.45)}
dialog .dh{padding:14px 18px;border-bottom:1px solid var(--grid);display:flex;justify-content:space-between;align-items:center}
dialog .db{max-height:60vh;overflow:auto}
.meter{height:7px;background:var(--grid);border-radius:4px;overflow:hidden;margin-top:6px}
.meter i{display:block;height:100%;background:var(--s3);border-radius:4px}
.meter.over i{background:var(--crit)}
footer{color:var(--mut);font-size:12px;margin-top:36px;border-top:1px solid var(--grid);padding-top:14px;max-width:78ch}
</style></head><body><div class="wrap">

<h1>Gran DT · Analizador</h1>
<p class="sub">Fecha 6 · 636 jugadores · puntos esperados si juega. Hacé clic en cualquier jugador para ver su ficha completa.</p>

<div class="tiles">
<div class="tile"><div class="k">Esquema</div><div class="v" id="t-esq">–</div></div>
<div class="tile"><div class="k">Puntos esperados</div><div class="v" id="t-pts">–</div></div>
<div class="tile"><div class="k">Costo del once</div><div class="v" id="t-cost">–</div><div class="meter" id="t-meter"><i style="width:0"></i></div></div>
<div class="tile"><div class="k">Capitán</div><div class="v" id="t-cap" style="font-size:15px;line-height:1.35;padding-top:6px">–</div></div>
</div>

<h2>Mi equipo</h2>
<p class="note">Cambiá el esquema o tocá el ⇅ de cualquier jugador para reemplazarlo. El total se recalcula solo. Ni el precio ni la chance de jugar penalizan a nadie: van al costado como dato, y la decisión es tuya.</p>
<div class="row">
  <select id="sel-esq"></select>
  <button id="btn-reset">Volver al recomendado</button>
  <span class="mut" id="lbl-dif"></span>
</div>
<div class="card"><ol class="once" id="once"></ol></div>

<h2>Fixture de la fecha</h2>
<p class="note">La mitad izquierda es <b>mercado real</b>: promedio de todas las casas con el margen ya descontado (la casa se queda con 10,5% en promedio). La mitad derecha es <b>calculo nuestro</b>, no precios de mercado: la cuota de "gol de tal equipo" no existe en el plan gratis de la API, asi que la probabilidad se resuelve con un Poisson ajustado contra el 1X2 y el Over/Under sin margen. La cuota entre parentesis es la equivalente a esa probabilidad, para que la compares con lo que veas en una casa.</p>
<div class="card" style="overflow-x:auto"><table id="tb-fix"><thead>
<tr><th rowspan="2">Partido</th><th colspan="4" style="text-align:center;border-left:1px solid var(--grid)">Mercado</th><th colspan="4" style="text-align:center;border-left:1px solid var(--grid)">Calculado</th></tr>
<tr><th class="num" style="border-left:1px solid var(--grid)">1</th><th class="num">X</th><th class="num">2</th><th class="num">O/U</th>
<th class="num" style="border-left:1px solid var(--grid)">Goles esp.</th><th class="num">P(gol)</th><th class="num">P(valla)</th><th class="num">Tiros</th></tr>
</thead><tbody id="tb-fix-b"></tbody></table></div>

<h2>Rankings</h2>
<div class="row">
  <button class="tab on" data-p="ARQ">Arqueros</button>
  <button class="tab" data-p="DEF">Defensores</button>
  <button class="tab" data-p="VOL">Volantes</button>
  <button class="tab" data-p="DEL">Delanteros</button>
  <input id="q" placeholder="Buscar jugador o equipo…">

</div>
<div class="grid2">
  <div class="card" style="overflow-x:auto"><table id="tabla"><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>
  <div class="card pad dt" id="detalle"><div class="mut">Elegí un jugador de la lista para ver su ficha.</div></div>
</div>

<h2>Qué mide cada puesto</h2>
<p class="note">No hay pesos configurados a mano. El puntaje es la suma de los términos del reglamento, cada uno en puntos. Lo que sigue son <b>dos porcentajes distintos que no hay que confundir</b>: cuánto <i>aporta</i> cada término al puntaje, y cuánto <i>separa</i> a un jugador de otro. La ficha aporta el 70-83% de los puntos pero casi no decide nada, porque es parecida en todos. Lo que decide es lo que más varía.</p>
<div class="row" id="tabs-ap">
  <button class="tabap on" data-p="ARQ">Arqueros</button>
  <button class="tabap" data-p="DEF">Defensores</button>
  <button class="tabap" data-p="VOL">Volantes</button>
  <button class="tabap" data-p="DEL">Delanteros</button>
</div>
<div class="card" style="overflow-x:auto"><table><thead><tr>
  <th>Término</th><th class="num">Aporte medio</th><th class="num">% del puntaje</th>
  <th class="num">Va de … a …</th><th class="num">% de lo que separa</th><th style="width:150px"></th>
</tr></thead><tbody id="tb-ap"></tbody></table></div>
<p class="note" id="ap-nota" style="margin-top:10px"></p>

<h2>El precio no compra puntos</h2>
<p class="note">El presupuesto no ordena ni filtra nada acá: el precio es información, nunca una penalización. Esto está para una sola cosa — <b>que no pagues por el nombre</b>. Medido sobre los titulares de esta fecha, la correlación entre precio y puntos esperados es <b>${CORRS.DEF} en defensores, ${CORRS.DEL} en delanteros, ${CORRS.ARQ} en arqueros y ${CORRS.VOL} en volantes</b>. Prácticamente cero. Un jugador del tramo más caro rinde <b>${(TRAMOS[TRAMOS.length-1].ep-TRAMOS[0].ep).toFixed(2)} puntos</b> más que uno del tramo más barato, a cinco veces el precio.</p>
<div class="grid2">
 <div class="card" style="overflow-x:auto"><table><thead><tr><th>Tramo de precio</th><th class="num">Jugadores</th><th class="num">Puntos esperados</th><th></th></tr></thead><tbody id="tb-tramos"></tbody></table></div>
 <div class="card pad"><div class="bt" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:600;margin-bottom:8px">Los caros que esta fecha no rinden</div><table id="tb-caros"></table></div>
</div>
<h2>Quién llega cansado</h2>
<p class="note">Equipos que jugaron copa entre semana. Sus jugadores bajan la chance de ser titulares; los del rival suben. Las magnitudes del ajuste son un supuesto declarado, no una medición.</p>
<div class="card" style="overflow-x:auto"><table><thead><tr><th>Equipo</th><th class="num">Descanso</th><th class="num">Rotación</th><th>Compromiso</th></tr></thead><tbody id="tb-copas"></tbody></table></div>

<dialog id="dlg"><div class="dh"><b id="dlg-t">Cambiar jugador</b><button onclick="document.getElementById('dlg').close()">Cerrar</button></div><div class="db"><table><tbody id="dlg-b"></tbody></table></div></dialog>

<footer>
Fuentes: Planeta Gran DT (planilla oficial, fecha 5) · 365Scores (tiros, xG y minutos individuales de 75 partidos) · the-odds-api (1X2 y Over/Under, promedio de casas, sin margen) · ESPN (fixture, tabla y calendario de copas).
Efecto de localía medido sobre los 75 partidos: de local se generan <b>${LIGA.locTiros.toFixed(1)} tiros y ${LIGA.locXg.toFixed(2)} xG</b> por partido; de visitante, <b>${LIGA.visTiros.toFixed(1)} y ${LIGA.visXg.toFixed(2)}</b>.
</footer>
</div>

<script>
const D=${JSON.stringify(D)};
const ESQ=${JSON.stringify(ESQ)};
const COP=${JSON.stringify(COP)};
const TRAMOS=${JSON.stringify(TRAMOS)}, GANGAS=${JSON.stringify(GANGAS)}, CAROS=${JSON.stringify(CAROS)};
const APORTES=${JSON.stringify(APORTES)};
const PARTIDOS=${JSON.stringify(o.partidos)};
const PRES=${PRES};
const TODOS={}; ['ARQ','DEF','VOL','DEL'].forEach(p=>D[p].forEach(x=>TODOS[x.id]=x));

const n1=v=>v==null?'–':Number(v).toFixed(1);
const n2=v=>v==null?'–':Number(v).toFixed(2);
const n3=v=>v==null?'–':Number(v).toFixed(3);
const pc=v=>v==null?'–':(v*100).toFixed(0)+'%';
const pl=v=>v==null?'s/d':'$ '+Number(v).toLocaleString('es-AR');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- MI EQUIPO ---------- */
let esqActual=ESQ[0].e, once=[...ESQ[0].ids], capId=null;
const cuentaPos=e=>{const [a,d,v,l]=e.split('-').map(Number);return {ARQ:a,DEF:d,VOL:v,DEL:l};};
function recalcCap(){ let mejor=null; once.forEach(id=>{const p=TODOS[id]; if(!p)return; const val=p.fi*p.pj_; if(!mejor||val>mejor.v) mejor={id,v:val};}); capId=mejor?mejor.id:null; }
function totalEquipo(){ let t=0; once.forEach(id=>{const p=TODOS[id]; if(p) t+=p.epr;}); const c=TODOS[capId]; if(c) t+=c.fi*c.pj_; return t; }
function costoEquipo(){ let c=0,sinDato=0; once.forEach(id=>{const p=TODOS[id]; if(!p)return; if(p.pr==null) sinDato++; else c+=p.pr;}); return {c,sinDato}; }

function pintarOnce(){
  recalcCap();
  const cont=document.getElementById('once');
  const orden={ARQ:0,DEF:1,VOL:2,DEL:3};
  const lista=once.map(id=>TODOS[id]).filter(Boolean).sort((a,b)=>orden[a.pos]-orden[b.pos]||b.epr-a.epr);
  cont.innerHTML=lista.map((p,i)=>\`<li>
    <span class="pos">\${p.pos}</span>
    <span><b>\${esc(p.n)}</b>\${p.id===capId?'<span class="cap">C</span>':''}
      <span class="eq">\${esc(p.eq)} \${p.cond} vs \${esc(p.riv)}</span>\${p.rot>0?' <span class="tag t2">copa</span>':''}</span>
    <span class="pz">\${pl(p.pr)}</span>
    <span class="ep2">\${n2(p.epr)}</span>
    <button class="sw" title="Cambiar" onclick="abrirCambio('\${p.id}')">⇅</button></li>\`).join('');

  const t=totalEquipo(); const {c,sinDato}=costoEquipo();
  document.getElementById('t-esq').textContent=esqActual;
  document.getElementById('t-pts').innerHTML=n1(t)+' <small>pts</small>';
  // El presupuesto es informativo. Nunca ordena, nunca filtra, nunca penaliza.
  document.getElementById('t-cost').innerHTML=(c?('$'+(c/1e6).toFixed(1)+'M'):'s/d')
    +' <small>de $65M'+(c<=PRES?' · te sobran $'+((PRES-c)/1e6).toFixed(1)+'M':' · te pasás por $'+((c-PRES)/1e6).toFixed(1)+'M')+'</small>'
    +(sinDato?' <small>('+sinDato+' sin cotización)</small>':'');
  const m=document.getElementById('t-meter'); m.className='meter';
  m.firstElementChild.style.width=Math.min(100,100*c/PRES)+'%';
  const cap=TODOS[capId];
  document.getElementById('t-cap').innerHTML=cap?esc(cap.n.split(',')[0])+'<br><small>ficha '+n2(cap.fi)+'</small>':'–';
  const base=ESQ.find(e=>e.e===esqActual);
  let tb=0; if(base){const guardo=[...once],gc=capId; once=[...base.ids]; recalcCap(); tb=totalEquipo(); once=guardo; capId=gc;}
  const dif=t-tb;
  document.getElementById('lbl-dif').textContent = Math.abs(dif)<0.01?'':(dif>0?'+':'')+n2(dif)+' pts vs el recomendado';
}
window.abrirCambio=function(id){
  const p=TODOS[id]; if(!p)return;
  document.getElementById('dlg-t').textContent='Cambiar a '+p.n+' — ordenado por puntos esperados';
  const cand=D[p.pos].filter(x=>!once.includes(x.id)||x.id===id).slice(0,60);
  document.getElementById('dlg-b').innerHTML=cand.map(x=>
    \`<tr onclick="hacerCambio('\${id}','\${x.id}')">
      <td><b>\${esc(x.n)}</b><br><span class="eq">\${esc(x.eq)} \${x.cond} vs \${esc(x.riv)}</span></td>
      <td class="num mut">\${pl(x.pr)}</td>
      <td class="num"><b>\${n2(x.epr)}</b></td></tr>\`).join('');
  document.getElementById('dlg').showModal();
};
window.hacerCambio=function(viejo,nuevo){ const i=once.indexOf(viejo); if(i>=0) once[i]=nuevo; document.getElementById('dlg').close(); pintarOnce(); };
document.getElementById('btn-reset').onclick=()=>{const b=ESQ.find(e=>e.e===esqActual); once=[...b.ids]; pintarOnce();};
const selE=document.getElementById('sel-esq');
selE.innerHTML=ESQ.map(e=>'<option value="'+e.e+'">'+e.e+'</option>').join('');
selE.onchange=()=>{esqActual=selE.value; const b=ESQ.find(e=>e.e===esqActual); once=[...b.ids]; pintarOnce();};

/* ---------- RANKINGS ---------- */
let posAct='ARQ', ordCol='sc', ordDir=-1, selId=null;
const COLS={
 ARQ:[['#','','rk'],['Arquero','n',''],['Valla invicta','pvi','num'],['xG que le hacen','lamc','num'],['Juega','pj_','num'],['Precio','pr','num'],['Pts esp.','ep','num']],
 DEF:[['#','','rk'],['Defensor','n',''],['Perfil','perf',''],['Valla','pvi','num'],['Tiros','tiros','num'],['xG','xg','num'],['Juega','pj_','num'],['Precio','pr','num'],['Pts esp.','ep','num']],
 VOL:[['#','','rk'],['Volante','n',''],['Tiros','tiros','num'],['xG','xg','num'],['Piso','piso','num'],['Techo','techo','num'],['Juega','pj_','num'],['Precio','pr','num'],['Pts esp.','ep','num']],
 DEL:[['#','','rk'],['Delantero','n',''],['Tiros','tiros','num'],['xG','xg','num'],['Piso','piso','num'],['Techo','techo','num'],['Juega','pj_','num'],['Precio','pr','num'],['Pts esp.','ep','num']]
};
const val=(x,k)=>k==='tiros'?(x.ind?x.ind.tirosPorPartido:0):k==='xg'?(x.ind?x.ind.xgPorPartido:0)
  :k==='lamc'?-x.lam.c:k===''?x.sc:x[k];
function celda(x,k,i){
  if(k==='') return i+1;
  if(k==='n') return '<b>'+esc(x.n)+'</b><br><span class="eq">'+esc(x.eq)+' '+x.cond+' vs '+esc(x.riv)+'</span>'+(x.rot>0?' <span class="tag t2">copa</span>':'')+(x.rotr>0?' <span class="tag t3">rival de copa</span>':'');
  if(k==='perf'){const c=x.perf.startsWith('SÓLIDO +')?'t3':x.perf==='SÓLIDO'?'t1':x.perf==='RIESGO GOLEADOR'?'t2':'t0';return '<span class="tag '+c+'">'+esc(x.perf)+'</span>';}
  if(k==='pvi') return pc(x.pvi);
  if(k==='pj_') return pc(x.pj_);
  if(k==='pr') return pl(x.pr);
  if(k==='lamc') return n2(x.lam.c);
  if(k==='tiros') return x.ind?n1(x.ind.tirosPorPartido):'–';
  if(k==='xg') return x.ind?n3(x.ind.xgPorPartido):'–';
  if(k==='ep') return '<b>'+n2(x.ep)+'</b>';
  return n2(x[k]);
}
function pintarTabla(){
  const cols=COLS[posAct], q=document.getElementById('q').value.toLowerCase().trim();
  let lista=D[posAct].filter(x=>!q||x.n.toLowerCase().includes(q)||x.eq.toLowerCase().includes(q));
  // ordDir = -1 -> de mayor a menor
  lista=[...lista].sort((a,b)=>{const va=val(a,ordCol),vb=val(b,ordCol);
    if(typeof va==='string') return -ordDir*String(va).localeCompare(String(vb));
    return ordDir*((va??-1e9)-(vb??-1e9));});
  document.getElementById('thead').innerHTML='<tr>'+cols.map(c=>'<th class="'+c[2]+'" data-k="'+c[1]+'">'+c[0]+'</th>').join('')+'</tr>';
  document.getElementById('thead').querySelectorAll('th').forEach(th=>th.onclick=()=>{
    const k=th.dataset.k; if(!k)return; if(ordCol===k) ordDir*=-1; else {ordCol=k;ordDir=-1;} pintarTabla();});
  document.getElementById('tbody').innerHTML=lista.slice(0,80).map((x,i)=>
    '<tr class="'+(x.id===selId?'sel':'')+'" onclick="verDetalle(\\''+x.id+'\\')">'+cols.map(c=>'<td class="'+c[2]+'">'+celda(x,c[1],i)+'</td>').join('')+'</tr>').join('');
}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(z=>z.classList.remove('on')); b.classList.add('on');
  posAct=b.dataset.p; ordCol='sc'; ordDir=-1; pintarTabla();});
document.getElementById('q').oninput=pintarTabla;

/* ---------- FICHA DEL JUGADOR ---------- */
function fila(k,v,extra){return '<div class="k">'+k+(extra?' <span class="mut">'+extra+'</span>':'')+'</div><div class="v">'+v+'</div>';}
window.verDetalle=function(id){
  selId=id; const x=TODOS[id]; if(!x)return; pintarTabla();
  const I=x.ind||{}, ME=x.me||{}, ER=x.er||{}, MT=x.met||{}, ET=x.ert||{};
  const cond=x.cond==='L'?'de local':'de visitante';
  const condR=x.cond==='L'?'de visitante':'de local';
  const epTab='<table class="ep">'+x.des.filter(d=>!(x.pos==='ARQ'&&d[0]==='Gol propio')).map(d=>'<tr><td>'+esc(d[0])+'</td><td class="num"><b>'+(d[1]>0?'+':'')+n2(d[1])+'</b></td></tr><tr><td colspan="2" class="mut" style="padding-top:0;padding-bottom:6px">'+esc(d[2])+'</td></tr>').join('')
   +'<tr class="tot"><td>Puntos esperados</td><td class="num">'+n2(x.ep)+'</td></tr>'
   +'<tr><td class="mut">× '+pc(x.pj_)+' de chance de jugar</td><td class="num"><b>'+n2(x.epr)+'</b></td></tr></table>';

  document.getElementById('detalle').innerHTML=
   '<h3>'+esc(x.n)+'</h3>'
  +'<div class="who">'+esc(x.eq)+' · '+(x.cond==='L'?'Local':'Visitante')+' vs '+esc(x.riv)+' · '+pl(x.pr)+(x.nrot?' <br><span class="tag t2">'+esc(x.nrot)+'</span>':'')+'</div>'
  +'<div class="blk"><div class="bt">Puntaje esperado, término por término</div>'+epTab+'</div>'
  +'<div class="blk"><div class="bt">El jugador</div><div class="kv">'
    +fila('Ficha Clarín limpia',n2(x.fi))
    +fila('Tiros',(I.tiros||0)+' <span class="mut">('+n1(I.tirosPorPartido)+'/p)</span>')
    +fila('xG generado',n2(I.xg)+' <span class="mut">('+n3(I.xgPorPartido)+'/p)</span>')
    +fila('Goles esperados esta fecha',n3(x.lg))
    +fila('Goles / figuras',(I.goles||0)+' / '+(I.figuras||0))
    +fila('Vallas invictas',(I.vallas||0)+' en '+(I.pj||0)+' PJ')
    +fila('Amarillas / rojas',(I.amarillas||0)+' / '+(I.rojas||0))
    +fila('Minutos',(I.minutos||0)+' <span class="mut">('+(I.minutosPorPartido||0)+'/p)</span>')
    +fila('Titularidad',I.titularidad!=null?pc(I.titularidad):'–')
    +fila('Chance de jugar',pc(x.pj_))
  +'</div></div>'
  +'<div class="blk"><div class="bt">Su equipo '+cond+'</div><div class="kv">'
    +fila('Tiros generados',n1(ME.tiros),'(total '+n1(MT.tiros)+')')
    +fila('Tiros concedidos',n1(ME.tirosConcedidos),'(total '+n1(MT.tirosConcedidos)+')')
    +fila('xG generado',n2(ME.xg),'(total '+n2(MT.xg)+')')
    +fila('xG concedido',n2(ME.xgConcedido),'(total '+n2(MT.xgConcedido)+')')
    +'<div class="sep"></div>'
    +fila('Depende de la localía',x.an?((x.an.ataque>0?'+':'')+n2(x.an.ataque)+' xG'):'–','vs el promedio de la liga')
  +'</div></div>'
  +'<div class="blk"><div class="bt">El rival ('+esc(x.riv)+') '+condR+'</div><div class="kv">'
    +fila('Tiros generados',n1(ER.tiros),'(total '+n1(ET.tiros)+')')
    +fila('Tiros concedidos',n1(ER.tirosConcedidos),'(total '+n1(ET.tirosConcedidos)+')')
    +fila('xG generado',n2(ER.xg),'(total '+n2(ET.xg)+')')
    +fila('xG concedido',n2(ER.xgConcedido),'(total '+n2(ET.xgConcedido)+')')
    +'<div class="sep"></div>'
    +fila('Depende de la localía',x.anr?((x.anr.ataque>0?'+':'')+n2(x.anr.ataque)+' xG'):'–','vs el promedio de la liga')
  +'</div></div>'
  +'<div class="blk"><div class="bt">El partido</div><div class="kv">'
    +fila('Goles esperados de su equipo',n2(x.lam.f))
    +fila('Goles esperados del rival',n2(x.lam.c))
    +fila('Probabilidad de valla invicta',pc(x.pvi))
    +fila('Gana / empata',pc(x.lam.w)+' / '+pc(x.lam.d))
    +fila('Fuente',x.lam.mk?'mercado + xG + goles reales':'xG + goles reales <span class="mut">(sin cuotas)</span>')
  +'</div></div>';
};

/* ---------- FIXTURE ---------- */
const dia=iso=>{const d=new Date(iso);return d.toLocaleDateString('es-AR',{weekday:'short',day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});};
document.getElementById('tb-fix-b').innerHTML=PARTIDOS.map(m=>{
  const rl=m.rotacionLocal>0?' <span class="tag t2">copa</span>':'';
  const rv=m.rotacionVisitante>0?' <span class="tag t2">copa</span>':'';
  const bl='style="border-left:1px solid var(--grid)"';
  return '<tr>'
   +'<td><b>'+esc(m.local)+'</b>'+rl+'<br><b>'+esc(m.visitante)+'</b>'+rv+'<br><span class="mut">'+dia(m.cuando)+'</span></td>'
   +'<td class="num" '+bl+'>'+n2(m.cuotaLocal)+'<br><span class="mut">'+pc(m.probLocal)+'</span></td>'
   +'<td class="num">'+n2(m.cuotaEmpate)+'<br><span class="mut">'+pc(m.probEmpate)+'</span></td>'
   +'<td class="num">'+n2(m.cuotaVisitante)+'<br><span class="mut">'+pc(m.probVisitante)+'</span></td>'
   +'<td class="num mut">'+(m.lineaTotales!=null?('+'+m.lineaTotales+'<br>'+(m.probOver!=null?pc(m.probOver)+' over':'-')):'-')+'</td>'
   +'<td class="num" '+bl+'>'+n2(m.golesEsperadosLocal)+'<br>'+n2(m.golesEsperadosVisitante)+'</td>'
   +'<td class="num">'+pc(m.pGolLocal)+' <span class="mut">('+n2(m.cuotaGolLocalEstimada)+')</span><br>'+pc(m.pGolVisitante)+' <span class="mut">('+n2(m.cuotaGolVisitanteEstimada)+')</span></td>'
   +'<td class="num"><b>'+pc(m.pVallaLocal)+'</b><br><b>'+pc(m.pVallaVisitante)+'</b></td>'
   +'<td class="num mut">'+(m.tirosLocal!=null?n1(m.tirosLocal):'-')+'<br>'+(m.tirosVisitante!=null?n1(m.tirosVisitante):'-')+'</td>'
   +'</tr>';}).join('');

/* ---------- QUE MIDE CADA PUESTO ---------- */
const NOTAS={
 ARQ:'En el arquero, <b>los goles recibidos y la valla invicta juntos son el 61% de lo que separa</b> a un arquero de otro, aunque sean apenas el 27% de los puntos. La ficha aporta casi el 70% del puntaje y decide un cuarto. Por eso el ranking de arqueros se ordena por probabilidad de valla invicta y nada más.',
 DEF:'En el defensor la ficha aporta tres cuartos de los puntos pero solo un tercio de la diferencia. <b>El gol propio, que es apenas el 5% del puntaje, decide casi el 30%</b> — es el término más volátil del puesto. Y ojo con esto: <b>las tarjetas separan más que la valla invicta</b> (19,1% contra 18,3%). Un defensor que se hace amonestar seguido pierde más de lo que gana con la valla.',
 VOL:'El volante vive del gol: aporta el 7% de los puntos y <b>decide el 38%</b>. Es el término que más manda de las cuatro posiciones. Las tarjetas pesan casi un cuarto. Por eso el volante es el puesto más de todo o nada.',
 DEL:'El delantero es el caso más extremo: <b>el gol decide el 41%</b> de la diferencia con menos del 10% de los puntos. Acá el ranking es, básicamente, quién tiene más chances de convertir.'
};
let apAct='ARQ';
function pintarAportes(){
  const A=APORTES[apAct], maxSep=Math.max(...A.filas.map(f=>f.pctSep));
  document.getElementById('tb-ap').innerHTML=A.filas.map(f=>
   '<tr><td>'+esc(f.k)+'</td><td class="num">'+(f.m>0?'+':'')+n2(f.m)+'</td><td class="num">'+n1(f.pctPje)+'%</td>'
   +'<td class="num mut">'+n2(f.p10)+' a '+n2(f.p90)+'</td><td class="num"><b>'+n1(f.pctSep)+'%</b></td>'
   +'<td><span class="bar" style="width:'+Math.round(100*f.pctSep/maxSep)+'%;margin-left:0"></span></td></tr>').join('')
   +'<tr><td><b>Puntaje esperado</b></td><td class="num"><b>'+n2(A.epMedio)+'</b></td><td class="num">100%</td>'
   +'<td class="num mut">'+n2(A.epP10)+' a '+n2(A.epP90)+'</td><td class="num">100%</td><td></td></tr>';
  document.getElementById('ap-nota').innerHTML=NOTAS[apAct]+' <span class="mut">(medido sobre '+A.n+' titulares de la fecha)</span>';
}
document.querySelectorAll('.tabap').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabap').forEach(z=>z.classList.remove('on')); b.classList.add('on');
  apAct=b.dataset.p; pintarAportes();});
pintarAportes();

/* ---------- PRECIO ---------- */
const maxEpT=Math.max(...TRAMOS.map(t=>t.ep));
document.getElementById('tb-tramos').innerHTML=TRAMOS.map(t=>
 '<tr><td>'+pl(t.a).replace('$ ','$')+' a '+pl(t.b).replace('$ ','$')+'</td><td class="num">'+t.n+'</td><td class="num"><b>'+n2(t.ep)+'</b></td>'
 +'<td style="width:120px"><span class="bar" style="width:'+Math.round(100*t.ep/maxEpT)+'%;margin-left:0"></span></td></tr>').join('');
document.getElementById('tb-caros').innerHTML=CAROS.map(c=>
 '<tr><td style="padding:5px 0;border-bottom:1px solid var(--grid)"><b>'+esc(c.n)+'</b> <span class="tag t0">'+c.pos+'</span><br><span class="eq">'+esc(c.eq)+' · puesto '+c.pu+' de '+c.tot+'</span></td>'
 +'<td class="num warnp" style="padding:5px 0;border-bottom:1px solid var(--grid)">'+pl(c.pr)+'<br><span class="mut">'+n2(c.ep)+' pts</span></td></tr>').join('');

/* ---------- COPAS ---------- */
document.getElementById('tb-copas').innerHTML=COP.sort((a,b)=>b.r-a.r).map(c=>
 '<tr><td>'+esc(c.eq)+'</td><td class="num">'+c.d+' días</td><td class="num"><b>'+Math.round(c.r*100)+'%</b></td><td class="mut">'+esc(c.det)+'</td></tr>').join('')
 ||'<tr><td colspan="4" class="mut">Sin datos de copas</td></tr>';

pintarOnce(); pintarTabla();
</script></body></html>`;
fs.writeFileSync('app2.html',html);
console.log('app2.html',(html.length/1024).toFixed(0)+' KB');
