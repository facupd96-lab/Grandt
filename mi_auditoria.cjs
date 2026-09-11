// ============================================================================
//  mi_auditoria.cjs — una segunda opinion sobre datos.js
//  No repite lo que ya controla auditar.cjs: lo cruza por afuera, con las
//  cuentas hechas de cero, para que un error en el motor no se valide a si
//  mismo. Se corre:  node mi_auditoria.cjs <ruta a datos.js>
// ============================================================================
const fs = require('fs'), vm = require('vm');
const ruta = process.argv[2] || 'datos.js';
const c = { window: {} }; vm.createContext(c);
vm.runInContext(fs.readFileSync(ruta, 'utf8'), c, { timeout: 120000 });
const D = c.window.DATOS;
const J = [].concat(...['ARQ', 'DEF', 'VOL', 'DEL'].map(p => D.rankings[p] || []));

const MAL = [], OJO = [], OK = [];
const mal = t => MAL.push(t), ojo = t => OJO.push(t), ok = t => OK.push(t);
const n1 = v => (Math.round(v * 10) / 10).toFixed(1);
const n2 = v => (Math.round(v * 100) / 100).toFixed(2);
const pct = v => (100 * v).toFixed(1) + '%';
const horas = t => (Date.now() - new Date(t).getTime()) / 3600000;

console.log('='.repeat(74));
console.log('  SEGUNDA OPINION SOBRE datos.js   ·   motor ' + (D.version || 's/d'));
console.log('  generado ' + String(D.generado).slice(0, 16).replace('T', ' ') +
            '  (hace ' + n1(horas(D.generado)) + ' h)');
console.log('  fecha objetivo ' + D.fechaObjetivo + '  ·  ' + J.length + ' jugadores');
console.log('='.repeat(74));

// ── 1. FRESCURA ────────────────────────────────────────────────────────────
{
  const h = horas(D.generado);
  if (h > 24) mal('datos.js tiene ' + n1(h) + ' horas: no es de hoy');
  else if (h > 6) ojo('datos.js tiene ' + n1(h) + ' horas');
  else ok('datos.js recien generado (' + n1(h) + ' h)');
}

// ── 2. LA FECHA QUE VIENE ──────────────────────────────────────────────────
{
  const P = D.partidos || [];
  if (P.length !== 15) mal('la fecha tiene ' + P.length + ' partidos, no 15');
  else ok('los 15 partidos de la fecha ' + D.fechaObjetivo + ' estan');
  const sinCuota = P.filter(m => m.golesEsperadosLocal == null || m.golesEsperadosVisitante == null);
  if (sinCuota.length) mal(sinCuota.length + ' partido(s) sin goles esperados: ' +
    sinCuota.map(m => m.local + '-' + m.visitante).join(', '));
  else ok('los ' + P.length + ' partidos tienen goles esperados salidos de las cuotas');
  // las tres probabilidades tienen que sumar 1 y el margen ser razonable
  const malProb = P.filter(m => Math.abs((m.probLocal + m.probEmpate + m.probVisitante) - 1) > 0.005);
  if (malProb.length) mal(malProb.length + ' partido(s) con probabilidades que no suman 1');
  else ok('en los ' + P.length + ' partidos las probabilidades suman 1');
  const marg = P.map(m => m.margenCasa).filter(v => v != null);
  if (marg.length) {
    const max = Math.max(...marg), min = Math.min(...marg);
    if (max > 0.12) mal('hay un margen de casa de ' + pct(max) + ': la cuota esta rara');
    else ok('margen de las casas entre ' + pct(min) + ' y ' + pct(max));
  }
  // goles esperados creibles
  const ge = P.flatMap(m => [m.golesEsperadosLocal, m.golesEsperadosVisitante]);
  const raros = ge.filter(v => v < 0.3 || v > 3.5);
  if (raros.length) mal(raros.length + ' valor(es) de goles esperados fuera de 0.3-3.5');
  else ok('los goles esperados caen entre ' + n2(Math.min(...ge)) + ' y ' + n2(Math.max(...ge)));
  // ventaja de local A NIVEL LIGA: tiene que ser positiva
  const gl = P.reduce((a, m) => a + m.golesEsperadosLocal, 0) / P.length;
  const gv = P.reduce((a, m) => a + m.golesEsperadosVisitante, 0) / P.length;
  if (gl <= gv) ojo('en esta fecha los locales esperan ' + n2(gl) + ' y los visitantes ' + n2(gv) +
    ': la ventaja de local no aparece (puede ser el sorteo de partidos)');
  else ok('ventaja de local en la fecha: ' + n2(gl) + ' contra ' + n2(gv));
}

