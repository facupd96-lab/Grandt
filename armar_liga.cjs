/* ===========================================================================
   armar_liga.cjs — arma dataLiga.js a partir de equipos.txt
   ---------------------------------------------------------------------------
   QUE HACE
   Lee equipos.txt (los equipos del torneo de amigos escritos por apellido) y
   escribe dataLiga.js, que es el archivo que hace que CUALQUIERA que abra la
   pagina vea el torneo. Sin dataLiga.js los equipos viven solo en el
   localStorage del navegador de cada uno y el que entra de afuera no ve nada.

   POR QUE HACE FALTA
   La app resuelve a los jugadores por una clave estable:
       apellido nombre@club@PUESTO      ej: luna alex@instituto@VOL
   El id (p123) cambia cada vez que se recalcula, la clave no. Este script
   traduce "Luna" a esa clave leyendo datos.js, que es la unica fuente que
   tiene los 763 jugadores con su club y su puesto.

   COMO DESAMBIGUA
   Si un apellido tiene un solo dueno, listo. Si tiene varios:
     1) si en el txt aclaraste el club entre parentesis, usa ese
     2) si no, prueba que puesto le falta al equipo para cerrar un esquema
        valido y elige al que encaja
     3) si igual quedan dos, NO ADIVINA: corta y te dice cuales son
   Al final imprime jugador por jugador a quien eligio, para que lo controles.

   COMO SE USA
       node.exe armar_liga.cjs        (o ARMAR_LIGA.bat)
   Despues: SUBIR_A_GITHUB.bat
   =========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const AQUI = __dirname;
const PUESTOS = ['ARQ', 'DEF', 'VOL', 'DEL'];
// esquemas validos de Gran DT (defensores-volantes-delanteros)
const ESQUEMAS = [[3,3,4],[4,2,4],[3,4,3],[4,3,3],[5,2,3],[3,5,2],[4,4,2],[5,3,2],[4,5,1],[5,4,1]];

function morir(msg) { console.error('\nERROR: ' + msg + '\n'); process.exit(1); }
const nz = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// ---- 1. los jugadores, desde datos.js -------------------------------------
const rutaDatos = path.join(AQUI, 'datos.js');
if (!fs.existsSync(rutaDatos)) morir('falta datos.js. Corre RECALCULAR.bat primero.');
global.window = {};
require(rutaDatos);
const D = global.window.DATOS || global.window.D;
if (!D || !D.rankings) morir('datos.js no trae rankings.');
const JUG = [].concat(...PUESTOS.map(p => D.rankings[p] || []));
if (JUG.length < 300) morir('datos.js trae solo ' + JUG.length + ' jugadores, algo esta mal.');

// ---- 2. el txt -------------------------------------------------------------
const rutaTxt = path.join(AQUI, 'equipos.txt');
if (!fs.existsSync(rutaTxt)) morir('falta equipos.txt.');
const lineas = fs.readFileSync(rutaTxt, 'utf8').split(/\r?\n/);
const equipos = [];
let act = null, enBanco = false;
lineas.forEach((raw, i) => {
  const l = raw.trim();
  if (!l || l.startsWith('#')) return;
  if (l.startsWith('=')) { act = { nombre: l.slice(1).trim(), once: [], banco: [], cap: null }; equipos.push(act); enBanco = false; return; }
  if (/^--/.test(l)) { if (!act) morir('linea ' + (i+1) + ': "-- suplentes" antes de nombrar un equipo'); enBanco = true; return; }
  if (!act) morir('linea ' + (i+1) + ': "' + l + '" no pertenece a ningun equipo (falta una linea "= Nombre")');
  let txt = l, cap = false, club = null;
  txt = txt.replace(/\(\s*c\s*\)\s*$/i, () => { cap = true; return ''; }).trim();
  const m = /\(([^)]+)\)\s*$/.exec(txt);
  if (m) { club = nz(m[1]); txt = txt.slice(0, m.index).trim(); }
  const item = { pedido: txt, ape: nz(txt), club, cap, linea: i + 1 };
  if (enBanco) act.banco.push(item); else act.once.push(item);
  if (cap) { if (act.cap) morir(act.nombre + ': dos capitanes'); act.cap = item; }
});
if (!equipos.length) morir('equipos.txt no define ningun equipo.');

// ---- 3. candidatos por apellido -------------------------------------------
function candidatos(it) {
  const t = it.ape.split(' ');
  let c = JUG.filter(x => {
    const ape = nz(String(x.n).split(',')[0]).split(' ');
    return t.every(w => ape.includes(w));
  });
  if (!c.length) c = JUG.filter(x => nz(x.n).includes(it.ape));   // red: nombre completo
  if (it.club) {
    const f = c.filter(x => { const e = nz(x.eq); return e.includes(it.club) || it.club.includes(e) ||
      it.club.split(' ').every(w => e.includes(w)) || nz(String(x.k).split('@')[1] || '').replace(/-/g, ' ').includes(it.club); });
    if (f.length) c = f;
  }
  return c;
}

// ---- 4. resolver cada equipo ----------------------------------------------
const avisos = [];
const salida = equipos.map(eq => {
  const todos = eq.once.concat(eq.banco);
  todos.forEach(it => { it.cand = candidatos(it);
    if (!it.cand.length) morir(eq.nombre + ', linea ' + it.linea + ': no encuentro a "' + it.pedido + '" en datos.js'); });

  // los que ya tienen dueno unico fijan puestos; con eso se prueban los esquemas
  const fijos = eq.once.filter(it => it.cand.length === 1);
  const dudas = eq.once.filter(it => it.cand.length > 1);
  let mejor = null;
  for (const [nd, nv, ndel] of ESQUEMAS) {
    const cupo = { ARQ: 1, DEF: nd, VOL: nv, DEL: ndel };
    const usado = { ARQ: 0, DEF: 0, VOL: 0, DEL: 0 };
    let ok = true;
    fijos.forEach(it => { usado[it.cand[0].pos]++; });
    PUESTOS.forEach(p => { if (usado[p] > cupo[p]) ok = false; });
    if (!ok) continue;
    // asignar las dudas a los puestos que faltan (backtracking chico)
    const libre = {}; PUESTOS.forEach(p => libre[p] = cupo[p] - usado[p]);
    const asign = [];
    const rec = k => {
      if (k === dudas.length) return true;
      const it = dudas[k];
      const ops = it.cand.filter(x => libre[x.pos] > 0)
        .sort((a, b) => (b.epsj || 0) - (a.epsj || 0));
      for (const o of ops) { libre[o.pos]--; asign[k] = o; if (rec(k + 1)) return true; libre[o.pos]++; }
      return false;
    };
    if (!rec(0)) continue;
    const cuenta = dudas.reduce((s, it, k) => s + (asign[k].cand ? 0 : 0), 0);
    if (!mejor) mejor = { esq: '1-' + nd + '-' + nv + '-' + ndel, asign: asign.slice() };
  }
  if (!mejor) morir(eq.nombre + ': el once no cierra en ningun esquema valido de Gran DT. ' +
    'Puestos que veo: ' + eq.once.map(it => it.pedido + '=' + [...new Set(it.cand.map(c => c.pos))].join('/')).join(', '));
  dudas.forEach((it, k) => { it.elegido = mejor.asign[k];
    avisos.push(eq.nombre + ': "' + it.pedido + '" -> ' + it.elegido.n + ' (' + it.elegido.eq + ', ' + it.elegido.pos + ')' +
      (it.club ? ' [lo aclaraste vos con el club]'
               : (it.cand.filter(c => c.pos === it.elegido.pos).length > 1
                  ? ' [OJO: habia ' + it.cand.length + ' con ese apellido y elegi al de mas puntos. Aclara el club si es otro]'
                  : ' [unico que entra en el ' + mejor.esq + ']'))); });
  fijos.forEach(it => it.elegido = it.cand[0]);

  // banco: uno por puesto
  const banco = {};
  eq.banco.forEach(it => {
    let c = it.cand;
    if (c.length > 1) { const libres = c.filter(x => !banco[x.pos]); if (libres.length) c = libres; }
    if (c.length > 1) morir(eq.nombre + ', linea ' + it.linea + ': "' + it.pedido + '" es ambiguo. Candidatos: ' +
      c.map(x => x.n + ' (' + x.eq + ', ' + x.pos + ')').join(' | ') + '. Aclara el club entre parentesis.');
    it.elegido = c[0];
    if (banco[it.elegido.pos]) morir(eq.nombre + ': dos suplentes ' + it.elegido.pos + ' (' + banco[it.elegido.pos].n + ' y ' + it.elegido.n + '). Va uno por puesto.');
    banco[it.elegido.pos] = it.elegido;
  });

  const orden = { ARQ: 0, DEF: 1, VOL: 2, DEL: 3 };
  const once = eq.once.slice().sort((a, b) => orden[a.elegido.pos] - orden[b.elegido.pos] || b.elegido.epsj - a.elegido.epsj);
  const kBanco = {}; PUESTOS.forEach(p => { if (banco[p]) kBanco[p] = banco[p].k; });
  const faltan = PUESTOS.filter(p => !banco[p]);
  if (faltan.length) avisos.push(eq.nombre + ': sin suplente de ' + faltan.join(' y ') + ' (si el titular no juega, no entra nadie)');
  if (!eq.cap) avisos.push(eq.nombre + ': SIN CAPITAN marcado');

  return {
    _eq: eq, _once: once, _banco: banco,
    nombre: eq.nombre, dt: null, esq: mejor.esq,
    kOnce: once.map(it => it.elegido.k),
    kCap: eq.cap ? eq.cap.elegido.k : null,
    kBanco,
    nombres: once.map(it => it.elegido.n)
  };
});

// ---- 5. escribir -----------------------------------------------------------
const paquete = {
  v: 5,
  fecha: D.fechaObjetivo,
  // CUANDO SE EDITO equipos.txt POR ULTIMA VEZ (17/09).
  // "fecha" es la del MOTOR, no la de los equipos, y eso enganaba: los onces se
  // cargan cuando arranca la fecha, asi que apenas el motor pasa a la siguiente
  // el archivo dice "fecha 10" con los equipos de la 9 y la pantalla proyecta
  // 78 puntos para onces que ya no existen. Con esto la app puede comparar
  // contra cuando empieza la fecha y avisar en vez de mentir.
  equiposEditado: (() => { try { return new Date(fs.statSync(rutaTxt).mtimeMs).toISOString(); }
                          catch (e) { return null; } })(),
  publicado: new Date().toISOString(),
  fichas: {},
  dts: [],
  camp: { general: {}, fechas: {} },
  equipos: salida.map(t => ({ nombre: t.nombre, dt: t.dt, esq: t.esq, kOnce: t.kOnce, kCap: t.kCap, kBanco: t.kBanco, nombres: t.nombres }))
};
// si ya habia un dataLiga.js, conservar la tabla del campeonato acumulada
const rutaVieja = path.join(AQUI, 'dataLiga.js');
if (fs.existsSync(rutaVieja)) {
  try {
    const w = {}; new Function('window', fs.readFileSync(rutaVieja, 'utf8'))(w);
    const vieja = w.LIGA_BASE;
    if (vieja && vieja.camp && (Object.keys(vieja.camp.fechas || {}).length || Object.keys(vieja.camp.general || {}).length)) {
      paquete.camp = vieja.camp;
      console.log('(conservo la tabla del campeonato que ya tenia dataLiga.js)');
    }
  } catch (e) { console.log('(no pude leer el dataLiga.js anterior, arranco la tabla de cero)'); }
}
fs.writeFileSync(rutaVieja, 'window.LIGA_BASE=' + JSON.stringify(paquete) + ';\n');

// ---- 6. informe ------------------------------------------------------------
console.log('\nTORNEO DE AMIGOS — fecha ' + paquete.fecha + ' — ' + salida.length + ' equipos\n');
salida.forEach(t => {
  console.log('== ' + t.nombre + '   (' + t.esq + ')');
  t._once.forEach(it => {
    const x = it.elegido;
    console.log('   ' + x.pos + '  ' + String(x.n).padEnd(26).slice(0, 26) + String(x.eq).padEnd(17).slice(0, 17) +
      'PTS ' + String(x.epsj).padStart(5) + (it.cap ? '   <<< CAPITAN' : ''));
  });
  const b = PUESTOS.filter(p => t._banco[p]).map(p => p + ' ' + String(t._banco[p].n).split(',')[0]);
  console.log('   banco: ' + (b.join(' · ') || '(vacio)'));
  console.log('');
});
if (avisos.length) { console.log('REVISAR:'); avisos.forEach(a => console.log('  - ' + a)); console.log(''); }
const usados = new Set(); salida.forEach(t => t.kOnce.forEach(k => usados.add(k)));
console.log('jugadores distintos en el torneo: ' + usados.size);
console.log('escrito dataLiga.js (' + (fs.statSync(rutaVieja).size / 1024).toFixed(1) + ' KB) — ahora corre SUBIR_A_GITHUB.bat');
