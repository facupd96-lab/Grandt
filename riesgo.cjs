'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// ONCE ARRIESGADO — simulacion de Montecarlo de la fecha
//
// El once que maximiza puntos esperados no es el que maximiza la chance de
// hacer una fecha enorme. Son dos objetivos distintos y hay que optimizar cada
// uno por separado:
//   · torneo largo contra amigos  -> maximizar el promedio (el once de siempre)
//   · ganar UNA fecha a nivel pais -> maximizar P(total >= objetivo)
//
// Para lo segundo hace falta la DISTRIBUCION del once, no su promedio. Y para
// eso hace falta simular el partido, porque los puntos de los companeros de
// equipo estan correlacionados: si el equipo gana 4-0, varios meten gol y todos
// los defensores cobran la valla el mismo domingo. Esa correlacion es
// justamente de donde sale el riesgo, y se pierde entera si uno suma varianzas
// jugador por jugador.
//
// DE DONDE SALE CADA NUMERO
// La parte del puntaje que NO es gol propio se toma de una tabla MEDIDA sobre
// las 6 fechas del torneo cruzadas con los resultados reales (2262 filas
// jugador-fecha, filtrando las que tienen gol propio). Esa tabla ya incluye
// ficha, valla invicta, figura y tarjetas, por puesto x resultado x valla:
//     DEF gano con valla 7.34 (sd 1.23) | DEF perdio 4.32 (sd 1.47)
//     ARQ gano con valla 9.52 (sd 1.54) | ARQ perdio 3.14 (sd 2.36)
// Se la centra en la ficha esperada de cada jugador para no perder quien es
// quien. Los goles se agregan aparte con el reglamento.
//
// NO ESTA MODELADO: el gol de oro (+5). Es raro y no lo se predecir, asi que el
// techo simulado queda un poco por debajo del techo real.
// ─────────────────────────────────────────────────────────────────────────────

// Tabla medida: puntos sin gol propio. [pos][resultado][valla] = [media, sd]
// Los casos que no aparecen (ganar sin valla recibiendo, etc.) caen al vecino.
const TABLA = {
  ARQ: { gano:   { VI: [9.52, 1.54], no: [5.29, 2.19] },
         empato: { VI: [7.50, 1.50], no: [4.28, 1.10] },
         perdio: { VI: [6.00, 1.50], no: [3.14, 2.36] } },
  DEF: { gano:   { VI: [7.34, 1.23], no: [5.63, 1.51] },
         empato: { VI: [6.93, 1.09], no: [4.79, 1.43] },
         perdio: { VI: [5.50, 1.40], no: [4.32, 1.47] } },
  VOL: { gano:   { VI: [5.62, 1.47], no: [5.75, 1.66] },
         empato: { VI: [5.31, 1.32], no: [5.31, 1.43] },
         perdio: { VI: [4.80, 1.30], no: [4.37, 1.31] } },
  DEL: { gano:   { VI: [5.35, 1.52], no: [5.36, 1.12] },
         empato: { VI: [4.74, 1.36], no: [5.11, 1.81] },
         perdio: { VI: [4.60, 1.30], no: [4.35, 1.35] } },
};
// Ficha media de la liga por puesto, para centrar la tabla en cada jugador.
const FICHA_MEDIA = { ARQ: 5.5, DEF: 5.4, VOL: 5.3, DEL: 5.2 };
const PTS_GOL = { ARQ: 12, DEF: 9, VOL: 6, DEL: 4 };
const GOL_PENAL = 3, BONUS_VISITA = 2;

