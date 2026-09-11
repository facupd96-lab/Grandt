/* ===========================================================================
   calibrar_ficha.cjs — mide cuanto hay que creerle a la ficha historica.
   ---------------------------------------------------------------------------
   QUE PREGUNTA CONTESTA
   El motor no puede usar la ficha cruda de un jugador tal cual: con pocas
   fechas, la mayor parte de lo que se ve es ruido del partido, no nivel del
   jugador. Entonces la lleva hacia la media de la liga con un prior K, en
   partidos-equivalentes:

       ficha = (cruda * PJ + mediaLiga * K) / (PJ + K)

   K chico = le creo a la ficha historica. K grande = la llevo a la media.
   El valor correcto no es una opinion: es K = (1 - r) / r, donde r es la
   fraccion de la varianza de UNA nota por partido que es habilidad real del
   jugador. Este script mide r y escribe calibracion.json.

   COMO LO MIDE
   Usa las notas por partido de 365 (campo log[].nota), que es el analogo mas
   cercano a la ficha de Clarin y la unica nota por partido que tenemos.
   Para cada jugador y cada torneo por separado parte sus notas en dos mitades
   y regresa la segunda mitad contra la primera. Esa pendiente es exactamente
   el factor de atenuacion: si fuera 1 la nota seria puro nivel, si fuera 0
   seria puro ruido. De ahi sale r y de r sale K. El intervalo de confianza es
   bootstrap sobre jugadores (4000 remuestreos).

   POR QUE LOS TORNEOS VAN SEPARADOS
   data365.json trae los dos torneos con los mismos numeros de fecha. Se
   separan por gid (el id de partido de 365, que es creciente en el tiempo):
   mezclarlos haria que la "primera mitad" de un jugador tenga partidos de un
   torneo y la segunda de otro, y eso infla el ruido. Cada jugador-torneo
   cuenta como una observacion independiente.

   SALIDA
   calibracion.json, que motorV3.cjs lee solo si existe y solo acepta valores
   entre 3 y 60. Si este script no corre nunca, el motor usa los numeros que
   tiene escritos adentro y no pasa nada.
   =========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const AQUI = __dirname;
const POS = ['ARQ', 'DEF', 'VOL', 'DEL'];
const MIN_MINUTOS = 20;   // la ficha de Clarin exige 20 minutos
const MIN_PARTIDOS = 6;   // hacen falta 3 por mitad
const REMUESTREOS = 4000;
const K_MIN = 3, K_MAX = 60;

function leer(nombre) {
  const p = path.join(AQUI, nombre);
  if (!fs.existsSync(p)) { console.error('FALTA ' + nombre + '. Corre SYNC_365.bat y SYNC_PLANETA.bat primero.'); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
const prom = a => a.reduce((s, x) => s + x, 0) / a.length;
const varia = a => { const m = prom(a); return prom(a.map(x => (x - m) ** 2)); };
function pendiente(X, Y) {
  const mx = prom(X), my = prom(Y); let sxy = 0, sxx = 0;
  for (let i = 0; i < X.length; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; }
  return sxx === 0 ? 0 : sxy / sxx;
}
// nombre comparable entre 365 ("Franco Paredes") y Planeta ("Paredes, Franco")
const clave = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, ' ').trim().split(/\s+/).sort().join(' ');

const D365 = leer('data365.json');
const PLAN = leer('dataPlaneta.json');

const POS_DE = {};
(PLAN.jugadores || []).forEach(j => {
  const p = String(j.nombre || '').split(',');
  POS_DE[clave((p[1] || '') + ' ' + (p[0] || ''))] = j.posicion;
});

// corte entre torneos: el hueco mas grande en los gid con nota
const gids = [];
Object.values(D365.jugadores || {}).forEach(j => (j.log || []).forEach(l => { if (l.nota != null && l.gid) gids.push(l.gid); }));
if (gids.length < 500) { console.error('data365.json no trae notas por partido suficientes (' + gids.length + ').'); process.exit(1); }
const unicos = [...new Set(gids)].sort((a, b) => a - b);
let corte = null, hueco = 0;
for (let i = 1; i < unicos.length; i++) {
  const d = unicos[i] - unicos[i - 1];
  if (d > hueco) { hueco = d; corte = unicos[i]; }
}
const variosTorneos = hueco > 200;
const grupoDe = gid => (variosTorneos && gid >= corte) ? 'B' : 'A';

// series de notas: una por jugador y torneo
const SERIES = { ARQ: [], DEF: [], VOL: [], DEL: [] };
let sinPosicion = 0;
Object.values(D365.jugadores || {}).forEach(j => {
  const pos = POS_DE[clave(j.nombre)];
  if (!pos || !SERIES[pos]) { sinPosicion++; return; }
  for (const g of ['A', 'B']) {
    const L = (j.log || [])
      .filter(l => l.nota != null && (l.min || 0) >= MIN_MINUTOS && grupoDe(l.gid) === g)
      .sort((a, b) => a.fecha - b.fecha).map(l => l.nota);
    if (L.length >= MIN_PARTIDOS) SERIES[pos].push(L);
  }
});

const K_FICHA = {}, DETALLE = {};
const avisos = [];
for (const pos of POS) {
  const G = SERIES[pos];
  if (G.length < 8) { avisos.push(pos + ': solo ' + G.length + ' jugador-torneo, queda el valor que ya tenia el motor'); continue; }
  let sw = 0, n = 0;
  G.forEach(s => { sw += varia(s) * s.length; n += s.length; });
  const varTotal = sw / n;                      // varianza de una nota individual
  const pares = G.map(s => { const h = Math.floor(s.length / 2); return { m1: prom(s.slice(0, h)), m2: prom(s.slice(h)), k: h }; })
                 .filter(p => p.k >= 3);
  if (pares.length < 8) { avisos.push(pos + ': pares insuficientes'); continue; }
  const kMedio = prom(pares.map(p => p.k));
  // de la pendiente al r de un solo partido
  const rDe = b => {
    if (!isFinite(b) || b <= 0) return 0;
    if (b >= 1) return 0.99;
    const sen = b * varTotal / (kMedio * (1 - b));
    return sen / (sen + varTotal);
  };
  const b = pendiente(pares.map(p => p.m1), pares.map(p => p.m2));
  const rs = [];
  for (let it = 0; it < REMUESTREOS; it++) {
    const X = [], Y = [];
    for (let i = 0; i < pares.length; i++) { const q = pares[(Math.random() * pares.length) | 0]; X.push(q.m1); Y.push(q.m2); }
    rs.push(rDe(pendiente(X, Y)));
  }
  rs.sort((x, y) => x - y);
  const cuantil = p => rs[Math.floor(p * rs.length)];
  const aK = r => r <= 0 ? Infinity : (1 - r) / r;
  const r = rDe(b);
  const K = Math.min(K_MAX, Math.max(K_MIN, isFinite(aK(r)) ? aK(r) : K_MAX));
  K_FICHA[pos] = Math.round(K * 10) / 10;
  DETALLE[pos] = {
    jugadorTorneo: pares.length, notas: n, sdNota: +Math.sqrt(varTotal).toFixed(3),
    partidosPorMitad: +kMedio.toFixed(1), pendiente: +b.toFixed(3),
    rPorPartido: +(r * 100).toFixed(1),
    rIC95: [+(cuantil(0.025) * 100).toFixed(1), +(cuantil(0.975) * 100).toFixed(1)],
    K: K_FICHA[pos],
    kIC95: [isFinite(aK(cuantil(0.975))) ? +aK(cuantil(0.975)).toFixed(1) : null,
            isFinite(aK(cuantil(0.025))) ? +aK(cuantil(0.025)).toFixed(1) : null],
    topeado: K !== (isFinite(aK(r)) ? aK(r) : K_MAX) || !isFinite(aK(r))
  };
}

const salida = {
  generado: new Date().toISOString(),
  fuente: 'data365.json log[].nota · ' + (variosTorneos ? 'dos torneos separados por gid >= ' + corte : 'un solo torneo'),
  minutosMinimos: MIN_MINUTOS, partidosMinimos: MIN_PARTIDOS, remuestreos: REMUESTREOS,
  limites: { min: K_MIN, max: K_MAX },
  kFicha: K_FICHA, detalle: DETALLE, avisos
};
fs.writeFileSync(path.join(AQUI, 'calibracion.json'), JSON.stringify(salida, null, 2) + '\n');

// ---- informe ----
console.log('');
console.log('CALIBRACION DEL PRIOR DE LA FICHA');
console.log('jugadores de 365 que no cruzan con Planeta: ' + sinPosicion);
console.log('torneos detectados: ' + (variosTorneos ? '2 (corte de gid ' + corte + ')' : '1'));
console.log('');
console.log('pos   jug-torneo  notas  sd   mitad   pendiente   r de 1 partido      K    IC95 de K');
for (const pos of POS) {
  const d = DETALLE[pos];
  if (!d) { console.log(pos.padEnd(4) + '  sin medicion'); continue; }
  console.log(pos.padEnd(4),
    String(d.jugadorTorneo).padStart(9), String(d.notas).padStart(7), d.sdNota.toFixed(2).padStart(5),
    String(d.partidosPorMitad).padStart(6), d.pendiente.toFixed(3).padStart(11),
    (d.rPorPartido.toFixed(1) + '% [' + d.rIC95[0].toFixed(1) + '-' + d.rIC95[1].toFixed(1) + ']').padStart(19),
    d.K.toFixed(1).padStart(7),
    '  [' + (d.kIC95[0] == null ? '?' : d.kIC95[0].toFixed(0)) + ' , ' + (d.kIC95[1] == null ? 'inf' : d.kIC95[1].toFixed(0)) + ']');
}
console.log('');
console.log('peso que le queda a la ficha historica segun partidos jugados:');
console.log('pos     4 PJ    8 PJ   12 PJ   20 PJ');
for (const pos of POS) {
  const k = K_FICHA[pos]; if (k == null) continue;
  console.log(pos.padEnd(4), [4, 8, 12, 20].map(n => ((n / (n + k) * 100).toFixed(0) + '%').padStart(7)).join(' '));
}
console.log('');
console.log('con el K=3 que usaba antes el motor:  57%    73%    80%    87%');
avisos.forEach(a => console.log('AVISO: ' + a));
console.log('');
console.log('escrito calibracion.json — ahora corre RECALCULAR.bat');
