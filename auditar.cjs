/* ══════════════════════════════════════════════════════════════════════════
   AUDITOR DE DATOS — corre despues de ACTUALIZAR_TODO y busca disparates.
   No arregla nada: sólo mira y avisa. La idea es que ningun error de datos
   dependa de que alguien lo cace mirando la pantalla.
   ══════════════════════════════════════════════════════════════════════════ */
const fs=require('fs'), vm=require('vm');
const L=(s)=>console.log(s);
const problemas=[], avisos=[], ok=[];
const P_=(t)=>problemas.push(t), A_=(t)=>avisos.push(t), OK=(t)=>ok.push(t);
const leer=(f)=>{ try{ return JSON.parse(fs.readFileSync(f,'utf8')); }catch(e){ return null; } };

const OUT=leer('salida.json');
if(!OUT){ L('No encontre salida.json. Corré ACTUALIZAR_TODO primero.'); process.exit(1); }
const S=leer('data365.json'), HIST=leer('data365_historico.json');
const PL=leer('dataPlaneta.json'), CU=leer('dataCuotas.json'), FX=leer('dataFixture.json');
const GD=(function(){ try{ return JSON.parse(fs.readFileSync('dataGranDT.json','utf8').replace(/^﻿/,'')); }catch(e){ return null; } })();

const ctx={console,window:{}};vm.createContext(ctx);
try{ vm.runInContext(fs.readFileSync('teamsRegistry.js','utf8'),ctx); }catch(e){}
const gid_=ctx.getCanonicalTeamId||(x=>null);
const CT=n=>{ if(!n) return ''; const p=n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  if(p==='estudiantes') return 'estudiantes-lp'; return gid_(n)||p.replace(/[^a-z0-9]/g,''); };

const TODOS=[].concat(...['ARQ','DEF','VOL','DEL'].map(p=>OUT.rankings[p]||[]));
const FJ=OUT.ultimaFechaJugada||0;
const MAXMIN=FJ*90;

L('');
L('  ══════════════════════════════════════════════════════════════');
L('   AUDITORIA DE DATOS   ·   motor '+(OUT.version||'sin sello'));
L('   fecha objetivo '+OUT.fechaObjetivo+'  ·  ultima fecha jugada '+FJ+'  ·  '+TODOS.length+' jugadores');
L('  ══════════════════════════════════════════════════════════════');

// ── 1. minutos y partidos imposibles ────────────────────────────────────────
const minImp=TODOS.filter(x=>x.individual && x.individual.minutos>MAXMIN);
const pjImp =TODOS.filter(x=>x.individual && x.individual.pj365>FJ);
// Unos pocos por encima suelen ser partidos de copa que 365Scores numera como
// fecha de liga. Muchos significa que data365.json trae dos torneos mezclados.
const grave=(n)=>n>TODOS.length*0.02;
if(grave(minImp.length)) P_(minImp.length+' jugadores con MAS MINUTOS que el maximo posible ('+MAXMIN+"'). Ej: "+
  minImp.slice(0,3).map(x=>x.nombre+' '+x.individual.minutos+"'").join(', ')+
  '   → data365.json esta trayendo dos torneos mezclados');
else if(minImp.length) A_(minImp.length+' jugador(es) con mas minutos que el maximo de liga ('+MAXMIN+"'): "+
  minImp.slice(0,3).map(x=>x.nombre+' '+x.individual.minutos+"'").join(', ')+'  → casi seguro partidos de copa');
else OK('minutos dentro de lo posible (maximo '+MAXMIN+"' en "+FJ+' fechas)');
if(grave(pjImp.length)) P_(pjImp.length+' jugadores con MAS PARTIDOS que fechas jugadas. Ej: '+
  pjImp.slice(0,3).map(x=>x.nombre+' '+x.individual.pj365+' PJ').join(', '));
else if(pjImp.length) A_(pjImp.length+' jugador(es) con mas partidos que fechas jugadas: '+
  pjImp.slice(0,3).map(x=>x.nombre+' '+x.individual.pj365+' PJ').join(', ')+'  → casi seguro copa');
else OK('partidos jugados dentro de lo posible');

