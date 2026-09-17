// ════════════════════════════════════════════════════════════════════════════
//  foto.cjs  —  LA FOTO DE UNA FECHA, HECHA DESDE LOS ARCHIVOS
//
//  POR QUE EXISTE (17/09)
//  ---------------------
//  Hasta hoy la foto de cada fecha —como termino, que hizo el once del motor,
//  como salio el torneo de amigos— se calculaba en el navegador y se guardaba
//  en el localStorage de Chrome. Tres consecuencias, las tres se sufrieron:
//
//    1. En Vercel, cada visitante abre SU localStorage, que esta vacio. O sea
//       que los amigos no ven NINGUN historial. Nunca vieron ninguno.
//    2. Se saca cuando uno abre la pagina. Si la abriste con la fecha a medio
//       publicar, la foto queda con 12 de 15 partidos, y cuando el motor pasa a
//       la fecha siguiente ya no hay forma de rehacerla: autoCapturar solo toca
//       la fecha que el motor tiene AHORA. Asi se perdio la fecha 9.
//    3. Ningun auditor la puede mirar, porque no es un archivo.
//
//  Esto la calcula desde los archivos, con las reglas del juego, y la ACUMULA
//  en dataFotos.js. Una fecha guardada no se pierde mas: esta en el repo, se
//  sube a GitHub y la ven todos igual.
//
//  QUE NECESITA
//    datos.js     el plantel y los ids de AHORA (los ids son numero de fila y
//                 se corren en cada corrida: por eso el sello de abajo)
//    dataVivo.js  los puntos reales de la fecha, bajados de Planeta
//    dataHist.js  lo que el motor esperaba de cada jugador ESA semana, y su once
//    dataLiga.js  los equipos del torneo de amigos
//
//  COMO SE USA
//    node foto.cjs            la fecha que tenga dataVivo.js
//    node foto.cjs 9          esa fecha (dataVivo.js tiene que ser de esa fecha)
//
//  NO inventa nada: si falta un dato, lo dice y no escribe.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = f => path.join(__dirname, f);
const leer = f => { const c = { window: {} }; vm.createContext(c);
  vm.runInContext(fs.readFileSync(P(f), 'utf8'), c); return c.window; };
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const PUESTOS = ['ARQ', 'DEF', 'VOL', 'DEL'];

function morir(m) { console.log('  ' + m); console.log(''); process.exit(2); }

let D, V, H, L;
try { D = leer('datos.js').DATOS; } catch (e) { morir('no pude leer datos.js: ' + e.message); }
try { V = leer('dataVivo.js').VIVO; } catch (e) { morir('no pude leer dataVivo.js: ' + e.message); }
try { H = leer('dataHist.js').HIST || {}; } catch (e) { H = {}; }
try { L = leer('dataLiga.js').LIGA_BASE || null; } catch (e) { L = null; }

console.log('');
console.log('-- la foto de la fecha, desde los archivos --');

const pedida = process.argv.slice(2).map(x => parseInt(x, 10)).find(x => !isNaN(x));
const fecha = pedida != null ? pedida : V.fecha;
if (fecha == null) morir('dataVivo.js no dice de que fecha es.');
if (V.fecha !== fecha) morir('pediste la fecha ' + fecha + ' y dataVivo.js es de la ' + V.fecha +
  '. Corre  SYNC_VIVO.bat -Fecha ' + fecha + '  (o REHACER_FECHA.bat) y volve.');

// EL SELLO. Los ids de dataVivo.js son el numero de fila de datos.js. Si datos.js
// se rehizo despues, los puntos se le colgarian a OTRO jugador, en silencio.
if (!V.generadoCon || V.generadoCon !== D.generado)
  morir('dataVivo.js se cruzo contra otro datos.js (' + (V.generadoCon || 'sin sello') + ' vs ' + D.generado +
        ').\n  Los puntos le corresponderian a otros jugadores. Corre SYNC_VIVO.bat y volve.');

// La foto es de una fecha TERMINADA. Una a medias es justo lo que veniamos
// arrastrando, asi que directamente no se guarda.
const deTotal = (D.partidos || []).length || 15;
const jugados = (V.partidos || []).length;
if (jugados < deTotal)
  morir('la fecha ' + fecha + ' tiene ' + jugados + ' de ' + deTotal + ' partidos publicados.\n' +
        '  La foto se saca con la fecha terminada: una a medias es la que despues no se puede arreglar.');