// Generador reproducible: la misma corrida da el mismo once.
function rng(seed) {
  let s = seed >>> 0;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function poisson(lam, r) {
  if (lam <= 0) return 0;
  const L = Math.exp(-lam); let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L && k < 12);
  return k - 1;
}
function normal(r) {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Simula N fechas y devuelve una matriz de puntos por jugador.
 * @returns { ids, pos, precio, nombre, equipo, M: Int16Array(nJug*N), N }
 */
function simularFecha(rankings, N, seed) {
  const r = rng(seed || 20260826);
  const jug = [];
  ['ARQ','DEF','VOL','DEL'].forEach(p => (rankings[p] || []).forEach(j => jug.push(j)));
  const idx = new Map(); jug.forEach((j, i) => idx.set(j.id, i));

  // Agrupar por partido: cada jugador trae rival, condicion y las lambdas.
  const partidos = new Map();
  jug.forEach(j => {
    const a = j.equipo, b = j.rival;
    const clave = j.condicion === 'Local' ? a + '|' + b : b + '|' + a;
    if (!partidos.has(clave)) partidos.set(clave, { local: [], visita: [], lamL: null, lamV: null });
    const P = partidos.get(clave);
    if (j.condicion === 'Local') { P.local.push(j); if (P.lamL == null) { P.lamL = j.lam.lamFor; P.lamV = j.lam.lamAgainst; } }
    else { P.visita.push(j); if (P.lamV == null) { P.lamV = j.lam.lamFor; P.lamL = j.lam.lamAgainst; } }
  });

  const M = new Int16Array(jug.length * N);
  const listas = [...partidos.values()];

  for (let s = 0; s < N; s++) {
    for (const P of listas) {
      const gL = poisson(P.lamL == null ? 1.2 : P.lamL, r);
      const gV = poisson(P.lamV == null ? 1.0 : P.lamV, r);
      resolverEquipo(P.local, gL, gV, true, s, N, M, idx, r);
      resolverEquipo(P.visita, gV, gL, false, s, N, M, idx, r);
    }
  }
  return { jug, idx, M, N };
}

function resolverEquipo(lista, gf, gc, esLocal, s, N, M, idx, r) {
  if (!lista.length) return;
  const resultado = gf > gc ? 'gano' : gf === gc ? 'empato' : 'perdio';
  const valla = gc === 0 ? 'VI' : 'no';
  // Quien juega esta fecha simulada.
  const juega = new Uint8Array(lista.length);
  const peso = new Float64Array(lista.length);
  let sumaPeso = 0;
  for (let i = 0; i < lista.length; i++) {
    const j = lista[i];
    juega[i] = r() < (j.pJuega || 0.5) ? 1 : 0;
    if (juega[i]) { peso[i] = Math.max(1e-6, (j.share || 0.001) * ((j.minSiJuega || 80) / 90)); sumaPeso += peso[i]; }
  }
  // Repartir los goles del equipo entre los que estan en cancha.
  const goles = new Int8Array(lista.length);
  for (let g = 0; g < gf; g++) {
    let u = r() * sumaPeso, k = -1;
    for (let i = 0; i < lista.length; i++) { if (!juega[i]) continue; u -= peso[i]; if (u <= 0) { k = i; break; } }
    if (k < 0) { for (let i = lista.length - 1; i >= 0; i--) if (juega[i]) { k = i; break; } }
    if (k >= 0) goles[k]++;
  }
  for (let i = 0; i < lista.length; i++) {
    const j = lista[i], fila = idx.get(j.id);
    if (!juega[i]) { M[fila * N + s] = 0; continue; }
    const t = (TABLA[j.pos] || TABLA.VOL)[resultado][valla];
    const ajusteFicha = (j.ficha || FICHA_MEDIA[j.pos]) - FICHA_MEDIA[j.pos];
    let pts = t[0] + ajusteFicha + t[1] * normal(r);
    if (goles[i] > 0) {
      // Que parte de sus goles suelen ser de penal (el penal paga 3 fijo).
      const fracPen = j.lamGol > 0 ? Math.min(0.9, (j.lamPen || 0) / j.lamGol) : 0;
      for (let g = 0; g < goles[i]; g++) {
        const dePenal = r() < fracPen;
        pts += (dePenal ? GOL_PENAL : (PTS_GOL[j.pos] || 4)) + (esLocal ? 0 : BONUS_VISITA);
      }
    }
    M[fila * N + s] = Math.round(pts * 10);   // decimas, para no perder precision
  }
}

// ── Optimizacion: buscar el once que maximiza P(total >= objetivo) ───────────
// Se trabaja con un vector de totales por simulacion. Cambiar un jugador es
// restar su fila y sumar la del reemplazante: 2 pasadas en vez de 11.
function totalesDe(sim, filas) {
  const { M, N } = sim; const tot = new Int32Array(N);
  for (const f of filas) { const off = f * N; for (let s = 0; s < N; s++) tot[s] += M[off + s]; }
  return tot;
}
function statsDe(tot, objetivo) {
  const N = tot.length; let exitos = 0, suma = 0, suma2 = 0;
  for (let s = 0; s < N; s++) { const v = tot[s] / 10; suma += v; suma2 += v * v; if (v >= objetivo) exitos++; }
  const media = suma / N;
  const orden = Int32Array.from(tot).sort();
  const sobre = u => { const lim = u * 10; let c = 0; for (let s = 0; s < N; s++) if (tot[s] >= lim) c++; return c / N; };
  return { p: exitos / N, media, sd: Math.sqrt(Math.max(0, suma2 / N - media * media)),
           p50: orden[Math.floor(N * 0.50)] / 10, p90: orden[Math.floor(N * 0.90)] / 10,
           p99: orden[Math.floor(N * 0.99)] / 10, max: orden[N - 1] / 10,
           p100: sobre(100), p120: sobre(120), p140: sobre(140), p160: sobre(160),
           p995: orden[Math.floor(N * 0.995)] / 10, excedente: excedente(tot, objetivo) };
}
// Criterio de busqueda: EXCEDENTE ESPERADO POR ENCIMA DEL OBJETIVO,
// E[max(0, total - objetivo)]. Contar cuantas simulaciones superan el objetivo
// parece lo natural, pero con objetivos altos quedan 20 o 30 exitos sobre
// 50.000 sorteos y la busqueda termina eligiendo ruido. El excedente usa toda
// la masa de la cola —no solo si la cruzo, sino por cuanto— asi que es mucho
// mas estable y sigue premiando exactamente lo mismo: los onces que explotan.
function excedente(tot, objetivo) {
  const lim = objetivo * 10; let acc = 0;
  for (let s = 0; s < tot.length; s++) { const d = tot[s] - lim; if (d > 0) acc += d; }
  return acc / (tot.length * 10);
}
// Criterio de busqueda definitivo: el CUANTIL 99.5, o sea "cuanto hace tu once
// en su mejor fecha de cada 200". Contar cuantas simulaciones pasan de 140
// deja 30 exitos sobre 50.000 y la busqueda ajusta ruido; el excedente esperado
// premia irse muy lejos una vez y no cruzar nunca. El cuantil apunta justo a
// donde el tipo quiere estar y se mide con 250 casos, no con 30.
// Cuantil por histograma: ordenar 50.000 numeros para cada candidato que se
// prueba cuesta el 90% del tiempo de la busqueda. Los totales son decimas de
// punto entre 0 y ~3000, asi que un conteo por casillero da lo mismo en una
// sola pasada.
// Casilleros de 2 decimas de punto: 0.2 de resolucion alcanza y sobra para
// comparar dos onces, y evita que la busqueda se quede quieta por empates.
const _NB = 2000, _hist = new Int32Array(_NB);
function cuantil(tot, q) {
  _hist.fill(0);
  const N = tot.length;
  for (let s = 0; s < N; s++) {
    let v = tot[s] >> 1; if (v < 0) v = 0; if (v >= _NB) v = _NB - 1;
    _hist[v]++;
  }
  const objetivo = Math.floor(N * q); let acc = 0;
  for (let b = 0; b < _NB; b++) { acc += _hist[b]; if (acc > objetivo) return b * 0.2; }
  return _NB * 0.2;
}
function cuantosSuperan(tot, objetivo) {
  const lim = objetivo * 10; let c = 0;
  for (let s = 0; s < tot.length; s++) if (tot[s] >= lim) c++;
  return c;
}
function evaluarOnce(sim, filas, objetivo) { return statsDe(totalesDe(sim, filas), objetivo); }

// maxComunes: cuantos jugadores puede compartir con el once de siempre. Sin
// esto la busqueda encuentra el once seguro con dos cambios y se queda ahi:
// tecnicamente es el que mas cola tiene, pero no es OTRA apuesta, es la misma.
function buscarOnce(sim, esquema, objetivo, presupuesto, criterio, arranque, idsSeguro, maxComunes) {
  const { M, N } = sim;
  const porPos = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  sim.jug.forEach((j, i) => { if (porPos[j.pos]) porPos[j.pos].push({ i, j }); });
  const cupos = { ARQ: esquema[0], DEF: esquema[1], VOL: esquema[2], DEL: esquema[3] };
  // EL POOL DECIDE MAS QUE LA BUSQUEDA. Antes eran los 25 mejores por puntos
  // esperados mas los 25 mas explosivos, y como las dos listas se parecen, el
  // arriesgado salia siendo el de siempre con dos cambios. Ahora entran tambien
  // los que el ranking normal nunca va a mostrar: el que patea mucho aunque su
  // equipo no espere goles, y el que genera xG y todavia no lo convirtio.
  const cand = {};
  for (const p in cupos) {
    const porEP  = [...porPos[p]].sort((x, y) => (y.j.EP || 0) - (x.j.EP || 0)).slice(0, 15);
    const porCri = [...porPos[p]].sort((x, y) => criterio(y.j) - criterio(x.j)).slice(0, 30);
    const porTiro= [...porPos[p]].sort((x, y) => (y.j._tiros90 || 0) - (x.j._tiros90 || 0)).slice(0, 20);
    const porDeuda=[...porPos[p]].sort((x, y) => (y.j._deuda || 0) - (x.j._deuda || 0)).slice(0, 15);
    const set = new Map(); [...porEP, ...porCri, ...porTiro, ...porDeuda].forEach(o => set.set(o.i, o));
    cand[p] = [...set.values()];
  }
  const enSeguro = idsSeguro instanceof Set ? idsSeguro : new Set();
  const tope = maxComunes == null ? 99 : maxComunes;
  const comunes = lista => lista.reduce((n, o) => n + (enSeguro.has(o.j.id) ? 1 : 0), 0);
  // Arranque. Se prueba desde dos lados —el once mas explosivo y el once que ya
  // recomienda el motor— porque la busqueda local se queda pegada en el primer
  // valle que encuentra. Sin esto el "arriesgado" podia salir peor que el de
  // siempre en TODAS las metricas, que es la senal de que no busco, tropezo.
  const once = [];
  if (arranque && arranque.length) {
    const porId = new Map(); sim.jug.forEach((j, i) => porId.set(j.id, { i, j }));
    const libres = { ...cupos };
    arranque.forEach(id => { const o = porId.get(id); if (o && libres[o.j.pos] > 0) { once.push(o); libres[o.j.pos]--; } });
    for (const p in libres) {
      const ord = [...cand[p]].sort((x, y) => criterio(y.j) - criterio(x.j));
      const usados = new Set(once.map(o => o.i));
      for (const o of ord) { if (libres[p] <= 0) break; if (usados.has(o.i)) continue; once.push(o); usados.add(o.i); libres[p]--; }
    }
  } else {
    for (const p in cupos) {
      const ord = [...cand[p]].sort((x, y) => criterio(y.j) - criterio(x.j));
      let puestos = 0;
      for (const o of ord) {
        if (puestos >= cupos[p]) break;
        if (enSeguro.has(o.j.id) && comunes(once) >= tope) continue;
        once.push(o); puestos++;
      }
      // si el cupo no se lleno por el tope, se completa con lo que haya
      for (const o of ord) { if (puestos >= cupos[p]) break;
        if (once.includes(o)) continue; once.push(o); puestos++; }
    }
  }
  const costo = o => o.reduce((a, x) => a + (x.j.precio || 0), 0);
  let guard = 0;
  while (costo(once) > presupuesto && guard++ < 300) {
    let peor = -1, mejorRatio = -Infinity, reemplazo = null;
    const usados = new Set(once.map(o => o.i));
    for (let k = 0; k < once.length; k++) {
      const alt = cand[once[k].j.pos].filter(o => !usados.has(o.i) && (o.j.precio || 0) < (once[k].j.precio || 0));
      if (!alt.length) continue;
      alt.sort((x, y) => criterio(y.j) - criterio(x.j));
      const perdida = Math.max(0.001, criterio(once[k].j) - criterio(alt[0].j));
      const ratio = ((once[k].j.precio || 0) - (alt[0].j.precio || 0)) / perdida;
      if (ratio > mejorRatio) { mejorRatio = ratio; peor = k; reemplazo = alt[0]; }
    }
    if (peor < 0) break;
    once[peor] = reemplazo;
  }
  // Busqueda local incremental.
  let tot = totalesDe(sim, once.map(o => o.i));
  let mejorC = cuantil(tot, 0.995);
  const tmp = new Int32Array(N);
  let mejoro = true, vueltas = 0;
  while (mejoro && vueltas++ < 8) {
    mejoro = false;
    for (let k = 0; k < once.length; k++) {
      const viejo = once[k], usados = new Set(once.map(o => o.i));
      const offV = viejo.i * N;
      let mejorAlt = null, mejorNuevo = mejorC, mejorTot = null;
      const comunesSinEste = comunes(once) - (enSeguro.has(viejo.j.id) ? 1 : 0);
      for (const alt of cand[viejo.j.pos]) {
        if (usados.has(alt.i)) continue;
        if (costo(once) - (viejo.j.precio || 0) + (alt.j.precio || 0) > presupuesto) continue;
        if (enSeguro.has(alt.j.id) && comunesSinEste >= tope) continue;
        const offA = alt.i * N;
        for (let s = 0; s < N; s++) tmp[s] = tot[s] - M[offV + s] + M[offA + s];
        const c = cuantil(tmp, 0.995);
        if (c > mejorNuevo + 0.01) { mejorNuevo = c; mejorAlt = alt; mejorTot = Int32Array.from(tmp); }
      }
      if (mejorAlt) { once[k] = mejorAlt; tot = mejorTot; mejorC = mejorNuevo; mejoro = true; }
    }
  }
  return { once: once.map(o => o.j), stats: statsDe(tot, objetivo), costo: costo(once) };
}

function armarArriesgado(rankings, opciones) {
  const o = opciones || {};
  const N = o.simulaciones || 50000;
  const presupuesto = o.presupuesto || 65000000;
  // LOS DIEZ ESQUEMAS, NO SIETE (03/09).
  // Faltaban 1-4-5-1, 1-5-4-1 y 1-5-2-3, y no era un detalle: simulando los diez
  // con los mejores de cada puesto, 1-4-5-1 es EL MEJOR para la cola —0.360% de
  // chance de pasar los 120— contra 0.221% del 1-3-4-3 que venia eligiendo.
  // O sea que la busqueda no podia encontrar el mejor once porque no estaba en
  // la lista de esquemas que probaba.
  //
  // El patron, simulando 150.000 fechas, es la cantidad de VOLANTES y es
  // monotono:  5 volantes -> 0.333% de media   |   4 volantes -> 0.235%
  //            3 volantes -> 0.178%            |   2 volantes -> 0.153%
  // La razon es del reglamento, no de esta fecha: el gol de volante paga 6 y
  // ademas lo hace figura el 44% de las veces (4 puntos mas), o sea 7.77 en
  // total. El del delantero paga 4 y lo hace figura el 24%: 4.95. El volante
  // que la mete vale casi el doble que el delantero que la mete.
  // Medido contra la realidad, un volante que convierte saca +10.54 sobre su
  // base y un delantero +8.57.
  const esquemas = o.esquemas || [[1,4,4,2],[1,4,3,3],[1,3,4,3],[1,4,5,1],[1,3,5,2],
                                  [1,5,3,2],[1,3,3,4],[1,4,2,4],[1,5,2,3],[1,5,4,1]];
  const sim = simularFecha(rankings, N, o.seed);
  // QUE ES "ARRIESGADO" (03/09). Antes el criterio era gol esperado x chance de
  // jugar, que es casi lo mismo que los puntos esperados: por eso el once
  // arriesgado salia igual al de siempre con dos cambios. Lo que hace explotar
  // una fecha en Gran DT es el GOL —un defensor paga 9, un volante 6—, y el gol
  // del que nadie espera. Asi que el criterio pasa a ser el gol POR 90 MINUTOS
  // en la cancha, sin descontar la chance de jugar, mas dos cosas que el
  // ranking normal castiga y que acá suman:
  //   · el que patea mucho aunque el contexto no acompañe (equipo que no
  //     espera goles): el volumen de tiro es suyo, el contexto es de hoy;
  //   · el que genera xG y todavia no lo convirtio: le deben goles.
  // Nada de esto dice que vaya a pasar. Dice que si pasa, paga mucho.
  const por90 = j => Math.max(0.4, (j.minSiJuega || 60) / 90);
  sim.jug.forEach(j => {
    const i = j.individual || {};
    const min = i.minutos || 0;
    j._tiros90 = min > 90 ? (i.tiros || 0) / (min / 90) : 0;
    j._deuda = min > 200 ? Math.max(0, (j.xgTorneo || 0) - ((i.goles || 0) - (i.golesPenal || 0))) : 0;
    j._gol90 = (j.lamGol || 0) / por90(j);
  });
  const explosivo = j => (j._gol90 || 0) + 0.04 * (j._tiros90 || 0) + 0.05 * (j._deuda || 0);

  // Objetivo: si no lo fijan, se usa el percentil 99 del once conservador.
  let objetivo = o.objetivo;
  let refe = null;
  if (o.onceSeguro && o.onceSeguro.length) {
    const filas = o.onceSeguro.map(j => sim.idx.get(j.id)).filter(i => i != null);
    // Objetivo por defecto: el techo del once conservador MAS 20 puntos.
    // Probado con dos semillas distintas: hasta 140 el once arriesgado sale
    // igual (9 de 11 jugadores coinciden); de 150 para arriba coinciden 4 o 5 y
    // la P(>=140) resultante es PEOR que la del conservador. Ahi ya no optimiza,
    // ajusta ruido. 20 puntos por encima del techo es lo mas lejos que se puede
    // apuntar con esta cantidad de simulaciones sin empezar a inventar.
    if (filas.length) { refe = evaluarOnce(sim, filas, objetivo || 999);
      if (!objetivo) objetivo = Math.round((refe.p99 + 20) / 5) * 5; }
  }
  if (!objetivo) objetivo = 130;
  if (refe) refe = evaluarOnce(sim, o.onceSeguro.map(j => sim.idx.get(j.id)).filter(i => i != null), objetivo);

  const idsSeguro = (o.onceSeguro || []).map(j => j.id);
  // COMO MUCHO CUATRO REPETIDOS. El objetivo de esta pantalla es tener OTRA
  // apuesta, no la misma con dos retoques: si los once salen casi iguales, el
  // domingo los dos onces suben y bajan juntos y no sirvio de nada. Se permite
  // compartir hasta cuatro nombres —los que son tan buenos que estan en
  // cualquier once— y los otros siete tienen que ser distintos.
  const setSeguro = new Set(idsSeguro);
  const tope = o.maxComunes == null ? 4 : o.maxComunes;
  let mejor = null;
  for (const e of esquemas) {
    const res = buscarOnce(sim, e, objetivo, presupuesto, explosivo, null, setSeguro, tope);
    if (!mejor || res.stats.p995 > mejor.stats.p995) mejor = { ...res, esquema: e.join('-') };
  }
  // EVALUACION FINAL FUERA DE MUESTRA. Los numeros que se muestran NO pueden
  // salir de las mismas simulaciones con las que se eligio el once: eso infla
  // siempre al ganador. Se vuelve a simular con otra semilla y el triple de
  // fechas, y recien ahi se comparan los dos onces. La primera vez que lo probe
  // sin esto, el arriesgado figuraba con P(>=140) mas baja que el conservador y
  // parecia un bug; con 300.000 simulaciones limpias se dio vuelta (0.054% vs
  // 0.046%). Era ruido: 22 casos contra 28.
  const simF = simularFecha(rankings, N * 3, (o.seed || 20260826) + 5000);
  const filasDe = lista => lista.map(j => simF.idx.get(j.id)).filter(i => i != null);
  const distFinal = evaluarOnce(simF, filasDe(mejor.once), objetivo);
  const refeFinal = o.onceSeguro && o.onceSeguro.length
    ? evaluarOnce(simF, filasDe(o.onceSeguro), objetivo) : null;
  mejor.stats = distFinal;
  if (refeFinal) refe = refeFinal;

  // Capitan del arriesgado: el de mayor ficha, igual que siempre (duplica ficha).
  const cap = [...mejor.once].sort((a, b) => (b.ficha || 0) - (a.ficha || 0))[0];
  // POR QUE ESTA CADA UNO. Sin esto la pantalla es una lista de nombres raros y
  // no hay forma de decidir si la apuesta te cierra o no.
  const n1 = v => (v == null || isNaN(v)) ? '?' : Number(v).toFixed(1);
  const motivo = j => {
    const m = [];
    if ((j._tiros90 || 0) >= 1.6) m.push(n1(j._tiros90) + ' tiros cada 90');
    if ((j._deuda || 0) >= 0.8) m.push('le deben ' + n1(j._deuda) + ' goles');
    if ((j.lam && j.lam.lamFor != null && j.lam.lamFor <= 1.05) && (j._tiros90 || 0) >= 1)
      m.push('su equipo espera solo ' + n1(j.lam.lamFor) + ' goles: el volumen es suyo, el contexto no acompaña');
    if ((j.pJuega || 0) < 0.6) m.push('juega ' + Math.round(100 * (j.pJuega || 0)) + '% de las veces: si arranca, paga');
    if ((j.share || 0) >= 0.14 && (j.pos === 'VOL' || j.pos === 'DEL'))
      m.push('se lleva el ' + Math.round(100 * j.share) + '% del gol de su equipo');
    if ((j.pos === 'DEF' || j.pos === 'ARQ') && (j.pVI || 0) >= 0.3)
      m.push(Math.round(100 * j.pVI) + '% de valla invicta, y si además la mete son ' + (j.pos === 'ARQ' ? 12 : 9) + ' puntos');
    if (!m.length) m.push('gol esperado alto para su puesto: ' + n1(100 * (j.lamGol || 0)) + '% de chance de convertir');
    return m;
  };
  const conMotivo = mejor.once.map(j => ({ ...j, porQue: motivo(j),
    tiros90: +(j._tiros90 || 0).toFixed(2), deuda: +(j._deuda || 0).toFixed(2),
    enElSeguro: setSeguro.has(j.id) }));
  return { objetivo, simulaciones: N * 3, esquema: mejor.esquema, once: conMotivo,
           capitan: cap, costo: mejor.costo, dist: mejor.stats, conservador: refe,
           comunes: conMotivo.filter(j => j.enElSeguro).length,
           esElMismo: false };
}

module.exports = { armarArriesgado, simularFecha, evaluarOnce, TABLA };
