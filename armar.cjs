const fs=require('fs'), vm=require('vm');

// ─────────────────────────────────────────────────────────────────────────────
// SELLO DE VERSION. Sirve para una sola cosa, pero importante: saber de un
// vistazo si los archivos que estan corriendo son los ultimos. El 27/08 pasamos
// dos dias arreglando cosas que "seguian rotas" porque los archivos nuevos
// estaban en Descargas y nunca llegaron a la carpeta. Ahora la version se
// imprime en la consola y se muestra en la cabecera de la pagina.
// ─────────────────────────────────────────────────────────────────────────────
const VERSION_MOTOR = 'v29 · 03/09/2026';
const M=require('./motorV3.cjs');

// HUELLA DE LOS ARCHIVOS DEL MOTOR (03/09).
// Esta carpeta esta adentro de OneDrive, que sincroniza sola y tiene historial
// de versiones. Ya paso: motorV3.cjs volvio a una version de 17 horas antes sin
// que nadie lo tocara, y la corrida salio "todo en orden" calculando con el
// motor viejo. Los sintomas eran raros y no apuntaban al archivo — el
// arriesgado elegia un esquema que ya no deberia elegir, y el auditor mostraba
// un texto que ya no existia.
// (En la carpeta hay "armar_1.cjs" y "QUE_SUBO_A_GITHUB_1.md": asi se llaman
// las copias que deja OneDrive cuando no puede resolver un conflicto.)
// Con esto, cada corrida imprime tamaño y hora de los dos archivos que hacen
// las cuentas. Si uno vuelve para atras, se ve en el log en vez de descubrirse
// tres horas despues por un numero que no cierra.
(function(){
  const huella = f => { try { const st=fs.statSync(f);
      return f.padEnd(13)+String(st.size).padStart(7)+' bytes  ·  '+
             new Date(st.mtimeMs).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    } catch(e){ return f+'  NO ESTA'; } };
  console.log('MOTOR '+VERSION_MOTOR+' — '+huella('motorV3.cjs'));
  console.log('              '+huella('riesgo.cjs'));
})();
const P=JSON.parse(fs.readFileSync('dataPlaneta.json','utf8'));
const S=JSON.parse(fs.readFileSync('data365.json','utf8'));
const C=JSON.parse(fs.readFileSync('dataCuotas.json','utf8'));
let HIST=null;
try{ HIST=JSON.parse(fs.readFileSync('data365_historico.json','utf8')); }catch(e){ console.log('(sin data365_historico.json: los niveles salen solo del torneo actual)'); }
let COPAS={equipos:{}};
try{ COPAS=JSON.parse(fs.readFileSync('dataCopas.json','utf8')); }catch(e){ console.log('(sin dataCopas.json: no se aplica ajuste por copas)'); }
// ═══════════════════════════════════════════════════════════════════════════
// SEPARAR EL TORNEO ACTUAL DEL ANTERIOR  (02/09/2026)
//
// data365.json paso a traer DOS torneos mezclados en el mismo archivo: los
// totales de cada jugador (minutos, partidos, tiros, xG) venian sumados de los
// dos, y el log traia la misma fecha dos veces. Brayan Cortes figuraba con
// 1980 minutos y 22 partidos en un torneo de 7 fechas. 372 de 839 jugadores
// —el 44%— tenian mas minutos que el maximo posible.
//
// De ahi salian todos los disparates: los tiros y el xG por 90 divididos por
// minutos de dos torneos, "le deben 5.36 goles" (xG de dos torneos contra
// goles de uno solo, que salen de Planeta), y jugadores con 20 partidos en la
// pantalla de Lideres.
//
// EL CORTE NO ES UN NUMERO INVENTADO. El historico trae la fecha de cada
// partido: ordenados en el tiempo hay un hueco de 80 dias entre el 04/05 y el
// 23/07, que es el receso entre torneos. El gid mas alto anterior a ese hueco
// es la frontera, y como los gid de 365Scores crecen con el tiempo, todo lo
// que esta por encima es del torneo actual. Se recalcula solo en cada corrida.
// ═══════════════════════════════════════════════════════════════════════════
let GID_CORTE = null, INICIO_ACTUAL = null;
if(HIST && Array.isArray(HIST.filasJugador)){
  const cuandoDeGid={};
  HIST.filasJugador.forEach(r=>{ if(r.gid && r.cuando) cuandoDeGid[r.gid]=r.cuando; });
  const partidos=Object.entries(cuandoDeGid)
    .map(([gid,c])=>({gid:+gid, t:new Date(c).getTime()}))
    .sort((a,b)=>a.t-b.t);
  if(partidos.length>20){
    let mejorHueco=0, corteT=null;
    for(let i=1;i<partidos.length;i++){
      const d=(partidos[i].t-partidos[i-1].t)/86400000;
      if(d>mejorHueco){ mejorHueco=d; corteT=partidos[i-1].t; }
    }
    if(mejorHueco>=30){
      GID_CORTE = Math.max(...partidos.filter(p=>p.t<=corteT).map(p=>p.gid));
      INICIO_ACTUAL = new Date(partidos.find(p=>p.t>corteT).t);
      console.log('TORNEOS — receso de '+mejorHueco.toFixed(0)+' dias detectado; el torneo actual arranca el '+
        INICIO_ACTUAL.toISOString().slice(0,10)+'. Todo partido con gid > '+GID_CORTE+' es de este torneo.');
    }
  }
}

if(GID_CORTE!=null){
  // 1) los totales de cada jugador se REHACEN desde el log del torneo actual
  let tocados=0, antesMax=0, despuesMax=0;
  Object.values(S.jugadores).forEach(p=>{
    const todo=p.log||[];
    const l=todo.filter(x=>x.gid>GID_CORTE);
    antesMax=Math.max(antesMax, todo.length);
    despuesMax=Math.max(despuesMax, l.length);
    if(l.length===todo.length) return;
    tocados++;
    p.log=l;
    p.partidos=l.length;
    p.minutos=l.reduce((a,x)=>a+(x.min||0),0);
    p.tiros  =l.reduce((a,x)=>a+(x.tiros||0),0);
    p.goles  =l.reduce((a,x)=>a+(x.goles||0),0);
    p.faltas =l.reduce((a,x)=>a+(x.faltas||0),0);
    p.xg=+l.reduce((a,x)=>a+(x.xg||0),0).toFixed(3);
    p.minutosPorPartido = l.length? Math.round(p.minutos/l.length) : 0;
    p.tirosPorPartido   = l.length? +(p.tiros/l.length).toFixed(2) : 0;
    p.xgPorPartido      = l.length? +(p.xg/l.length).toFixed(3) : 0;
    p.titularidad       = l.length? +(l.filter(x=>(x.min||0)>=60).length/l.length).toFixed(2) : null;
  });
  if(tocados) console.log('  '+tocados+' jugadores traian los dos torneos sumados. Totales rehechos desde el log: '+
    'el que mas partidos tenia pasa de '+antesMax+' a '+despuesMax+'.');

  // 2) el historico se queda SOLO con el torneo anterior. Si no, el torneo
  //    actual entra dos veces al nivel de cada equipo: una por data365 y otra
  //    por aca.
  if(Array.isArray(HIST.filasJugador)){
    const antes=HIST.filasJugador.length;
    HIST.filasJugador=HIST.filasJugador.filter(r=>!(r.gid>GID_CORTE));
    const gids=new Set(HIST.filasJugador.map(r=>r.gid));
    if(antes!==HIST.filasJugador.length)
      console.log('  data365_historico.json traia '+(antes-HIST.filasJugador.length)+' filas del torneo ACTUAL. '+
        'Se sacaron: el historico queda con '+gids.size+' partidos del torneo anterior.');
  }
}

// ---- LEY DEL EX: en que club jugo cada uno el torneo pasado ----------------
// HIST ya quedo recortado al torneo ANTERIOR, asi que alcanza con agrupar por
// nombre de 365Scores y club. Despues, cuando cada jugador tenga su rival de
// la fecha, se cruza. No se inventa nada: si el tipo no jugo un minuto en ese
// club dentro de lo que tenemos guardado, no aparece.
const CLUBES_ANTES={};
if(HIST && Array.isArray(HIST.filasJugador)){
  HIST.filasJugador.forEach(r=>{
    if(!r.nombre || !r.equipo) return;
    const m=CLUBES_ANTES[r.nombre]=CLUBES_ANTES[r.nombre]||{};
    const c=m[r.equipo]=m[r.equipo]||{equipo:r.equipo,min:0,pj:0,goles:0,asis:0};
    c.min+=r.minutos||0; c.goles+=r.goles||0; c.asis+=r.asistencias||0;
    if((r.minutos||0)>0) c.pj++;
  });
}
if(GID_CORTE==null && HIST){
  console.log('  OJO — no pude separar los torneos (el historico no trae fechas o no hay receso claro). '+
    'Si ves jugadores con mas partidos que fechas jugadas, es esto.');
}

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
// QUE PARTIDOS SE JUGARON YA.
// ARREGLADO 01/09. Antes se miraba el log de los jugadores y se marcaba un par
// de equipos como "ya jugado" si aparecia en cualquier partido. Cuando
// data365.json paso a traer TAMBIEN el torneo anterior, todos los pares del
// fixture ya figuraban jugados (los mismos 30 equipos jugaron todos contra
// todos el torneo pasado), asi que NINGUNA ronda quedaba con jugados===0, la
// fecha objetivo salia null y el programa se caia al plan B: "los 15 partidos
// con cuotas mas proximos". Eso arma un Frankenstein — 4 partidos de la fecha
// 7, 7 de la 8 y 3 de la 9 — que es exactamente lo que se veia en la app.
// Ahora el corte sale del fixture fresco de 365Scores, que trae el numero de
// fecha y si el partido termino. El log de jugadores queda solo de respaldo.
const FIXTURE_FRESCO=(()=>{ try{
  const f=JSON.parse(fs.readFileSync('dataFixture.json','utf8')).partidos||[];
  return f.filter(m=>m.numeroFecha!=null && m.local && m.visitante);
}catch(e){ return []; } })();

