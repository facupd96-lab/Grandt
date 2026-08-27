const fs=require('fs');
const o=JSON.parse(fs.readFileSync('salida.json','utf8'));
const S=JSON.parse(fs.readFileSync('data365.json','utf8'));
const R=o.rankings, E=o.esquema.optimo;

// xG por equipo a la fecha 5 (xgscore.io) — GC real vs xG concedido
const COPAS=(()=>{try{return JSON.parse(fs.readFileSync('dataCopas.json','utf8')).equipos||{};}catch(e){return {};}})();
const XG=[["Instituto",5,2,3.6],["Vélez",5,3,8.7],["Gimnasia (M)",5,3,8.2],["Independiente",5,3,5.8],
["Defensa y Just.",5,7,5.8],["Newell's",5,5,6.0],["Estudiantes LP",5,5,6.5],["Dep. Riestra",5,5,4.2],
["Lanús",5,6,5.3],["Boca",5,7,4.1],["Central Cba.",5,5,6.7],["San Lorenzo",5,4,6.2],["Platense",5,9,8.6],
["Unión",5,8,6.2],["Talleres",5,10,8.9],["Argentinos",5,5,6.0],["Belgrano",5,2,6.5],["Rosario Ctral.",5,3,6.8],
["Sarmiento",5,8,6.7],["Barracas Ctral.",5,3,4.1],["Gimnasia LP",5,7,6.2],["Atl. Tucumán",5,2,3.8],
["Tigre",5,2,4.2],["Huracán",5,4,6.2],["Ind. Rivadavia",5,6,3.6],["Banfield",5,5,8.2],["Racing",5,7,7.2],
["Estudiantes RC",5,6,7.8],["River",5,4,4.6],["Aldosivi",5,6,6.1]]
.map(([eq,pj,gc,xgc])=>({eq,gc:gc/pj,xgc:xgc/pj,delta:(xgc-gc)/pj}))
.sort((a,b)=>b.delta-a.delta);

const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const n1=v=>Number(v).toFixed(1), n2=v=>Number(v).toFixed(2);
const pct=v=>(v*100).toFixed(0)+'%';

function tip(x){
  const filas=(x.desglose||[]).map(d=>`<tr><td>${esc(d[0])}</td><td class="num">${d[1]>0?'+':''}${n2(d[1])}</td><td class="det">${esc(d[2])}</td></tr>`).join('');
  return `<table class="tip"><tr><th colspan="3">${esc(x.nombre)} · ${esc(x.equipo)} ${x.condicion==='Local'?'(L)':'(V)'} vs ${esc(x.rival)}</th></tr>${filas}<tr class="tot"><td>Puntos esperados</td><td class="num">${n2(x.EP)}</td><td class="det">× ${pct(x.pJuega)} de chance de jugar = <b>${n2(x.EPreal)}</b></td></tr></table>`;
}
const barra=(v,max)=>`<span class="bar" style="--w:${Math.max(2,Math.round(100*v/max))}%"></span>`;

function tabla(lista,cols,maxEP){
  const th=cols.map(c=>`<th class="${c.cls||''}">${c.t}</th>`).join('');
  const tr=lista.map((x,i)=>{
    const tds=cols.map(c=>`<td class="${c.cls||''}">${c.f(x,i)}</td>`).join('');
    return `<tr tabindex="0">${tds}<td class="tipcell">${tip(x)}</td></tr>`;
  }).join('');
  return `<table class="rank"><thead><tr>${th}<th></th></tr></thead><tbody>${tr}</tbody></table>`;
}

const cEq=x=>`<span class="eq">${esc(x.equipo)}</span> <span class="mut">${x.condicion==='Local'?'L':'V'} vs ${esc(x.rival)}</span>`
  +(x.rotacion>0?` <span class="rot" title="${esc(x.notaRotacion||'')}">copa ${Math.round(x.rotacion*100)}%</span>`:'')
  +(x.rotacionRival>0?` <span class="rotr" title="el rival viene de jugar copa">rival de copa</span>`:'');
const maxEP={ARQ:Math.max(...R.ARQ.map(x=>x.EPreal)),DEF:Math.max(...R.DEF.map(x=>x.EPreal)),
             VOL:Math.max(...R.VOL.map(x=>x.EPreal)),DEL:Math.max(...R.DEL.map(x=>x.EPreal))};

