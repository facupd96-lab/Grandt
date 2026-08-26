const fs=require('fs'), vm=require('vm');
const M=require('./motorV3.cjs');
const P=JSON.parse(fs.readFileSync('dataPlaneta.json','utf8'));
const S=JSON.parse(fs.readFileSync('data365.json','utf8'));
const C=JSON.parse(fs.readFileSync('dataCuotas.json','utf8'));
let HIST=null;
try{ HIST=JSON.parse(fs.readFileSync('data365_historico.json','utf8')); }catch(e){ console.log('(sin data365_historico.json: los niveles salen solo del torneo actual)'); }
let COPAS={equipos:{}};
try{ COPAS=JSON.parse(fs.readFileSync('dataCopas.json','utf8')); }catch(e){ console.log('(sin dataCopas.json: no se aplica ajuste por copas)'); }
// registry para canonizar equipos
const ctx={console,window:{}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('teamsRegistry.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('data.js','utf8'),ctx);
const g=ctx.getCanonicalTeamId, viejo=ctx.window.appData;
// BUG del teamsRegistry: "Estudiantes" a secas devuelve estudiantes-rc (Rio Cuarto)
// cuando por convencion Estudiantes solo = La Plata. Lo corrijo aca.
const ARREGLOS={'estudiantes':'estudiantes-lp'};
const CT=n=>{ if(!n) return '';
  const plano=n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  if(ARREGLOS[plano]) return ARREGLOS[plano];
  const i=g(n); return i||plano.replace(/[^a-z0-9]/g,''); };

// ---- 1. LA FECHA QUE HAY QUE ANALIZAR ----
// Antes agarraba "los 15 partidos con cuotas mas proximos en el tiempo", sin
// mirar a que fecha pertenecian. Con la fecha en curso a medio jugar eso arma
// un Frankenstein: los partidos que sobran de la fecha actual mezclados con los
// primeros de la siguiente.
// En Gran DT los cambios cierran cuando ARRANCA la fecha, asi que apenas se
// juega el primer partido de una fecha ya no hay nada que decidir sobre ella.
// Regla: la fecha objetivo es la primera que NO tiene ningun partido jugado.
const jugadosPorPar=new Set();
Object.values(S.jugadores).forEach(j=>{(j.log||[]).forEach(l=>{
  if(l.min) jugadosPorPar.add([CT(j.equipo),CT(l.vs)].sort().join('|'));
});});
const rondas={};
(viejo.fixture||[]).forEach(m=>{
  const r=m.round; if(r==null) return;
  const o=rondas[r]=rondas[r]||{total:0,jugados:0,pares:new Set()};
  o.total++; o.pares.add([CT(m.home),CT(m.away)].sort().join('|'));
  if(jugadosPorPar.has([CT(m.home),CT(m.away)].sort().join('|'))) o.jugados++;
});
let fechaObjetivo=null;
Object.keys(rondas).map(Number).sort((a,b)=>a-b).forEach(r=>{
  if(fechaObjetivo===null && rondas[r].jugados===0) fechaObjetivo=r;
});
// cuotas de esa fecha, cruzadas por el par de equipos
const paresObjetivo = fechaObjetivo!==null ? rondas[fechaObjetivo].pares : null;
let f6=[];
if(paresObjetivo){
  f6=C.cuotas.filter(m=>paresObjetivo.has([CT(m.local),CT(m.visitante)].sort().join('|')));
}
if(!f6.length){
  // sin cruce (fixture viejo o cuotas raras): se cae al criterio anterior
  const orden=[...C.cuotas].sort((a,b)=>new Date(a.cuando)-new Date(b.cuando));
  const vistos=new Set();
  for(const m of orden){ const h=CT(m.local),a=CT(m.visitante);
    if(vistos.has(h)||vistos.has(a))continue; vistos.add(h);vistos.add(a); f6.push(m); if(f6.length===15)break; }
  console.log('(no pude cruzar las cuotas con el fixture: uso los 15 partidos mas proximos)');
} else {
  f6.sort((a,b)=>new Date(a.cuando)-new Date(b.cuando));
  const faltan=rondas[fechaObjetivo].total-f6.length;
  console.log('FECHA '+fechaObjetivo+' — '+f6.length+' de '+rondas[fechaObjetivo].total+' partidos con cuotas, del '+
    f6[0].cuando.slice(0,10)+' al '+f6[f6.length-1].cuando.slice(0,10)+
    (faltan>0?('   ('+faltan+' sin cuota todavia)'):''));
  const cerradas=Object.keys(rondas).map(Number).filter(r=>r<fechaObjetivo&&rondas[r].jugados>0&&rondas[r].jugados<rondas[r].total);
  cerradas.forEach(r=>console.log('  (la fecha '+r+' esta en curso: '+rondas[r].jugados+' de '+rondas[r].total+' jugados, ya no se puede cambiar el equipo)'));
}

// ---- 2. indices
const eq365={}; Object.values(S.equipos).forEach(e=>{eq365[CT(e.equipo)]=e;});
const st={}; [...viejo.standings.zonaA,...viejo.standings.zonaB].forEach(s=>{st[CT(s.team)]=s;});
const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').replace(/\s+/g,' ').trim();
const idx365={}; Object.values(S.jugadores).forEach(p=>{const n=norm(p.nombre);idx365[n]=p;
  const w=n.split(' '); if(w.length>=2) {const inv=w.slice(1).join(' ')+' '+w[0]; if(!idx365[inv])idx365[inv]=p;}});

// ---- 2b. tarjetas, suspensiones y partidos ya jugados ----
// Las tarjetas salen de partido.events de 365Scores (1=gol, 2=amarilla, 3=roja),
// con minuto y fecha. Regla de la Liga Profesional: a la QUINTA amarilla hay una
// fecha de suspension, y una roja suspende el partido siguiente.
const TARJ={};
Object.values(S.tarjetas||{}).forEach(t=>{
  const n=norm(t.nombre); TARJ[n]=t;
  const w=n.split(' '); if(w.length>=2){const inv=w.slice(1).join(' ')+' '+w[0]; if(!TARJ[inv])TARJ[inv]=t;}
});
const ultFechaTarj=Number(S.ultimaFechaConTarjetas)||0;
function disponibilidad(nombrePlaneta){
  const n=norm(nombrePlaneta), w=n.split(' ');
  const t=TARJ[n]||TARJ[w.slice(1).join(' ')+' '+w[0]];
  if(!t) return null;
  const am=Number(t.amarillas)||0, ro=Number(t.rojas)||0;
  const ultRoja=t.fechaUltimaRoja!=null?Number(t.fechaUltimaRoja):null;
  return { amarillas:am, rojas:ro, fechaUltimaRoja:ultRoja,
    aUnaDeSuspension:(am%5===4),
    suspendido:(ro>0 && ultRoja!=null && ultRoja>=ultFechaTarj) };
}

// Partidos de la fecha objetivo que YA se jugaron. 365Scores los tiene con
// minutos: si aparecen, el partido ya paso y no hay nada que recomendar ahi.
const YA_JUGADOS=new Set();
Object.values(S.jugadores).forEach(j=>{(j.log||[]).forEach(l=>{
  if(!l.min) return;
  YA_JUGADOS.add([CT(j.equipo),CT(l.vs)].sort().join('|'));
});});

// ---- 3. jugadores en el formato del motor
const players=[]; let match365=0, nuncaJugaron=0;
P.jugadores.forEach((j,i)=>{
  const raw=norm(j.nombre), w=raw.split(' ');
  let m=idx365[raw]||idx365[w.slice(1).join(' ')+' '+w[0]]||null;
  if(!m){const ap=w[0];const h=Object.values(S.jugadores).filter(x=>norm(x.nombre).split(' ').includes(ap));if(h.length===1)m=h[0];}
  if(m)match365++;
  // Los que no jugaron un solo minuto NI tienen partidos calificados no entran.
  // La planilla nueva trae los planteles completos y un tercio nunca jugo; sin
  // historial heredan la ficha promedio de la liga y se trepan al ranking.
  // No son candidatos: son nombres en una lista.
  const minutosReales=(m?(m.minutos||0):0), calificados=(j.ct||0);
  if(minutosReales===0 && calificados===0){ nuncaJugaron++; return; }
  players.push({ id:'p'+i, name:j.nombre, position:j.posicion, team:j.equipo,
    matchesRated:j.ct, totalPoints:j.act, goals:j.gt, goalsPenalty:j.gp, goalsAway:j.gv,
    goalsGolden:j.go, goalsConceded:j.gr, ownGoals:j.ge, figuras:j.vf, cleanSheets:j.vi,
    yellowCards:j.ta, redCards:j.tr, penaltiesSaved:j.pa, penaltiesMissed:j.pe, price:j.cotizacion,
    xg365:m?m.xg:0, shots365:m?m.tiros:0, matches365:m?m.partidos:0,
    minutes365:m?m.minutos:0, titularidad:m?m.titularidad:null, _m:m });
});
console.log('jugadores:',players.length,'(se dejaron afuera '+nuncaJugaron+' que nunca jugaron) | cruzados con 365Scores:',match365,'('+Math.round(100*match365/players.length)+'%)');

// ---- 4. contexto por equipo
const porEquipo={}; f6.forEach(m=>{
  porEquipo[CT(m.local)]={esLocal:true, rival:m.visitante, odds:{homeWin:m.cuotaLocal,draw:m.cuotaEmpate,awayWin:m.cuotaVisitante,overOdds:m.cuotaOver,underOdds:m.cuotaUnder,overUnderLine:m.lineaTotales}, rivalKey:CT(m.visitante)};
  porEquipo[CT(m.visitante)]={esLocal:false, rival:m.local, odds:{homeWin:m.cuotaLocal,draw:m.cuotaEmpate,awayWin:m.cuotaVisitante,overOdds:m.cuotaOver,underOdds:m.cuotaUnder,overUnderLine:m.lineaTotales}, rivalKey:CT(m.local)};
});
// se completa mas abajo, cuando ya estan calculados los niveles
let xgDe=(k,cond)=>null;
// dataCopas viene indexado por el nombre que usa 365Scores ("River Plate"),
// no por la clave canonica. Sin esto la rotacion daba 0 para TODOS.
const ROT={};
Object.values(COPAS.equipos||{}).forEach(e=>{ROT[CT(e.equipo)]=e;});
{const sinCruce=Object.values(COPAS.equipos||{}).filter(e=>!ROT[CT(e.equipo)]).length;
 console.log('rotacion por copas: '+Object.keys(ROT).length+' equipos cruzados'+(sinCruce?', '+sinCruce+' SIN cruzar':''));}
const rotDe=k=>{const e=ROT[k];return e?Number(e.indiceRotacion)||0:0;};
const notaDe=k=>{const e=ROT[k];return e?e.detalle:'';};
function getCtx(equipo){ const k=CT(equipo); const c=porEquipo[k]; if(!c)return null;
  return {esLocal:c.esLocal, rival:c.rival, odds:c.odds,
    miXg:xgDe(k,c.esLocal?'local':'visitante'), rivalXg:xgDe(c.rivalKey,c.esLocal?'visitante':'local'),
    misStandings:st[k], rivalStandings:st[c.rivalKey],
    rotacion:rotDe(k), rotacionRival:rotDe(c.rivalKey), notaRotacion:notaDe(k)}; }

const sinCtx=[...new Set(players.map(p=>p.team))].filter(t=>!porEquipo[CT(t)]);
if(sinCtx.length) console.log('equipos sin partido en fecha 6:',sinCtx.join(', '));

// ---- 4b. datos de contexto para el panel del jugador ----
// ── NIVEL DEL EQUIPO × FACTOR DE LOCALIA ───────────────────────────────────
// Lo medimos: el corte local/visitante POR EQUIPO no se traslada de un torneo
// al otro (r=0.26 en ataque, -0.21 en defensa). Con 2 o 3 partidos por
// condicion es casi todo ruido. Lo que si se traslada es el NIVEL general del
// equipo (tiros concedidos r=0.48, xG generado r=0.39) y la ventaja de local
// de la LIGA, que sobre 290 partidos es enorme y estable: +33% de tiros,
// +31% de xG, valla invicta 44% contra 29%.
// Entonces se modela asi:  esperado = base de la liga en esa condicion
//                                     × nivel de ataque del equipo
//                                     × nivel de defensa del rival
// El nivel sale de TODOS los partidos disponibles (torneo actual + anterior),
// que son ~20 por equipo en vez de 5.

// partidos equipo-a-equipo, juntando las dos fuentes
const bruto={};
function sumar(k,pj,xg,xgc,tir,tirc,esLocal){
  if(!k||!pj) return;
  const o=bruto[k]=bruto[k]||{pj:0,xg:0,xgc:0,tir:0,tirc:0,pjL:0,pjV:0};
  o.pj+=pj; o.xg+=xg*pj; o.xgc+=xgc*pj; o.tir+=tir*pj; o.tirc+=tirc*pj;
  if(esLocal===true)o.pjL+=pj; if(esLocal===false)o.pjV+=pj;
}
Object.values(S.equipos).forEach(t=>{const k=CT(t.equipo);
  ['local','visitante'].forEach(c=>{const b=t[c]; if(!b||!b.pj)return;
    sumar(k,b.pj,b.xgPorPartido,b.xgConcedidoPorPartido,b.tirosPorPartido,b.tirosConcedidosPorPartido,c==='local');});});
if(HIST&&HIST.equipos){
  Object.values(HIST.equipos).forEach(t=>{const k=CT(t.equipo);
    ['local','visitante'].forEach(c=>{const b=t[c]; if(!b||!b.pj)return;
      sumar(k,b.pj,b.xgPorPartido,b.xgConcedidoPorPartido,b.tirosPorPartido,b.tirosConcedidosPorPartido,c==='local');});});
}
const NIVEL={};
let sXg=0,sXgc=0,sPj=0;
Object.entries(bruto).forEach(([k,o])=>{sXg+=o.xg;sXgc+=o.xgc;sPj+=o.pj;});
const ligaXg=sPj?sXg/sPj:1.1, ligaXgc=sPj?sXgc/sPj:1.1;
const KN=6;   // encogimiento: con pocos partidos, el nivel tira al promedio
Object.entries(bruto).forEach(([k,o])=>{
  const xg=(o.xg+ligaXg*KN)/(o.pj+KN), xgc=(o.xgc+ligaXgc*KN)/(o.pj+KN);
  NIVEL[k]={pj:o.pj, xg:+xg.toFixed(3), xgc:+xgc.toFixed(3),
            tir:+(o.tir/o.pj).toFixed(2), tirc:+(o.tirc/o.pj).toFixed(2),
            atk:+(xg/ligaXg).toFixed(3), def:+(xgc/ligaXgc).toFixed(3)};
});

// factor de localia de la liga, medido sobre las dos fuentes juntas
let FL={xg:0,xgc:0,pj:0},FV={xg:0,xgc:0,pj:0};
const acumular=(t)=>{['local','visitante'].forEach(c=>{const b=t[c];if(!b||!b.pj)return;
  const d=c==='local'?FL:FV; d.xg+=b.xgPorPartido*b.pj; d.xgc+=b.xgConcedidoPorPartido*b.pj; d.pj+=b.pj;});};
Object.values(S.equipos).forEach(acumular);
if(HIST&&HIST.equipos) Object.values(HIST.equipos).forEach(acumular);
const LIGA={ locXg:FL.xg/FL.pj, visXg:FV.xg/FV.pj, locXgc:FL.xgc/FL.pj, visXgc:FV.xgc/FV.pj,
             partidos:Math.round((FL.pj+FV.pj)/2) };
LIGA.factorAtaqueLocal = LIGA.locXg/((LIGA.locXg+LIGA.visXg)/2);
LIGA.factorAtaqueVisita= LIGA.visXg/((LIGA.locXg+LIGA.visXg)/2);
console.log('LIGA — ventaja de local sobre '+LIGA.partidos+' partidos: xG local '+LIGA.locXg.toFixed(2)+
            ' vs visitante '+LIGA.visXg.toFixed(2)+'  (+'+(100*(LIGA.locXg/LIGA.visXg-1)).toFixed(0)+'%)');

/** Lo que se espera que genere y conceda un equipo en ESTE partido. */
function esperado(k,rivalK,esLocal){
  const yo=NIVEL[k], el=NIVEL[rivalK];
  if(!yo||!el) return null;
  const baseF = esLocal?LIGA.locXg:LIGA.visXg;      // cuanto genera un equipo promedio en esa condicion
  const baseC = esLocal?LIGA.locXgc:LIGA.visXgc;    // cuanto concede
  return { xgFavor:+(baseF*yo.atk*el.def).toFixed(3), xgContra:+(baseC*el.atk*yo.def).toFixed(3) };
}

xgDe=(k,cond)=>{const n=NIVEL[k]; if(!n)return null; const esLocal=cond==='local';
  return {xgPerMatch:n.xg*(esLocal?LIGA.factorAtaqueLocal:LIGA.factorAtaqueVisita),
          xgConcededPerMatch:n.xgc*(esLocal?LIGA.factorAtaqueVisita:LIGA.factorAtaqueLocal)};};

const bloque=(k,cond)=>{const n=NIVEL[k]; if(!n) return null;
  const esLocal=cond==='local';
  return {pj:n.pj, tiros:n.tir, tirosConcedidos:n.tirc,
          sot:null, sotConcedidos:null,
          xg:+(n.xg*(esLocal?LIGA.factorAtaqueLocal:LIGA.factorAtaqueVisita)).toFixed(3),
          xgConcedido:+(n.xgc*(esLocal?LIGA.factorAtaqueVisita:LIGA.factorAtaqueLocal)).toFixed(3),
          nivelAtaque:n.atk, nivelDefensa:n.def};};

const anomalias={};
Object.keys(NIVEL).forEach(k=>{anomalias[k]={ataque:0,defensa:0};});

const out=M.correrMotor(players,getCtx,viejo.fixture);
console.log('validacion ficha:',out.validacion.veredicto,'| media',out.validacion.media,'| fuera',out.validacion.pctFuera+'%');
// enriquecer cada jugador con precio y contexto
const porNombre={}; players.forEach(pl=>{porNombre[pl.name]=pl;});
const precio={}; P.jugadores.forEach(j=>{precio[j.nombre]=j.cotizacion;});
['ARQ','DEF','VOL','DEL'].forEach(pos=>{
  out.rankings[pos].forEach(x=>{
    const pl=porNombre[x.nombre]||{};
    const k=CT(x.equipo), c=porEquipo[k];
    const miCond = c && c.esLocal ? 'local':'visitante';
    const rivalCond = c && c.esLocal ? 'visitante':'local';
    x.precio = precio[x.nombre] ?? null;
    x.disponibilidad = disponibilidad(x.nombre);
    x.partidoYaJugado = c ? YA_JUGADOS.has([k,c.rivalKey].sort().join('|')) : false;
    x.individual = {
      tiros: pl.shots365||0, tirosPorPartido: pl.matches365? +((pl.shots365||0)/pl.matches365).toFixed(2):0,
      xg: +(pl.xg365||0).toFixed(2), xgPorPartido: pl.matches365? +((pl.xg365||0)/pl.matches365).toFixed(3):0,
      goles: pl.goals||0, golesPenal: pl.goalsPenalty||0, golesVisitante: pl.goalsAway||0,
      figuras: pl.figuras||0, vallas: pl.cleanSheets||0,
      amarillas: pl.yellowCards||0, rojas: pl.redCards||0,
      pj: pl.matchesRated||0, pj365: pl.matches365||0,
      minutos: pl.minutes365||0, minutosPorPartido: pl.matches365? Math.round((pl.minutes365||0)/pl.matches365):0,
      titularidad: pl.titularidad!=null? pl.titularidad : null
    };
    x.miEquipo = bloque(k, miCond);
    x.elRival  = c ? bloque(c.rivalKey, rivalCond) : null;
    x.miEquipoTotal = bloque(k,'total');
    x.elRivalTotal  = c ? bloque(c.rivalKey,'total') : null;
    x.anomalia = anomalias[k]||null;
    x.anomaliaRival = c? (anomalias[c.rivalKey]||null) : null;
  });
});
// ---- 5. el fixture de la fecha, con todo lo del mercado y lo calculado ----
const ctxDe={}; ['ARQ','DEF','VOL','DEL'].forEach(pos=>out.rankings[pos].forEach(x=>{ if(!ctxDe[CT(x.equipo)]) ctxDe[CT(x.equipo)]=x.lam; }));
out.partidos = f6.map(m=>{
  const kl=CT(m.local), kv=CT(m.visitante);
  const L=ctxDe[kl]||null, V=ctxDe[kv]||null;
  const pGol=l=>l? +(1-Math.exp(-Math.max(0.05,l.lamFor))).toFixed(3) : null;
  const cuotaDe=p=>p? +(1/p).toFixed(2) : null;
  return {
    cuando: m.cuando,
    local: m.local, visitante: m.visitante,
    // mercado real, promedio de casas
    cuotaLocal: m.cuotaLocal, cuotaEmpate: m.cuotaEmpate, cuotaVisitante: m.cuotaVisitante,
    probLocal: m.probLocal, probEmpate: m.probEmpate, probVisitante: m.probVisitante,
    margenCasa: m.margenCasa, lineaTotales: m.lineaTotales,
    cuotaOver: m.cuotaOver, cuotaUnder: m.cuotaUnder, probOver: m.probOver,
    // calculado por nosotros
    golesEsperadosLocal: L? L.lamFor : null, golesEsperadosVisitante: V? V.lamFor : null,
    pGolLocal: pGol(L), pGolVisitante: pGol(V),
    cuotaGolLocalEstimada: cuotaDe(pGol(L)), cuotaGolVisitanteEstimada: cuotaDe(pGol(V)),
    pVallaLocal: L? L.pVI : null, pVallaVisitante: V? V.pVI : null,
    tieneMercado: L? L.tieneMercado : false,
    yaJugado: YA_JUGADOS.has([kl,kv].sort().join('|')),
    rotacionLocal: rotDe(kl), rotacionVisitante: rotDe(kv),
    tirosLocal: (eq365[kl]&&eq365[kl].local.pj)? eq365[kl].local.tirosPorPartido : null,
    tirosVisitante: (eq365[kv]&&eq365[kv].visitante.pj)? eq365[kv].visitante.tirosPorPartido : null,
    tirosConcLocal: (eq365[kl]&&eq365[kl].local.pj)? eq365[kl].local.tirosConcedidosPorPartido : null,
    tirosConcVisitante: (eq365[kv]&&eq365[kv].visitante.pj)? eq365[kv].visitante.tirosConcedidosPorPartido : null
  };
}).sort((a,b)=>new Date(a.cuando)-new Date(b.cuando));

out.liga = LIGA;
out.presupuesto = 65000000;

// ---- 6. tabla de posiciones calculada desde los resultados reales ----
// El fixture COMPLETO del torneo (240 partidos, 16 fechas) solo esta en data.js.
// 365Scores solo devuelve la fecha en curso, pero sus resultados son los mas
// frescos. Entonces: esqueleto de data.js + resultados de 365Scores encima.
const ZONA={};
(viejo.standings&&viejo.standings.zonaA||[]).forEach(s=>{ZONA[CT(s.team)]='A';});
(viejo.standings&&viejo.standings.zonaB||[]).forEach(s=>{ZONA[CT(s.team)]='B';});

// Nombres de display: cada fuente escribe distinto ("CA Tigre BA", "Union
// Santa Fe", "Estudiantes de Río Cuarto"). data.js tiene los cortos y limpios,
// que son los que se usan en toda la app.
const NOMBRES={};
(viejo.fixture||[]).forEach(m=>{NOMBRES[CT(m.home)]=m.home;NOMBRES[CT(m.away)]=m.away;});

const claveP=(l,v)=>CT(l)+'|'+CT(v);
const base=new Map();
(viejo.fixture||[]).forEach(m=>{
  base.set(claveP(m.home,m.away),{
    fecha:m.date, numeroFecha:m.round, local:m.home, visitante:m.away,
    golesLocal:(typeof m.homeScore==='number')?m.homeScore:null,
    golesVisitante:(typeof m.awayScore==='number')?m.awayScore:null,
    terminado:(m.state==='post'&&typeof m.homeScore==='number'),
    fuente:(m.state==='post'&&typeof m.homeScore==='number')?'data.js':null});
});

let FX365=null;
try{ FX365=JSON.parse(fs.readFileSync('dataFixture.json','utf8')).partidos; }catch(e){}
let refrescados=0, choques=0, sueltos=0, coinciden=0;
const listaChoques=[];
(FX365||[]).forEach(m=>{
  if(!(m.terminado&&m.golesLocal!=null&&m.golesVisitante!=null)) return;
  const k=claveP(m.local,m.visitante), b=base.get(k);
  if(!b){ base.set(k,{fecha:m.fecha,numeroFecha:m.numeroFecha,local:m.local,visitante:m.visitante,
    golesLocal:m.golesLocal,golesVisitante:m.golesVisitante,terminado:true,fuente:'365Scores'});
    sueltos++; return; }
  if(b.terminado){
    if(b.golesLocal!==m.golesLocal||b.golesVisitante!==m.golesVisitante){
      choques++; listaChoques.push(`${m.local} ${b.golesLocal}-${b.golesVisitante} vs ${m.visitante} (data.js) / ${m.golesLocal}-${m.golesVisitante} (365Scores)`);
    } else coinciden++;
  } else refrescados++;
  b.golesLocal=m.golesLocal; b.golesVisitante=m.golesVisitante; b.terminado=true; b.fuente='365Scores';
});
// Tercera fuente, y la mas confiable para el torneo en curso: los EVENTOS de
// gol de 365Scores (partido.events, eventType id=1), cada uno con su minuto y
// el equipo al que se le acredita.
//
// Antes probe sumar la estadistica "Goles" de cada jugador y no cerraba: en 5
// partidos faltaba exactamente un gol. La causa no eran los goles en contra
// como pense primero, sino goleadores que directamente NO figuran en las
// estadisticas individuales — en Gimnasia (M) 3-1 Talleres, Cingolani convirtio
// a los 51' y no aparece en la ficha de ningun jugador.
// Los eventos si estan completos: reproducen el marcador correcto en los 74
// partidos donde se pudo comparar, incluidos esos 5.
const golesPorGid={};
(S.tarjetasDetalle||[]).forEach(t=>{
  if(t.tipo!=='gol') return;
  const g=golesPorGid[t.gid]=golesPorGid[t.gid]||{L:0,V:0};
  if(t.esLocal===true||t.esLocal==='True') g.L++; else g.V++;
});
// para saber que equipos jugaron cada gid hace falta el log de jugadores
const equiposPorGid={};
Object.values(S.jugadores).forEach(j=>{(j.log||[]).forEach(l=>{
  if(!l.min) return;
  const g=equiposPorGid[l.gid]=equiposPorGid[l.gid]||{};
  if(l.local){ g.local=j.equipo; g.visitante=l.vs; } else { g.visitante=j.equipo; g.local=l.vs; }
  if(l.fecha) g.fecha=l.fecha;
});});
let de365=0, choques365=0;
Object.keys(equiposPorGid).forEach(gid=>{
  const e=equiposPorGid[gid]; if(!e.local||!e.visitante) return;
  const m=golesPorGid[gid]||{L:0,V:0};          // sin eventos = 0-0, que es un resultado valido
  const b=base.get(claveP(e.local,e.visitante));
  if(!b) return;
  if(b.terminado){
    if(b.golesLocal!==m.L||b.golesVisitante!==m.V){
      choques365++;
      if(choques365<=5) console.log('  conflicto:',e.local,b.golesLocal+'-'+b.golesVisitante,e.visitante,'-> eventos dicen',m.L+'-'+m.V);
    }
    return;
  }
  b.golesLocal=m.L; b.golesVisitante=m.V; b.terminado=true; b.fuente='365Scores eventos';
  if(b.numeroFecha==null&&e.fecha) b.numeroFecha=e.fecha;
  de365++;
});
if(de365) console.log('  '+de365+' resultados tomados de los eventos de gol de 365Scores');
if(choques365) console.log('  OJO: '+choques365+' resultados en conflicto (se respeto el que ya estaba)');

const FX=[...base.values()];
FX.forEach(m=>{ m.zona=ZONA[CT(m.local)]===ZONA[CT(m.visitante)]?ZONA[CT(m.local)]:'INT'; });

const jugadosPorFecha={};
FX.filter(m=>m.terminado).forEach(m=>{jugadosPorFecha[m.numeroFecha]=(jugadosPorFecha[m.numeroFecha]||0)+1;});
const fechasJug=Object.keys(jugadosPorFecha).map(Number).sort((a,b)=>a-b);
console.log('FIXTURE —',FX.length,'partidos |',FX.filter(m=>m.terminado).length,'jugados |',
  'por fecha:',fechasJug.map(f=>'f'+f+':'+jugadosPorFecha[f]).join(' '));
console.log('  resultados: ',coinciden,'coinciden en las dos fuentes,',refrescados,'nuevos de 365Scores,',sueltos,'sueltos');
if(choques){ console.log('  OJO —',choques,'resultados en conflicto:'); listaChoques.forEach(t=>console.log('   ',t)); }
const ultimaJugada=fechasJug.filter(f=>jugadosPorFecha[f]>=8).pop()||0;
const tabla={};
const filaVacia=eq=>({equipo:eq,pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,pts:0,
  local:{pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,pts:0}, visitante:{pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,pts:0}, forma:[]});
FX.filter(m=>m.terminado&&m.golesLocal!=null&&m.golesVisitante!=null)
  .sort((a,b)=>new Date(a.fecha)-new Date(b.fecha))
  .forEach(m=>{
   const kl=CT(m.local), kv=CT(m.visitante);
   tabla[kl]=tabla[kl]||filaVacia(m.local); tabla[kv]=tabla[kv]||filaVacia(m.visitante);
   const L=tabla[kl], V=tabla[kv];
   const gl=m.golesLocal, gv=m.golesVisitante;
   [[L,L.local,gl,gv],[V,V.visitante,gv,gl]].forEach(([t,b,gf,gc])=>{
     t.pj++; t.gf+=gf; t.gc+=gc; b.pj++; b.gf+=gf; b.gc+=gc;
     if(gf>gc){t.pg++;t.pts+=3;b.pg++;b.pts+=3;t.forma.push('G');}
     else if(gf===gc){t.pe++;t.pts++;b.pe++;b.pts++;t.forma.push('E');}
     else {t.pp++;b.pp++;t.forma.push('P');}
   });
  });
const ordenar=arr=>arr.sort((a,b)=>b.pts-a.pts||(b.gf-b.gc)-(a.gf-a.gc)||b.gf-a.gf);
out.tabla=ordenar(Object.values(tabla).map(t=>({...t,zona:ZONA[CT(t.equipo)]||'',dif:t.gf-t.gc,forma:t.forma.slice(-5)})));
out.tablaZonas={
  A:ordenar(out.tabla.filter(t=>t.zona==='A').map(t=>({...t}))),
  B:ordenar(out.tabla.filter(t=>t.zona==='B').map(t=>({...t})))
};
out.fixtureCompleto=FX;

// ---- 7. ranking de equipos por tiros concedidos, con split ----
out.equipos=Object.values(S.equipos).map(e=>({
  equipo:e.equipo,
  total:e.total, local:e.local, visitante:e.visitante,
  anomalia:anomalias[CT(e.equipo)]||null,
  rotacion:rotDe(CT(e.equipo)), notaRotacion:notaDe(CT(e.equipo))
}));

// ---- 7a. marcar a los que jugaron sin registro en Planeta ----
{let sf=0;
['ARQ','DEF','VOL','DEL'].forEach(pos=>{out.rankings[pos].forEach(x=>{
  const min=(x.individual&&x.individual.minutos)||0, pj=(x.individual&&x.individual.pj)||0;
  // Jugo, pero Planeta no le registra ningun partido calificado. Su ficha no es
  // un dato suyo: es el promedio de la liga. Hay que decirlo.
  x.sinFicha=(min>0 && pj===0); if(x.sinFicha) sf++;
});});
if(sf) console.log('  '+sf+' jugaron pero Planeta no les registra puntaje: su ficha es el promedio de la liga, quedan marcados');}

// ---- 7b. TABLERO DE LA FECHA ----
// Una fila por equipo con su partido: que tan solida esta su defensa y que tan
// vulnerable la del rival, ya ajustado por local/visitante con el factor de la
// liga. Es lo que contesta "que defensor tiene el mejor contexto" sin cruzar
// tablas a mano.
const ctxLam={}; ['ARQ','DEF','VOL','DEL'].forEach(pos=>out.rankings[pos].forEach(x=>{
  const k=CT(x.equipo); if(!ctxLam[k]) ctxLam[k]={lam:x.lam,pVI:x.pVI,rot:x.rotacion,rotRiv:x.rotacionRival,jug:x.partidoYaJugado};
}));
out.tablero=[];
f6.forEach(m=>{
  const kl=CT(m.local), kv=CT(m.visitante);
  [[kl,kv,true],[kv,kl,false]].forEach(([k,riv,esLocal])=>{
    const n=NIVEL[k], nr=NIVEL[riv], e=esperado(k,riv,esLocal), c=ctxLam[k];
    if(!n||!nr) return;
    out.tablero.push({
      equipo:NOMBRES[k]||k, equipoKey:k, rival:NOMBRES[riv]||riv, rivalKey:riv,
      condicion:esLocal?'L':'V', cuando:m.cuando,
      yaJugado:!!(c&&c.jug),
      // nivel propio y del rival (1.00 = promedio de la liga)
      miAtaque:n.atk, miDefensa:n.def, suAtaque:nr.atk, suDefensa:nr.def,
      pjNivel:n.pj,
      // esperado de este partido segun niveles + factor de localia
      xgFavor:e?e.xgFavor:null, xgContra:e?e.xgContra:null,
      // lo que dice el motor (anclado al mercado)
      lamFavor:c?c.lam.lamFor:null, lamContra:c?c.lam.lamAgainst:null,
      pValla:c?c.pVI:null,
      rotacion:c?c.rot:0, rotacionRival:c?c.rotRiv:0
    });
  });
});
// dos lecturas rapidas
out.tableroDefensa = out.tablero.slice().sort((a,b)=>(b.pValla||0)-(a.pValla||0));
out.tableroAtaque  = out.tablero.slice().sort((a,b)=>(b.lamFavor||0)-(a.lamFavor||0));
out.liga = Object.assign(out.liga||{}, {
  ventajaLocal:{ xgLocal:+LIGA.locXg.toFixed(3), xgVisitante:+LIGA.visXg.toFixed(3),
                 pctMas:+(100*(LIGA.locXg/LIGA.visXg-1)).toFixed(0), partidos:LIGA.partidos }});

// ---- 8. aportes vs separacion por posicion ----
out.aportes={};
['ARQ','DEF','VOL','DEL'].forEach(pos=>{
  const g=out.rankings[pos].filter(x=>x.pJuega>0.5);
  const term={};
  g.forEach(x=>x.desglose.forEach(d=>{(term[d[0]]=term[d[0]]||[]).push(d[1]);}));
  Object.keys(term).forEach(k=>{while(term[k].length<g.length)term[k].push(0);});
  const filas=Object.entries(term).map(([k,v])=>{
    const m=v.reduce((a,b)=>a+b,0)/v.length, sv=[...v].sort((a,b)=>a-b);
    const p10=sv[Math.floor(v.length*.1)], p90=sv[Math.floor(v.length*.9)];
    return {k,m:+m.toFixed(2),p10:+p10.toFixed(2),p90:+p90.toFixed(2),rango:+(p90-p10).toFixed(2)};
  });
  const sm=filas.reduce((a,b)=>a+Math.abs(b.m),0), sr=filas.reduce((a,b)=>a+b.rango,0)||1;
  filas.forEach(f=>{f.pctPje=+(100*Math.abs(f.m)/sm).toFixed(1); f.pctSep=+(100*f.rango/sr).toFixed(1);});
  filas.sort((a,b)=>b.pctSep-a.pctSep);
  const eps=g.map(x=>x.EP).sort((a,b)=>a-b);
  out.aportes[pos]={n:g.length,filas,epMedio:+(eps.reduce((a,b)=>a+b,0)/eps.length).toFixed(2),
    epP10:+eps[Math.floor(eps.length*.1)].toFixed(2), epP90:+eps[Math.floor(eps.length*.9)].toFixed(2)};
});
out.nombres=NOMBRES;
out.generado=new Date().toISOString();
out.ultimaFechaJugada=ultimaJugada||P.ultimaFecha||0;
// La fecha que se esta analizando es la de los partidos que tienen cuotas, no
// necesariamente la siguiente a la ultima jugada: si las cuotas quedaron viejas
// hay que decirlo en vez de mostrar numeros de un partido que ya se jugo.
out.fechaObjetivo=fechaObjetivo!=null?fechaObjetivo:out.ultimaFechaJugada+1;
const yaJugados=out.partidos.filter(m=>m.yaJugado).length;
out.cuotas={fecha:out.fechaObjetivo, partidos:out.partidos.length, yaJugados,
            pendientes:out.partidos.length-yaJugados,
            vencidas: yaJugados>=out.partidos.length-1};
if(out.cuotas.vencidas){
  console.log('  ATENCION: las cuotas son de la fecha '+out.fechaObjetivo+' y ya se jugaron '+yaJugados+' de '+out.partidos.length+' partidos.');
  console.log('  Hay que correr SYNC_CUOTAS.bat para traer las de la fecha '+(out.ultimaFechaJugada+1)+'.');
} else if(yaJugados){
  console.log('  cuotas de la fecha '+out.fechaObjetivo+': '+out.cuotas.pendientes+' partidos todavia por jugarse');
}

// payload compacto para la app
const slim=x=>({id:x.id,n:x.nombre,eq:x.equipo,pos:x.pos,riv:x.rival,cond:x.condicion[0],
 ep:x.EP,pj_:x.pJuega,sc:x.score,fi:x.ficha,pvi:x.pVI,lg:x.lamGol,pfig:x.pFigura,ta:x.tasaTA,
 piso:x.piso,techo:x.techo,perf:x.perfil||'',pe:x.pisoEquipo||null,
 rot:x.rotacion||0,rotr:x.rotacionRival||0,nrot:x.notaRotacion||'',
 pr:x.precio,ind:x.individual,me:x.miEquipo,er:x.elRival,met:x.miEquipoTotal,ert:x.elRivalTotal,
 an:x.anomalia,anr:x.anomaliaRival, disp:x.disponibilidad, jug:x.partidoYaJugado, sf:x.sinFicha,
 des:(x.desglose||[]).map(d=>[d[0],+Number(d[1]).toFixed(2),d[2]]),
 lam:{f:x.lam.lamFor,c:x.lam.lamAgainst,w:x.lam.pWin,d:x.lam.pDraw,mk:x.lam.tieneMercado}});
const paraApp={
  generado:out.generado, fechaObjetivo:out.fechaObjetivo, ultimaFechaJugada:out.ultimaFechaJugada,
  rankings:{ARQ:out.rankings.ARQ.map(slim),DEF:out.rankings.DEF.map(slim),
            VOL:out.rankings.VOL.map(slim),DEL:out.rankings.DEL.map(slim)},
  esquema:{optimo:{esquema:out.esquema.optimo.esquema,once:out.esquema.optimo.once.map(x=>({id:x.id}))},
           todos:out.esquema.todos.map(e=>({e:e.esquema,ids:e.once.map(x=>x.id),total:e.total}))},
  partidos:out.partidos, tablero:out.tablero, tabla:out.tabla, tablaZonas:out.tablaZonas, fixtureCompleto:out.fixtureCompleto,
  nombres:NOMBRES,
  equipos:out.equipos, aportes:out.aportes, liga:out.liga,
  presupuesto:out.presupuesto, validacion:out.validacion, cuotas:out.cuotas
};

// ---- 9. GUARDAR LA RECOMENDACION DE ESTA FECHA ----
// Sin esto no hay forma de saber si el motor acierta: cuando la fecha termina
// ya no queda registro de que habia recomendado antes de que se jugara.
// Se guarda una foto por fecha y despues backtest.cjs la compara contra los
// puntajes reales de Planeta.
try{
  if(!fs.existsSync('historial')) fs.mkdirSync('historial');
  const archivo='historial/fecha_'+out.fechaObjetivo+'.json';
  const yaEstaba=fs.existsSync(archivo);
  const foto={
    fecha: out.fechaObjetivo,
    generado: out.generado,
    ultimaFechaJugada: out.ultimaFechaJugada,
    // el once que recomienda el motor, con lo que espera de cada uno
    once: out.esquema.optimo.once.map(x=>{
      const j=[].concat(...['ARQ','DEF','VOL','DEL'].map(p=>out.rankings[p])).find(y=>y.id===x.id);
      return j?{nombre:j.nombre,pos:j.pos,equipo:j.equipo,EP:+j.EP.toFixed(2),
                pJuega:+j.pJuega.toFixed(2),precio:j.precio}:null;
    }).filter(Boolean),
    esquema: out.esquema.optimo.esquema,
    // el top 25 de cada puesto, para poder evaluar el ranking entero y no solo el once
    ranking: {}, 
    partidos: out.partidos.map(m=>({local:m.local,visitante:m.visitante,
      pGolLocal:m.pGolLocal,pGolVisitante:m.pGolVisitante,
      pVallaLocal:m.pVallaLocal,pVallaVisitante:m.pVallaVisitante,
      golesEsperadosLocal:m.golesEsperadosLocal,golesEsperadosVisitante:m.golesEsperadosVisitante}))
  };
  ['ARQ','DEF','VOL','DEL'].forEach(p=>{
    foto.ranking[p]=out.rankings[p].slice(0,25).map(j=>({nombre:j.nombre,equipo:j.equipo,
      EP:+j.EP.toFixed(2),pJuega:+j.pJuega.toFixed(2),ficha:+j.ficha.toFixed(2),precio:j.precio}));
  });
  fs.writeFileSync(archivo,JSON.stringify(foto,null,1));
  console.log((yaEstaba?'  (actualizada) ':'  ')+'foto guardada: '+archivo+'  — sirve para el backtest cuando termine la fecha');
}catch(e){ console.log('  no pude guardar la foto de la fecha:',e.message); }

fs.writeFileSync('salida.json',JSON.stringify(out,null,1));
fs.writeFileSync('datos.js','window.DATOS='+JSON.stringify(paraApp)+';');
// datos.js: para que index.html lo cargue con <script> y funcione hasta con file://
console.log('OK -> salida.json y datos.js');