const rondas={};
if(FIXTURE_FRESCO.length){
  FIXTURE_FRESCO.forEach(m=>{
    const r=m.numeroFecha;
    const o=rondas[r]=rondas[r]||{total:0,jugados:0,pares:new Set()};
    o.total++; o.pares.add([CT(m.local),CT(m.visitante)].sort().join('|'));
    if(m.terminado) o.jugados++;
  });
} else {
  const jugadosPorPar=new Set();
  Object.values(S.jugadores).forEach(j=>{(j.log||[]).forEach(l=>{
    if(l.min) jugadosPorPar.add([CT(j.equipo),CT(l.vs)].sort().join('|'));
  });});
  (viejo.fixture||[]).forEach(m=>{
    const r=m.round; if(r==null) return;
    const o=rondas[r]=rondas[r]||{total:0,jugados:0,pares:new Set()};
    o.total++; o.pares.add([CT(m.home),CT(m.away)].sort().join('|'));
    if(jugadosPorPar.has([CT(m.home),CT(m.away)].sort().join('|'))) o.jugados++;
  });
  console.log('(sin dataFixture.json: la fecha objetivo sale del fixture viejo de data.js)');
}
let fechaObjetivo=null;
Object.keys(rondas).map(Number).sort((a,b)=>a-b).forEach(r=>{
  if(fechaObjetivo===null && rondas[r].jugados===0) fechaObjetivo=r;
});
// cuotas de esa fecha, cruzadas por el par de equipos
const paresObjetivo = fechaObjetivo!==null ? rondas[fechaObjetivo].pares : null;
let f6=[];
if(paresObjetivo){
  f6=C.cuotas.filter(m=>paresObjetivo.has([CT(m.local),CT(m.visitante)].sort().join('|')));
  // La casa a veces publica el mismo partido dos veces con horarios distintos
  // (Estudiantes RC vs Sarmiento aparecio el 04 y el 06). Se queda el que cae
  // mas cerca del horario que dice el fixture de 365Scores.
  const horaFixture={};
  FIXTURE_FRESCO.forEach(m=>{ horaFixture[[CT(m.local),CT(m.visitante)].sort().join('|')]=new Date(m.fecha).getTime(); });
  const mejorPorPar={};
  f6.forEach(m=>{ const k=[CT(m.local),CT(m.visitante)].sort().join('|');
    const t=new Date(m.cuando).getTime(), ref=horaFixture[k];
    const d=ref?Math.abs(t-ref):0;
    if(!mejorPorPar[k]||d<mejorPorPar[k].d) mejorPorPar[k]={m,d}; });
  const antes=f6.length;
  f6=Object.values(mejorPorPar).map(o=>o.m);
  if(antes!==f6.length) console.log('  ('+(antes-f6.length)+' partido(s) duplicado(s) en las cuotas: me quedo con el del horario del fixture)');
}
if(!f6.length){
  // sin cruce (fixture viejo o cuotas raras): se cae al criterio anterior
  const orden=[...C.cuotas].sort((a,b)=>new Date(a.cuando)-new Date(b.cuando));
  const vistos=new Set();
  for(const m of orden){ const h=CT(m.local),a=CT(m.visitante);
    if(vistos.has(h)||vistos.has(a))continue; vistos.add(h);vistos.add(a); f6.push(m); if(f6.length===15)break; }
  const dias = f6.length ? (new Date(f6[f6.length-1].cuando)-new Date(f6[0].cuando))/86400000 : 0;
  console.log('');
  console.log('  ############################################################');
  console.log('  # NO PUDE CRUZAR LAS CUOTAS CON EL FIXTURE.');
  console.log('  # Estoy usando los '+f6.length+' partidos con cuota mas proximos, que');
  console.log('  # abarcan '+dias.toFixed(0)+' dias: eso MEZCLA FECHAS y el analisis no sirve.');
  console.log('  # Revisa que dataFixture.json y dataCuotas.json esten al dia.');
  console.log('  ############################################################');
  console.log('');
} else {
  f6.sort((a,b)=>new Date(a.cuando)-new Date(b.cuando));
  const abarca=(new Date(f6[f6.length-1].cuando)-new Date(f6[0].cuando))/86400000;
  if(abarca>8) console.log('  OJO: los partidos de la fecha '+fechaObjetivo+' abarcan '+abarca.toFixed(0)+
    ' dias. Una fecha se juega en 3 o 4: puede haber cuotas de otra fecha coladas.');
  const faltan=rondas[fechaObjetivo].total-f6.length;
  console.log('FECHA '+fechaObjetivo+' — '+f6.length+' de '+rondas[fechaObjetivo].total+' partidos con cuotas, del '+
    f6[0].cuando.slice(0,10)+' al '+f6[f6.length-1].cuando.slice(0,10)+
    (faltan>0?('   ('+faltan+' sin cuota todavia)'):''));
  const cerradas=Object.keys(rondas).map(Number).filter(r=>r<fechaObjetivo&&rondas[r].jugados>0&&rondas[r].jugados<rondas[r].total);
  cerradas.forEach(r=>console.log('  (la fecha '+r+' esta en curso: '+rondas[r].jugados+' de '+rondas[r].total+' jugados, ya no se puede cambiar el equipo)'));
}

// LA FECHA QUE TODAVIA SE ESTA JUGANDO.
// En Gran DT los cambios abren recien cuando termina el ultimo partido de la
// fecha en curso. Mientras queden partidos por jugarse de la fecha anterior,
// no hay nada que cambiar aunque la proxima este a tres dias.
let FECHA_EN_CURSO = null;
if(FIXTURE_FRESCO.length && fechaObjetivo!=null){
  const previa = FIXTURE_FRESCO.filter(m=>m.numeroFecha===fechaObjetivo-1);
  const faltan = previa.filter(m=>!m.terminado);
  if(faltan.length){
    const ultimo = faltan.map(m=>new Date(m.fecha)).sort((a,b)=>b-a)[0];
    FECHA_EN_CURSO = { numero: fechaObjetivo-1, faltan: faltan.length,
      total: previa.length, ultimo: ultimo.toISOString() };
    console.log('  la fecha '+FECHA_EN_CURSO.numero+' sigue en curso: faltan '+faltan.length+
      ' de '+previa.length+' partidos. Los cambios abren cuando termine el ultimo.');
  }
}

// ---- 2. indices
const eq365={}; Object.values(S.equipos).forEach(e=>{eq365[CT(e.equipo)]=e;});
const st={}; [...viejo.standings.zonaA,...viejo.standings.zonaB].forEach(s=>{st[CT(s.team)]=s;});
const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').replace(/\s+/g,' ').trim();
// El cruce Planeta <-> 365Scores va SIEMPRE con el equipo adentro de la clave.
// Sin eso, "Molina, Joaquín" (arquero de Banfield, cero partidos) enganchaba
// con "Tomás Molina" (delantero de Argentinos) por apellido, y el arquero
// aparecia con 9 tiros y 1.02 de xG. Un arquero con amenaza de gol se cuela
// primero en cualquier once arriesgado, porque el gol de arquero paga 12.
const idx365={};
const clave=(nom,eq)=>norm(nom)+'@'+CT(eq);
Object.values(S.jugadores).forEach(p=>{
  const n=norm(p.nombre), e=CT(p.equipo);
  idx365[n+'@'+e]=p;
  const w=n.split(' ');
  if(w.length>=2){const inv=w.slice(1).join(' ')+' '+w[0]+'@'+e; if(!idx365[inv])idx365[inv]=p;}});

// ---- 2a-bis. EL AYUDANTE DE CAMPO DEL GRAN DT OFICIAL ---------------------
// El propio juego publica dos JSON abiertos con el estado de cada jugador
// antes de la fecha: LESIONADO, EN DUDA, SUSPENDIDO, EXPULSADO, NO JUEGA,
// JUEGA COPA, POSIBLE TITULAR. Es la unica fuente que tiene los lesionados, y
// es la autoridad para las tarjetas porque es la que cuenta para el juego.
// Los baja SYNC_GRANDT.ps1 a dataGranDT.json. Si el archivo no esta, todo
// sigue funcionando como antes: nada de esto es obligatorio.
const GDT = (function(){ try{
  return JSON.parse(fs.readFileSync('dataGranDT.json','utf8').replace(/^﻿/,''));
}catch(e){ return null; } })();
const GDT_POR = {};          // clave nombre@equipo (y nombre solo) -> ficha del ayudante
let GDT_VEDA = null;         // momento exacto en que cierran los cambios
let GDT_FECHA = null;
if(GDT && GDT.estatico && GDT.dinamico){
  const E=GDT.estatico, D=GDT.dinamico;
  const nombreEstado={}; (E.estadosJugador||[]).forEach(x=>nombreEstado[x.id]=(x.nombre||'').trim());
  const estadoDe={}; (D.estadoPorJugador||[]).forEach(x=>estadoDe[x.idJT]=x.st);
  const tarjDe={};   (E.jugTarjetometro||[]).forEach(x=>tarjDe[x.idJT]=x);
  const figDe={};    (E.jugFiguras||[]).forEach(x=>figDe[x.idJT]=x.valorReporte);
  const exDe={};     (E.leyDelEx||[]).forEach(x=>exDe[x.idJT]=x.exClub);
  const dtsDe={};    (E.todosLosJugadores||[]).forEach(j=>{});
  (D.jugNoJuegan||[]).forEach(x=>{ dtsDe[x.idJT]=x.dts; });
  (E.leyDelEx||[]).forEach(x=>{ if(dtsDe[x.idJT]==null) dtsDe[x.idJT]=x.dts; });

  // Cruce con la planilla. El apellido y el nombre de pila alcanzan: el Gran DT
  // a veces usa el segundo nombre ("Nervo, Martin" por "Nervo, Hugo Martin") o
  // acorta el apellido compuesto ("Sosa" por "Sosa Yung"), asi que el cruce va
  // en tres pasadas y siempre dentro del mismo club.
  const partes=s=>{ const q=(s||'').split(','); return {ap:norm(q[0]||''), nom:norm(q.slice(1).join(' '))}; };
  const exacto={}, porApClub={};
  (E.todosLosJugadores||[]).forEach(j=>{
    exacto[norm(j.nombre)+'@'+CT(j.club)]=j;
    const k=partes(j.nombre).ap.split(' ')[0]+'@'+CT(j.club);
    (porApClub[k]=porApClub[k]||[]).push(j);
  });
  const buscar=(nombre,equipo)=>{
    const e=CT(equipo), n=norm(nombre);
    if(exacto[n+'@'+e]) return exacto[n+'@'+e];
    const {ap,nom}=partes(nombre);
    const cand=porApClub[ap.split(' ')[0]+'@'+e]||[];
    if(cand.length===1) return cand[0];
    const mios=new Set(nom.split(' ').filter(Boolean));
    const hit=cand.filter(j=>partes(j.nombre).nom.split(' ').some(t=>mios.has(t)));
    return hit.length===1 ? hit[0] : null;
  };
  let cruzados=0; const sinCruzar=[]; const cuenta={};
  P.jugadores.forEach(j=>{
    const g=buscar(j.nombre, j.equipo);
    if(!g){ sinCruzar.push(j.nombre+' ('+j.equipo+')'); return; }
    cruzados++;
    const t=tarjDe[g.id]||{};
    const ficha={ id:g.id, estadoId:estadoDe[g.id]??g.idStatus??null,
      estado: nombreEstado[estadoDe[g.id]??g.idStatus] || null,
      amarillas: t.amarillas!=null? Number(t.amarillas):null,
      rojas: t.rojas!=null? Number(t.rojas):null,
      figuras: figDe[g.id]??null, exClub: exDe[g.id]||null, dts: dtsDe[g.id]??null };
    GDT_POR[norm(j.nombre)+'@'+CT(j.equipo)]=ficha;
    if(GDT_POR[norm(j.nombre)]===undefined) GDT_POR[norm(j.nombre)]=ficha;
    if(ficha.estado) cuenta[ficha.estado]=(cuenta[ficha.estado]||0)+1;
  });
  GDT_FECHA = (D.fechaActual&&D.fechaActual.nombre)||null;
  if(D.fechaActual && D.fechaActual.inicioVeda) GDT_VEDA = new Date(Number(D.fechaActual.inicioVeda)).toISOString();
  const dias=(Date.now()-new Date(GDT.generado).getTime())/86400000;
  console.log('AYUDANTE DE CAMPO ('+GDT_FECHA+') — '+cruzados+' de '+P.jugadores.length+
    ' jugadores cruzados'+(sinCruzar.length? ' ('+sinCruzar.length+' sin cruzar: '+sinCruzar.slice(0,3).join(', ')+')':'')+
    (GDT_VEDA? '  ·  cierran cambios '+new Date(GDT_VEDA).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}):''));
  console.log('  estados: '+Object.entries(cuenta).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(' · '));
  if(dias>1.5) console.log('  OJO — dataGranDT.json tiene '+dias.toFixed(1)+' dias. Corré SYNC_GRANDT.bat de nuevo: '+
    'los lesionados y las formaciones cambian hasta una hora antes del partido.');
} else {
  console.log('AYUDANTE DE CAMPO — no encontre dataGranDT.json. Sin el no hay lesionados ni ley del ex; corré SYNC_GRANDT.bat.');
}
// Estados que son un HECHO del juego: el jugador no va a jugar. Lo demas
// (En duda, Posible Titular, Habilitado) es informacion y se muestra, pero no
// toca el puntaje: todavia no lo medimos y no se inventan numeros.
const GDT_NO_JUEGA = new Set(['Lesionado','Suspendido','Expulsado','No juega']);
const fichaGDT=(nombre,equipo)=> GDT_POR[norm(nombre)+'@'+CT(equipo)] || GDT_POR[norm(nombre)] || null;

