// =============================================================================
//  vivo.cjs — PUNTAJES EN VIVO DE LA FECHA (Planeta Gran DT, seccion Puntajes)
//
//  Lee feedVivo.json (lo baja SYNC_VIVO.ps1 del feed JSON de Blogger) y escribe
//  dataVivo.js con los puntos Gran DT de cada jugador de la fecha en curso.
//
//  ESTE ARCHIVO NO TOCA AL MOTOR. Ni armar.cjs ni motorV3.cjs leen dataVivo.js.
//  Es a proposito: Planeta corrige los puntajes cuando la fecha termina, y si
//  el motor se alimentara de esto, cada correccion le cambiaria el pasado.
//  Los datos "buenos" siguen viniendo de la planilla oficial (dataPlaneta.json).
//  Aca lo unico que se hace es mirar el partido mientras se juega.
//
//  Como esta armado el post de Planeta (importa, porque son DOS cosas distintas
//  dentro del mismo post y confundirlas seria un desastre):
//    - bloque con fondo fac.png  -> puntajes de Clarin, formato "Nombre (6)"
//    - bloque con fondo fap.png  -> PUNTOS GRAN DT, formato "Nombre 12"
//  Nosotros queremos SOLO el de fap.png.
// =============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const P = f => path.join(DIR, f);

// ---------------------------------------------------------------------------
// 0. utilidades
// ---------------------------------------------------------------------------
const norm = s => (s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z ]/g, ' ')
  .replace(/\s+/g, ' ').trim();

// OJO CON ESTO: teamsRegistry.js NO se puede cargar con require().
// El package.json del proyecto dice "type": "module", asi que Node trata todo
// .js como ESM y el bloque module.exports del final del registry nunca corre:
// require() devuelve un objeto vacio, sin error, y despues "River Plate" no
// engancha con "River" y te quedas sin la mitad de los equipos, en silencio.
// Por eso se lee el archivo y se evalua a mano, que es lo mismo que hace
// armar.cjs con data.js.
// OJO CON ESTO: teamsRegistry.js NO se puede cargar con require().
// El package.json del proyecto dice "type": "module", asi que Node trata todo
// .js como ESM, el bloque module.exports del final del registry nunca corre y
// require() devuelve un objeto VACIO, sin tirar error. Con eso "River Plate"
// deja de enganchar con "River" y te quedas sin la mitad de los equipos, en
// silencio. Por eso se evalua a mano con vm, igual que armar.cjs hace con
// data.js.
let getCanonicalTeamId = null;
for (const archivo of ['teamsRegistry.js', 'data.js']) {
  try {
    const caja = { window: {}, document: undefined, console: { log(){}, warn(){}, error(){} } };
    vm.createContext(caja);
    vm.runInContext(fs.readFileSync(P(archivo), 'utf8'), caja, { timeout: 20000 });
    const fn = caja.getCanonicalTeamId ||
      (caja.module && caja.module.exports && caja.module.exports.getCanonicalTeamId) || null;
    if (typeof fn === 'function' && fn('River Plate') === 'river' && fn('River') === 'river') {
      getCanonicalTeamId = fn; break;
    }
  } catch (e) { /* probamos el siguiente */ }
}
if (!getCanonicalTeamId) {
  console.log('');
  console.log('  ATENCION: no pude cargar el registro de equipos.');
  console.log('  Sin el, "River Plate" y "River" son dos equipos distintos y el cruce');
  console.log('  se rompe. Fijate que teamsRegistry.js este en esta misma carpeta.');
  console.log('');
}

const ARREGLOS = { 'estudiantes': 'estudiantes-lp' };
const CT = n => {
  if (!n) return '';
  const plano = n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (ARREGLOS[plano]) return ARREGLOS[plano];
  const i = getCanonicalTeamId ? getCanonicalTeamId(n) : null;
  return i || plano.replace(/[^a-z0-9]/g, '');
};