// ── 2. los dos torneos, y si el motor los separo bien ───────────────────────
// data365.json guarda el torneo actual Y el anterior: SYNC_365 detecta el
// receso pero no corta, para no repetir el dia que se borro el archivo entero.
// El que separa es el motor. Aca se rehace el mismo corte y se controla que
// haya quedado limpio LO QUE USA EL MOTOR, no el archivo crudo.
let GID_CORTE=null;
if(HIST && Array.isArray(HIST.filasJugador)){
  const cg={}; HIST.filasJugador.forEach(r=>{ if(r.gid&&r.cuando) cg[r.gid]=r.cuando; });
  const ps=Object.entries(cg).map(([g,c])=>({gid:+g,t:new Date(c).getTime()})).sort((x,y)=>x.t-y.t);
  if(ps.length>20){ let h=0,ct=null;
    for(let i=1;i<ps.length;i++){ const d=(ps[i].t-ps[i-1].t)/86400000; if(d>h){h=d;ct=ps[i-1].t;} }
    if(h>=30) GID_CORTE=Math.max(...ps.filter(p=>p.t<=ct).map(p=>p.gid)); }
}
if(S && S.jugadores){
  const cuenta=(filtrar)=>{ let dup=0, ej=[];
    Object.values(S.jugadores).forEach(p=>{ const c={};
      (p.log||[]).filter(l=>!filtrar||l.gid>GID_CORTE).forEach(l=>{ c[l.fecha]=(c[l.fecha]||0)+1; });
      if(Object.values(c).some(v=>v>1)){ dup++; if(ej.length<3) ej.push(p.nombre); } });
    return {dup,ej}; };
  const crudo=cuenta(false);
  if(GID_CORTE==null){
    if(crudo.dup>5) P_(crudo.dup+' jugadores con la MISMA FECHA repetida en el log, y NO pude separar los torneos '+
      '(falta data365_historico.json o no tiene fechas). Los numeros por jugador estan mezclados.');
    else OK('ningun partido repetido en el log de 365Scores');
  } else {
    const limpio=cuenta(true);
    if(limpio.dup>5) P_(limpio.dup+' jugadores con la misma fecha repetida DESPUES de separar los torneos. Ej: '+limpio.ej.join(', '));
    else {
      OK('el corte de torneos funciona: el archivo trae '+crudo.dup+' jugadores con fechas de los dos torneos '+
         'y el motor los deja en '+limpio.dup+(limpio.dup?' (copas)':''));
      if(crudo.dup>5) A_('data365.json sigue guardando los dos torneos juntos (SYNC_365 detecta el receso pero no corta, '+
        'a proposito, para no repetir el dia que borro el archivo). El motor los separa en cada corrida: no hace falta tocar nada.');
    }
  }
}

// ── 3. nombres repetidos que comparten datos ────────────────────────────────
const porNombre={}; TODOS.forEach(x=>{ (porNombre[x.nombre]=porNombre[x.nombre]||[]).push(x); });
const rep=Object.entries(porNombre).filter(([k,v])=>v.length>1);
const pisados=rep.filter(([k,v])=>{
  const i=v.map(x=>JSON.stringify([x.individual&&x.individual.minutos, x.individual&&x.individual.tiros, x.individual&&x.individual.xg]));
  return new Set(i).size===1 && v[0].individual && v[0].individual.minutos>0;
});
const precioPisado=rep.filter(([k,v])=>new Set(v.map(x=>x.precio)).size===1 && v.some(x=>x.pos!==v[0].pos));
if(pisados.length) P_(pisados.length+' nombres repetidos donde los dos jugadores tienen LOS MISMOS datos (uno pisa al otro): '+
  pisados.map(([k])=>k).join(', '));
else if(rep.length) OK(rep.length+' nombres repetidos, cada uno con sus propios datos: '+rep.map(([k])=>k).join(', '));
else OK('no hay nombres repetidos');
if(precioPisado.length) P_('cotizaciones iguales entre homonimos de distinto puesto: '+precioPisado.map(([k])=>k).join(', '));