// ---- 2b. tarjetas, suspensiones y partidos ya jugados ----
// Las tarjetas salen de partido.events de 365Scores (1=gol, 2=amarilla, 3=roja),
// con minuto y fecha. Regla de la Liga Profesional: a la QUINTA amarilla hay una
// fecha de suspension, y una roja suspende el partido siguiente.
const TARJ={};
Object.values(S.tarjetas||{}).forEach(t=>{
  const n=norm(t.nombre); TARJ[n]=t;
  const w=n.split(' '); if(w.length>=2){const inv=w.slice(1).join(' ')+' '+w[0]; if(!TARJ[inv])TARJ[inv]=t;}
});
// LAS ROJAS TAMBIEN VENIAN DE LOS DOS TORNEOS (02/09).
// S.ultimaFechaConTarjetas valia 16: la ultima fecha del torneo PASADO, porque
// data365.json guarda los dos juntos. Con eso la regla "roja en la ultima fecha
// => suspendido" fallaba en las dos direcciones: marcaba suspendidos a Robertone
// y a Adrian Fernandez por una roja del 24 de abril, y no marcaba a nadie
// expulsado en la fecha 7, porque 7 nunca va a ser >= 16.
// La reparacion usa tarjetasDetalle, que trae el gid de cada tarjeta, y rehace
// las rojas del torneo actual. Las amarillas siguen saliendo de la planilla de
// Gran DT, que es la que cuenta para el juego.
let ultFechaTarj=Number(S.ultimaFechaConTarjetas)||0;
if(GID_CORTE!=null && Array.isArray(S.tarjetasDetalle)){
  const ahora=S.tarjetasDetalle.filter(r=>r.gid>GID_CORTE && (r.tipo==='roja'||r.tipo==='amarilla'));
  if(ahora.length){
    const rojas={};
    ahora.filter(r=>r.tipo==='roja').forEach(r=>{
      const k=norm(r.nombre); const f=Number(r.fecha)||0;
      const o=rojas[k]=rojas[k]||{n:0,ult:null};
      o.n++; if(o.ult==null||f>o.ult) o.ult=f;
    });
    let corregidos=0, perdidos=0;
    Object.values(TARJ).forEach(t=>{ if(t._limpio) return; t._limpio=true;
      const k=norm(t.nombre), r=rojas[k];
      const antesRo=Number(t.rojas)||0, antesF=t.fechaUltimaRoja;
      t.rojas = r? r.n : 0;
      t.fechaUltimaRoja = r? r.ult : null;
      if(antesRo!==t.rojas || antesF!==t.fechaUltimaRoja) corregidos++;
      if(antesRo>0 && t.rojas===0) perdidos++;
    });
    const fMax=Math.max(0,...ahora.map(r=>Number(r.fecha)||0));
    console.log('TARJETAS — las rojas se rehicieron con el torneo actual: '+corregidos+' jugadores corregidos ('+
      perdidos+' tenian rojas que eran del torneo pasado). La ultima fecha con tarjetas pasa de '+
      ultFechaTarj+' a '+fMax+'.');
    ultFechaTarj=fMax;
  }
}
// SUSPENDIDOS DEL TARJETERO.
// Las fechas de suspension que pone el tribunal no estan en ninguna fuente que
// bajemos: 365Scores da la roja del partido y la planilla de Planeta da el
// total de rojas, pero no cuantas fechas debe cada uno. Eso lo publica
// PlanetaGranDT en su pagina, en una tabla que se llama "tarjetero".
// Hasta que la podamos bajar sola, se carga a mano en suspendidos.json y se
// muestra siempre diciendo de donde salio y de que fecha es.
let SUSPENDIDOS={fecha:null, fuente:null, jugadores:[]};
try{
  const raw=JSON.parse(fs.readFileSync('suspendidos.json','utf8'));
  if(raw && Array.isArray(raw.jugadores)) SUSPENDIDOS=raw;
}catch(e){}
const SUSP_MANUAL={};
SUSPENDIDOS.jugadores.forEach(j=>{
  const n=norm(j.nombre), p=(j.nombre||'').split(',');
  const dato={fechas:Number(j.fechas)||1, motivo:j.motivo||'roja', equipo:j.equipo||''};
  SUSP_MANUAL[n]=dato;
  if(p.length>1) SUSP_MANUAL[norm(p[1]+' '+p[0])]=dato;
});
if(SUSPENDIDOS.jugadores.length)
  console.log('suspendidos cargados a mano: '+SUSPENDIDOS.jugadores.length+
    ' (tarjetero a cumplir en la fecha '+SUSPENDIDOS.fecha+')');

const AMARILLAS_PLANETA={};
P.jugadores.forEach(j=>{ const n=norm(j.nombre), p=(j.nombre||'').split(',');
  AMARILLAS_PLANETA[n]=Number(j.ta)||0;
  if(p.length>1) AMARILLAS_PLANETA[norm(p[1]+' '+p[0])]=Number(j.ta)||0; });

function disponibilidad(nombrePlaneta, equipoPlaneta){
  const n=norm(nombrePlaneta), w=n.split(' ');
  const gdt = fichaGDT(nombrePlaneta, equipoPlaneta);
  const t=TARJ[n]||TARJ[w.slice(1).join(' ')+' '+w[0]];
  const manTmp = SUSP_MANUAL[n] || SUSP_MANUAL[w.slice(1).join(' ')+' '+w[0]] || null;
  // Antes se cortaba aca si 365Scores no tenia ninguna tarjeta del jugador, y
  // con eso se perdian los suspendidos del tarjetero que nunca vieron una
  // amarilla en la liga (Juan Jose Franco y Gianini quedaban sin marcar).
  if(!t && !manTmp && !gdt) return null;
  const am=t?(Number(t.amarillas)||0):0, ro=t?(Number(t.rojas)||0):0;
  const ultRoja=(t&&t.fechaUltimaRoja!=null)?Number(t.fechaUltimaRoja):null;
  // LAS AMARILLAS SALEN DE PLANETA, NO DE 365SCORES (01/09).
  // 365 cuenta las tarjetas de todas las competencias y da numeros mas altos:
  // decia que 47 jugadores estaban a una amarilla de la suspension cuando en la
  // planilla de Gran DT hay dos con cuatro. La que cuenta para el juego es la
  // de Gran DT, y esa la tenemos en la planilla.
  const amPlaneta = AMARILLAS_PLANETA[n] ?? AMARILLAS_PLANETA[w.slice(1).join(' ')+' '+w[0]];
  // EL TARJETOMETRO DEL PROPIO JUEGO MANDA (02/09). Antes la mejor fuente era
  // la planilla de Planeta, que copia al Gran DT con un dia de atraso. Ahora
  // bajamos el tarjetometro oficial y ese es el que decide; Planeta queda de
  // respaldo y 365Scores atras de todo.
  const amUsar = (gdt && gdt.amarillas!=null) ? gdt.amarillas
               : (amPlaneta!=null ? amPlaneta : am);
  const man = SUSP_MANUAL[n] || SUSP_MANUAL[w.slice(1).join(' ')+' '+w[0]] || null;
  const cumpleAca = man && SUSPENDIDOS.fecha!=null && SUSPENDIDOS.fecha + man.fechas - 1 >= (fechaObjetivo||0);
  // EL ESTADO DEL AYUDANTE DE CAMPO ES UN HECHO, NO UNA ESTIMACION.
  // Lo publica el propio juego: si dice Lesionado, el tipo no juega. Le gana a
  // cualquier cuenta nuestra de tarjetas y al tarjetero cargado a mano.
  const estadoGDT = gdt && gdt.estado ? gdt.estado : null;
  const fueraPorGDT = !!(estadoGDT && GDT_NO_JUEGA.has(estadoGDT));
  return { amarillas:amUsar, amarillas365:am, rojas:ro, fechaUltimaRoja:ultRoja,
    tarjetero: man ? {fechas:man.fechas, motivo:man.motivo, desde:SUSPENDIDOS.fecha, fuente:SUSPENDIDOS.fuente, cumpleAca:!!cumpleAca} : null,
    fuenteAmarillas: (gdt&&gdt.amarillas!=null) ? 'ayudante de campo' : (amPlaneta!=null ? 'planilla' : '365Scores'),
    rojasGranDT: gdt ? gdt.rojas : null,
    estado: estadoGDT, estadoId: gdt? gdt.estadoId : null,
    exClub: gdt ? gdt.exClub : null,
    dts: gdt ? gdt.dts : null,
    figurasGranDT: gdt ? gdt.figuras : null,
    // "En duda" y "Posible titular" NO tocan nada: se muestran y los mirás vos.
    enDuda: estadoGDT === 'En duda',
    posibleTitular: estadoGDT === 'Posible Titular',
    aUnaDeSuspension:(amUsar%5===4),
    motivoBaja: fueraPorGDT ? estadoGDT
              : (cumpleAca ? 'suspendido (tarjetero)'
              : ((ro>0 && ultRoja!=null && ultRoja>=ultFechaTarj) ? 'roja en la fecha '+ultRoja : null)),
    suspendido: fueraPorGDT || !!cumpleAca || (ro>0 && ultRoja!=null && ultRoja>=ultFechaTarj) };
}

// Partidos de la fecha objetivo que YA se jugaron. 365Scores los tiene con
// minutos: si aparecen, el partido ya paso y no hay nada que recomendar ahi.
// MISMO PROBLEMA QUE LA FECHA OBJETIVO, MISMA CAUSA (01/09).
// Se marcaba un partido como jugado si ese PAR DE EQUIPOS aparecia en el log
// de algun jugador, sin mirar cuando. Con el torneo anterior adentro de
// data365.json, todos los pares ya se habian jugado alguna vez y 13 de los 15
// partidos de la fecha 8 —que se juegan en septiembre— figuraban "YA JUGADO".
// El corte sale del fixture fresco, que dice partido por partido si termino.
const YA_JUGADOS=new Set();
if(FIXTURE_FRESCO.length){
  FIXTURE_FRESCO.filter(m=>m.terminado).forEach(m=>{
    YA_JUGADOS.add([CT(m.local),CT(m.visitante)].sort().join('|'));
  });
} else {
  Object.values(S.jugadores).forEach(j=>{(j.log||[]).forEach(l=>{
    if(!l.min) return;
    YA_JUGADOS.add([CT(j.equipo),CT(l.vs)].sort().join('|'));
  });});
}