const TODOS = {}, POR_K = {};
PUESTOS.forEach(p => (D.rankings[p] || []).forEach(x => { TODOS[x.id] = x; if (x.k) POR_K[x.k] = x; }));

const hist = H[fecha] || null;
const esperados = (hist && hist.esperados) || {};
if (Object.keys(esperados).length < 50)
  morir('dataHist.js no tiene lo que el motor esperaba de la fecha ' + fecha + ' (' +
        Object.keys(esperados).length + ' jugadores).\n  Sin eso la foto no tiene con que comparar.');

const vivo = id => (V.puntos && V.puntos[id]) ? V.puntos[id] : null;
const fichaDe = id => (V.fichas && V.fichas[id] != null) ? V.fichas[id] : null;
const espDe = x => (x && x.k && esperados[x.k] != null) ? esperados[x.k] : null;
const corto = n => String(n || '').split(',')[0].trim() || String(n || '');
const NOM = e => (D.nombres && D.nombres[e]) ? D.nombres[e] : e;

// ── EL MARCADOR DE UN EQUIPO ────────────────────────────────────────────────
// Las reglas del juego, las mismas que usa la pantalla:
//   · los 11 titulares suman lo que publico Planeta
//   · al titular que NO jugo lo reemplaza SU suplente del mismo puesto, uno solo
//   · la cinta duplica la FICHA del capitan, y se pierde si el capitan no sumo
function marcador(equipo) {
  const once = (equipo.once || []).map(k => POR_K[k]).filter(Boolean);
  const faltan = (equipo.once || []).length - once.length;
  const caidos = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  let real = 0, jugaron = 0;

  const det = once.map(p => {
    const v = vivo(p.id);
    const jugo = !!(v && v.p != null);
    const pts = jugo ? v.p : 0;
    if (jugo) { jugaron++; real += pts; } else caidos[p.pos].push(p);
    const e = espDe(p);
    // OJO CON EL CERO (17/09). El que NO jugo tiene que quedar con real = 0, no
    // con real = null. Su partido se jugo: que no haya entrado es un error del
    // modelo, no un dato que falta. Poniendolo en null quedaba afuera de la
    // comparacion de abajo y el motor pasaba de "esperaba 58.3, hizo 66" (+7.7)
    // a "esperaba 44.1, hizo 66" (+21.9): tres veces mejor, sin haber acertado
    // nada mas. La foto no esta para hacer quedar bien al motor.
    return { k: p.k, n: corto(p.n), eq: NOM(p.eq), pos: p.pos,
             esp: e == null ? null : r2(e), real: pts, jugo,
             cap: equipo.cap === p.k };
  });

  const banco = [];
  PUESTOS.forEach(pos => {
    const k = equipo.banco ? equipo.banco[pos] : null;
    const s = k ? POR_K[k] : null;
    if (!s) return;
    const e = espDe(s);
    const hayHueco = caidos[pos].length > 0;
    const v = vivo(s.id);
    const jugo = !!(v && v.p != null);
    if (hayHueco && jugo) { jugaron++; real += v.p; }
    banco.push({ k: s.k, n: corto(s.n), eq: NOM(s.eq), pos,
                 esp: e == null ? null : r2(e),
                 real: jugo ? v.p : null,
                 entro: !!(hayHueco && jugo),
                 porQuien: hayHueco ? corto(caidos[pos][0].n) : null });
    if (hayHueco && caidos[pos].length > 1) banco[banco.length - 1].sinCubrir = caidos[pos].length - 1;
  });

  // la cinta
  const cap = equipo.cap ? POR_K[equipo.cap] : null;
  let cinta = { estado: 'nadie', valor: 0, quien: null };
  if (cap) {
    const v = vivo(cap.id), f = fichaDe(cap.id);
    if (!v || v.p == null) cinta = { estado: 'perdida', valor: 0, quien: corto(cap.n) };
    else if (f == null) cinta = { estado: 'sindato', valor: 0, quien: corto(cap.n) };
    else cinta = { estado: 'ok', valor: f, quien: corto(cap.n) };
  }

  const conEsp = det.filter(x => x.real != null && x.esp != null);
  return {
    nombre: equipo.nombre, dt: equipo.dt || null,
    motor: !!equipo.motor, mio: !!equipo.mio, esq: equipo.esq || null,
    once: det, banco, cinta,
    total: r1(real + cinta.valor),
    esperado: r1(det.reduce((a, x) => a + (x.esp || 0), 0)),
    sinEsp: det.filter(x => x.esp == null).length,
    espHecho: r1(conEsp.reduce((a, x) => a + x.esp, 0)),
    espHechoDe: conEsp.length,
    realDeEsos: r1(conEsp.reduce((a, x) => a + (x.real || 0), 0)),
    jugaron, n: det.length,
    sinCruzar: faltan || 0
  };
}