// ── 4. valores fuera de rango ───────────────────────────────────────────────
const fichaMal=TODOS.filter(x=>x.ficha!=null && (x.ficha<1||x.ficha>10));
if(fichaMal.length) P_(fichaMal.length+' fichas fuera del 1-10 de Clarin. Ej: '+fichaMal.slice(0,3).map(x=>x.nombre+' '+x.ficha).join(', '));
else OK('todas las fichas caen dentro del 1 al 10');
const xgMal=TODOS.filter(x=>x.individual && x.individual.pj365>0 && (x.individual.xg/x.individual.pj365)>1.5);
if(xgMal.length) A_(xgMal.length+' jugadores con mas de 1.5 de xG por partido (posible, pero raro): '+
  xgMal.slice(0,3).map(x=>x.nombre+' '+(x.individual.xg/x.individual.pj365).toFixed(2)).join(', '));
else OK('ningun xG por partido absurdo');
const golMal=TODOS.filter(x=>x.individual && x.individual.goles>x.individual.pj365*3 && x.individual.pj365>0);
if(golMal.length) P_(golMal.length+' jugadores con mas de 3 goles por partido: '+golMal.slice(0,3).map(x=>x.nombre).join(', '));
else OK('ningun promedio de goles imposible');

// ── 5. "le deben": xG y goles de la misma ventana ───────────────────────────
const deben=TODOS.filter(x=>x.xgTorneo!=null && x.individual)
  .map(x=>({n:x.nombre, d:x.xgTorneo-(x.individual.goles||0)}))
  .filter(x=>x.d>4);
const racha=TODOS.filter(x=>x.xgTorneo!=null && x.individual && (x.individual.goles||0)-x.xgTorneo>4);
if(deben.length) P_(deben.length+' jugadores con MUCHO mas xG que goles (mas de 4 de diferencia): '+
  deben.slice(0,3).map(x=>x.n+' +'+x.d.toFixed(2))+'  → tipico de xG de dos torneos contra goles de uno');
else OK('el xG y los goles hablan del mismo torneo');
if(racha.length) A_(racha.length+' jugadores que metieron mucho mas de lo que su xG esperaba (racha, no error): '+
  racha.slice(0,3).map(x=>x.nombre).join(', '));

// ── 6. coherencia interna del puntaje ───────────────────────────────────────
let desc=0;
TODOS.forEach(x=>{ if(!Array.isArray(x.desglose)) return;
  const suma=x.desglose.reduce((a,d)=>a+(+d[1]||0),0);
  // el desglose suma los puntos SI ENTRA A LA CANCHA, no el descontado
  if(Math.abs(suma-x.EPsiJuega)>0.05) desc++; });
if(desc) P_(desc+' jugadores donde el desglose NO suma el puntaje que se muestra');
else OK('el desglose suma exactamente los puntos si entra, en los '+TODOS.length+' jugadores');

// ── 7. la fecha objetivo ────────────────────────────────────────────────────
const PT=OUT.partidos||[];
if(PT.length){
  const fechas=PT.map(m=>new Date(m.cuando)).sort((a,b)=>a-b);
  const dias=(fechas[fechas.length-1]-fechas[0])/86400000;
  if(dias>8) P_('los partidos de la fecha '+OUT.fechaObjetivo+' abarcan '+dias.toFixed(0)+
    ' dias: se estan mezclando fechas');
  else OK('los '+PT.length+' partidos de la fecha caen en '+dias.toFixed(0)+' dias');
  const yaJ=PT.filter(m=>m.yaJugado).length;
  const futuros=PT.filter(m=>m.yaJugado && new Date(m.cuando)>new Date()).length;
  if(futuros) P_(futuros+' partidos marcados "ya jugado" con fecha en el futuro');
  else OK('ningun partido futuro marcado como jugado'+(yaJ?' ('+yaJ+' ya se jugaron de verdad)':''));
  const sinPar=PT.filter(m=>!m.cuotaLocal);
  if(sinPar.length) A_(sinPar.length+' partidos sin cuota de mercado');
}