// ---- 3. jugadores en el formato del motor
// Minutos por fecha del torneo, 0 donde no jugo. Se corta en la fecha anterior
// a la que estamos armando: nunca se mira una fecha que todavia no se jugo.
function minutosPorFecha(m, fObj){
  const hasta = Math.max(1, (fObj || 1) - 1);
  const out = new Array(hasta).fill(0);
  ((m && m.log) || []).forEach(l=>{ if(l.fecha>=1 && l.fecha<=hasta) out[l.fecha-1] = l.min || 0; });
  return out;
}
// Lo mismo pero con el detalle de cada fecha: hace falta saber si ARRANCO, no
// solo cuantos minutos jugo. Sin esto no se puede separar al titular al que
// sacan a los 55 del suplente que entra en el entretiempo.
function detallePorFecha(m, fObj){
  const hasta = Math.max(1, (fObj || 1) - 1);
  const out = new Array(hasta).fill(null);
  ((m && m.log) || []).forEach(l=>{ if(l.fecha>=1 && l.fecha<=hasta)
    out[l.fecha-1] = { min: l.min||0, tit: (l.tit==null? null : !!l.tit) }; });
  return out;
}
// ── CONTROL DE SANIDAD DE LOS DATOS ────────────────────────────────────────
// El 27/08 aparecio "Florian Monzon, 21 goles en un partido". Era el bug viejo
// del parser de 365Scores: los valores compuestos vienen como "2 (1)" —dos
// goles, uno de penal— y al borrar los no-digitos quedaba 21. El parser esta
// arreglado desde el 23/08 en los dos SYNC, pero data365_historico.json es del
// 22/08 y NUNCA se vuelve a generar (SYNC_365_HISTORICO no esta en
// ACTUALIZAR_TODO porque tarda 15 minutos). Resultado: 46 filas envenenadas de
// 9015, y con ellas el torneo entero figuraba con 3.76 goles por partido en vez
// de 1.99. Todas las calibraciones que salen de ese archivo estaban torcidas.
//
// El patron es reversible sin ambiguedad: 11 = "1 (1)", 21 = "2 (1)". Se repara
// al vuelo y se avisa. Si aparece otro patron, se avisa y no se toca nada.
function sanearGoles(filas, etiqueta){
  if(!Array.isArray(filas)) return 0;
  let arregladas=0, raras=0;
  filas.forEach(r=>{
    const g = r.goles;
    if(typeof g !== 'number' || g <= 5) return;
    const rec = Math.floor(g/10);
    if(g < 100 && rec >= 1 && rec <= 5){ r.goles = rec; arregladas++; }
    else { raras++; }
  });
  if(arregladas) console.log('  OJO — '+etiqueta+': '+arregladas+' filas con goles imposibles ("2 (1)" leido como 21). Reparadas al vuelo.');
  if(raras) console.log('  OJO — '+etiqueta+': '+raras+' filas con goles que no se pueden reparar. Quedan como estan.');
  return arregladas+raras;
}
{
  let tocadas = 0;
  tocadas += sanearGoles(HIST && HIST.filasJugador, 'data365_historico.json');
  const logs = [];
  [S, HIST].forEach(F=>{ if(!F || !F.jugadores) return;
    Object.values(F.jugadores).forEach(j=>{ (j.log||[]).forEach(l=>logs.push(l)); }); });
  tocadas += sanearGoles(logs, 'log por partido de los jugadores');
  if(HIST && HIST.generado){
    const dias = (Date.now() - new Date(HIST.generado).getTime())/86400000;
    if(dias > 10) console.log('  data365_historico.json tiene '+Math.round(dias)+' dias. Conviene correr SYNC_365_HISTORICO.bat (tarda ~15 min) para regenerarlo limpio.');
  }
  if(!tocadas) console.log('control de sanidad: OK, ningun gol imposible en las dos fuentes');
}

// ── FORMACIONES CONFIRMADAS ────────────────────────────────────────────────
// Una hora antes del partido 365Scores publica el once de verdad
// (lineups.status = "Confirmado"). Ahi el modelo de minutos —que tiene 28
// minutos de error cuadratico medio— deja de hacer falta para ese partido: se
// sabe quien arranca. Es la mejora mas grande que le queda al motor.
//
// Se aplica SOLO si la formacion esta confirmada Y de la lista salen entre 10 y
// 12 titulares. Si el formato no es el esperado, no se toca nada y se avisa por
// consola. Prefiero que no ande a que ande mal el viernes a la noche.
const CONFIRMADOS = {};
(function(){
  const fp = (S.formacionesProbables||[]);
  let equiposOk = 0, sinFormato = 0;
  const titularesDe = (detalle, once) => {
    if (Array.isArray(detalle) && detalle.length) {
      const marcados = detalle.filter(d => d && (d.titular === true ||
        String(d.estado||'').toLowerCase() === 'starter' || String(d.estado||'') === '1' ||
        (d.enCancha && String(d.enCancha) !== '' && String(d.enCancha) !== '0')));
      if (marcados.length >= 10 && marcados.length <= 12) return marcados.map(d=>d.nombre);
    }
    // Sin marca de titularidad: si la lista confirmada trae 11 nombres, son esos.
    if (Array.isArray(once) && once.length >= 10 && once.length <= 12) return once.slice();
    return null;
  };
  fp.forEach(p => {
    [['estadoLocal','local','detalleLocal','onceLocal'],
     ['estadoVisitante','visitante','detalleVisitante','onceVisitante']].forEach(([kEst,kEq,kDet,kOnce])=>{
      if (String(p[kEst]||'').toLowerCase().indexOf('confirm') < 0) return;
      if (String(p[kEst]||'').toLowerCase().indexOf('sin confirm') >= 0) return;
      const t = titularesDe(p[kDet], p[kOnce]);
      if (!t) { sinFormato++; return; }
      CONFIRMADOS[CT(p[kEq])] = new Set(t.map(norm));
      equiposOk++;
    });
  });
  if (equiposOk) console.log('FORMACIONES CONFIRMADAS: '+equiposOk+' equipos. Para esos, los minutos salen del once real y no de la estimacion.');
  if (sinFormato) console.log('  OJO — '+sinFormato+' equipos dicen "Confirmado" pero no pude sacar 11 titulares de la lista. Se ignoran (se usa la estimacion de siempre).');
  if (!equiposOk && !sinFormato) console.log('formaciones: ninguna confirmada todavia (se publican ~1 hora antes de cada partido; conviene correr SYNC_365.bat de nuevo justo antes de cerrar el equipo)');
})();


// ---- 2c. CRUCE PLANETA <-> 365SCORES, EN DOS PASADAS ----
// Primera pasada: los cruces seguros, siempre dentro del mismo equipo.
// Segunda pasada: los TRANSFERIDOS. Gran DT actualiza la planilla cuando un
// jugador cambia de club, pero 365Scores lo sigue listando en el equipo donde
// jugo los partidos. Con el cruce atado al equipo, esos jugadores quedaban sin
// minutos, sin tiros y sin xG: el motor los veia como si nunca hubieran pisado
// una cancha. Perrotta ya es de Defensa y Justicia en la planilla y en 365
// sigue en Banfield con 441 minutos; asi quedaba en cero.
// La segunda pasada solo cruza si el nombre es unico de los dos lados y el
// jugador de 365 no lo tomo nadie. Los minutos son reales, pero son del club
// anterior, asi que se marcan y se muestran con la advertencia en la app.
let cruceNombreUnico=0;
const CRUCE=new Array(P.jugadores.length).fill(null);
const TRANSFER={};
(function(){
  const usados=new Set();
  P.jugadores.forEach((j,i)=>{
    const raw=norm(j.nombre), w=raw.split(' '), eq=CT(j.equipo);
    let m=idx365[raw+'@'+eq]||idx365[w.slice(1).join(' ')+' '+w[0]+'@'+eq]||null;
    if(!m){const ap=w[0];
      const h=Object.values(S.jugadores).filter(x=>CT(x.equipo)===eq && norm(x.nombre).split(' ').includes(ap));
      if(h.length===1)m=h[0];}
    if(!m){
      const pila = w.slice(1).concat([w[0]]);
      const h=Object.values(S.jugadores).filter(x=>{
        if(CT(x.equipo)!==eq) return false;
        const partes=norm(x.nombre).split(' ');
        return partes.length===1 && pila.includes(partes[0]);
      });
      if(h.length===1){ m=h[0]; cruceNombreUnico++; }
    }
    if(m){ CRUCE[i]=m; usados.add(m); }
  });
  // indice global por nombre, sin equipo
  const porNombre={};
  Object.values(S.jugadores).forEach(p=>{
    const n=norm(p.nombre); (porNombre[n]=porNombre[n]||[]).push(p);
    const w=n.split(' ');
    if(w.length>=2){ const inv=w.slice(1).join(' ')+' '+w[0]; (porNombre[inv]=porNombre[inv]||[]).push(p); }
  });
  // cuantas veces se repite cada nombre del lado de la planilla, entre los que
  // quedaron sin cruzar: si hay dos "Gonzalez, Lucas" sueltos no se toca ninguno
  const sueltos={};
  P.jugadores.forEach((j,i)=>{ if(CRUCE[i]) return;
    const n=norm(j.nombre); sueltos[n]=(sueltos[n]||0)+1; });
  P.jugadores.forEach((j,i)=>{
    if(CRUCE[i]) return;
    const raw=norm(j.nombre), w=raw.split(' '), eq=CT(j.equipo);
    if(sueltos[raw]!==1) return;
    const cand=[...new Set((porNombre[raw]||[]).concat(porNombre[w.slice(1).join(' ')+' '+w[0]]||[]))];
    if(cand.length!==1) return;
    const m=cand[0];
    if(usados.has(m)) return;
    if(CT(m.equipo)===eq) return;
    if(!(m.minutos>0)) return;
    CRUCE[i]=m; usados.add(m);
    TRANSFER['p'+i]={desde:m.equipo, hacia:j.equipo, min:m.minutos};
  });
  const n=Object.keys(TRANSFER).length;
  if(n) console.log('TRANSFERIDOS: '+n+' jugadores que en la planilla ya estan en el club nuevo y en 365Scores siguen en el viejo. Se les recuperan los minutos y el xG, marcados como transferidos: '
    + Object.values(TRANSFER).map(t=>t.desde+'->'+t.hacia).slice(0,6).join(', ') + (n>6?', ...':''));
})();

// ---- PASES CARGADOS A MANO (03/09) ---------------------------------------
// El pase automatico de arriba solo ve el que YA cambio de club en la planilla
// de Planeta. Cuando un pase se cierra a mitad de semana, ni Planeta ni el
// ayudante de campo de Gran DT lo tienen todavia, y el jugador queda con el
// club, el rival y la condicion equivocados: todo lo que se calcula de el para
// esa fecha esta mal, no un poco, mal del todo.
// Caso que lo motivo: Bruno Sepulveda rescindio con Banfield el 2/9 y firmo en
// Platense. La app lo tenia de VISITANTE contra Aldosivi cuando en realidad
// juega de LOCAL contra Riestra — otro rival, otra condicion, otro ataque.
// Se carga a mano en pases.json y se avisa fuerte, porque mientras Gran DT no
// lo actualice el juego puede seguir tratandolo como jugador del club viejo.
const PASES_MANUALES=[];
(function(){
  let raw=null;
  try{ raw=JSON.parse(fs.readFileSync('pases.json','utf8').replace(/^\uFEFF/,'')); }catch(e){ return; }
  const lista=Array.isArray(raw&&raw.pases)?raw.pases:[];
  if(!lista.length) return;
  lista.forEach(t=>{
    if(!t || !t.nombre || !t.hacia) return;
    const objetivo=norm(t.nombre), partes=(t.nombre||'').split(',');
    const alterno=partes.length>1 ? norm(partes[1]+' '+partes[0]) : null;
    let encontrados=0;
    P.jugadores.forEach((j,i)=>{
      const n=norm(j.nombre);
      if(n!==objetivo && (!alterno || n!==alterno)) return;
      if(t.desde && CT(j.equipo)!==CT(t.desde)) return;   // no pisar a un homonimo
      if(CT(j.equipo)===CT(t.hacia)) return;              // la planilla ya se actualizo sola
      encontrados++;
      const antes=j.equipo;
      j.equipo=t.hacia;
      const m=CRUCE[i];
      TRANSFER['p'+i]={desde:antes, hacia:t.hacia, min:(m&&m.minutos)||0,
                       manual:true, cuando:t.fecha||null, fuente:t.fuente||null,
                       nota:t.nota||null};
      PASES_MANUALES.push({nombre:j.nombre, desde:antes, hacia:t.hacia, cuando:t.fecha||null});
    });
    if(!encontrados) console.log('  OJO — pases.json: no encontre a "'+t.nombre+'"'+(t.desde?' en '+t.desde:'')+'. O el nombre no coincide, o la planilla ya lo movio sola.');
  });
  if(PASES_MANUALES.length){
    console.log('PASES A MANO: '+PASES_MANUALES.length+' jugador(es) movidos de club porque las fuentes todavia no lo reflejan:');
    PASES_MANUALES.forEach(t=>console.log('   '+t.nombre+': '+t.desde+' -> '+t.hacia+(t.cuando?'  ('+t.cuando+')':'')));
    console.log('   OJO: cambian de rival y de condicion. Si Gran DT todavia no los actualizo, fijate en el juego antes de ponerlos.');
  }
})();