const desHtml = s => (s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// ---------------------------------------------------------------------------
// 1. EL PARSER DEL POST
//    No uso una sola expresion regular gigante para todo el bloque: los posts
//    tienen divs anidados y con una regex golosa se come de mas. Lo que hago es
//    cortar el HTML en tramos usando fap.png / fac.png como mojones, y solo
//    dentro de los tramos de fap.png busco los dos recuadros de 45% (uno por
//    equipo).
// ---------------------------------------------------------------------------
const avisos = [];
function parsearPost(html) {
  const partidos = [];
  const marcas = [];
  const re = /fa[pc]\.png/g;
  let m;
  while ((m = re.exec(html))) marcas.push({ i: m.index, tipo: m[0][2] === 'p' ? 'gdt' : 'clarin' });
  for (let k = 0; k < marcas.length; k++) {
    if (marcas[k].tipo !== 'gdt') continue;
    const desde = marcas[k].i;
    const hasta = k + 1 < marcas.length ? marcas[k + 1].i : html.length;
    const tramo = html.slice(desde, hasta);

    const equipos = [];
    const reEq = /<div[^>]*width:\s*45%[^>]*>([\s\S]*?)<\/div>/g;
    let e;
    while ((e = reEq.exec(tramo))) {
      const lineas = e[1].split(/<br\s*\/?>/i)
        .map(l => desHtml(l.replace(/<[^>]+>/g, '')).trim())
        .filter(l => l.length);
      if (!lineas.length) continue;

      // primera linea = "Aldosivi 3" (equipo y goles)
      const cab = lineas.shift();
      const mg = cab.match(/^(.*?)\s+(\d+)\s*$/);
      const equipo = (mg ? mg[1] : cab).trim();
      const goles = mg ? Number(mg[2]) : null;

      const jugadores = [];
      let suplente = false;
      lineas.forEach(l => {
        if (/^suplentes?\s*:?\s*$/i.test(l)) { suplente = true; return; }
        const mm = l.match(/^(.+?)\s+(-?\d+|s\/c)$/i);
        if (!mm) return;                       // linea de texto suelta: se ignora
        const crudo = mm[2].toLowerCase();
        jugadores.push({
          nombre: mm[1].trim(),
          pts: crudo === 's/c' ? null : Number(crudo),
          suplente
        });
      });
      if (jugadores.length) equipos.push({ equipo, goles, jugadores });
    }
    if (equipos.length === 2) partidos.push({ local: equipos[0], visitante: equipos[1] });
    else if (equipos.length) partidos.push({ local: equipos[0], visitante: null, incompleto: true });
    else {
      // Si esto aparece, Planeta cambio el formato del post y hay que mirarlo:
      // mejor gritar que devolver un partido menos sin decir nada.
      avisos.push('un bloque de puntajes no tenia los dos recuadros de equipo. Arranca asi: ' +
        tramo.replace(/\s+/g, ' ').slice(0, 180));
    }
  }
  return partidos;
}

// LAS FICHAS DE CLARIN (bloque fac.png).
// Es OTRA cosa que los puntos: es la nota del 1 al 10, que es justo lo que la
// cinta de capitan duplica. Planeta solo publica las destacadas de cada equipo
// (tres o cuatro por partido), asi que esto no alcanza para recalcular a nadie:
// sirve para una sola cosa, saber cuanto pago la cinta cuando el capitan
// aparece en la lista. Si no aparece, no se inventa.
function parsearFichas(html) {
  const filas = [];
  const marcas = [];
  const re = /fa[pc]\.png/g;
  let m;
  while ((m = re.exec(html))) marcas.push({ i: m.index, tipo: m[0][2] === 'p' ? 'gdt' : 'clarin' });
  for (let k = 0; k < marcas.length; k++) {
    if (marcas[k].tipo !== 'clarin') continue;
    const tramo = html.slice(marcas[k].i, k + 1 < marcas.length ? marcas[k + 1].i : html.length);
    // cada renglon arranca con "<b>Equipo:</b>" y despues los nombres con la nota
    tramo.split(/<br\s*\/?>/i).forEach(bruto => {
      const mEq = bruto.match(/<b>\s*([^<:]+?)\s*:?\s*<\/b>/i);
      if (!mEq) return;
      const equipo = desHtml(mEq[1]).trim();
      // el tramo arranca a mitad del <div ...>, asi que hay que cortar DESPUES
      // del </b> del equipo o el primer nombre se lleva puesto medio atributo
      const corte = bruto.toLowerCase().indexOf('</b>');
      const texto = desHtml(bruto.slice(corte + 4).replace(/<[^>]+>/g, ''));
      const reN = /([^;().]+?)\s*\((\d+(?:[.,]\d+)?)\)/g;
      let n;
      while ((n = reN.exec(texto))) {
        const nombre = n[1].replace(/^[\s,;y]+/i, '').replace(/^y\s+/i, '').trim();
        if (!nombre || nombre.length < 3) continue;
        filas.push({ equipo, nombre, ficha: Number(String(n[2]).replace(',', '.')) });
      }
    });
  }
  return filas;
}

// ---------------------------------------------------------------------------
// 2. EL CRUCE DE NOMBRES
//    Planeta escribe "Lucas Acosta". La app tiene "Acosta, Lucas". Ademas hay
//    apellidos compuestos ("Santiago Lopez Garcia") y segundos nombres. El
//    cruce va SIEMPRE dentro del mismo club: sin eso "Molina" de un equipo
//    engancha con "Molina" de otro y le colgas puntos a quien no jugo.
// ---------------------------------------------------------------------------
function armarIndice(jugadores) {
  const porClub = {};
  jugadores.forEach(j => {
    const k = CT(j.eq);
    (porClub[k] = porClub[k] || []).push(j);
  });
  return porClub;
}

function partesApp(nombre) {
  // "Lopez Garcia, Santiago"  ->  {ap:'lopez garcia', nom:'santiago'}
  const q = (nombre || '').split(',');
  return { ap: norm(q[0] || ''), nom: norm(q.slice(1).join(' ')) };
}

function buscar(nombreBlog, clubKey, porClub, usados) {
  const lista = porClub[clubKey] || [];
  if (!lista.length) return null;
  const n = norm(nombreBlog);
  const tok = n.split(' ').filter(Boolean);
  if (!tok.length) return null;

  const libre = j => !usados.has(j.id);
  const cands = lista.filter(libre);

  // pasada 1: "nombre apellido" == "apellido, nombre" dado vuelta, exacto
  let hit = cands.filter(j => {
    const p = partesApp(j.n);
    return (p.nom + ' ' + p.ap) === n || (p.ap + ' ' + p.nom) === n;
  });
  if (hit.length === 1) return { j: hit[0], via: 'exacto' };

  // pasada 2: el apellido de la app entero esta al final del nombre del blog,
  //           y el primer nombre de pila coincide
  hit = cands.filter(j => {
    const p = partesApp(j.n);
    if (!p.ap) return false;
    if (!(n === p.ap || n.endsWith(' ' + p.ap))) return false;
    const pilaApp = p.nom.split(' ')[0];
    return !pilaApp || tok[0] === pilaApp || tok.includes(pilaApp);
  });
  if (hit.length === 1) return { j: hit[0], via: 'apellido+pila' };

  // pasada 3: primera palabra del apellido de la app == ultima palabra del blog,
  //           y coincide el nombre de pila (cubre "Sosa" por "Sosa Yung")
  hit = cands.filter(j => {
    const p = partesApp(j.n);
    const apPrim = p.ap.split(' ')[0];
    const pilaApp = p.nom.split(' ')[0];
    if (!apPrim || !pilaApp) return false;
    return tok.includes(apPrim) && tok.includes(pilaApp);
  });
  if (hit.length === 1) return { j: hit[0], via: 'apellido corto' };

  // pasada 4: por apellido, cuando el nombre de pila no ayuda.
  //   Dos candados, porque aca es donde se cuelgan puntos al que no jugo:
  //   1) el apellido tiene que ser UNICO en el club (si hay dos Gonzalez, no adivina)
  //   2) si los dos tienen nombre de pila y no comparten NINGUNO, no es el mismo.
  //      Sin este segundo candado "Ivan Gomez" de Central Cordoba enganchaba con
  //      "Gomez, Jose" del mismo club. Son dos personas distintas.
  hit = cands.filter(j => {
    const p = partesApp(j.n);
    const apPartes = p.ap.split(' ').filter(Boolean);
    const apPrim = apPartes[0];
    if (!apPrim) return false;
    const pegaApellido = (n === p.ap || n.endsWith(' ' + p.ap) || n === apPrim || n.endsWith(' ' + apPrim));
    if (!pegaApellido) return false;
    const pilaBlog = tok.filter(t => !apPartes.includes(t));
    const pilaApp = p.nom.split(' ').filter(Boolean);
    if (pilaBlog.length && pilaApp.length && !pilaBlog.some(t => pilaApp.includes(t))) return false;
    return true;
  });
  if (hit.length === 1) return { j: hit[0], via: 'solo apellido' };

  return null;
}

// ---------------------------------------------------------------------------
// 3. CORRER
// ---------------------------------------------------------------------------
function main() {
  console.log('');
  console.log('-- puntajes en vivo: leyendo los posts de Planeta --');

  if (!fs.existsSync(P('feedVivo.json'))) {
    console.log('  no encuentro feedVivo.json. Corre SYNC_VIVO.bat, que es el que lo baja.');
    process.exit(1);
  }
  const feed = JSON.parse(fs.readFileSync(P('feedVivo.json'), 'utf8'));
  const entradas = (feed.feed && feed.feed.entry) || [];
  if (!entradas.length) { console.log('  el feed vino vacio.'); process.exit(1); }

  // que fecha mirar: la que el motor tiene como objetivo
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(P('datos.js'), 'utf8'), ctx);
  const D = ctx.window.DATOS;
  // POR DEFECTO, LA FECHA QUE EL MOTOR ESTA MIRANDO. Pero se puede pedir otra:
  //   node vivo.cjs 8
  // Sirve para rearmar una fecha que quedo sin foto: el motor ya paso a la 9 y
  // los posts de la 8 siguen estando en el feed. Los ids salen del datos.js de
  // AHORA, que es lo que necesita la app para no cruzarle los puntos a otro.
  const pedida = process.argv.slice(2).map(x => parseInt(x, 10)).find(x => !isNaN(x));
  const fecha = (pedida != null) ? pedida : D.fechaObjetivo;
  if (pedida != null) console.log('  (a pedido) se leen los posts de la fecha ' + pedida);
  const jugadores = [].concat(D.rankings.ARQ, D.rankings.DEF, D.rankings.VOL, D.rankings.DEL);
  const porClub = armarIndice(jugadores);
  console.log('  fecha ' + fecha + ' · ' + jugadores.length + ' jugadores en la app');

  // EL PLANTEL CON EL QUE SE CRUZA ES EL DE datos.js.
  // Si datos.js quedo viejo, los que debutaron o llegaron esta semana no estan
  // y no cruzan: pasa de verdad —una corrida cruzo 96.8% y despues de recalcular
  // 98.8%, con los mismos posts. Asi que conviene correr RECALCULAR primero.
  try {
    const edad = (Date.now() - fs.statSync(P('datos.js')).mtimeMs) / 3600000;
    if (edad > 12) {
      console.log('');
      console.log('  OJO: datos.js tiene ' + edad.toFixed(0) + ' horas. El cruce se hace contra ESE plantel,');
      console.log('  asi que los que llegaron o debutaron despues no van a cruzar. Cerra esto,');
      console.log('  corre RECALCULAR.bat y volve a correr SYNC_VIVO.bat.');
      console.log('');
    }
  } catch (e) { }

  const deLaFecha = entradas.filter(en => {
    const t = (en.title && en.title.$t) || '';
    return new RegExp('fecha\\s*' + fecha + '\\b', 'i').test(t);
  });
  if (!deLaFecha.length) {
    console.log('  todavia no hay ningun post de la fecha ' + fecha + '. Escribo dataVivo.js vacio.');
  } else {
    deLaFecha.forEach(en => console.log('   post: ' + (en.title.$t || '')));
  }

  const partidos = [];
  const filas = [];
  const filasFicha = [];
  deLaFecha.forEach(en => {
    const html = (en.content && en.content.$t) || '';
    const cuando = (en.published && en.published.$t) || null;
    parsearFichas(html).forEach(f => filasFicha.push(f));
    parsearPost(html).forEach(p => {
      const lados = ['local', 'visitante'];
      const eqs = lados.map(l => p[l]).filter(Boolean);
      partidos.push({
        cuando,
        local: p.local ? p.local.equipo : null,
        visitante: p.visitante ? p.visitante.equipo : null,
        // la clave canonica, para que la app pueda cruzar el partido con su
        // fixture sin depender de como lo escribio Planeta ese dia
        cl: p.local ? CT(p.local.equipo) : null,
        cv: p.visitante ? CT(p.visitante.equipo) : null,
        golesL: p.local ? p.local.goles : null,
        golesV: p.visitante ? p.visitante.goles : null
      });
      eqs.forEach(eq => eq.jugadores.forEach(j =>
        filas.push({ equipo: eq.equipo, nombre: j.nombre, pts: j.pts, suplente: j.suplente })));
    });
  });

  // cruce
  const usados = new Set();
  const puntos = {};
  const sinCruzar = [];
  const vias = {};
  filas.forEach(f => {
    const k = CT(f.equipo);
    const r = buscar(f.nombre, k, porClub, usados);
    if (!r) { sinCruzar.push(f.equipo + ' — ' + f.nombre + (f.pts === null ? ' (s/c)' : ' ' + f.pts)); return; }
    usados.add(r.j.id);
    vias[r.via] = (vias[r.via] || 0) + 1;
    puntos[r.j.id] = { p: f.pts, s: f.suplente ? 1 : 0 };
  });

  if (avisos.length) {
    console.log('');
    avisos.forEach(a => console.log('  OJO: ' + a));
    console.log('');
  }

  // las fichas de Clarin van por separado y con su propio set de usados: un
  // jugador puede estar en las dos listas y no tiene que competir consigo mismo
  const fichas = {};
  {
    const u = new Set();
    filasFicha.forEach(f => {
      const r = buscar(f.nombre, CT(f.equipo), porClub, u);
      if (r) { u.add(r.j.id); fichas[r.j.id] = f.ficha; }
    });
  }

  const cruzadas = filas.length - sinCruzar.length;
  const pct = filas.length ? Math.round(cruzadas / filas.length * 1000) / 10 : 0;

  console.log('');
  console.log('  partidos leidos: ' + partidos.length);
  console.log('  filas de jugador: ' + filas.length);
  console.log('  cruzaron con la app: ' + cruzadas + '  (' + pct + '%)');
  console.log('  fichas de Clarin publicadas: ' + Object.keys(fichas).length +
    '   (solo las destacadas: sirven para saber cuanto pago la cinta)');
  Object.keys(vias).sort().forEach(v => console.log('     por ' + v + ': ' + vias[v]));
  if (sinCruzar.length) {
    console.log('  NO cruzaron ' + sinCruzar.length + ':');
    sinCruzar.forEach(t => console.log('     ' + t));
    console.log('  (los que no cruzan no suman puntos: es preferible que falte a que');
    console.log('   se le cuelguen los puntos de otro)');
  }

  const salida = {
    fecha,
    generado: new Date().toISOString(),
    // CONTRA QUE datos.js SE CRUZARON LOS IDS (08/09).
    // Los ids son el numero de fila de datos.js: si el motor se vuelve a
    // correr, se corren. Sin este sello la app no tiene forma de saber si los
    // puntos de este archivo le corresponden al jugador que ella llama p766, y
    // el error seria silencioso —le colgaria los puntos de otro—.
    generadoCon: D.generado || null,
    fechaMotor: D.fechaObjetivo != null ? D.fechaObjetivo : null,
    posts: deLaFecha.map(en => ({ titulo: en.title.$t, publicado: en.published.$t })),
    partidos,
    puntos,
    fichas,
    cruce: { filas: filas.length, cruzadas, pct, sinCruzar, fichas: Object.keys(fichas).length }
  };
  fs.writeFileSync(P('dataVivo.js'), 'window.VIVO=' + JSON.stringify(salida) + ';');
  console.log('');
  console.log('OK -> dataVivo.js');
}

if (require.main === module) main();
module.exports = { parsearPost, parsearFichas, buscar, armarIndice, CT, norm, avisos };