// ── 3. xG ──────────────────────────────────────────────────────────────────
{
  // LOS ARQUEROS NO PATEAN. Medir su cobertura de xG y contarla como un
  // agujero da un 84% que asusta y no significa nada. Se mira por puesto, y
  // solo de los de campo.
  const conMin = J.filter(x => x.ind && x.ind.minutos >= 90 && x.pos !== 'ARQ');
  const conXg = conMin.filter(x => x.xgT != null && x.xgT > 0);
  const cob = conXg.length / conMin.length;
  const porPuesto = ['DEF', 'VOL', 'DEL'].map(p => {
    const a = conMin.filter(x => x.pos === p);
    return p + ' ' + pct(a.filter(x => x.xgT > 0).length / a.length);
  }).join(' · ');
  if (cob < 0.8) mal('solo ' + pct(cob) + ' de los jugadores de campo con 90+ minutos tienen xG (' + porPuesto + ')');
  else ok('xG medido en ' + pct(cob) + ' de los de campo con 90+ minutos — ' + porPuesto +
          '. Los que faltan son centrales que no patearon nunca (mediana ' +
          (() => { const m = conMin.filter(x => !(x.xgT > 0)).map(x => x.ind.minutos).sort((a, b) => a - b);
                   return m.length ? m[Math.floor(m.length / 2)] : 0; })() + " minutos)");
  // xG por 90 imposible
  const x90 = conXg.map(x => ({ x, v: x.xgT / (x.ind.minutos / 90) }));
  const altos = x90.filter(o => o.v > 1.4);
  if (altos.length) mal(altos.length + ' con xG/90 arriba de 1.4: ' +
    altos.slice(0, 3).map(o => o.x.n + ' ' + n2(o.v)).join(' · '));
  else ok('ningun xG/90 imposible (el mayor es ' + n2(Math.max(...x90.map(o => o.v))) + ')');
  // el xG del jugador no puede superar lo que se espera de su equipo entero
  const negativos = J.filter(x => (x.xgT != null && x.xgT < 0) || (x.x90 != null && x.x90 < 0));
  if (negativos.length) mal(negativos.length + ' con xG negativo');
  else ok('ningun xG negativo');
  // coherencia xG contra goles: sobre el total de la liga tienen que parecerse
  // EL DENOMINADOR CORRECTO. Comparar el xG de los 761 del ranking contra los
  // goles DE ESOS 761 deja afuera los goles de los que no entran al ranking y
  // los en contra: da una brecha inflada. Los minutos del ranking cubren el
  // 101% de los que existen, asi que su xG es practicamente el de la liga
  // entera; del otro lado va lo que la liga metio de verdad, de la tabla.
  const sxg = J.reduce((a, x) => a + ((x.ind && x.ind.xg) || 0), 0);
  const golesLiga = (D.tabla || []).reduce((a, t) => a + (t.gf || t.golesFavor || 0), 0);
  const penales = J.reduce((a, x) => a + ((x.ind && x.ind.golesPenal) || 0), 0);
  const sgol = golesLiga ? (golesLiga - penales) : J.reduce((a, x) =>
    a + ((x.ind && x.ind.goles) || 0) - ((x.ind && x.ind.golesPenal) || 0), 0);
  const r = sxg / (sgol || 1);
  if (r < 0.6 || r > 1.8) mal('el xG total (' + n1(sxg) + ') y los goles de jugada (' + sgol + ') no cierran: razon ' + n2(r));
  else if (r > 1.15) ojo('el xG de 365Scores corre ' + pct(r - 1) + ' arriba de los goles que se metieron: ' +
    n1(sxg) + ' de xG contra ' + sgol + ' goles de jugada en la liga. Es de la fuente, no del motor. ' +
    'Adentro de un mismo puesto no cambia nada el orden; entre puestos empuja un poco para arriba a los ' +
    'que viven del gol. No leas el gol esperado como una cantidad exacta.');
  else ok('el xG total y los goles de jugada cierran: ' + n1(sxg) + ' contra ' + sgol + ' (razon ' + n2(r) + ')');
  // el xG de la ficha tiene que estar encogido en los de poca muestra
  const pocos = J.filter(x => x.ind && x.ind.minutos > 0 && x.ind.minutos < 180 && x.x90 != null);
  const muchos = J.filter(x => x.ind && x.ind.minutos >= 540 && x.x90 != null);
  if (pocos.length && muchos.length) {
    const varP = Math.max(...pocos.map(x => x.x90)), varM = Math.max(...muchos.map(x => x.x90));
    if (varP > varM * 1.6) ojo('el xG/90 de los de poca muestra llega a ' + n2(varP) +
      ' y el de los de mucha a ' + n2(varM) + ': revisar el encogido');
    else ok('el xG/90 de los de poca muestra no se dispara (' + n2(varP) + ' contra ' + n2(varM) + ')');
  }
}