const players=[]; let match365=0, nuncaJugaron=0;
P.jugadores.forEach((j,i)=>{
  const m=CRUCE[i];
  // Los que no jugaron un solo minuto NI tienen partidos calificados no entran.
  // La planilla nueva trae los planteles completos y un tercio nunca jugo; sin
  // historial heredan la ficha promedio de la liga y se trepan al ranking.
  // No son candidatos: son nombres en una lista.
  const minutosReales=(m?(m.minutos||0):0), calificados=(j.ct||0);
  if(minutosReales===0 && calificados===0){ nuncaJugaron++; return; }
  // El contador va DESPUES del filtro: antes sumaba los 1000 de la planilla y
  // se dividia por los 740 que quedan, y daba "cruzados 112%".
  if(m)match365++;
  players.push({ id:'p'+i, name:j.nombre, position:j.posicion, team:j.equipo,
    matchesRated:j.ct, totalPoints:j.act, goals:j.gt, goalsPenalty:j.gp, goalsAway:j.gv,
    goalsGolden:j.go, goalsConceded:j.gr, ownGoals:j.ge, figuras:j.vf, cleanSheets:j.vi,
    yellowCards:j.ta, redCards:j.tr, penaltiesSaved:j.pa, penaltiesMissed:j.pe, price:j.cotizacion,
    xg365:m?m.xg:0, shots365:m?m.tiros:0, matches365:m?m.partidos:0,
    minutes365:m?m.minutos:0, titularidad:m?m.titularidad:null,
    transferido: TRANSFER['p'+i]||null,
    // Minutos fecha por fecha, con 0 en las fechas que no jugo. El motor los
    // necesita para estimar cuantos minutos va a jugar la proxima, que es
    // distinto de "juega o no juega".
    minutosLog: minutosPorFecha(m, fechaObjetivo),
    logDetalle: detallePorFecha(m, fechaObjetivo),
    // true = confirmado titular | false = su equipo confirmo y no esta | null = sin confirmar
    confirmado: (function(){ const c=CONFIRMADOS[CT(j.equipo)]; if(!c) return null;
      return c.has(norm(j.nombre)) || c.has(norm((j.nombre||'').split(',').reverse().join(' ').trim())); })(),
    nombre365: m? m.nombre : null,
    _m:m });
});
console.log('jugadores:',players.length,'(se dejaron afuera '+nuncaJugaron+' que nunca jugaron) | cruzados con 365Scores:',match365,'('+Math.round(100*match365/players.length)+'%)'+(cruceNombreUnico?'  ['+cruceNombreUnico+' cruzados por nombre de pila]':''));

// ---- ex clubes de cada jugador -------------------------------------------
// Dos fuentes, las dos reales: el torneo pasado (data365_historico) y los
// pases de mitad de torneo que ya detectamos al cruzar Planeta con 365.
// El nombre sale del cruce, no de adivinar: si el jugador no cruzo con
// 365Scores, sencillamente no tiene ex club y listo.
const EX_POR_ID={};
players.forEach(pl=>{
  const kAct=CT(pl.team), vistos=new Set([kAct]), ex=[];
  if(pl.nombre365 && CLUBES_ANTES[pl.nombre365]){
    Object.values(CLUBES_ANTES[pl.nombre365]).forEach(c=>{
      const k=CT(c.equipo);
      if(vistos.has(k) || !(c.min>0)) return;
      vistos.add(k);
      ex.push({equipo:c.equipo, min:c.min, pj:c.pj, goles:c.goles, asis:c.asis, cuando:'el torneo pasado'});
    });
  }
  if(pl.transferido && pl.transferido.desde){
    const k=CT(pl.transferido.desde);
    if(!vistos.has(k)){ vistos.add(k);
      ex.push({equipo:pl.transferido.desde, min:pl.transferido.min||0, pj:null, goles:null, asis:null,
               cuando:'este mismo torneo'}); }
  }
  if(ex.length) EX_POR_ID[pl.id]=ex;
});
console.log('  ex clubes detectados en '+Object.keys(EX_POR_ID).length+' jugadores (torneo pasado + pases de este torneo)');

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
// POR QUE rota, no solo cuanto. La app mostraba "COPA" en cualquier equipo con
// indice > 0, y River aparecia con COPA despues de quedar afuera de todas: su
// 0.4 no venia de un partido de copa por delante sino de haber jugado el
// miercoles. Son dos cosas distintas y se deciden distinto:
//   'guarda'   -> tiene copa ENCIMA, es probable que ponga suplentes
//   'cansancio'-> viene de jugar hace poco, llega fundido pero pone titulares
const motivoRot=k=>{const e=ROT[k]; if(!e) return null;
  const ind=Number(e.indiceRotacion)||0; if(ind<=0) return null;
  if(e.proximoEsCopa) return {tipo:'guarda', dias:Number(e.diasHastaProximo)||null,
    torneo:e.proximoTorneo||'copa', indice:ind};
  return {tipo:'cansancio', dias:Number(e.diasDescanso)||null,
    torneo:e.vieneDeTorneo||'', indice:ind};};
function getCtx(equipo){ const k=CT(equipo); const c=porEquipo[k]; if(!c)return null;
  return {esLocal:c.esLocal, rival:c.rival, odds:c.odds,
    miXg:xgDe(k,c.esLocal?'local':'visitante'), rivalXg:xgDe(c.rivalKey,c.esLocal?'visitante':'local'),
    misStandings:st[k], rivalStandings:st[c.rivalKey],
    rotacion:rotDe(k), rotacionRival:rotDe(c.rivalKey), notaRotacion:notaDe(k),
    motivoRotacion:motivoRot(k), motivoRotacionRival:motivoRot(c.rivalKey)}; }

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

// OJO: esto NO es el corte de local/visitante del equipo. Es su NIVEL general
// (que si se traslada de un torneo al otro) multiplicado por la ventaja de
// local de la LIGA. El corte propio de cada equipo va aparte, en CORTES.
// Arreglado 01/09: con cond='total' caia en la rama del "else" y aplicaba el
// factor de VISITANTE, asi que "el total" del equipo salia achicado y para
// cualquier jugador visitante daba exactamente lo mismo que su condicion.
// Los 734 jugadores tenian miEquipo === miEquipoTotal.
const bloque=(k,cond)=>{const n=NIVEL[k]; if(!n) return null;
  const fA = cond==='local'?LIGA.factorAtaqueLocal : cond==='visitante'?LIGA.factorAtaqueVisita : 1;
  const fC = cond==='local'?LIGA.factorAtaqueVisita: cond==='visitante'?LIGA.factorAtaqueLocal : 1;
  return {pj:n.pj, tiros:n.tir, tirosConcedidos:n.tirc,
          sot:null, sotConcedidos:null,
          xg:+(n.xg*fA).toFixed(3),
          xgConcedido:+(n.xgc*fC).toFixed(3),
          nivelAtaque:n.atk, nivelDefensa:n.def};};

// EL CORTE DE VERDAD DE CADA EQUIPO, sin ningun ajuste: lo que genero y lo que
// concedio jugando de local y jugando de visitante, tal cual paso. No entra en
// el puntaje —se midio que no se traslada de un torneo al otro— pero es un dato
// real que sirve para mirar antes de decidir.
const CORTES={};
const acumCorte=(t)=>{const k=CT(t.equipo); const o=CORTES[k]=CORTES[k]||{
  local:{pj:0,xg:0,xgc:0,tir:0,tirc:0}, visitante:{pj:0,xg:0,xgc:0,tir:0,tirc:0}};
  ['local','visitante'].forEach(c=>{const b=t[c]; if(!b||!b.pj) return; const d=o[c];
    d.pj+=b.pj; d.xg+=(b.xgPorPartido||0)*b.pj; d.xgc+=(b.xgConcedidoPorPartido||0)*b.pj;
    d.tir+=(b.tirosPorPartido||0)*b.pj; d.tirc+=(b.tirosConcedidosPorPartido||0)*b.pj; });};
Object.values(S.equipos||{}).forEach(acumCorte);
const CORTES_HIST={};
if(HIST&&HIST.equipos){ Object.values(HIST.equipos).forEach(t=>{
  const k=CT(t.equipo); const o=CORTES_HIST[k]=CORTES_HIST[k]||{
    local:{pj:0,xg:0,xgc:0,tir:0,tirc:0}, visitante:{pj:0,xg:0,xgc:0,tir:0,tirc:0}};
  ['local','visitante'].forEach(c=>{const b=t[c]; if(!b||!b.pj) return; const d=o[c];
    d.pj+=b.pj; d.xg+=(b.xgPorPartido||0)*b.pj; d.xgc+=(b.xgConcedidoPorPartido||0)*b.pj;
    d.tir+=(b.tirosPorPartido||0)*b.pj; d.tirc+=(b.tirosConcedidosPorPartido||0)*b.pj; });});}
const corteDe=(k,c)=>{ const o=CORTES[k]; if(!o||!o[c].pj) return null; const d=o[c];
  const h=CORTES_HIST[k]&&CORTES_HIST[k][c].pj?CORTES_HIST[k][c]:null;
  return {pj:d.pj, xg:+(d.xg/d.pj).toFixed(2), xgc:+(d.xgc/d.pj).toFixed(2),
          tir:+(d.tir/d.pj).toFixed(1), tirc:+(d.tirc/d.pj).toFixed(1),
          antPj: h?h.pj:0, antXg: h?+(h.xg/h.pj).toFixed(2):null, antXgc: h?+(h.xgc/h.pj).toFixed(2):null};};

const anomalias={};
Object.keys(NIVEL).forEach(k=>{anomalias[k]={ataque:0,defensa:0};});

const out=M.correrMotor(players,getCtx,viejo.fixture);
console.log('validacion ficha:',out.validacion.veredicto,'| media',out.validacion.media,'| fuera',out.validacion.pctFuera+'%');
// enriquecer cada jugador con precio y contexto
// INDICE POR NOMBRE + PUESTO + EQUIPO (arreglado 01/09).
// Estaba solo por nombre, igual que la cotizacion en agosto. Hay 4 nombres
// repetidos entre los 734 del ranking —8 jugadores— y el ultimo pisaba al
// anterior: "Martinez, David" defensor de Defensa y Justicia mostraba los
// tiros, el xG y los minutos del "Martinez, David" volante de Independiente,
// y al reves. La tabla enseñaba los numeros de un jugador y el ranking
// ordenaba con los del otro. Los otros dos: Vazquez Franco y Gonzalez Tomas,
// Fernandez Julian.
const clavePl = (n,p,e) => (n||'')+'|'+(p||'')+'|'+(e||'');
const porNombre={}; const porNombreSolo={};
players.forEach(pl=>{ porNombre[clavePl(pl.name,pl.position,pl.team)]=pl;
  porNombreSolo[pl.name]=pl; });
