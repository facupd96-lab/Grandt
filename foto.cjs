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
const P_ = f => path.join(__dirname, f);
const P = P_;
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

// ════════════════════════════════════════════════════════════════════════════
//  MODO --viejas : RECUPERAR LAS FECHAS QUE YA PASARON
//  ------------------------------------------------------------------------
//  Las fotos de historial/fecha_N.json de antes del 13/09 no traen el esperado
//  de los 772 jugadores, pero SI traen dos cosas que valen oro: el once que el
//  motor recomendo esa semana (con nombre, EP, pJuega y precio) y el top 25 de
//  cada puesto. Son predicciones hechas ANTES de que se jugara la fecha, que es
//  justo lo que no se puede reconstruir despues.
//
//  Los puntos reales salen de dataPlaneta.json, que guarda el puntaje de cada
//  jugador fecha por fecha (F1..F18). O sea que se puede medir el acierto del
//  motor en esas fechas sin inventar nada.
//
//  LO QUE NO SE PUEDE, Y NO SE VA A FINGIR:
//   · la CINTA. La planilla no guarda la ficha fecha por fecha, solo el puntaje
//     total. Sin la ficha del capitan no hay forma de saber cuanto pago la
//     cinta, asi que estas fotos van SIN cinta y lo dicen.
//   · el TORNEO DE AMIGOS. equipos.txt tiene los onces de ahora, no los de la
//     fecha 7. Poner los de hoy con los puntos de entonces seria un equipo que
//     nunca existio.
//   · el BANCO. Se empezo a guardar el 17/09.
//
//  Tampoco se vuelve a correr el motor sobre una fecha vieja: usaria el xG y la
//  forma de partidos que en ese momento no se habian jugado, y el motor
//  acertaria de mas por construccion. Se usa lo que dijo entonces, o nada.
if (process.argv.includes('--viejas')) { recuperarViejas(); process.exit(0); }