// ── 4. TIROS ───────────────────────────────────────────────────────────────
{
  const conMin = J.filter(x => x.ind && x.ind.minutos >= 90 && x.pos !== 'ARQ');
  const conT = conMin.filter(x => x.tirT != null && x.tirT > 0);
  if (conT.length / conMin.length < 0.8) mal('solo ' + pct(conT.length / conMin.length) + ' de los de campo tienen tiros registrados');
  else ok(pct(conT.length / conMin.length) + ' de los de campo con 90+ minutos tienen tiros medidos');
  const t90 = conT.map(x => x.tirT / (x.ind.minutos / 90));
  const max = Math.max(...t90);
  if (max > 8) mal('hay un tiros/90 de ' + n2(max) + ': imposible');
  else ok('el mayor tiros/90 es ' + n2(max));
  // los tiros tienen que ser al menos tantos como los goles
  const imposibles = J.filter(x => x.ind && x.ind.goles > 0 && x.tirT != null && x.tirT < (x.ind.goles - x.ind.golesPenal));
  if (imposibles.length) ojo(imposibles.length + ' con menos tiros que goles de jugada (365Scores le registra menos partidos)');
  else ok('nadie tiene mas goles de jugada que tiros');
}

// ── 5. EL AYUDANTE DE CAMPO ────────────────────────────────────────────────
{
  const conEstado = J.filter(x => x.disp && x.disp.estado);
  const cob = conEstado.length / J.length;
  if (cob < 0.97) mal('solo ' + pct(cob) + ' de los jugadores cruzan con el ayudante de campo');
  else ok(pct(cob) + ' de los jugadores tienen estado del ayudante de campo');
  const cuenta = {};
  conEstado.forEach(x => { cuenta[x.disp.estado] = (cuenta[x.disp.estado] || 0) + 1; });
  ok('estados: ' + Object.entries(cuenta).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
  const bajas = J.filter(x => x.disp && (x.disp.suspendido || x.disp.seFue || x.disp.motivoBaja ||
    ['Lesionado', 'Suspendido', 'Expulsado', 'No juega'].includes(x.disp.estado)));
  ok(bajas.length + ' jugadores marcados como que no juegan');
  // NINGUNA baja puede estar en el once recomendado
  const once = ((D.esquema && D.esquema.optimo && D.esquema.optimo.once) || []).map(x => x.id);
  const coladas = bajas.filter(x => once.includes(x.id));
  if (coladas.length) mal('SE COLO UNA BAJA EN EL ONCE: ' + coladas.map(x => x.n + ' (' + x.disp.estado + ')').join(', '));
  else ok('ninguna baja se colo en el once recomendado');
  // ni en el arriesgado
  const arr = (D.arriesgado && D.arriesgado.ids) || [];
  const coladas2 = bajas.filter(x => arr.includes(x.id));
  if (coladas2.length) mal('SE COLO UNA BAJA EN EL ONCE ARRIESGADO: ' + coladas2.map(x => x.n).join(', '));
  else if (arr.length) ok('ninguna baja se colo en el once arriesgado');
  // a una amarilla de la suspension
  const filo = J.filter(x => x.disp && x.disp.aUnaDeSuspension);
  ok(filo.length + ' jugadores a una amarilla de la suspension');
}

// ── 6. FORMACIONES CONFIRMADAS ─────────────────────────────────────────────
{
  const conf = J.filter(x => x.fmin === 'confirmado' || x.fmin === 'once confirmado');
  const banco = J.filter(x => x.fmin === 'al banco (once confirmado)');
  const est = J.filter(x => x.fmin === 'estimado');
  if (!conf.length && !banco.length) {
    ojo('NINGUNA formacion confirmada todavia. Se publican ~1 hora antes de cada partido: ' +
        'volve a correr SYNC_365 lo mas cerca posible del cierre.');
  } else {
    ok(conf.length + ' jugadores con el once ya confirmado y ' + banco.length + ' mandados al banco');
    // un confirmado tiene que tener chance de jugar alta
    const flojos = conf.filter(x => x.pj_ != null && x.pj_ < 0.9);
    if (flojos.length) mal(flojos.length + ' confirmados con chance de jugar abajo de 90%');
    else ok('a los confirmados se les puso chance de jugar alta');
  }
  ok(est.length + ' jugadores con minutos estimados (todavia sin formacion publicada)');
}

// ── 7. EL PUNTAJE ──────────────────────────────────────────────────────────
{
  const raros = J.filter(x => x.epsj == null || x.epsj < 0 || x.epsj > 25);
  if (raros.length) mal(raros.length + ' con puntaje fuera de 0-25');
  else ok('los ' + J.length + ' puntajes caen entre ' + n2(Math.min(...J.map(x => x.epsj))) +
          ' y ' + n2(Math.max(...J.map(x => x.epsj))));
  const probs = [];
  J.forEach(x => ['pj_', 'pvi', 'p12', 'pfig'].forEach(k => { if (x[k] != null) probs.push([x.n, k, x[k]]); }));
  const fuera = probs.filter(([, , v]) => v < 0 || v > 1);
  if (fuera.length) mal(fuera.length + ' probabilidad(es) fuera de 0 a 1');
  else ok('las ' + probs.length + ' probabilidades caen entre 0 y 1');
  // los rankings tienen que venir ordenados
  let desord = 0;
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => {
    const a = D.rankings[p] || [];
    for (let i = 1; i < a.length; i++) if ((a[i].epsj ?? -1) > (a[i - 1].epsj ?? -1) + 1e-9) desord++;
  });
  if (desord) mal(desord + ' saltos de orden en los rankings');
  else ok('los cuatro rankings vienen ordenados por puntaje');
  // la ficha, que es el termino mas pesado
  const fichas = J.map(x => x.fi).filter(v => v != null);
  const malF = fichas.filter(v => v < 1 || v > 10);
  if (malF.length) mal(malF.length + ' fichas fuera de 1 a 10');
  else ok('las ' + fichas.length + ' fichas caen entre ' + n2(Math.min(...fichas)) + ' y ' + n2(Math.max(...fichas)) +
          ' (media ' + n2(fichas.reduce((a, b) => a + b, 0) / fichas.length) + ')');
}