// COTIZACION POR NOMBRE + PUESTO + EQUIPO (arreglado 27/08).
// Estaba indexado SOLO por nombre, y en la planilla hay 7 nombres repetidos —
// 14 jugadores. El ultimo pisaba al anterior: "Vazquez, Franco" defensor de
// Argentinos ($0.7M) terminaba con la cotizacion del "Vazquez, Franco" volante
// de Belgrano ($4.8M). Con eso el motor lo veia 7 veces mas caro de lo que sale
// y el once optimo lo descartaba por presupuesto sin motivo.
// Los otros seis: Gutierrez Kevin, Fernandez Julian, Gonzalez Lucas,
// Fernandez Damian, Martinez David, Gonzalez Tomas.
const clavePrecio = j => (j.nombre||'') + '|' + (j.posicion||'') + '|' + (j.equipo||'');
const precio={}; const precioSoloNombre={};
P.jugadores.forEach(j=>{ precio[clavePrecio(j)]=j.cotizacion; precioSoloNombre[j.nombre]=j.cotizacion; });
{
  const rep={}; P.jugadores.forEach(j=>{rep[j.nombre]=(rep[j.nombre]||0)+1;});
  const n=Object.values(rep).filter(v=>v>1).length;
  if(n) console.log('nombres repetidos en la planilla: '+n+' (se distinguen por puesto y equipo, no se pisan las cotizaciones)');
}
['ARQ','DEF','VOL','DEL'].forEach(pos=>{
  out.rankings[pos].forEach(x=>{
    const pl = porNombre[clavePl(x.nombre, x.pos, x.equipoPlaneta||x.equipo)]
            || porNombre[clavePl(x.nombre, x.pos, x.equipo)]
            || porNombreSolo[x.nombre] || {};
    const k=CT(x.equipo), c=porEquipo[k];
    const miCond = c && c.esLocal ? 'local':'visitante';
    const rivalCond = c && c.esLocal ? 'visitante':'local';
    x.precio = precio[(x.nombre||'')+'|'+(x.pos||'')+'|'+(x.equipoPlaneta||x.equipo||'')]
            ?? precio[(x.nombre||'')+'|'+(x.pos||'')+'|'+(x.equipo||'')]
            ?? precioSoloNombre[x.nombre] ?? null;
    x.disponibilidad = disponibilidad(x.nombre, x.equipoPlaneta || x.equipo);
    x.partidoYaJugado = c ? YA_JUGADOS.has([k,c.rivalKey].sort().join('|')) : false;
    x.individual = {
      tiros: pl.shots365||0, tirosPorPartido: pl.matches365? +((pl.shots365||0)/pl.matches365).toFixed(2):0,
      xg: +(pl.xg365||0).toFixed(2), xgPorPartido: pl.matches365? +((pl.xg365||0)/pl.matches365).toFixed(3):0,
      goles: pl.goals||0, golesPenal: pl.goalsPenalty||0, golesVisitante: pl.goalsAway||0,
      figuras: pl.figuras||0, vallas: pl.cleanSheets||0,
      amarillas: pl.yellowCards||0, rojas: pl.redCards||0,
      pj: pl.matchesRated||0, pj365: pl.matches365||0,
      // Puntaje del torneo, tal cual lo publica Gran DT. Es el numero con el
      // que un grandetero mide a un jugador y no estaba en la ficha.
      puntosTorneo: pl.totalPoints||0,
      promedioTorneo: pl.matchesRated? +((pl.totalPoints||0)/pl.matchesRated).toFixed(2) : null,
      asistencias: (pl._m&&pl._m.asistencias)||0,
      minutos: pl.minutes365||0, minutosPorPartido: pl.matches365? Math.round((pl.minutes365||0)/pl.matches365):0,
      titularidad: pl.titularidad!=null? pl.titularidad : null
    };
    x.corteMio  = {local:corteDe(k,'local'), visitante:corteDe(k,'visitante')};
    x.corteRival= c ? {local:corteDe(c.rivalKey,'local'), visitante:corteDe(c.rivalKey,'visitante')} : null;
    x.miEquipo = bloque(k, miCond);
    x.elRival  = c ? bloque(c.rivalKey, rivalCond) : null;
    x.miEquipoTotal = bloque(k,'total');
    x.elRivalTotal  = c ? bloque(c.rivalKey,'total') : null;
    x.anomalia = anomalias[k]||null;
    x.anomaliaRival = c? (anomalias[c.rivalKey]||null) : null;
  });
});
// Control del tarjetero cargado a mano: si un nombre no engancha con nadie,
// hay que saberlo, porque si no la suspension se pierde en silencio.
if(SUSPENDIDOS.jugadores.length){
  const enRanking=new Set();
  ['ARQ','DEF','VOL','DEL'].forEach(p=>out.rankings[p].forEach(x=>{
    if(x.disponibilidad && x.disponibilidad.tarjetero) enRanking.add(norm(x.nombre)); }));
  const perdidos=SUSPENDIDOS.jugadores.filter(j=>{
    const n=norm(j.nombre), p=(j.nombre||'').split(',');
    return !enRanking.has(n) && !(p.length>1 && enRanking.has(norm(p[1]+' '+p[0]))); });
  if(perdidos.length) console.log('  OJO — '+perdidos.length+' del tarjetero no aparecen en el ranking (o el nombre no coincide, o nunca jugaron y quedaron afuera): '+
    perdidos.map(j=>j.nombre+' ('+(j.equipo||'?')+')').join('  /  '));
}

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
    motivoRotLocal: motivoRot(kl), motivoRotVisitante: motivoRot(kv),
    tirosLocal: (eq365[kl]&&eq365[kl].local.pj)? eq365[kl].local.tirosPorPartido : null,
    tirosVisitante: (eq365[kv]&&eq365[kv].visitante.pj)? eq365[kv].visitante.tirosPorPartido : null,
    tirosConcLocal: (eq365[kl]&&eq365[kl].local.pj)? eq365[kl].local.tirosConcedidosPorPartido : null,
    tirosConcVisitante: (eq365[kv]&&eq365[kv].visitante.pj)? eq365[kv].visitante.tirosConcedidosPorPartido : null
  };
}).sort((a,b)=>new Date(a.cuando)-new Date(b.cuando));

out.liga = LIGA;
out.presupuesto = 65000000;

// ---- 5-bis. EL ONCE RECOMENDADO NO PUEDE TENER A UN LESIONADO -------------
// El motor arma el once antes de saber quien esta disponible, porque la
// disponibilidad se cruza despues. Hasta hoy no importaba mucho: sabiamos de
// las rojas y poco mas. Con el ayudante de campo sabemos quien esta lesionado,
// suspendido o directamente afuera, y eso no es una estimacion nuestra: lo
// dice el juego. Asi que el once se rehace sin ellos.
// OJO: siguen en los rankings y en Oportunidades, con su cartel. Lo unico que
// pasa es que no entran al once que recomendamos. Nadie desaparece.
(function(){
  const fuera = x => !!(x.disponibilidad && x.disponibilidad.suspendido);
  const bajas = [].concat(...['ARQ','DEF','VOL','DEL'].map(p=>out.rankings[p].filter(fuera)));
  if(!bajas.length) return;
  const limpio = {};
  ['ARQ','DEF','VOL','DEL'].forEach(p=>{ limpio[p]=out.rankings[p].filter(x=>!fuera(x)); });
  const antes = new Set(out.esquema.optimo.once.map(x=>x.id));
  out.rankingsSinBajas = limpio;
  out.esquema = M.mejorEsquema(limpio);
  const sacados = bajas.filter(x=>antes.has(x.id));
  console.log('ONCE — '+bajas.length+' jugadores quedaron afuera del once por estar lesionados, suspendidos o expulsados'+
    (sacados.length? '. Estaban en el once recomendado: '+sacados.map(x=>x.nombre+' ('+
      ((x.disponibilidad&&x.disponibilidad.motivoBaja)||'baja')+')').join(', ') : '. Ninguno estaba en el once.'));
})();

// ---- 5bis. ONCE ARRIESGADO ----
// El once optimo maximiza el PROMEDIO. Para ganar una fecha a nivel pais no
// sirve el promedio: sirve la chance de hacer una fecha enorme. Es otro
// problema de optimizacion y se resuelve simulando la fecha entera.
try {
  const R = require('./riesgo.cjs');
  const t0 = Date.now();
  out.arriesgado = R.armarArriesgado(out.rankingsSinBajas || out.rankings, {
    simulaciones: 50000,
    presupuesto: out.presupuesto,
    onceSeguro: out.esquema.optimo.once, esquemaSeguro: out.esquema.optimo.esquema
  });
  const a = out.arriesgado;
  console.log('ONCE ARRIESGADO — ' + a.simulaciones.toLocaleString('es-AR') + ' fechas simuladas en ' +
    ((Date.now() - t0) / 1000).toFixed(1) + 's | objetivo ' + a.objetivo + ' puntos');
  const fila = (n, d) => console.log('  ' + n.padEnd(12) +
    String(d.media.toFixed(1)).padStart(7) + String(d.sd.toFixed(1)).padStart(7) +
    String(d.p99.toFixed(0)).padStart(7) + String(d.max.toFixed(0)).padStart(7) +
    ((100 * d.p100).toFixed(2) + '%').padStart(9) + ((100 * d.p120).toFixed(2) + '%').padStart(9) +
    ((100 * d.p140).toFixed(3) + '%').padStart(9) + ((100 * d.p160).toFixed(3) + '%').padStart(9));
  console.log('               media     sd    p99    max   P>=100   P>=120   P>=140   P>=160');
  if (a.conservador) fila('conservador', a.conservador);
  fila('arriesgado', a.dist);
  console.log('  arriesgado: ' + a.esquema + ', $' + (a.costo / 1e6).toFixed(1) + 'M — ' +
    a.once.map(x => x.nombre.split(',')[0]).join(', '));
} catch (e) {
  console.log('(no pude armar el once arriesgado: ' + e.message + ')');
}

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
// rachas: se leen del final de la forma completa, antes de recortarla a 5
const rachaDe=(f,cond)=>{ let n=0; for(let i=f.length-1;i>=0;i--){ if(cond(f[i])) n++; else break; } return n; };
out.tabla=ordenar(Object.values(tabla).map(t=>({...t,zona:ZONA[CT(t.equipo)]||'',dif:t.gf-t.gc,
  rachaSinPerder: rachaDe(t.forma,r=>r!=='P'),
  rachaSinGanar:  rachaDe(t.forma,r=>r!=='G'),
  rachaGanando:   rachaDe(t.forma,r=>r==='G'),
  rachaPerdiendo: rachaDe(t.forma,r=>r==='P'),
  forma:t.forma.slice(-5)})));
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
  rotacion:rotDe(CT(e.equipo)), notaRotacion:notaDe(CT(e.equipo)), motivoRotacion:motivoRot(CT(e.equipo))
}));

// ---- 7a. marcar a los que jugaron sin registro en Planeta ----
{let sf=0;
['ARQ','DEF','VOL','DEL'].forEach(pos=>{out.rankings[pos].forEach(x=>{
  const min=(x.individual&&x.individual.minutos)||0, pj=(x.individual&&x.individual.pj)||0;
  // Jugo, pero Planeta no le registra ningun partido calificado. Su ficha no es
  // un dato suyo: es el promedio de la liga. Hay que decirlo.
  x.sinFicha=(min>0 && pj===0); if(x.sinFicha) sf++;
  // COBERTURA DE 365SCORES (03/09). La planilla de Gran DT cuenta los partidos
  // calificados y 365Scores los partidos con datos individuales. Si 365 tiene
  // MENOS, es porque le faltan partidos: los tiros y el xG de este jugador
  // estan calculados sobre menos futbol del que jugo, y mostrarlos como si nada
  // es mentir. Sergio Ojeda aparecia con un gol y cero tiros porque a 365 le
  // faltaba justo la fecha en la que convirtio.
  const pjPl=x.individual.pj||0, pj365=x.individual.pj365||0;
  x.individual.partidosSinDato = Math.max(0, pjPl - pj365);
  x.datosParciales = x.individual.partidosSinDato > 0;
  // Contradiccion pura: metio goles y 365 no le registra un solo tiro.
  x.datosImposibles = (x.individual.goles||0) > 0 && (x.individual.tiros||0) === 0;
});});
if(sf) console.log('  '+sf+' jugaron pero Planeta no les registra puntaje: su ficha es el promedio de la liga, quedan marcados');
{ const TT=[].concat(...['ARQ','DEF','VOL','DEL'].map(p=>out.rankings[p]));
  const parc=TT.filter(x=>x.datosParciales), imp=TT.filter(x=>x.datosImposibles);
  if(parc.length) console.log('  COBERTURA — a '+parc.length+' jugadores 365Scores les registra MENOS partidos que la planilla: '+
    'sus tiros y su xG salen de menos futbol del que jugaron. Quedan marcados en la app.');
  if(imp.length) console.log('  OJO — '+imp.length+' con goles y CERO tiros en 365Scores, que es imposible: le faltan partidos a 365. '+
    imp.slice(0,4).map(x=>x.nombre).join(', ')); }}