const colsARQ=[
 {t:'#',cls:'rk',f:(x,i)=>i+1},
 {t:'Arquero',f:x=>`<b>${esc(x.nombre)}</b><br>${cEq(x)}`},
 {t:'Valla invicta',cls:'num',f:x=>`<b>${pct(x.pVI)}</b>${barra(x.pVI,0.55)}`},
 {t:'Juega',cls:'num',f:x=>pct(x.pJuega)},
 {t:'Pts esp.',cls:'num',f:x=>`<b>${n2(x.EP)}</b>`}];
const colsDEF=[
 {t:'#',cls:'rk',f:(x,i)=>i+1},
 {t:'Defensor',f:x=>`<b>${esc(x.nombre)}</b><br>${cEq(x)}`},
 {t:'Perfil',f:x=>`<span class="tag t${x.perfil.startsWith('SÓLIDO +')?'3':x.perfil==='SÓLIDO'?'1':x.perfil==='RIESGO GOLEADOR'?'2':'0'}">${esc(x.perfil)}</span>`},
 {t:'Valla',cls:'num',f:x=>pct(x.pVI)},
 {t:'Tiros',cls:'num',f:x=>x.tirosTorneo||0},
 {t:'Juega',cls:'num',f:x=>pct(x.pJuega)},
 {t:'Pts esp.',cls:'num',f:x=>`<b>${n2(x.EP)}</b>${barra(x.EPreal,maxEP.DEF)}`}];
const colsOF=[
 {t:'#',cls:'rk',f:(x,i)=>i+1},
 {t:'Jugador',f:x=>`<b>${esc(x.nombre)}</b><br>${cEq(x)}`},
 {t:'Tiros',cls:'num',f:x=>x.tirosTorneo||0},
 {t:'Piso',cls:'num',f:x=>n1(x.piso)},
 {t:'Techo',cls:'num',f:x=>n1(x.techo)},
 {t:'Juega',cls:'num',f:x=>pct(x.pJuega)},
 {t:'Pts esp.',cls:'num',f:x=>`<b>${n2(x.EP)}</b>${barra(x.EPreal,maxEP.VOL)}`}];

const once=E.once.map(x=>`<li><span class="pos p${x.pos}">${x.pos}</span><span class="nm">${esc(x.nombre)}${x.id===E.capitan.id?' <span class="cap">C</span>':''}</span><span class="eq">${esc(x.equipo)}</span><span class="ep">${n2(x.EP)}</span></li>`).join('');

const maxAbs=Math.max(...XG.map(t=>Math.abs(t.delta)));
const filasXG=XG.map(t=>{
  const w=Math.round(46*Math.abs(t.delta)/maxAbs);
  const lado=t.delta>0?`<span class="dv pos" style="width:${w}%"></span>`:`<span class="dv neg" style="width:${w}%"></span>`;
  const et=t.delta>0.55?'Trampa':t.delta<-0.45?'Oportunidad':'Coherente';
  const cl=t.delta>0.55?'critical':t.delta<-0.45?'good':'neutral';
  return `<tr><td>${esc(t.eq)}</td><td class="num">${n2(t.gc)}</td><td class="num">${n2(t.xgc)}</td>
  <td class="dvcell"><span class="dvwrap">${t.delta<0?lado:''}</span><span class="dvmid"></span><span class="dvwrap l">${t.delta>0?lado:''}</span></td>
  <td><span class="st ${cl}">${et==='Trampa'?'▲':et==='Oportunidad'?'▼':'—'} ${et}</span></td></tr>`;
}).join('');