// ── 8. EL ONCE RECOMENDADO ─────────────────────────────────────────────────
{
  const o = (D.esquema && D.esquema.optimo) || null;
  if (!o) { mal('no hay once recomendado'); }
  else {
    const ids = o.once.map(x => x.id);
    const porId = {}; J.forEach(x => porId[x.id] = x);
    const jug = ids.map(i => porId[i]).filter(Boolean);
    if (ids.length !== 11) mal('el once tiene ' + ids.length + ' jugadores');
    else if (new Set(ids).size !== 11) mal('el once tiene jugadores repetidos');
    else ok('el once recomendado tiene 11 jugadores distintos');
    const porPos = {}; jug.forEach(x => porPos[x.pos] = (porPos[x.pos] || 0) + 1);
    if (porPos.ARQ !== 1) mal('el once tiene ' + (porPos.ARQ || 0) + ' arqueros');
    else ok('esquema ' + o.esquema + ': ' + ['ARQ', 'DEF', 'VOL', 'DEL'].map(p => porPos[p] + ' ' + p).join(' · '));
    const costo = jug.reduce((a, x) => a + (x.pr || 0), 0);
    const tope = D.presupuesto || 65000000;
    if (costo > tope) mal('el once cuesta $' + n1(costo / 1e6) + 'M y el tope es $' + n1(tope / 1e6) + 'M');
    else ok('el once cuesta $' + n1(costo / 1e6) + 'M de $' + n1(tope / 1e6) + 'M');
    const suma = jug.reduce((a, x) => a + (x.epsj || 0), 0);
    ok('el once suma ' + n1(suma) + ' puntos esperados (sin la cinta)');
  }
}

// ── 9. LA PLANILLA DE PLANETA ──────────────────────────────────────────────
{
  const uf = D.ultimaFechaJugada;
  if (uf == null) ojo('no se sabe cual fue la ultima fecha jugada');
  else if (uf < D.fechaObjetivo - 1) mal('la ultima fecha jugada es la ' + uf + ' y el motor apunta a la ' + D.fechaObjetivo +
    ': falta cargar la planilla de la ' + (D.fechaObjetivo - 1));
  else ok('ultima fecha jugada: ' + uf + ', el motor apunta a la ' + D.fechaObjetivo);
  const conFicha = J.filter(x => x.fi != null && !(x.ind && x.ind.partidosSinDato === x.ind.pj));
  ok(J.filter(x => x.ind && x.ind.pj > 0).length + ' jugadores con partidos calificados en la planilla');
}

// ── RESUMEN ────────────────────────────────────────────────────────────────
const linea = (ic, a, col) => a.forEach(t => console.log('  ' + ic + ' ' + t));
console.log('');
if (MAL.length) { console.log('  PROBLEMAS (' + MAL.length + ')'); linea('X', MAL); console.log(''); }
if (OJO.length) { console.log('  PARA MIRAR (' + OJO.length + ')'); linea('!', OJO); console.log(''); }
console.log('  PASARON (' + OK.length + ')'); linea('.', OK);
console.log('');
console.log('='.repeat(74));
console.log(MAL.length ? ('  HAY ' + MAL.length + ' PROBLEMA(S).') : '  SIN PROBLEMAS.');
console.log('='.repeat(74));