// ---- 7b. TABLERO DE LA FECHA ----
// Una fila por equipo con su partido: que tan solida esta su defensa y que tan
// vulnerable la del rival, ya ajustado por local/visitante con el factor de la
// liga. Es lo que contesta "que defensor tiene el mejor contexto" sin cruzar
// tablas a mano.
const ctxLam={}; ['ARQ','DEF','VOL','DEL'].forEach(pos=>out.rankings[pos].forEach(x=>{
  const k=CT(x.equipo); if(!ctxLam[k]) ctxLam[k]={lam:x.lam,pVI:x.pVI,rot:x.rotacion,rotRiv:x.rotacionRival,
    mrot:x.motivoRotacion,mrotRiv:x.motivoRotacionRival,jug:x.partidoYaJugado};
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
      rotacion:c?c.rot:0, rotacionRival:c?c.rotRiv:0,
      motivoRotacion:c?c.mrot:null, motivoRotacionRival:c?c.mrotRiv:null
    });
  });
});
// dos lecturas rapidas
out.tableroDefensa = out.tablero.slice().sort((a,b)=>(b.pValla||0)-(a.pValla||0));
out.tableroAtaque  = out.tablero.slice().sort((a,b)=>(b.lamFavor||0)-(a.lamFavor||0));
out.liga = Object.assign(out.liga||{}, {
  ventajaLocal:{ xgLocal:+LIGA.locXg.toFixed(3), xgVisitante:+LIGA.visXg.toFixed(3),
                 pctMas:+(100*(LIGA.locXg/LIGA.visXg-1)).toFixed(0), partidos:LIGA.partidos }});

// ---- 7c. DATOS DE LA FECHA (la parte "curiosidades") ----------------------
// Todo lo de aca sale de datos que ya teniamos y se puede rastrear: la ley del
// ex sale del historico de 365Scores, las rachas de la tabla, los goles
// pendientes del xG sin penales. Si un dato no se puede sostener, no entra.
(function(){
  const TODOS=[].concat(...['ARQ','DEF','VOL','DEL'].map(p=>out.rankings[p]||[]));
  const deLaFecha = TODOS.filter(x=>!x.partidoYaJugado);
  const cur={ fecha: out.fechaObjetivo };

  // ── LEY DEL EX ───────────────────────────────────────────────────────────
  // La lista la pone el propio Gran DT (es de carrera completa: sabe que Meza
  // jugo en River hace años, cosa que nosotros no podiamos saber). Nuestro
  // historial del torneo pasado no se tira: cuando coincide, le agrega el
  // detalle de lo que hizo ahi — partidos, minutos y goles.
  const ley=[];
  TODOS.forEach(x=>{
    if(!x.rival) return;
    const kr=CT(x.rival);
    const clubGDT = x.disponibilidad && x.disponibilidad.exClub;
    const propio = (EX_POR_ID[x.id]||[]).filter(c=>CT(c.equipo)===kr)
                     .sort((a,b)=>(b.min||0)-(a.min||0))[0] || null;
    // Si el Gran DT lo marca, vale aunque el ex club que nombre no sea el rival
    // exacto (usan nombres cortos); si no lo marca, vale nuestro historial.
    if(!clubGDT && !propio) return;
    x.leyDelEx = {
      club: clubGDT || propio.equipo,
      fuente: clubGDT ? 'Gran DT' : 'nuestro historial',
      min: propio? propio.min : null, pj: propio? propio.pj : null,
      goles: propio? propio.goles : null, asis: propio? propio.asis : null,
      cuando: propio? propio.cuando : null };
    ley.push({ id:x.id, nombre:x.nombre, pos:x.pos, equipo:x.equipo, rival:x.rival,
      condicion:x.condicion, cuando:x.cuando||null, yaJugado:!!x.partidoYaJugado,
      ex:x.leyDelEx, EP:+x.EP.toFixed(2), pJuega:+(x.pJuega||0).toFixed(2),
      estado:(x.disponibilidad&&x.disponibilidad.estado)||null,
      baja:!!(x.disponibilidad&&x.disponibilidad.suspendido),
      dts:(x.disponibilidad&&x.disponibilidad.dts)||null,
      precio:x.precio, ficha:+(x.ficha||0).toFixed(2), lamGol:+(x.lamGol||0).toFixed(3) });
  });
  cur.leyDelEx = ley.sort((a,b)=>b.EP-a.EP);
  cur.veda = GDT_VEDA;

  // ── goles que le deben (xG sin penales contra goles de jugada) ───────────
  cur.leDeben = deLaFecha
    .filter(x=>x.individual && x.individual.minutos>=250 && x.xgTorneo!=null)
    .map(x=>{ const gJugada=(x.individual.goles||0)-(x.individual.golesPenal||0);
      return { id:x.id, nombre:x.nombre, pos:x.pos, equipo:x.equipo, rival:x.rival,
        xg:+x.xgTorneo.toFixed(2), goles:gJugada, deuda:+(x.xgTorneo-gJugada).toFixed(2),
        minutos:x.individual.minutos, EP:+x.EP.toFixed(2) }; })
    .filter(r=>r.deuda>=0.8).sort((a,b)=>b.deuda-a.deuda).slice(0,8);

  // ── en racha: quien viene metiendo ───────────────────────────────────────
  // OJO CON EL ORDEN DEL LOG (02/09). Dentro de este torneo 365Scores numera
  // los partidos con gid DECRECIENTE: el gid mas alto es la fecha 1. Ordenar
  // por gid ascendente dejaba la racha contada desde la fecha 1 hacia atras, o
  // sea al reves, y por eso Ángel Correa —tres fechas seguidas marcando— no
  // aparecia. Se ordena por numero de fecha, que es lo unico que no miente.
  const logDe={}; players.forEach(pl=>{ if(pl._m && pl._m.log) logDe[pl.id]=pl._m.log; });
  const ordenarLog = log => log.slice().sort((a,b)=>{
    if(a.fecha!=null && b.fecha!=null) return a.fecha-b.fecha;
    return b.gid-a.gid;   // sin numero de fecha, el gid mas alto es el mas viejo
  });
  cur.enRacha = deLaFecha.map(x=>{
      const jugados=ordenarLog(logDe[x.id]||[]).filter(l=>(l.min||0)>0);
      if(!jugados.length) return null;
      // racha = fechas seguidas convirtiendo, contadas desde la ultima que jugo
      let n=0; for(let i=jugados.length-1;i>=0;i--){ if((jugados[i].goles||0)>0) n++; else break; }
      const ult5=jugados.slice(-5);
      const goles5=ult5.reduce((a,l)=>a+(l.goles||0),0);
      const conGol5=ult5.filter(l=>(l.goles||0)>0).length;
      if(n<2 && goles5<2) return null;
      return { id:x.id, nombre:x.nombre, pos:x.pos, equipo:x.equipo, rival:x.rival,
               condicion:x.condicion, partidos:n,
               goles: jugados.slice(jugados.length-Math.max(n,1)).reduce((a,l)=>a+(l.goles||0),0),
               goles5, conGol5, pj5:ult5.length,
               ultimas: ult5.map(l=>({fecha:l.fecha??null, goles:l.goles||0, min:l.min||0})),
               EP:+x.EP.toFixed(2) }; })
    .filter(Boolean).sort((a,b)=>b.goles5-a.goles5||b.partidos-a.partidos||b.EP-a.EP);

  // ── equipos: donde sacan los puntos ──────────────────────────────────────
  // LOS 30, NO UNA SELECCION. Antes solo se mostraban los extremos (80% o mas
  // en casa, 20% o menos) y quedaban 7 equipos: si querias mirar al rival de tu
  // defensor y no estaba en la lista, no servia para nada.
  cur.casaYPatio = out.tabla.filter(t=>t.local.pj>0 || t.visitante.pj>0)
    .map(t=>({ equipo:t.equipo, pts:t.pts, ptsLocal:t.local.pts, ptsVisita:t.visitante.pts,
               pjLocal:t.local.pj, pjVisita:t.visitante.pj,
               gfLocal:t.local.gf, gcLocal:t.local.gc,
               gfVisita:t.visitante.gf, gcVisita:t.visitante.gc,
               pctCasa: t.pts? +(100*t.local.pts/t.pts).toFixed(0) : null }))
    .sort((a,b)=>(b.pctCasa??-1)-(a.pctCasa??-1)||b.pts-a.pts);

  // ── rachas de equipo ─────────────────────────────────────────────────────
  // Los 30 tambien: con la forma de las ultimas 5, que es lo que se mira.
  cur.rachas = out.tabla.map(t=>({ equipo:t.equipo, pts:t.pts, forma:t.forma||[],
      sinPerder:t.rachaSinPerder, sinGanar:t.rachaSinGanar,
      ganando:t.rachaGanando, perdiendo:t.rachaPerdiendo }))
    .sort((a,b)=>{
      const peso=t=>t.ganando>=2? 100+t.ganando : (t.perdiendo>=2? -100-t.perdiendo
                 : (t.sinPerder>=3? 50+t.sinPerder : (t.sinGanar>=3? -50-t.sinGanar : 0)));
      return peso(b)-peso(a) || b.pts-a.pts;
    });

  // ── al filo: una amarilla mas y se pierden la que viene ──────────────────
  cur.alFilo = deLaFecha.filter(x=>x.disponibilidad && x.disponibilidad.aUnaDeSuspension)
    .map(x=>({ id:x.id, nombre:x.nombre, pos:x.pos, equipo:x.equipo, rival:x.rival,
      amarillas:x.disponibilidad.amarillas, tasaTA:+(x.tasaTA||0).toFixed(3),
      EP:+x.EP.toFixed(2) }))
    .sort((a,b)=>b.EP-a.EP);

  // ── los que no van a estar ───────────────────────────────────────────────
  // De que fecha es el tarjetero que tenemos cargado a mano. Si quedo viejo,
  // la lista de bajas no sirve para esta fecha y hay que decirlo en pantalla.
  const maxAlcance = SUSPENDIDOS.fecha!=null
    ? SUSPENDIDOS.fecha + Math.max(0,...SUSPENDIDOS.jugadores.map(j=>Number(j.fechas)||1)) - 1 : null;
  cur.tarjetero = { fecha:SUSPENDIDOS.fecha, fuente:SUSPENDIDOS.fuente,
    cargados:SUSPENDIDOS.jugadores.length,
    viejo: maxAlcance!=null && out.fechaObjetivo!=null && maxAlcance < out.fechaObjetivo };
  if(cur.tarjetero.viejo) console.log('  OJO — el tarjetero de suspendidos.json es de la fecha '+SUSPENDIDOS.fecha+
    ' y ya no alcanza a la fecha '+out.fechaObjetivo+'. Cargá el tarjetero nuevo de Planeta.');

  // ── EN DUDA ──────────────────────────────────────────────────────────────
  // Los que el Gran DT no da ni dentro ni fuera. No tocan el puntaje: solo se
  // muestran, y ordenados por lo que se pierde uno si al final no juegan.
  cur.enDuda = deLaFecha.filter(x=>x.disponibilidad && x.disponibilidad.enDuda)
    .map(x=>({ id:x.id, nombre:x.nombre, pos:x.pos, equipo:x.equipo, rival:x.rival,
      condicion:x.condicion, minutos:(x.individual&&x.individual.minutos)||0,
      mesp:x.minEsperados, EP:+x.EP.toFixed(2) }))
    .sort((a,b)=>b.EP-a.EP);

  // ── cambiaron de club ────────────────────────────────────────────────────
  // Estaba en la portada ocupando un lugar que necesitaban las bajas. Es un
  // dato para saber de donde salen los numeros, no para decidir la fecha.
  cur.transferidos = TODOS.filter(x=>x.transferido)
    .map(x=>({ id:x.id, nombre:x.nombre, pos:x.pos, equipo:x.equipo, rival:x.rival,
      condicion:x.condicion, desde:x.transferido.desde, min:x.transferido.min,
      minutos:(x.individual&&x.individual.minutos)||0, EP:+x.EP.toFixed(2) }))
    .sort((a,b)=>b.EP-a.EP);

  cur.bajas = TODOS.filter(x=>x.disponibilidad && x.disponibilidad.suspendido)
    .map(x=>{ const d=x.disponibilidad;
      return { nombre:x.nombre, pos:x.pos, equipo:x.equipo,
        motivo: d.motivoBaja || (d.tarjetero ? d.tarjetero.motivo : 'suspendido'),
        estado: d.estado || null,
        fechas: d.tarjetero ? d.tarjetero.fechas : null,
        fuente: d.estado ? 'ayudante de campo' : (d.tarjetero ? 'tarjetero' : '365Scores') }; });

  // ── EL ONCE IDEAL DE LA ULTIMA FECHA ─────────────────────────────────────
  // Lo mismo que muestra el "Ayudante de campo" del Gran DT, hecho con la
  // planilla: los puntajes fecha por fecha (F1..F18) vienen en dataPlaneta y
  // el once se arma buscando, entre los diez esquemas validos, el que mas
  // puntos suma. No es una prediccion: es lo que efectivamente pago la fecha.
  // out.ultimaFechaJugada se asigna mas abajo, asi que aca se usa la misma
  // cuenta: la ultima fecha del fixture con al menos 8 partidos jugados, y si
  // no hay fixture, la que dice la planilla.
  const fUlt = out.ultimaFechaJugada || ultimaJugada || P.ultimaFecha || 0;
  if(fUlt>0){
    const porPos={ARQ:[],DEF:[],VOL:[],DEL:[]};
    P.jugadores.forEach(j=>{
      const pts=(j.puntajes||[])[fUlt-1];
      if(pts==null || !porPos[j.posicion]) return;
      porPos[j.posicion].push({nombre:j.nombre, pos:j.posicion, equipo:j.equipo,
        pts:Number(pts)||0, precio:j.cotizacion||0});
    });
    Object.values(porPos).forEach(l=>l.sort((a,b)=>b.pts-a.pts||a.precio-b.precio));
    const ESQ=[[1,4,4,2],[1,4,3,3],[1,3,4,3],[1,4,5,1],[1,3,5,2],
               [1,5,3,2],[1,3,3,4],[1,4,2,4],[1,5,2,3],[1,5,4,1]];
    let mejor=null;
    ESQ.forEach(f=>{
      const [nA,nD,nV,nL]=f;
      if(porPos.ARQ.length<nA||porPos.DEF.length<nD||porPos.VOL.length<nV||porPos.DEL.length<nL) return;
      const once=[].concat(porPos.ARQ.slice(0,nA),porPos.DEF.slice(0,nD),
                           porPos.VOL.slice(0,nV),porPos.DEL.slice(0,nL));
      const total=once.reduce((a,x)=>a+x.pts,0);
      if(!mejor||total>mejor.total) mejor={esquema:nD+'-'+nV+'-'+nL, total, once,
        costo:once.reduce((a,x)=>a+x.precio,0)};
    });
    if(mejor){
      // El capitan duplica SOLO la ficha, pero la planilla no separa ficha de
      // bonus por fecha. Se marca al de mas puntos, como hace el juego.
      const cap=mejor.once.slice().sort((a,b)=>b.pts-a.pts)[0];
      mejor.capitan=cap?cap.nombre:null;
      mejor.fecha=fUlt;
      cur.onceIdeal=mejor;
    }
  }

  // ── JUGADORES FIGURA ─────────────────────────────────────────────────────
  // VF de la planilla: cuantas veces fue la figura de su equipo en el torneo.
  cur.figuras = deLaFecha
    .filter(x=>x.individual && (x.individual.figuras||0)>0)
    .map(x=>({ id:x.id, nombre:x.nombre, pos:x.pos, equipo:x.equipo, rival:x.rival,
      condicion:x.condicion, veces:x.individual.figuras, pj:x.individual.pj,
      pFigura:+(x.pFigura||0).toFixed(3), EP:+x.EP.toFixed(2) }))
    .sort((a,b)=>b.veces-a.veces||b.EP-a.EP).slice(0,10);

  out.curiosidades=cur;
  if(cur.onceIdeal) console.log('  once ideal de la fecha '+cur.onceIdeal.fecha+': '+cur.onceIdeal.esquema+
    ', '+cur.onceIdeal.total+' puntos, $'+(cur.onceIdeal.costo/1e6).toFixed(1)+'M');
  console.log('  en duda: '+cur.enDuda.length+' con peso  ·  bajas: '+cur.bajas.length);
  console.log('DATOS DE LA FECHA — ley del ex: '+cur.leyDelEx.length+
    ' | en racha: '+cur.enRacha.length+' | le deben goles: '+cur.leDeben.length+
    ' | al filo: '+cur.alFilo.length+' | bajas: '+cur.bajas.length);
  if(cur.leyDelEx.length) console.log('   ex mas caro: '+cur.leyDelEx[0].nombre+' ('+cur.leyDelEx[0].equipo+
    ') contra '+cur.leyDelEx[0].ex.club);
})();