// ── 8. cuotas ───────────────────────────────────────────────────────────────
if(CU && Array.isArray(CU.cuotas)){
  const malSuma=CU.cuotas.filter(m=>{ const t=(m.probLocal||0)+(m.probEmpate||0)+(m.probVisitante||0);
    return Math.abs(t-1)>0.02; });
  if(malSuma.length) P_(malSuma.length+' partidos donde las probabilidades no suman 1 (margen mal descontado)');
  else OK('las probabilidades de las '+CU.cuotas.length+' cuotas suman 1');
  const margen=CU.cuotas.map(m=>m.margenCasa).filter(x=>x!=null);
  if(margen.length){ const mx=Math.max(...margen), mn=Math.min(...margen);
    if(mx>0.12) A_('margen de casa de hasta '+(100*mx).toFixed(1)+'% (lo normal es 2 a 8%)');
    else OK('margen de las casas entre '+(100*mn).toFixed(1)+'% y '+(100*mx).toFixed(1)+'%'); }
  const dupC={}; CU.cuotas.forEach(m=>{ const k=[CT(m.local),CT(m.visitante)].sort().join('|');
    dupC[k]=(dupC[k]||0)+1; });
  const nd=Object.values(dupC).filter(v=>v>1).length;
  if(nd) A_(nd+' partidos que aparecen mas de una vez en las cuotas (se usa el del horario del fixture)');
}

// ── 9. tabla de posiciones ──────────────────────────────────────────────────
if(Array.isArray(OUT.tabla)){
  const mal=OUT.tabla.filter(t=>t.pts!==3*t.pg+t.pe || t.pj!==t.pg+t.pe+t.pp);
  if(mal.length) P_(mal.length+' equipos donde los puntos no cierran con ganados/empatados/perdidos: '+
    mal.slice(0,3).map(t=>t.equipo).join(', '));
  else OK('la tabla cierra: puntos = 3×ganados + empatados en los '+OUT.tabla.length+' equipos');
  const pjs=[...new Set(OUT.tabla.map(t=>t.pj))].sort((a,b)=>a-b);
  if(pjs[pjs.length-1]-pjs[0]>2) A_('los equipos tienen entre '+pjs[0]+' y '+pjs[pjs.length-1]+
    ' partidos jugados (normal si hay fechas a medio jugar)');
  const gf=OUT.tabla.reduce((s,t)=>s+t.gf,0), gc=OUT.tabla.reduce((s,t)=>s+t.gc,0);
  if(gf!==gc) P_('los goles a favor ('+gf+') no igualan a los goles en contra ('+gc+')');
  else OK('los goles a favor y en contra de la liga cierran ('+gf+')');
}

// ── 10. cruce con 365Scores y con la planilla ───────────────────────────────
const sin365=TODOS.filter(x=>!x.tieneDato365 && (!x.individual||!x.individual.minutos));
const pct=Math.round(100*(TODOS.length-sin365.length)/TODOS.length);
if(pct<90) P_('solo el '+pct+'% de los jugadores cruzo con 365Scores');
else OK('el '+pct+'% de los jugadores tiene datos de 365Scores');
const sinPrecio=TODOS.filter(x=>x.precio==null);
if(sinPrecio.length) A_(sinPrecio.length+' jugadores sin cotizacion');
else OK('todos los jugadores tienen cotizacion');
const sinFicha=TODOS.filter(x=>x.sinFicha).length;
if(sinFicha) A_(sinFicha+' jugadores sin ficha propia (usan el promedio de la liga, quedan marcados en la app)');

// ── 11. equipos ─────────────────────────────────────────────────────────────
const eqs=[...new Set(TODOS.map(x=>CT(x.equipo)))];
const raros=eqs.filter(e=>!e||e.length<3);
if(raros.length) P_('equipos que no se pudieron canonizar: '+raros.join(', '));
else OK(eqs.length+' equipos, todos reconocidos');

// ── 12. suspendidos y transferidos ──────────────────────────────────────────
const susp=TODOS.filter(x=>x.disponibilidad&&x.disponibilidad.suspendido).length;
const tr=TODOS.filter(x=>x.transferido).length;
OK(susp+' suspendidos detectados · '+tr+' transferidos marcados');