const html=`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gran DT · Fecha 6 · Puntaje esperado</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--plane:#f9f9f7;--ink:#0b0b0b;--ink2:#52514e;--mut:#898781;
--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10);
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--good:#0ca30c;--crit:#d03b3b;--seq:#256abf;--seqbg:#cde2fb;--mid:#f0efec}
@media(prefers-color-scheme:dark){:root:where(:not([data-theme=light])){color-scheme:dark;--surface:#1a1a19;--plane:#0d0d0d;
--ink:#fff;--ink2:#c3c2b7;--mut:#898781;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--seq:#3987e5;--seqbg:#184f95;--mid:#383835}}
*{box-sizing:border-box}
body{margin:0;background:var(--plane);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:28px 20px 80px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}
.sub{color:var(--ink2);margin:0 0 26px;font-size:14px}
h2{font-size:17px;margin:34px 0 4px;letter-spacing:-.01em}
.note{color:var(--ink2);font-size:13px;margin:0 0 12px;max-width:70ch}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:22px 0 8px}
.tile{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:14px 16px}
.tile .k{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
.tile .v{font-size:27px;font-weight:650;letter-spacing:-.02em;margin-top:2px}
.tile .v small{font-size:14px;font-weight:500;color:var(--ink2)}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:6px 4px;overflow-x:auto}
table.rank{width:100%;border-collapse:collapse;font-size:14px}
table.rank th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--grid);white-space:nowrap}
table.rank td{padding:9px 12px;border-bottom:1px solid var(--grid);vertical-align:middle}
table.rank tbody tr:last-child td{border-bottom:0}
table.rank tbody tr{position:relative}
table.rank tbody tr:hover,table.rank tbody tr:focus{background:var(--mid);outline:none}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rk{color:var(--mut);font-variant-numeric:tabular-nums;width:34px}
.eq{color:var(--ink2);font-size:12.5px}
.mut{color:var(--mut);font-size:12.5px}
.bar{display:block;height:6px;border-radius:0 3px 3px 0;background:var(--seq);width:var(--w);margin-top:5px;margin-left:auto}
.tag{display:inline-block;font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;white-space:nowrap;border:1px solid var(--ring)}
.t3{color:var(--s3)}.t1{color:var(--s1)}.t2{color:var(--s2)}.t0{color:var(--mut)}
ol.once{list-style:none;margin:0;padding:0}
ol.once li{display:grid;grid-template-columns:44px 1fr auto 62px;gap:10px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--grid)}
ol.once li:last-child{border-bottom:0}
.pos{font-size:10.5px;font-weight:700;letter-spacing:.05em;color:var(--mut)}
.nm{font-weight:550}
.cap{background:var(--s1);color:#fff;font-size:10px;font-weight:700;border-radius:4px;padding:1px 5px;margin-left:4px}
.ep{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.tipcell{width:0;padding:0!important;border:0!important;position:relative}
table.tip{display:none;position:absolute;right:8px;top:100%;z-index:40;background:var(--surface);border:1px solid var(--ring);
box-shadow:0 8px 28px rgba(0,0,0,.18);border-radius:10px;padding:8px;font-size:12.5px;border-collapse:collapse;min-width:330px}
tr:hover table.tip,tr:focus table.tip{display:table}
table.tip th{text-align:left;padding:4px 8px 8px;font-size:12px;color:var(--ink);border-bottom:1px solid var(--grid)}
table.tip td{padding:3px 8px;border:0;white-space:nowrap}
table.tip .det{color:var(--mut);font-size:11.5px;white-space:normal}
table.tip .tot td{border-top:1px solid var(--grid);padding-top:6px;font-weight:600}
table.xg{width:100%;border-collapse:collapse;font-size:13.5px}
table.xg th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:600;padding:9px 12px;border-bottom:1px solid var(--grid)}
table.xg td{padding:6px 12px;border-bottom:1px solid var(--grid)}
table.xg tbody tr:last-child td{border-bottom:0}
.dvcell{width:230px}
.dvwrap{display:inline-block;width:calc(50% - 1px);text-align:right;vertical-align:middle}
.dvwrap.l{text-align:left}
.dvmid{display:inline-block;width:2px;height:14px;background:var(--axis);vertical-align:middle}
.dv{display:inline-block;height:7px;vertical-align:middle}
.dv.pos{background:var(--crit);border-radius:0 3px 3px 0}
.dv.neg{background:var(--s1);border-radius:3px 0 0 3px}
.st{font-size:11.5px;font-weight:600;white-space:nowrap}
.rot{font-size:10.5px;font-weight:600;color:var(--s2);border:1px solid var(--ring);border-radius:999px;padding:1px 6px;white-space:nowrap}
.rotr{font-size:10.5px;font-weight:600;color:var(--s3);border:1px solid var(--ring);border-radius:999px;padding:1px 6px;white-space:nowrap}
.st.critical{color:var(--crit)}.st.good{color:var(--good)}.st.neutral{color:var(--mut)}
footer{color:var(--mut);font-size:12.5px;margin-top:40px;border-top:1px solid var(--grid);padding-top:16px;max-width:75ch}
</style></head><body><div class="wrap">

<h1>Gran DT · Fecha 6</h1>
<p class="sub">Puntaje esperado por jugador, en puntos reales del reglamento. Pasá el mouse por cualquier fila para ver el desglose completo.</p>

<div class="tiles">
<div class="tile"><div class="k">Esquema</div><div class="v">${E.esquema}</div></div>
<div class="tile"><div class="k">Once esperado</div><div class="v">${n1(E.total)} <small>pts</small></div></div>
<div class="tile"><div class="k">Capitán</div><div class="v" style="font-size:17px;line-height:1.3;padding-top:6px">${esc(E.capitan.nombre.split(',')[0])}<br><small>ficha ${n2(E.capitan.ficha)}</small></div></div>
<div class="tile"><div class="k">Jugadores medidos</div><div class="v">636</div></div>
</div>

<h2>El once</h2>
<p class="note">Ordenado por puntos esperados descontando la chance de que no juegue. El capitán duplica solo la ficha, así que se elige por ficha, no por puntaje total.</p>
<div class="card"><ol class="once">${once}</ol></div>

<h2>Arqueros</h2>
<p class="note">Ordenados por probabilidad de valla invicta y nada más. Medido sobre el torneo pasado, la correlación entre la tasa de figura de un arquero y su valla invicta es −0,003: la figura es ruido que no se puede anticipar.</p>
<div class="card">${tabla(R.ARQ.slice(0,15),colsARQ)}</div>

<h2>Defensores</h2>
<p class="note">El partido pone el piso, el jugador pone el techo. <b>Sólido</b> = el equipo tiene buena chance de valla invicta. <b>Riesgo goleador</b> = la valla no está, pero el jugador llega mucho al área — y un gol de defensor vale 9,84 puntos efectivos, casi cinco vallas invictas.</p>
<div class="card">${tabla(R.DEF.slice(0,25),colsDEF)}</div>

<h2>Volantes</h2>
<p class="note">El puesto más de todo o nada: la mediana más baja de las cuatro posiciones y el techo más alto. Por eso van piso y techo separados. Un volante que mete gol es figura el 44% de las veces, así que su gol vale 7,77 y no 6.</p>
<div class="card">${tabla(R.VOL.slice(0,20),colsOF)}</div>

<h2>Delanteros</h2>
<p class="note">El gol y la figura son la misma apuesta: un delantero que convierte es figura el 24% de las veces, así que su gol vale 4,95 y no 4.</p>
<div class="card">${tabla(R.DEL.slice(0,20),colsOF)}</div>

<h2>Quién llega cansado</h2>
<p class="note">Un equipo que juega copa entre semana pone suplentes el fin de semana. El efecto no es que su jugador sume cero — en Gran DT si tu titular no juega entra tu suplente del banco — sino que baja la chance de que juegue, y de paso el rival enfrenta a un equipo más flojo. Las magnitudes del ajuste son un supuesto declarado, no una medición: están en un solo lugar del código para calibrarlas cuando haya fechas suficientes.</p>
<div class="card"><table class="xg"><thead><tr><th>Equipo</th><th class="num">Días de descanso</th><th class="num">Rotación</th><th>Compromiso de copa</th></tr></thead><tbody>
${Object.values(COPAS).sort((a,b)=>b.indiceRotacion-a.indiceRotacion).map(t=>`<tr><td>${esc(t.equipo)}</td><td class="num">${t.diasDescanso}</td><td class="num"><b>${Math.round(t.indiceRotacion*100)}%</b></td><td class="mut">${esc(t.detalle)}</td></tr>`).join('')||'<tr><td colspan="4" class="mut">Sin datos de copas cargados</td></tr>'}
</tbody></table></div>

<h2>Trampas de valla invicta</h2>
<p class="note">Goles realmente recibidos contra goles esperados en contra, por partido. Un equipo que recibe mucho menos de lo que le generan no está defendiendo bien: está teniendo suerte, y la suerte no se repite. El que mira solo la tabla de goles recibidos cae en la trampa todas las fechas.</p>
<div class="card"><table class="xg"><thead><tr><th>Equipo</th><th class="num">Goles rec./p</th><th class="num">xG conc./p</th><th>← defiende mejor · viene con suerte →</th><th>Lectura</th></tr></thead><tbody>${filasXG}</tbody></table></div>

<footer>
Fuentes: planilla oficial de Planeta Gran DT (636 jugadores, fecha 5) · 365Scores (tiros, xG y minutos individuales de 75 partidos) · the-odds-api (cuotas 1X2 y Over/Under promediadas entre casas y sin margen) · xgscore.io (xG por equipo).<br>
Los puntos esperados salen de sumar los términos del reglamento: ficha Clarín reconstruida + valla invicta × su probabilidad + goles esperados × el valor del gol + figura × 4 − tarjetas. Nada de índices inventados.<br>
Generado ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC.
</footer>
</div></body></html>`;

fs.writeFileSync('fecha6.html',html);
console.log('fecha6.html',(html.length/1024).toFixed(0)+' KB');