// ---- 8. aportes vs separacion por posicion ----
out.aportes={};
['ARQ','DEF','VOL','DEL'].forEach(pos=>{
  const g=out.rankings[pos].filter(x=>x.pJuega>0.5);
  // Si no hay a quien medir, no se calcula nada. El 27/08 una corrida se cayo
  // aca con "Cannot read properties of undefined": SYNC_365 habia dejado
  // data365.json vacio, ningun jugador llegaba a pJuega>0.5, y el percentil 10
  // de una lista vacia es undefined. El error real estaba tres pasos antes,
  // pero el que se veia era este. Ahora avisa en vez de reventar.
  if(!g.length){
    out.aportes[pos]={n:0,filas:[],epMedio:0,epP10:0,epP90:0};
    console.log('  OJO: no hay ningun '+pos+' con chance de jugar. Revisa que data365.json y dataPlaneta.json tengan datos.');
    return;
  }
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
 ep:x.EP,epsj:x.EPsiJuega,mesp:x.minEsperados,msj:x.minSiJuega,mest:x.minEstimados,mlog:x.minutosLog,mtit:x.minutosDeTitular||null,pmin:x.perfilMin||null,fmin:x.fuenteMinutos,pen:x.penalesPateados,penC:x.penalesConvertidos,penE:x.penalesErrados,tr:x.transferido||null,lex:x.leyDelEx||null,dpar:x.datosParciales||false,dimp:x.datosImposibles||false,t90:x.tiros90,x90:x.xg90,xgT:x.xgTorneo,tirT:x.tirosTorneo,pj_:x.pJuega,sc:x.score,fi:x.ficha,sh:x.share,pvi:x.pVI,lg:x.lamGol,pfig:x.pFigura,ta:x.tasaTA,
 piso:x.piso,techo:x.techo,perf:x.perfil||'',pe:x.pisoEquipo||null,
 rot:x.rotacion||0,rotr:x.rotacionRival||0,nrot:x.notaRotacion||'',
 mrot:x.motivoRotacion||null,mrotr:x.motivoRotacionRival||null,
 pr:x.precio,ind:x.individual,me:x.miEquipo,er:x.elRival,met:x.miEquipoTotal,ert:x.elRivalTotal,cm:x.corteMio,cr:x.corteRival,
 an:x.anomalia,anr:x.anomaliaRival, disp:x.disponibilidad, jug:x.partidoYaJugado, sf:x.sinFicha,
 des:(x.desglose||[]).map(d=>[d[0],+Number(d[1]).toFixed(2),d[2]]),
 lam:{f:x.lam.lamFor,c:x.lam.lamAgainst,w:x.lam.pWin,d:x.lam.pDraw,mk:x.lam.tieneMercado}});
const paraApp={
  generado:out.generado, fechaObjetivo:out.fechaObjetivo, ultimaFechaJugada:out.ultimaFechaJugada,
  fechaEnCurso: FECHA_EN_CURSO,
  rankings:{ARQ:out.rankings.ARQ.map(slim),DEF:out.rankings.DEF.map(slim),
            VOL:out.rankings.VOL.map(slim),DEL:out.rankings.DEL.map(slim)},
  esquema:{optimo:{esquema:out.esquema.optimo.esquema,once:out.esquema.optimo.once.map(x=>({id:x.id}))},
           todos:out.esquema.todos.map(e=>({e:e.esquema,ids:e.once.map(x=>x.id),total:e.total}))},
  arriesgado: out.arriesgado ? {
    esquema: out.arriesgado.esquema, objetivo: out.arriesgado.objetivo,
    ids: out.arriesgado.once.map(x=>x.id), capitan: out.arriesgado.capitan && out.arriesgado.capitan.id,
    costo: out.arriesgado.costo, sims: out.arriesgado.simulaciones,
    // por que esta cada uno: sin esto es una lista de nombres raros
    porQue: out.arriesgado.once.map(x=>({id:x.id, m:x.porQue||[], t90:x.tiros90, deu:x.deuda, comun:!!x.enElSeguro})),
    comunes: out.arriesgado.comunes,
    dist: out.arriesgado.dist, conservador: out.arriesgado.conservador } : null,
  partidos:out.partidos, tablero:out.tablero, tabla:out.tabla, tablaZonas:out.tablaZonas, fixtureCompleto:out.fixtureCompleto,
  nombres:NOMBRES,
  equipos:out.equipos, aportes:out.aportes, liga:out.liga,
  presupuesto:out.presupuesto, validacion:out.validacion, cuotas:out.cuotas,
  curiosidades:out.curiosidades
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

out.version = VERSION_MOTOR;
fs.writeFileSync('salida.json',JSON.stringify(out,null,1));
// RED DE SEGURIDAD (27/08). No pisar un datos.js bueno con uno vacio.
// Si SYNC_365 falla, el motor igual corre —la ficha sale de Planeta— pero sin
// tiros, ni xG, ni minutos, ni tarjetas: los rankings quedan sin sentido. Mejor
// dejar la app mostrando los datos de ayer que mostrar cualquier cosa hoy.
{
  const totalRanking = ['ARQ','DEF','VOL','DEL'].reduce((a,p)=>a+(out.rankings[p]||[]).length,0);
  const problemas = [];
  if(match365 === 0) problemas.push('ningun jugador cruzo con 365Scores (data365.json vacio o roto)');
  if(totalRanking < 200) problemas.push('solo '+totalRanking+' jugadores en los rankings');
  if(!out.partidos || !out.partidos.length) problemas.push('no hay partidos para la fecha objetivo');
  if(problemas.length){
    console.log('');
    console.log('  NO SE ESCRIBIO datos.js. La app sigue mostrando lo de la corrida anterior.');
    problemas.forEach(t=>console.log('   - '+t));
    console.log('  Corre SYNC_365.bat de nuevo y despues ACTUALIZAR_TODO.bat.');
    console.log('');
    fs.writeFileSync('salida_RECHAZADA.json', JSON.stringify(out));
    process.exit(2);
  }
}
paraApp.version = VERSION_MOTOR;
fs.writeFileSync('datos.js','window.DATOS='+JSON.stringify(paraApp)+';');
// datos.js: para que index.html lo cargue con <script> y funcione hasta con file://
console.log('OK -> salida.json y datos.js   [motor '+VERSION_MOTOR+']');