// ── 13. la planilla de Planeta, ¿es la de esta fecha? ───────────────────────
// Planeta publica una planilla NUEVA cada fecha, con OTRO ID. Estuvimos
// bajando la de la fecha 6 con la 7 ya jugada y nadie se dio cuenta: el log
// decia "ultima fecha: F6" y parecia normal. Este control lo hace imposible.
if(PL){
  const uf = Number(PL.ultimaFecha)||0;
  const cfg = leer('planilla.json');
  if(uf && FJ && uf < FJ){
    P_('la planilla de Planeta esta ATRASADA: trae hasta la fecha '+uf+' y ya se jugo la '+FJ+
       '.  → Planeta publica una planilla nueva cada fecha, con otro ID. Pedile el link nuevo,'+
       ' pega el pedazo entre /d/e/ y /pubhtml en planilla.json y corré ACTUALIZAR_TODO de nuevo.'+
       (cfg&&cfg.id? '  (el ID que estamos usando arranca en '+String(cfg.id).slice(0,18)+'…)':''));
  } else if(uf && FJ && uf > FJ){
    A_('la planilla de Planeta dice fecha '+uf+' pero el fixture marca '+FJ+' jugadas. Puede ser que'+
       ' Planeta ya cargue la fecha en curso; si no, mira el fixture.');
  } else if(uf){
    OK('la planilla de Planeta esta al dia (fecha '+uf+')');
  }
  if(cfg && cfg.fecha && uf && Number(cfg.fecha)!==uf){
    A_('planilla.json dice fecha '+cfg.fecha+' pero la planilla bajada trae hasta la '+uf+
       '. Reviså que el ID sea el que corresponde.');
  }
  const dias = PL.generado? (Date.now()-new Date(PL.generado).getTime())/86400000 : null;
  if(dias!=null && dias>10) A_('dataPlaneta.json se bajo hace '+dias.toFixed(0)+' dias');
}

// ── 14. el ayudante de campo del Gran DT ────────────────────────────────────
// Es la unica fuente de los lesionados y la autoridad de las tarjetas. Si esta
// viejo, la app dice que juega gente que no juega, que es el peor error que
// podemos cometer: se pierde una fecha entera por un jugador en cero.
if(!GD){
  A_('no encontre dataGranDT.json. Sin el no hay lesionados ni ley del ex ni horario de cierre. Corré SYNC_GRANDT.bat.');
} else {
  const E=GD.estatico||{}, D=GD.dinamico||{};
  const horas = GD.generado ? (Date.now()-new Date(GD.generado).getTime())/3600000 : null;
  const conEstado = TODOS.filter(x=>x.disponibilidad && x.disponibilidad.estado).length;
  const bajas = TODOS.filter(x=>x.disponibilidad && x.disponibilidad.suspendido).length;
  if(horas!=null && horas>36) P_('el ayudante de campo tiene '+(horas/24).toFixed(1)+' dias. '+
    'Los lesionados y las formaciones cambian hasta una hora antes del partido: corré SYNC_GRANDT.bat de nuevo.');
  else if(horas!=null && horas>12) A_('el ayudante de campo tiene '+horas.toFixed(0)+' horas. '+
    'Conviene correr SYNC_GRANDT.bat justo antes de cerrar el equipo.');
  const pct = TODOS.length? Math.round(100*conEstado/TODOS.length) : 0;
  if(pct<90) P_('solo el '+pct+'% de los jugadores del ranking cruzo con el ayudante de campo. '+
    'Algo cambio en los nombres o en los clubes: los lesionados de los que no cruzan no se estan viendo.');
  else OK('el ayudante de campo cruza con el '+pct+'% del ranking · '+bajas+' bajas detectadas');
  // El once recomendado no puede tener a nadie que no juegue. Es el control que
  // mas caro sale si falla.
  const ids=new Set((OUT.esquema&&OUT.esquema.optimo&&OUT.esquema.optimo.once||[]).map(x=>x.id));
  const colados=TODOS.filter(x=>ids.has(x.id) && x.disponibilidad && x.disponibilidad.suspendido);
  if(colados.length) P_('HAY '+colados.length+' JUGADOR(ES) QUE NO JUEGAN DENTRO DEL ONCE RECOMENDADO: '+
    colados.map(x=>x.nombre+' ('+(x.disponibilidad.motivoBaja||'baja')+')').join(', '));
  else OK('ninguna baja se colo en el once recomendado');
  const fGDT = D.fechaActual && D.fechaActual.nombre;
  if(fGDT && OUT.fechaObjetivo!=null && !String(fGDT).includes(String(OUT.fechaObjetivo)))
    A_('el ayudante de campo habla de la "'+fGDT+'" y nosotros armamos la fecha '+OUT.fechaObjetivo+'. Revisalo.');
  if(OUT.curiosidades && OUT.curiosidades.veda){
    const v=new Date(OUT.curiosidades.veda);
    if(v.getTime()<Date.now()) A_('el horario de cierre que trae el ayudante de campo ya paso ('+
      v.toISOString().slice(0,16).replace('T',' ')+' UTC). O la fecha arranco, o el archivo quedo viejo.');
    else OK('cierre de cambios: '+v.toISOString().slice(0,16).replace('T',' ')+' UTC (lo publica el juego)');
  }
}