// ── los equipos ─────────────────────────────────────────────────────────────
const equipos = [];
let motor = null;

if (hist && Array.isArray(hist.once) && hist.once.length >= 7) {
  const bancoMotor = {};
  // bancoK se empezo a guardar el 17/09. En las fechas anteriores no esta, y
  // sin el el once del motor compite con 11 contra los 15 de cada amigo: por
  // eso en la fecha 9 figuraba "8 de 11 jugaron, 72 puntos".
  if (hist.banco) PUESTOS.forEach(p => { if (hist.banco[p]) bancoMotor[p] = hist.banco[p]; });
  motor = marcador({ nombre: 'El motor', motor: true, once: hist.once,
                     banco: bancoMotor, cap: hist.capitan || null, esq: hist.esquema || null });
  if (!hist.banco) motor.sinBanco = true;
}

if (L && Array.isArray(L.equipos)) {
  L.equipos.forEach(e => {
    equipos.push(marcador({ nombre: e.nombre, dt: e.dt || null, once: e.kOnce,
                            banco: e.kBanco || null, cap: e.kCap || null, esq: e.esq || null,
                            mio: !!e.mio }));
  });
  equipos.sort((a, b) => b.total - a.total);
}

// ── todos los jugadores con puntaje, para medir el error del modelo ─────────
const jugadores = [];
PUESTOS.forEach(pos => (D.rankings[pos] || []).forEach(x => {
  const v = vivo(x.id); if (!v || v.p == null) return;
  const e = espDe(x);
  jugadores.push({ k: x.k, n: corto(x.n), eq: NOM(x.eq), pos,
                   esp: e == null ? null : r2(e), real: v.p });
}));

const foto = {
  fecha, cuando: new Date().toISOString(), fuente: 'foto.cjs',
  partidos: jugados, deTotal, completa: true,
  version: D.version || null,
  motor, mio: null, equipos, jugadores
};

// ── se ACUMULA: una fecha guardada no se toca nunca mas ─────────────────────
let previas = {};
try { previas = leer('dataFotos.js').FOTOS || {}; } catch (e) { }
const habia = Object.keys(previas).length;
previas[fecha] = foto;
const ordenado = {};
Object.keys(previas).map(Number).sort((a, b) => a - b).forEach(n => { ordenado[n] = previas[n]; });
fs.writeFileSync(P('dataFotos.js'), 'window.FOTOS=' + JSON.stringify(ordenado) + ';');

console.log('  fecha ' + fecha + ' · ' + jugados + ' partidos · ' + jugadores.length + ' jugadores con puntaje');
if (motor) console.log('  el motor: ' + motor.total + ' puntos, ' + motor.jugaron + ' de ' + motor.n + ' jugaron' +
  (motor.sinBanco ? '  (sin banco: esta fecha es anterior al 17/09)' : '') +
  (motor.cinta.estado === 'ok' ? ' · cinta +' + motor.cinta.valor : ' · cinta ' + motor.cinta.estado));
else console.log('  OJO — no hay once del motor guardado para esta fecha: la foto va sin el.');
equipos.forEach((e, i) => console.log('   ' + (i + 1) + '. ' + e.nombre.slice(0, 24).padEnd(25) +
  String(e.total).padStart(6) + '   ' + e.jugaron + '/' + e.n + ' jugaron' +
  (e.cinta.estado === 'ok' ? ' · cinta +' + e.cinta.valor : ' · cinta ' + e.cinta.estado) +
  (e.sinCruzar ? '   OJO: ' + e.sinCruzar + ' del once no cruzan' : '')));
console.log('');
console.log('OK -> dataFotos.js  (' + Object.keys(ordenado).length + ' fecha(s) guardada(s)' +
  (habia ? ', ' + habia + ' que ya estaban' : '') + ')');
console.log('');