function recuperarViejas() {
  let P;
  try { P = JSON.parse(fs.readFileSync(P_('dataPlaneta.json'), 'utf8')); }
  catch (e) { morir('no pude leer dataPlaneta.json: ' + e.message); }

  const norm = z => String(z || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
  // el plantel de hoy, para colgarle la clave estable a cada uno
  const hoy = {};
  PUESTOS.forEach(p => (D.rankings[p] || []).forEach(x => {
    const kk = norm(x.n) + '|' + p;
    (hoy[kk] = hoy[kk] || []).push(x);
  }));
  // la planilla, que es de donde salen los puntos reales de esas fechas
  const plan = {};
  (P.jugadores || []).forEach(j => {
    const kk = norm(j.nombre) + '|' + j.posicion;
    (plan[kk] = plan[kk] || []).push(j);
  });
  const buscar = (tabla, nombre, pos, equipo) => {
    const c = tabla[norm(nombre) + '|' + pos];
    if (!c || !c.length) return null;
    if (c.length === 1) return c[0];
    // nombre repetido: desempata el club
    const e = norm(equipo);
    return c.find(x => norm(x.equipo || x.eq).startsWith(e.slice(0, 6))) || null;
  };

  let previas = {};
  try { previas = leer('dataFotos.js').FOTOS || {}; } catch (e) { }

  const hechas = [], saltadas = [];
  fs.readdirSync(P_('historial')).filter(f => /^fecha_\d+\.json$/.test(f)).forEach(f => {
    const n = parseInt(f.match(/\d+/)[0], 10);
    if (previas[n] && previas[n].fuente === 'foto.cjs') return;   // ya la tenemos completa
    let j;
    try { j = JSON.parse(fs.readFileSync(P_(path.join('historial', f)), 'utf8')); } catch (e) { return; }
    const once = Array.isArray(j.once) ? j.once : [];
    if (once.length < 7) { saltadas.push(n + ' (no guardo el once del motor)'); return; }
    // ¿la planilla tiene los puntos de esa fecha?
    const conPts = (P.jugadores || []).filter(x => (x.puntajes || [])[n - 1] != null).length;
    if (conPts < 200) { saltadas.push(n + ' (la planilla no tiene sus puntajes)'); return; }

    let real = 0, jugaron = 0, sinCruce = 0;
    const det = once.map(o => {
      const h = buscar(hoy, o.nombre, o.pos, o.equipo);
      const pl = buscar(plan, o.nombre, o.pos, o.equipo);
      const pts = pl ? (pl.puntajes || [])[n - 1] : null;
      // OJO: "no lo encontre en la planilla" NO es lo mismo que "hizo 0".
      // El que no cruza queda en null y sale de la comparacion; ponerlo en cero
      // le inventaria una mala fecha al motor, que es el error espejo del que
      // ya me comi al reves. Solo el que SI aparece con 0 cuenta como 0.
      if (pts == null) sinCruce++;
      else { real += pts; if (pts !== 0) jugaron++; }
      return { k: h ? h.k : null, n: String(o.nombre).split(',')[0].trim(), eq: o.equipo, pos: o.pos,
               esp: o.EP != null ? r2(o.EP) : null, real: pts == null ? null : pts,
               jugo: pts != null && pts !== 0, cap: false };
    });
    const conEsp = det.filter(x => x.esp != null && x.real != null);
    const foto = {
      fecha: n, cuando: j.generado || null, fuente: 'foto.cjs --viejas',
      partidos: Array.isArray(j.partidos) ? j.partidos.length : null,
      deTotal: Array.isArray(j.partidos) ? j.partidos.length : 15,
      completa: true, recuperada: true, sinCinta: true, sinTorneo: true,
      // LA ESCALA CAMBIO EN EL CAMINO (17/09). La fecha 6 se reconstruyo a mano
      // y sus EP salen de una version anterior del motor: el once esperaba 80.4
      // cuando en la 7, 8 y 9 esperaba entre 58 y 66. Ese salto no es que el
      // motor fuera mas optimista, es que el numero significaba otra cosa. Sin
      // esta marca, "esperaba 80.4 e hizo 68" se leeria como un error del
      // modelo de 12 puntos y seria mentira.
      reconstruida: !!j.reconstruida,
      escalaDudosa: !!j.reconstruida,
      notaFecha: j.nota || null,
      nota: 'Recuperada de historial/fecha_' + n + '.json (lo que el motor recomendo esa semana) y de ' +
            'dataPlaneta.json (lo que pago cada uno). Va SIN cinta: la planilla no guarda la ficha fecha ' +
            'por fecha. Va SIN el torneo de amigos: equipos.txt tiene los onces de ahora, no los de entonces.',
      motor: {
        nombre: 'El motor', motor: true, esq: j.esquema || null,
        once: det, banco: [],
        cinta: { estado: 'sindato', valor: 0, quien: null },
        total: r1(real),
        esperado: r1(det.reduce((a, x) => a + (x.esp || 0), 0)),
        sinEsp: det.filter(x => x.esp == null).length,
        espHecho: r1(conEsp.reduce((a, x) => a + x.esp, 0)),
        espHechoDe: conEsp.length,
        realDeEsos: r1(conEsp.reduce((a, x) => a + (x.real || 0), 0)),
        jugaron, n: det.length, sinBanco: true,
        conReal: conEsp.length
      },
      mio: null, equipos: [], jugadores: []
    };
    if (sinCruce) foto.motor.sinCruzar = sinCruce;
    previas[n] = foto;
    hechas.push({ n, total: foto.motor.total, esp: foto.motor.esperado, jug: jugaron, de: det.length, sinCruce });
  });

  if (!hechas.length) {
    console.log('  no habia ninguna fecha vieja para recuperar.');
    if (saltadas.length) saltadas.forEach(x => console.log('   fecha ' + x));
    console.log('');
    return;
  }
  const ord = {};
  Object.keys(previas).map(Number).sort((a, b) => a - b).forEach(k => { ord[k] = previas[k]; });
  fs.writeFileSync(P_('dataFotos.js'), 'window.FOTOS=' + JSON.stringify(ord) + ';');
  console.log('  recuperadas (el once del motor contra lo que pago la realidad):');
  hechas.sort((a, b) => a.n - b.n).forEach(h => console.log('   fecha ' + String(h.n).padStart(2) +
    ' · esperaba ' + String(h.esp).padStart(5) + ' · hizo ' + String(h.total).padStart(5) +
    ' · ' + (h.total - h.esp >= 0 ? '+' : '') + r1(h.total - h.esp) +
    '   (' + h.jug + ' de ' + h.de + ' sumaron)' + (h.sinCruce ? '  OJO: ' + h.sinCruce + ' no cruzan' : '')));
  saltadas.forEach(x => console.log('   fecha ' + x + ': se salta'));
  console.log('');
  console.log('OK -> dataFotos.js  (' + Object.keys(ord).length + ' fechas)');
  console.log('');
}

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

// ── LA TABLA OFICIAL MANDA (17/09) ──────────────────────────────────────────
// Nuestro total sale de sumar el once de equipos.txt. Ese archivo lo escribe
// una persona a mano, asi que un apellido repetido o un club mal puesto da un
// total creible y equivocado — paso en la fecha 9: dabamos 106 para El Favorito
// de la Tati y el juego decia 115. El once tambien se puede cambiar a mitad de
// fecha, y ahi equipos.txt directamente no se entera.
//
// Asi que el numero que se muestra y que queda en la historia es EL DEL JUEGO.
// El nuestro se guarda al lado como "asi se compone", y cuando no coinciden la
// foto se lo lleva escrito: no se tapa, se avisa.
const norm = z => String(z || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const flat = z => norm(z).replace(/(.)\1+/g, '$1');
let OFICIAL = null;
try {
  OFICIAL = require('./parsear_oficial.cjs')(fs.readFileSync(P_('puntajes_oficiales.txt'), 'utf8'));
  if (!OFICIAL.length) OFICIAL = null;
} catch (e) { OFICIAL = null; }
const oficialDe = nombre => {
  if (!OFICIAL) return null;
  return OFICIAL.find(o => norm(o.equipo) === norm(nombre))
      || OFICIAL.find(o => flat(o.equipo) === flat(nombre)) || null;
};

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
    const m = marcador({ nombre: e.nombre, dt: e.dt || null, once: e.kOnce,
                         banco: e.kBanco || null, cap: e.kCap || null, esq: e.esq || null,
                         mio: !!e.mio });
    const o = oficialDe(e.nombre);
    if (o) {
      m.calculado = m.total;     // lo que da sumar el once que tenemos cargado
      m.total = o.pts;           // lo que dice el juego: esto es lo que vale
      m.oficial = true;
      m.dt = m.dt || o.dt || null;
      m.modifico = o.veces != null ? o.veces : null;
      if (m.calculado !== o.pts) m.difiere = r1(o.pts - m.calculado);
    }
    equipos.push(m);
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
  String(e.total).padStart(6) + (e.oficial ? ' (oficial)' : '          ') + '   ' + e.jugaron + '/' + e.n + ' jugaron' +
  (e.cinta.estado === 'ok' ? ' · cinta +' + e.cinta.valor : ' · cinta ' + e.cinta.estado) +
  (e.difiere ? '   OJO: nuestro once da ' + e.calculado + ', ' + (e.difiere > 0 ? 'faltan ' + e.difiere : 'sobran ' + (-e.difiere)) : '') +
  (e.sinCruzar ? '   OJO: ' + e.sinCruzar + ' del once no cruzan' : '')));
if (!OFICIAL) console.log('   (sin puntajes_oficiales.txt: los totales son los que calculamos, sin cruzar contra el juego)');
console.log('');
console.log('OK -> dataFotos.js  (' + Object.keys(ordenado).length + ' fecha(s) guardada(s)' +
  (habia ? ', ' + habia + ' que ya estaban' : '') + ')');
console.log('');