// ── 15. cobertura de 365Scores: partidos que le faltan ──────────────────────
// 365Scores arma la lista de partidos con una ventana movil, asi que si un
// partido no aparecio el dia que corrimos el sync, no entra nunca mas. Cuatro
// partidos enteros quedaron afuera y con ellos los tiros de todos los que
// jugaron. Este control los caza comparando el fixture con lo que 365 tiene.
if(S && FX && GID_CORTE!=null){
  const pares=new Set();
  Object.values(S.jugadores||{}).forEach(p=>(p.log||[]).forEach(l=>{
    if(l.gid>GID_CORTE) pares.add(l.fecha+'|'+[CT(p.equipo),CT(l.vs)].sort().join('-'));
  }));
  // OJO: dataFixture.json solo trae los resultados de las fechas recientes; el
  // fixture completo con las fechas 1 a 3 lo arma el motor. Usando el crudo, el
  // control se comia el partido de la fecha 1 que le falta a Estudiantes RC
  // —justo el del gol de Sergio Ojeda— y decia 4 en vez de 5.
  const jugados=(OUT.fixtureCompleto||[]).filter(m=>m.numeroFecha!=null && m.numeroFecha<=FJ && m.golesLocal!=null);
  const faltan=jugados.filter(m=>!pares.has(m.numeroFecha+'|'+[CT(m.local),CT(m.visitante)].sort().join('-')));
  if(faltan.length){
    P_(faltan.length+' partido(s) ya jugados NO tienen datos individuales en 365Scores, asi que a los que jugaron '+
      'les faltan tiros y xG: '+faltan.slice(0,5).map(m=>'f'+m.numeroFecha+' '+m.local+'-'+m.visitante).join(' · ')+
      '.  → corré SYNC_365.bat de nuevo: ahora tapa los huecos del bloque reciente.');
  } else OK('365Scores tiene los '+jugados.length+' partidos jugados del torneo');
  const parc=TODOS.filter(x=>x.datosParciales).length;
  const imp=TODOS.filter(x=>x.datosImposibles);
  // No es un imposible: el gol puede estar en un partido que 365 no tiene
  // cargado para ese jugador (Ojeda mete en la fecha 1 y 365 no lo lista en ese
  // partido). El cero de tiros es real y medido; lo que falta es un partido.
  if(imp.length) A_(imp.length+' jugador(es) con goles y CERO tiros medidos en 365Scores: '+
    imp.slice(0,4).map(x=>x.nombre).join(', ')+'. El gol cae en un partido que 365 no le tiene cargado. La app muestra el cero real y, al lado, cuantos partidos le faltan.');
  if(parc) A_(parc+' jugadores con menos partidos en 365 que en la planilla: su ritmo por 90 sale de menos futbol del que jugaron. Van marcados.');
}

// ── informe ─────────────────────────────────────────────────────────────────
L('');
if(problemas.length){
  L('  ✗ PROBLEMAS ('+problemas.length+')');
  problemas.forEach(t=>L('     • '+t));
  L('');
}
if(avisos.length){
  L('  ! PARA MIRAR ('+avisos.length+')');
  avisos.forEach(t=>L('     • '+t));
  L('');
}
L('  ✓ CONTROLES QUE PASARON ('+ok.length+')');
ok.forEach(t=>L('     · '+t));
L('');
L('  ══════════════════════════════════════════════════════════════');
L(problemas.length ? '   HAY '+problemas.length+' PROBLEMA(S). No confies en los numeros hasta arreglarlos.'
                   : '   Todo en orden.');
L('  ══════════════════════════════════════════════════════════════');
L('');
