/* ============================================================================
 * appV3.js — Reemplaza al app.js viejo. Misma interfaz, motor nuevo.
 * ----------------------------------------------------------------------------
 * Lee window.DATOS (datos.js, que genera armar.js) y dibuja index.html.
 * Regla: NINGÚN dato inventado. Lo que es cálculo nuestro va etiquetado como
 * tal; lo que es mercado o dato oficial va como mercado o dato oficial. Si un
 * dato falta, se muestra "s/d" y no se rellena con un valor por defecto.
 * ==========================================================================*/

const D = window.DATOS || null;
const S = {
  pos: 'ARQ',
  busqueda: '',
  equipo: '',            // filtro por club, vacio = todos
  zona: 'todos',
  filtroTabla: 'all',
  esquema: null,
  once: [],
  capitan: null,
  ordCol: 'epsj',
  ordDir: -1,
  verTodos: false,
  filtrados: 0,
  // DESCARTES DE LA FECHA (05/09). Los que YO se que no juegan: lesionado,
  // suspendido, vendido, guardado para la copa. No es una estimacion del motor,
  // es informacion que tengo yo y el motor no puede tener.
  fuera: new Set(),
  capitanManual: null,     // el capitan que elegiste vos; null = el de ficha mas alta
  oncesLocales: null,
  // pantalla Datos: como se comporta cada equipo de local y de visitante
  condVent: 'actual',      // siempre este torneo: el selector se saco de la pantalla
  condModo: 'fecha',       // 'fecha' = solo la condicion que le toca | 'ambas'
  condTab: 'res',          // 'res' = resultados | 'juego'
  condFiltro: 'todos',     // 'todos' | 'L' | 'V' — solo en modo 'fecha'
  esquemaElegido: false,   // true recien cuando vos elegis una formacion a mano
  // MI ONCE (07/09): el que usaste vos en el juego, para el Versus del inicio.
  // null = todavia no se leyo del navegador.
  mi11: null, miCap: null, miEsq: null,
  // LA LIGA (07/09): el torneo de amigos. Los equipos viven en el navegador y
  // NO son por fecha: siguen cargados la semana que viene.
  liga: null, ligaAbierto: null, caraA: null, caraB: null,
  analista: true,          // ver todas las columnas. Se guarda en el navegador.

  // Arranca ordenada por la BRECHA de puntos POR PARTIDO entre local y
  // visitante, que es la pregunta que se le hace a esta tabla: quien es muy
  // casero y quien no aparece de visitante. Por puntos totales a secas seria
  // enganoso, porque no todos jugaron la misma cantidad de local que de visitante.
  condOrd: 'ptsL',         // campo+lado por el que esta ordenada la tabla
  condDir: -1
};

// ── LOS QUE YO SE QUE NO JUEGAN ─────────────────────────────────────────────
// EL MOTOR YA NO ADIVINA SI UN JUGADOR VA A JUGAR (05/09).
// La tabla ordena por PUNTOS, que son los puntos SI ENTRA A LA CANCHA, y la
// unica penalizacion que queda es por MINUTOS: el que cuando arranca juega 60
// cobra por 60, el que juega 90 cobra por 90. Eso esta medido y sirve.
// Lo que el motor NO puede saber es si el tipo esta lesionado o suspendido, y
// no es un problema de calibracion sino de informacion: el dato no esta en el
// log de minutos. Medido sobre 3.740 casos del torneo, un cero despues de una
// titularidad da 45.1% de chance de jugar la fecha siguiente — pero adentro de
// ese 45% hay dos poblaciones opuestas mezcladas, el que descanso (vuelve casi
// seguro) y el que se rompio (no vuelve). El promedio de las dos no le sirve a
// ninguna. Por eso esto es un tilde y no un coeficiente.
// Se guarda por fecha: al cambiar la fecha objetivo la lista arranca vacia.
const CLAVE_FUERA = () => 'gdt_fuera_f' + ((typeof D !== 'undefined' && D && D.fechaObjetivo != null) ? D.fechaObjetivo : 'x');
// LOS DESCARTES TAMBIEN VAN POR CLAVE ESTABLE (07/09).
// Se guardaban por id ('p988'), y el id es el numero de fila de la planilla de
// Planeta: cambia cada vez que Planeta publica una planilla nueva. O sea que un
// tilde puesto el viernes podia terminar escondiendo a OTRO jugador el domingo,
// sin que nadie se enterara. Se guardan por nombre+club+puesto, como la liga.
function cargarFuera() {
  S.fuera = new Set();
  try {
    // LOS DESCARTES SE ARRASTRAN (17/09). Se guardaban por fecha, y el armado
    // se hace justo cuando el motor cambia de fecha: todo lo que tildabas el
    // martes desaparecia el viernes. Si no hay nada para la fecha de hoy, se
    // toma la ultima que si tenga. Se reescribe bajo la fecha nueva, asi que la
    // vieja queda como estaba.
    let r = JSON.parse(localStorage.getItem(CLAVE_FUERA()) || 'null');
    if (!Array.isArray(r) && D && D.fechaObjetivo != null) {
      for (let f = D.fechaObjetivo - 1; f >= D.fechaObjetivo - 6 && f >= 1; f--) {
        const v = JSON.parse(localStorage.getItem('gdt_fuera_f' + f) || 'null');
        if (Array.isArray(v) && v.length) { r = v; break; }
      }
    }
    if (Array.isArray(r)) {
      r.forEach(v => {
        // formato viejo: el id pelado. Se acepta una vez y se reescribe por clave.
        const p = porClave(v) || TODOS[v];
        if (p) S.fuera.add(p.id);
      });
    }
  } catch (e) { }   // storage bloqueado en file://: anda igual, sin memoria
  // se reescribe ya en el formato nuevo, para que la migracion pase una sola vez
  if (S.fuera.size) guardarFuera();
}
function guardarFuera() {
  try { localStorage.setItem(CLAVE_FUERA(), JSON.stringify([...S.fuera].map(id => claveDe(id) || id))); }
  catch (e) { }
}
const CLAVE_CAP = () => 'gdt_capitan_f' + ((typeof D !== 'undefined' && D && D.fechaObjetivo != null) ? D.fechaObjetivo : 'x');
function cargarCapitan() {
  S.capitanManual = null;
  try {
    const v = localStorage.getItem(CLAVE_CAP());
    if (v) { const p = porClave(v) || TODOS[v]; S.capitanManual = p ? p.id : null; }
  } catch (e) { }
}
function guardarCapitan() {
  try {
    if (S.capitanManual) localStorage.setItem(CLAVE_CAP(), claveDe(S.capitanManual) || S.capitanManual);
    else localStorage.removeItem(CLAVE_CAP());
  } catch (e) { }
}
// BAJA = lo que dice el juego (lesionado, suspendido, expulsado, se fue).
// armar.cjs ya rehace SU once sin ellos con esta misma regla; como ahora el
// once se rearma aca, la regla tiene que estar aca tambien o vuelven a entrar.
// Paso: Módica, lesion muscular cargada a mano, salia del once del motor y
// reaparecia en el que rearmaba la pagina.
const esBaja = x => !!(x.disp && x.disp.suspendido);
const estaFuera = x => S.fuera.has(x.id) || esBaja(x);
// Los descartes viven en el menu de los tres puntos: se tocan una vez por fecha
// y no tienen por que ocupar una barra abajo del once en todas las pantallas.
function pintarMenuFuera() {
  const cont = $('menu-fuera'), sep = $('menu-sep-fuera'), txt = $('lbl-fuera-txt');
  if (!cont || !txt) return;
  const n = S.fuera.size;
  cont.hidden = sep.hidden = (n === 0);
  if (!n) return;
  txt.innerHTML = `<b>${n}</b> descartado${n > 1 ? 's' : ''} por vos en la fecha ${D && D.fechaObjetivo != null ? D.fechaObjetivo : '–'}
    <small>No entran al once. Se guardan <b>en este navegador</b>: si le pasás la app a alguien, esa persona
    arranca con la lista completa.</small>`;
}
function repintarTodo() {
  rearmarOnce();
  pintarRankings();
  if (document.getElementById('pantalla-once')) pintarPantallaOnce();
  if (document.getElementById('pitch-layout')) pintarOnce();
  // La portada ahora tambien dibuja el once: si no se repinta aca, tildar a un
  // jugador lo sacaba del once pero la cancha del inicio seguia mostrandolo.
  if (document.getElementById('pantalla-fecha')) pintarPantallaFecha();
  if (document.getElementById('pantalla-liga') && S.liga) pintarPantallaLiga();
  pintarMenuFuera();
}
// ── ¿ESTE TIPO JUEGA? (17/09) ──────────────────────────────────────────────
// Los estados los escribe el ayudante de campo del Gran DT, no nosotros.
// "Habilitado" es el generico: no esta lesionado, pero tampoco dice que vaya a
// jugar. Los otros cuatro son senales activas de que esta en el radar del DT.
const ESTADO_SIEMPRE_VISIBLE = new Set(['Posible Titular', 'En duda', 'Juega Copa', 'Jugó Copa']);
const ESTADO_OCULTABLE = new Set(['Habilitado', 'Lesionado']);
const FECHAS_MIRAR = 5;
const MIN_PARA_FICHA = 20;   // los que exige el juego para darle ficha a un jugador
function jugoUltimasFechas(x) {
  const l = (x.dlog || []).slice(-FECHAS_MIRAR);
  if (!l.length) return true;            // sin log no se puede afirmar nada: se muestra
  return l.some(e => e && (e.m || 0) >= MIN_PARA_FICHA);
}
// UNA SOLA REGLA (18/09). Estaba escrita dos veces: una para decidir a quien se
// muestra y otra, distinta, para numerar los puestos. Resultado: Teo Rodríguez
// Pagano aparecia en la tabla SIN numero, porque pasaba el filtro de la lista y
// no el de la numeracion. Ahora las dos preguntan lo mismo.
function esCandidato(x) {
  const est = (x.disp && x.disp.estado) || '';
  if (ESTADO_SIEMPRE_VISIBLE.has(est)) return true;
  if (ESTADO_OCULTABLE.has(est) && !jugoUltimasFechas(x)) return false;
  const q = x.pmin, min = (x.ind && x.ind.minutos) || 0;
  if (!q) return true;
  return q.arranques >= 2 || min >= 270;
}

function toggleFuera(id, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  if (S.fuera.has(id)) S.fuera.delete(id); else S.fuera.add(id);
  S.topGol = null;                     // el mas seguro puede cambiar si tildé a uno
  guardarFuera(); repintarTodo();
}
function limpiarFuera() { S.fuera = new Set(); guardarFuera(); repintarTodo(); }

// ── PUBLICAR LOS DESCARTES ─────────────────────────────────────────────────
// La ✕ vive en el localStorage de ESTE navegador: es tuya y nadie mas la ve.
// Eso esta bien mientras la app es para uno, pero si se la pasas a alguien, esa
// persona arranca con la lista sin filtrar y el motor le recomienda a los que
// vos ya sabes que no juegan.
// Para que tu criterio VIAJE con la app hay que pasarlo a pases.json, que si
// entra en datos.js y lo ve todo el que abra ese archivo. Esto arma el bloque
// listo para pegar, en vez de tener que escribirlo a mano jugador por jugador.
// ── CARGAR PUNTAJES A MANO ─────────────────────────────────────────────────
// Se pegan igual que un equipo: "Almada 12", uno por linea. Es mucho mas rapido
// que cincuenta casilleros, y es como uno los tiene cuando los saca de Twitter.
function leerPuntajes(txt) {
  return String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    // el numero puede ir al final o separado por dos puntos o guion
    const m = /^(.*?)[\s:\-–]+(-?\d{1,2})$/.exec(l);
    if (!m) return { texto: l, pts: null, cands: [], elegido: null };
    const nombre = m[1].replace(/^\d+[.)\-\s]+/, '').trim();
    const cands = candidatosNombre(nombre);
    return { texto: nombre, pts: parseInt(m[2], 10), cands,
             elegido: cands.length === 1 ? cands[0].id : null };
  });
}
let _mano = null;
window.abrirCargarMano = function () {
  // el nombre lindo sale del partido, no del slug: NOM() no traduce 'atl-tucuman'
  const faltan = [];
  if (VIVO) (VIVO.partidos || []).forEach(m => {
    if (m.cl && !EQ_RESUELTOS.has(m.cl)) faltan.push(m.local || m.cl);
    if (m.cv && !EQ_RESUELTOS.has(m.cv)) faltan.push(m.visitante || m.cv);
  });
  const yaCargados = Object.keys(MANO).map(k => ({ k, p: porClave(k), pts: MANO[k] })).filter(x => x.p);
  _mano = null;
  $('team-detail-title').innerHTML = 'Cargar puntajes a mano';
  $('team-detail-body').innerHTML = `
    <p class="exp-txt">Planeta publica por tandas. Si ya sabés un puntaje y él todavía no lo subió,
    escribilo acá y la app lo usa <b>hasta que llegue el oficial</b>, que después lo pisa solo.
    Un jugador por línea, con el número al final: <code>Almada 12</code>.</p>
    ${faltan.length ? `<p class="exp-txt exp-nota">Ahora mismo falta el puntaje de: <b>${esc([...new Set(faltan)].join(', '))}</b>.</p>`
      : '<p class="exp-txt exp-nota">Ahora mismo Planeta publicó todos los partidos que se jugaron.</p>'}
    <div class="lg-pegar">
      <textarea id="mn-txt" rows="8" placeholder="Almada 12
Correa 8
Otamendi 5"></textarea>
      <button class="vs-btn vs-btn-fuerte" id="mn-leer">Leer los puntajes</button>
    </div>
    <div id="mn-res"></div>
    ${yaCargados.length ? `<div class="mn-ya"><h4>Ya cargados a mano (${yaCargados.length})</h4>
      <div class="mn-chips">${yaCargados.map(x => `<span class="mn-chip">${esc(nombreCorto(x.p.n))}
        <b>${x.pts}</b><button data-mn-borrar="${esc(x.k)}" title="Borrarlo">✕</button></span>`).join('')}</div>
      <button class="vs-btn" id="mn-bajar">Bajar dataManual.js para tus amigos</button>
      <p class="exp-txt exp-nota">Los puntajes a mano viven <b>en este navegador</b>. Para que tus amigos
      también los vean, bajá el archivo, dejalo en la carpeta Grandt y corré <b>SUBIR_A_GITHUB.bat</b>.
      El día que Planeta publique, el oficial gana igual y no hace falta borrar nada.</p></div>` : ''}`;
  abrirModal('team-detail-modal');
  $('mn-leer').onclick = () => { _mano = leerPuntajes($('mn-txt').value); pintarMano(); };
  const bb = $('mn-bajar'); if (bb) bb.onclick = bajarManual;
  $('team-detail-body').querySelectorAll('[data-mn-borrar]').forEach(b => b.onclick = () => {
    delete MANO[b.dataset.mnBorrar]; guardarMano(); rearmarResueltos();
    abrirCargarMano(); repintarPorMano();
  });
};
function pintarMano() {
  const r = _mano || [];
  const ok = r.filter(f => f.elegido && f.pts != null).length;
  $('mn-res').innerHTML = `
    <p class="exp-txt"><b>${ok}</b> de ${r.length} cruzaron.</p>
    <table class="data-table"><thead><tr><th>Lo que pegaste</th><th>Quién es</th><th>Puntos</th></tr></thead>
      <tbody>${r.map((f, i) => `<tr>
        <td>${esc(f.texto)}</td>
        <td>${f.pts == null ? '<span class="lg-cinta-mal">falta el número</span>'
          : f.cands.length === 0 ? '<span class="lg-cinta-mal">no lo encontré</span>'
          : `<select data-mn="${i}">${f.cands.length > 1 ? '<option value="">— elegí —</option>' : ''}
              ${f.cands.slice(0, 12).map(p => `<option value="${p.id}"${p.id === f.elegido ? ' selected' : ''}>${esc(p.n)} · ${esc(NOM(p.eq))} · ${p.pos}</option>`).join('')}
            </select>`}</td>
        <td class="text-center"><b>${f.pts == null ? '—' : f.pts}</b></td></tr>`).join('')}</tbody></table>
    <button class="vs-btn vs-btn-fuerte" id="mn-guardar">Guardar ${ok} puntaje${ok === 1 ? '' : 's'}</button>`;
  $('mn-res').querySelectorAll('[data-mn]').forEach(sel => sel.onchange = () => {
    _mano[+sel.dataset.mn].elegido = sel.value || null;
  });
  $('mn-guardar').onclick = () => {
    let n = 0;
    (_mano || []).forEach(f => {
      if (!f.elegido || f.pts == null) return;
      const k = claveDe(f.elegido); if (!k) return;
      MANO[k] = f.pts; n++;
    });
    guardarMano(); rearmarResueltos();
    cerrarModal($('team-detail-modal'));
    repintarPorMano();
    if (!n) alert('No guardé ninguno: revisá que cada línea termine con el número.');
  };
}
function bajarManual() {
  const obj = { fecha: D.fechaObjetivo, generado: new Date().toISOString(), puntos: MANO };
  const b = new Blob(['window.MANUAL=' + JSON.stringify(obj) + ';\n'], { type: 'text/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'dataManual.js';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
// Un puntaje a mano toca todo: el Versus, el torneo, la tabla y la revision.
// repintarTodo() ya cubre casi todo; Revision no estaba porque los tildados no
// la afectan, pero un puntaje si.
function repintarPorMano() {
  try { repintarTodo(); } catch (e) { }
  try { if (document.getElementById('pantalla-revision')) pintarRevision(); } catch (e) { }
}

window.exportarDescartes = function () {
  const hoy = new Date().toISOString().slice(0, 10);
  const items = [...S.fuera].map(id => TODOS[id]).filter(Boolean).map(p => ({
    nombre: p.n, desde: NOM(p.eq), hacia: 'NO JUEGA', fecha: hoy,
    fuente: 'cargado a mano', nota: 'no juega la fecha ' + (D.fechaObjetivo ?? '')
  }));
  if (!items.length) { alert('No tenés ningún jugador descartado.'); return; }
  const txt = items.map(o => '    ' + JSON.stringify(o)).join(',\n');
  const cuerpo = $('team-detail-body');
  $('team-detail-title').innerHTML = `Publicar ${items.length} descarte${items.length > 1 ? 's' : ''}`;
  cuerpo.innerHTML = `
    <p class="exp-txt">La <b>✕</b> guarda tus descartes <b>en este navegador</b>: son tuyos, no los ve nadie más
    y nadie te los puede tocar. Si le pasás la app a alguien, esa persona arranca con la lista completa.</p>
    <p class="exp-txt">Para que tu criterio viaje con la app, pegá esto adentro de <code>"pases"</code> en
    <b>pases.json</b> y corré <b>RECALCULAR.bat</b>. A partir de ahí esos jugadores quedan afuera del once
    <b>para todo el que abra tu datos.js</b>, igual que Módica.</p>
    <textarea class="exp-json" readonly onclick="this.select()">${esc(txt)}</textarea>
    <p class="exp-txt exp-nota">Tocá el texto para seleccionarlo todo. Revisá el motivo de cada uno antes de pegarlo:
    queda escrito en la app y es lo que después explica por qué ese jugador no aparece.</p>`;
  abrirModal('team-detail-modal');
};

// ── utilidades ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = v => (v == null || isNaN(v)) ? 's/d' : Number(v).toFixed(1);
const n2 = v => (v == null || isNaN(v)) ? 's/d' : Number(v).toFixed(2);
const n3 = v => (v == null || isNaN(v)) ? 's/d' : Number(v).toFixed(3);
// Numero corto: la cantidad de decimales depende de cuan chico es el numero.
// 0.102 se lee 0.1, pero 0.02 no se puede redondear a 0.0 — ahi si hacen falta
// los decimales. Regla: siempre dos cifras significativas, sin ceros de relleno.
const nCorto = v => {
  if (v == null || isNaN(v)) return 's/d';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 10) return Number(v).toFixed(0);
  if (a >= 1) return String(+Number(v).toFixed(1));
  if (a >= 0.1) return String(+Number(v).toFixed(2));
  if (a >= 0.01) return String(+Number(v).toFixed(3));
  return String(+Number(v).toFixed(4));
};
const pc = v => (v == null || isNaN(v)) ? 's/d' : (v * 100).toFixed(1) + '%';
const pc0 = v => (v == null || isNaN(v)) ? 's/d' : Math.round(v * 100) + '%';
const plata = v => v == null ? 's/d' : '$ ' + Number(v).toLocaleString('es-AR');
const NOMBRE_POS_SING = { ARQ: 'arquero', DEF: 'defensor', VOL: 'volante', DEL: 'delantero' };
const TODOS = {};
// LOS id NO SON ESTABLES ENTRE FECHAS. 'p171' es el numero de fila en la
// planilla de Planeta, y Planeta publica una planilla nueva cada fecha con otro
// orden: el mismo id puede ser otra persona la semana que viene. Todo lo que se
// guarda en el navegador y tiene que sobrevivir a eso —la liga de amigos, tu
// once— se guarda por esta clave (nombre + club + puesto) y se resuelve al
// abrir. Si un jugador cambio de club, no engancha: y esta bien que no enganche,
// porque ya no es el mismo jugador en el mismo lugar.
const POR_CLAVE = {};
// Si el datos.js todavia es viejo y no trae la clave, se degrada solo: la
// "clave" pasa a ser el id y la busqueda cae en TODOS. Asi abrir la pagina con
// un datos.js viejo no te borra los equipos guardados.
const claveDe = id => (TODOS[id] && TODOS[id].k) || (TODOS[id] ? id : null);
const porClave = k => POR_CLAVE[k] || TODOS[k] || null;
// Convierte una lista guardada (claves) a ids de esta corrida. Devuelve tambien
// las que se perdieron, para poder decirlo en vez de tragarselo.
function idsDesdeClaves(claves) {
  const ids = [], perdidas = [];
  (claves || []).forEach(k => {
    if (!k) return;
    const p = porClave(k);
    if (p) ids.push(p.id); else perdidas.push(k);
  });
  return { ids, perdidas };
}
const clavesDesdeIds = ids => (ids || []).map(claveDe).filter(Boolean);
const POS_LABEL = { ARQ: '🧤 ARQ', DEF: '🛡️ DEF', VOL: '⚡ VOL', DEL: '🎯 DEL' };

function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
/** Nombre corto y consistente de equipo. Cada fuente lo escribe distinto
 *  ("CA Tigre BA", "Union Santa Fe", "Estudiantes de Río Cuarto"); armar.js
 *  deja una tabla canonica y toda la app muestra ese nombre. */
const ARREGLOS_EQ = { estudiantes: 'estudiantes-lp' };
function claveEquipo(nombre) {
  if (!nombre) return '';
  const plano = String(nombre).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (ARREGLOS_EQ[plano]) return ARREGLOS_EQ[plano];
  const id = (typeof getCanonicalTeamId === 'function') ? getCanonicalTeamId(nombre) : null;
  return id || plano.replace(/[^a-z0-9]/g, '');
}
function NOM(nombre) {
  if (!nombre) return '';
  return (D && D.nombres && D.nombres[claveEquipo(nombre)]) || nombre;
}

/** Arrastrar para seleccionar texto NO tiene que abrir modales.
 *  El navegador dispara "click" al soltar aunque el mouse se haya movido 300px,
 *  asi que se mide el desplazamiento entre mousedown y click y se corta el
 *  evento en fase de captura antes de que llegue a ningun onclick. */
(function guardaArrastre() {
  let desde = null;
  document.addEventListener('mousedown', e => { desde = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('click', e => {
    if (!desde) return;
    const corrido = Math.abs(e.clientX - desde.x) + Math.abs(e.clientY - desde.y);
    const interactivo = e.target.closest('input,select,textarea,option,a,button,label');
    if (corrido > 6 && !interactivo) { e.stopPropagation(); e.preventDefault(); }
    desde = null;
  }, true);
})();

/** Avisos de disponibilidad. Ninguno cambia el puntaje: son advertencias.
 *  suspendido = vio la roja en la ultima fecha con datos -> no juega la que viene.
 *  a una amarilla = lleva 4 (o 9, o 14): la proxima amarilla le cuesta una fecha. */
function avisosJugador(x) {
  const a = [];
  // Ni siquiera "no lo encontramos" puede quedar en blanco: son 2 o 3 por fecha,
  // los que no cruzan por nombre con el Ayudante de campo, y hasta hoy se veian
  // igual que uno habilitado (03/09).
  if (!x.disp || !x.disp.estado) a.push(['SIN DATO DEL JUEGO', '#8b5cf6',
    'El Ayudante de campo del Gran DT no lo cruza por nombre, así que no sabemos si está habilitado, lesionado o suspendido. No es que esté bien: es que no lo sabemos. Miralo en el juego antes de ponerlo.']);
  if (x.jug) a.push(['YA SE JUGÓ', '#94a3b8', 'Este partido de la fecha ya terminó: la recomendación es de referencia, no accionable']);
  if (x.sf) a.push(['SIN FICHA', '#8b5cf6', 'Jugó, pero la planilla de Planeta no le registra ningún partido calificado. Su ficha no es un dato suyo: es el promedio de la liga']);
  const d = x.disp;
  if (d) {
    // El estado sale del Ayudante de campo del propio Gran DT. No es una
    // estimación nuestra: si dice Lesionado, el tipo no juega.
    // SE FUE DEL TORNEO (04/09). Vendido al exterior: no es una baja de una
    // fecha, no vuelve. Va primero porque le gana a cualquier otra explicación.
    if (d.seFue) {
      a.push([(d.estado || 'NO JUEGA').toUpperCase(), '#ef4444', `${d.seFue} No entra en ningún once ni en las recomendaciones. Sigue en la lista porque la planilla de Planeta y el Ayudante de campo todavía lo listan en su club viejo.`]);
    }
    else if (d.suspendido) {
      const t = d.tarjetero;
      const porGDT = d.estado && ['Lesionado', 'Suspendido', 'Expulsado', 'No juega'].includes(d.estado);
      a.push([porGDT ? d.estado.toUpperCase() : 'SUSPENDIDO', '#ef4444',
        porGDT ? `Lo marca así el Ayudante de campo del Gran DT oficial: no juega esta fecha`
        : (t && t.cumpleAca
          ? `Debe ${t.fechas} fecha${t.fechas > 1 ? 's' : ''} desde la ${t.desde}. Fuente: ${t.fuente}`
          : `Roja en la fecha ${d.fechaUltimaRoja}: no juega la próxima`)]);
    }
    else if (d.enDuda) a.push(['EN DUDA', '#f59e0b', 'El Gran DT lo pone en duda para esta fecha. No cambia el puntaje esperado: es información, la decisión es tuya']);
    else if (d.posibleTitular) a.push(['POSIBLE TITULAR', '#10b981', 'El Gran DT lo da como probable titular. No cambia el puntaje esperado: es información']);
    // NINGÚN ESTADO SE COME LA PANTALLA (03/09).
    // Antes solo se pintaban cuatro estados y el resto quedaba en blanco, que
    // es indistinguible de "no tenemos el dato". Merentiel figuraba vacío y en
    // realidad el Gran DT decía "Jugó Copa" — 22 jugadores en esa situación, y
    // es justo el dato que uno quiere ver (jugó entre semana, puede ser
    // rotado). Habilitado eran otros 516 en blanco.
    // Ahora cualquier estado que publique el juego se muestra, incluidos los
    // que todavía no existen: si mañana inventan uno nuevo, aparece igual en
    // vez de desaparecer sin que nadie se entere.
    else if (d.estado) {
      const e = String(d.estado);
      const copa = /copa/i.test(e);
      // "JUEGA COPA" NO DISTINGUE ENTRE PASADO Y FUTURO (04/09).
      // El Gran DT usa la misma etiqueta para el que YA jugó la copa —y esta
      // semana no tiene nada más— y para el que la juega DESPUÉS de esta fecha,
      // que es el que de verdad puede ser guardado. Son dos cosas opuestas:
      // Lanzini venía de Copa Argentina el miércoles y después juega liga;
      // Ascacíbar viene de lo mismo pero el martes juega Sudamericana contra
      // São Paulo. Al primero no hay por qué bajarlo.
      // La nota de rotación sí lo dice, así que se lee de ahí.
      const nota = x.nrot || '';
      const desp = /despues juega ([^-]*)/i.exec(nota);
      const copaDespues = copa && desp && /copa|conmebol|libertadores|sudamericana/i.test(desp[1]);
      const etq = copa ? (copaDespues ? 'COPA DESPUÉS' : 'VIENE DE COPA') : e.toUpperCase();
      a.push([etq, copa ? (copaDespues ? '#f59e0b' : '#64748b') : '#64748b',
        copa ? (copaDespues
          ? `Tiene copa DESPUÉS de esta fecha: ${desp[1].trim()}. Es el caso en que lo pueden guardar. ${nota}`
          : `Ya jugó la copa y después de esta fecha le toca liga, así que no hay motivo para que lo guarden. ${nota}`)
             : `El Gran DT lo marca como "${e}" para esta fecha. No hay nada anotado en contra: ni lesión, ni suspensión, ni duda.`]);
    }
    if (!d.suspendido && d.aUnaDeSuspension) a.push([`${d.amarillas}ª AMARILLA`, '#f59e0b', `Lleva ${d.amarillas} amarillas. A la quinta son una fecha de suspensión`]);
    if (d.exClub) a.push(['LEY DEL EX', '#38bdf8', `Jugó en ${d.exClub}, que es justo el rival de hoy. No cambia el puntaje: no hay evidencia de que la ley del ex exista`]);
  }
  // PASE CARGADO A MANO. Distinto del pase normal, que no se avisa porque no
  // cambia ninguna decisión: acá el club, el rival y la condición los pusimos
  // nosotros porque las fuentes todavía no los tienen. Si Gran DT no lo movió,
  // en el juego sigue siendo jugador del club viejo.
  if (x.tr && x.tr.manual) a.push(['PASE RECIENTE', '#f97316',
    `Pasó de ${x.tr.desde} a ${x.tr.hacia}${x.tr.cuando ? ' el ' + x.tr.cuando : ''}. Ni la planilla ni el Ayudante de campo lo tienen todavía: el club, el rival y la condición se cargaron a mano. Sus minutos, tiros y xG son los que hizo en ${x.tr.desde}. Fijate en el juego antes de ponerlo.`]);
  return a;
}
function pintarAvisos(x) {
  return avisosJugador(x).map(([t, c, tip]) =>
    `<span class="aviso-pill" style="color:${c};border-color:${c}55;background:${c}1a;" title="${esc(tip)}">${esc(t)}</span>`).join('');
}

function nombreCorto(n) {
  if (!n) return '';
  const p = n.split(',');
  return p.length > 1 ? (p[1].trim().split(' ')[0] + ' ' + p[0].trim()) : n;
}

/** Percentil y puesto de un valor dentro de su posición. Devuelve el badge tal
 *  cual lo mostraba la app vieja: P97 (Top 3% - #5/154). */
function percentil(valor, arr, mayorEsMejor = true) {
  const v = arr.filter(x => x != null && isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length || valor == null || !isFinite(valor)) return null;
  let menores = 0;
  v.forEach(x => { if (x < valor) menores++; });
  let p = Math.round(100 * menores / v.length);
  if (!mayorEsMejor) p = 100 - p;
  const orden = mayorEsMejor ? [...v].sort((a, b) => b - a) : v;
  const puesto = orden.findIndex(x => x === valor) + 1;
  return { p, puesto: puesto || v.length, total: v.length, top: Math.max(1, 100 - p) };
}
function badgePct(pctObj) {
  if (!pctObj) return '<span class="text-muted" style="font-size:0.78rem;">s/d</span>';
  const { p, puesto, total, top } = pctObj;
  const color = p >= 85 ? '#10b981' : p >= 60 ? '#38bdf8' : p >= 35 ? '#94a3b8' : '#f97316';
  const bg = p >= 85 ? 'rgba(16,185,129,0.14)' : p >= 60 ? 'rgba(56,189,248,0.14)' : p >= 35 ? 'rgba(148,163,184,0.12)' : 'rgba(249,115,22,0.14)';
  // Antes decia "P100 (Top 1% · #1/530)": tres formas de decir lo mismo, una al
  // lado de la otra. Queda el puesto, que es lo unico que se lee de un vistazo,
  // y el percentil pasa al tooltip.
  return `<span title="Percentil ${p} — mejor que el ${p}% de los medidos"
    style="display:inline-block;background:${bg};color:${color};border-radius:6px;padding:2px 8px;font-weight:800;font-size:0.8rem;">#${puesto}</span>
    <span style="color:var(--text-muted);font-size:0.74rem;margin-left:5px;">de ${total}</span>`;
}

// ── arranque ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', iniciar);

function iniciar() {
  if (!D) {
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="background:#7f1d1d;color:#fff;padding:14px 18px;font-weight:600;">
        No encontré <code>datos.js</code>. Corré los cuatro .bat de sincronización y después
        <code>node armar.js</code> (o pedime que lo regenere) para que se cree.</div>`);
    return;
  }
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => (D.rankings[p] || []).forEach(x => {
    TODOS[x.id] = x;
    if (x.k) POR_CLAVE[x.k] = x;
  }));
  S.esquema = D.esquema.optimo.esquema;
  S.once = D.esquema.optimo.once.map(x => x.id);
  try { S.analista = localStorage.getItem('gdt_analista') !== '0'; } catch (e) { }
  cargarMano();                        // los puntajes que cargaste a mano
  rearmarResueltos();                  // ahora si, con TODOS lleno, se puede contar
  cargarFuera(); cargarCapitan();      // los tildados de esta fecha, guardados en el navegador
  rearmarOnce();      // el once se rehace aca, no viene cocinado de datos.js
  cargarOnceEditado();  // ...y si vos lo editaste, gana el tuyo
  cargarMi11();       // el once que armaste vos, para el Versus
  cargarLiga();       // los equipos del torneo de amigos

  // el subtitulo decia "Los 748" a mano y ya son 760
  {
    const sub = document.querySelector('#sec-jugadores .cab-txt span');
    if (sub) {
      const n = ['ARQ', 'DEF', 'VOL', 'DEL'].reduce((a, p) => a + (D.rankings[p] || []).length, 0);
      sub.textContent = 'Los ' + n + ', ordenables por cualquier columna';
    }
  }
  const ar = $('analysis-round-select');
  if (ar) {
    ar.innerHTML = `<option value="${D.fechaObjetivo}">Fecha ${D.fechaObjetivo}</option>`;
    ar.title = 'El motor analiza siempre la próxima fecha. Para otra, hay que volver a correr los sync.';
  }
  eventos();
  pintarCabecera();
  pintarFixture();
  pintarTabla();
  pintarRankings();
  pintarPantallaFecha();
  pintarAvisoDatos();
  // la foto de la fecha se saca sola apenas estan todos los partidos
  autoCapturar();
}

// ── CORTE DE LOCAL Y DE VISITANTE ──────────────────────────────────────────
// Hay equipos que son otra cosa segun donde jueguen: Newell's saco todos sus
// puntos de local. El puntaje del modelo NO usa esto —se midio que el corte
// local/visitante de un equipo no se traslada de un torneo al otro, asi que
// como prediccion no sirve— pero como INFORMACION para mirar antes de decidir
// vale, y es un dato real, no una estimacion. Va etiquetado como lo que es.
let _COND = null;
function condEquipos() {
  if (_COND) return _COND;
  _COND = {};
  const t = (D && D.tabla) || [];
  ['local', 'visitante'].forEach(c => {
    const filas = t.map(e => ({ k: claveEquipo(e.equipo), eq: e.equipo, ...(e[c] || {}) }))
      .filter(e => e.pj > 0)
      .sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
    filas.forEach((e, i) => {
      const o = _COND[e.k] = _COND[e.k] || {};
      o[c] = { ...e, puesto: i + 1, total: filas.length };
    });
  });
  return _COND;
}
function datoCond(equipo, cond) {
  const o = condEquipos()[claveEquipo(equipo)];
  return o ? o[cond] : null;
}
// El puesto en esa condicion, siempre visible al lado del partido. No es una
// alerta ni un umbral: es en que lugar de la liga esta ese equipo jugando de
// local o de visitante, que es justo lo que uno quiere saber de un vistazo.
function textoCond(x) {
  const cond = x.cond === 'L' ? 'local' : 'visitante';
  const d = datoCond(x.eq, cond);
  if (!d || d.pj < 2) return '';
  // Si el equipo esta en un extremo ya lo dice la etiqueta de color; no hace
  // falta escribirlo dos veces en la misma fila.
  if (d.puesto <= 5 || d.puesto > d.total - 5) return '';
  const ay = `${NOM(x.eq)} de ${cond}: ${d.pts} puntos en ${d.pj} partidos (${d.pg}G ${d.pe}E ${d.pp}P), ${d.gf}:${d.gc}. Puesto ${d.puesto} de ${d.total} de la liga en esa condición. Dato del torneo, no entra en el puntaje.`;
  return ` · <span class="cond-puesto" title="${esc(ay)}">${d.puesto}º de ${cond}</span>`;
}
// Solo se marca cuando el equipo esta entre los 5 mejores o los 5 peores de la
// liga EN ESA CONDICION. No es un corte inventado: es su puesto entre los 30.
function pillCond(x) {
  const cond = x.cond === 'L' ? 'local' : 'visitante';
  const condR = x.cond === 'L' ? 'visitante' : 'local';
  const d = datoCond(x.eq, cond); if (!d || d.pj < 2) return '';
  const r = datoCond(x.riv, condR);
  const arriba = d.puesto <= 5, abajo = d.puesto > d.total - 5;
  if (!arriba && !abajo) return '';
  const ic = cond === 'local' ? '🏠' : '✈️';
  const txt = `${d.puesto}º DE ${cond === 'local' ? 'LOCAL' : 'VISITANTE'}`;
  const ay = `${NOM(x.eq)} de ${cond}: ${d.pts} puntos en ${d.pj} partidos (${d.pg}G ${d.pe}E ${d.pp}P), ${d.gf} a favor y ${d.gc} en contra. `
    + `Puesto ${d.puesto} de ${d.total} de la liga en esa condición.`
    + (r && r.pj >= 2 ? ` El rival, ${NOM(x.riv)} de ${condR}: ${r.pts} puntos en ${r.pj} (puesto ${r.puesto}).` : '')
    + ' Es un dato del torneo, no entra en el puntaje.';
  return `<span class="pill-alerta ${arriba ? 'pill-cond-bien' : 'pill-cond-mal'}" title="${esc(ay)}">${ic} ${txt}</span>`;
}
// Tabla chica para la lupita: los dos equipos, en la condicion que les toca.
function bloqueCondicion(x) {
  const cond = x.cond === 'L' ? 'local' : 'visitante';
  const condR = x.cond === 'L' ? 'visitante' : 'local';
  const filas = [[x.eq, cond, 'Su equipo'], [x.riv, condR, 'El rival']].map(([eq, c, quien]) => {
    const d = datoCond(eq, c), tot = (D.tabla || []).find(e => claveEquipo(e.equipo) === claveEquipo(eq));
    if (!d) return `<tr><td colspan="7" class="text-muted">${esc(NOM(eq))}: sin partidos de ${c} todavía</td></tr>`;
    const todos = tot ? `${tot.pts} en ${tot.pj}` : 's/d';
    return `<tr>
      <td><b>${esc(NOM(eq))}</b> <span class="text-muted">de ${c}</span></td>
      <td class="text-center">${d.pj}</td>
      <td class="text-center"><b>${d.pts}</b></td>
      <td class="text-center">${d.pg}-${d.pe}-${d.pp}</td>
      <td class="text-center">${d.gf}</td>
      <td class="text-center">${d.gc}</td>
      <td class="text-center">${d.puesto}º <span class="text-muted">de ${d.total}</span></td>
      <td class="text-center text-muted">${todos}</td>
    </tr>`;
  }).join('');
  // Corte real de xG y tiros por condicion, sin ningun ajuste: lo que
  // generaron y concedieron de local y de visitante, tal cual paso.
  const corte = (c, cond) => {
    const d = c && c[cond]; if (!d) return '<span class="text-muted">s/d</span>';
    return `${n1(d.tir)} <span class="text-muted">tiros</span> · ${n2(d.xg)} <span class="text-muted">xG</span>
            &nbsp;|&nbsp; ${n1(d.tirc)} <span class="text-muted">/</span> ${n2(d.xgc)} <span class="text-muted">en contra</span>
            <span class="text-muted">(${d.pj} PJ)</span>`;
  };
  const condMio = x.cond === 'L' ? 'local' : 'visitante';
  const condRiv = x.cond === 'L' ? 'visitante' : 'local';
  const filasXg = `
    <tr><td><b>${esc(NOM(x.eq))}</b> <span class="text-muted">de ${condMio}</span></td><td colspan="7">${corte(x.cm, condMio)}</td></tr>
    <tr><td class="text-muted">${esc(NOM(x.eq))} de ${condMio === 'local' ? 'visitante' : 'local'}</td><td colspan="7" class="text-muted">${corte(x.cm, condMio === 'local' ? 'visitante' : 'local')}</td></tr>
    <tr><td><b>${esc(NOM(x.riv))}</b> <span class="text-muted">de ${condRiv}</span></td><td colspan="7">${corte(x.cr, condRiv)}</td></tr>
    <tr><td class="text-muted">${esc(NOM(x.riv))} de ${condRiv === 'local' ? 'visitante' : 'local'}</td><td colspan="7" class="text-muted">${corte(x.cr, condRiv === 'local' ? 'visitante' : 'local')}</td></tr>`;
  return `
    <div class="md-titulo">Cómo les va en esta condición</div>
    <table class="data-table tb-cond">
      <thead><tr><th>Equipo</th><th class="text-center">PJ</th><th class="text-center">PTS</th>
        <th class="text-center">G-E-P</th><th class="text-center">GF</th><th class="text-center">GC</th>
        <th class="text-center">Puesto</th><th class="text-center">Total del torneo</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <table class="data-table tb-cond">
      <thead><tr><th>Juego generado y concedido, por condición</th><th colspan="7"></th></tr></thead>
      <tbody>${filasXg}</tbody>
    </table>
    <p class="md-p suave">Esto es el resultado real del torneo, <b>no entra en el puntaje</b>. Lo medimos:
    el corte de local y visitante de un equipo <b>no se traslada de un torneo al otro</b>, así que como
    predicción no sirve. Lo que sí usa el modelo es la ventaja de local de la liga entera, que es real
    y está medida sobre 380 partidos (1.25 de xG en casa contra 0.97 afuera).</p>`;
}

// ── OPORTUNIDADES ──────────────────────────────────────────────────────────
// El ranking normal ordena por PUNTOS de la fecha, y ahi pesan la ficha y los
// minutos. Un defensor que patea mucho pero todavia no convirtio queda
// enterrado, y son justo los que uno quiere encontrar para arriesgar.
// Esta pantalla ordena por otra cosa: AMENAZA POR 90 MINUTOS EN LA CANCHA.
// Es el mismo numero que usa el motor (goles esperados del jugador en este
// partido) pero dividido por los minutos que se espera que juegue, asi que no
// premia ni castiga al que juega mucho o poco: mide el ritmo, no el volumen.
// No filtra por probabilidad de jugar: eso lo mira uno.
function amenaza90(x) {
  if (x.lg == null || !x.msj) return null;
  return x.lg / (x.msj / 90);
}
// ── EL CRUCE DE CONDICIONES ────────────────────────────────────────────────
// Lo que pedia facu: "este equipo es muy fuerte de local y el rival muy debil
// de visitante". Se arma con los goles REALES del torneo, cortados por
// condicion: cuanto mete cada equipo jugando de local (o de visitante) y
// cuanto recibe. El puesto es entre los 30, asi que no hay ningun umbral
// inventado: el tercio de arriba son los 10 primeros.
//
// OJO — esto NO entra en el puntaje, y es a proposito. Ya lo medimos: el corte
// de local/visitante de un equipo no se traslada de un torneo al otro, asi que
// como prediccion no sirve. Lo que si usa el modelo es la ventaja de local de
// la liga entera (+30% de xG), que esa si es real.
let _CRUCE = null;
function crucesCond() {
  if (_CRUCE) return _CRUCE;
  const t = (D && D.tabla) || [];
  const arma = (cond, campo, mayorMejor) => {
    const filas = t.map(e => ({ k: claveEquipo(e.equipo), eq: e.equipo,
        pj: (e[cond] || {}).pj || 0, v: ((e[cond] || {})[campo] || 0) / Math.max(1, (e[cond] || {}).pj || 1) }))
      .filter(e => e.pj > 0)
      .sort((a, b) => mayorMejor ? b.v - a.v : a.v - b.v);
    const m = {}; filas.forEach((e, i) => { m[e.k] = { puesto: i + 1, total: filas.length, v: e.v, pj: e.pj }; });
    return m;
  };
  _CRUCE = {
    ataque:  { local: arma('local', 'gf', true),  visitante: arma('visitante', 'gf', true) },
    // en defensa el puesto 1 es el que MENOS recibe; el 30 es el mas goleado
    defensa: { local: arma('local', 'gc', false), visitante: arma('visitante', 'gc', false) }
  };
  return _CRUCE;
}
function cruceDe(x) {
  const c = crucesCond();
  const condMio = x.cond === 'L' ? 'local' : 'visitante';
  const condRiv = x.cond === 'L' ? 'visitante' : 'local';
  const atk = c.ataque[condMio][claveEquipo(x.eq)];
  const def = c.defensa[condRiv][claveEquipo(x.riv)];
  if (!atk || !def || atk.pj < 2 || def.pj < 2) return null;
  const tercio = Math.round(atk.total / 3);
  return { atk, def, condMio, condRiv,
    // ataque en el tercio de arriba Y defensa rival en el tercio de abajo
    caliente: atk.puesto <= tercio && def.puesto > def.total - tercio };
}

const NOMBRE_POS_L = { ARQ: 'Arqueros', DEF: 'Defensores', VOL: 'Volantes', DEL: 'Delanteros' };
const S_OP = { pos: 'DEF', min: 180, ord: 'am', dir: -1 };

// UNA BARRA DE ORDEN, NO LINKS ADENTRO DEL ENCABEZADO.
// Se probó meter dos links chiquitos abajo de cada título y quedaron
// ilegibles y encimados con el título. Los criterios de orden ahora van
// arriba de la tabla, en una barra que se lee de un vistazo, y los
// encabezados vuelven a ser etiquetas y nada más.
// UNA COLUMNA, UN ORDEN (03/09). Antes habia una barra "ORDENAR POR" con doce
// botones, y la mitad ordenaba por cosas que no eran ninguna columna de la
// tabla: se ordenaba por "goles" y no habia columna de goles a la vista, asi
// que no se veia por que se movian las filas. En Jugadores el orden se toca en
// el titulo de la columna desde siempre y funciona bien. Aca igual: cada
// columna es UN dato y se ordena tocandola. Nada de datos escondidos adentro de
// otra celda.
const COLS_OP = [
  ['#',        null,     ''],
  ['Jugador',  null,     ''],
  ['Amenaza/90', 'am',   'Su parte del ataque × los goles que se espera que meta su equipo HOY, llevado a 90 minutos en la cancha. El rival ya está adentro: los goles esperados del equipo salen de las cuotas del partido, que conocen a los dos. OJO: es solo la chance de gol. Un jugador puede ser el primero de esta columna y estar muy abajo en PUNTOS, porque el puntaje también tiene la ficha, la valla y la chance de jugar — mirá el puesto que dice al lado del nombre'],
  ['Cruce',    'defriv', 'Puesto del rival recibiendo goles en la condición que le toca: el 30 es el más goleado'],
  ['Tiros/90', 'tiros',  'Tiros por cada 90 minutos en la cancha'],
  ['xG/90',    'xg',     'Goles esperados sin penales por cada 90 minutos en la cancha'],
  ['Goles',    'goles',  'Goles convertidos en el torneo'],
  ['Le deben', 'debe',   'xG sin penales menos los goles que hizo. Arriba de cero, genera más de lo que convierte'],
  ['Minutos',  'min',    'Minutos jugados en el torneo'],
  ['Si juega', 'msj',    'Minutos que juega cuando ARRANCA de titular, y abajo los últimos tres que arrancó. Los ratos de suplente no cuentan'],
];

function pintarOportunidades() {
  const cont = $('pantalla-oportunidades'); if (!cont || !D) return;
  const pool = D.rankings[S_OP.pos] || [];
  // Puesto en el ranking normal, para poder comparar
  const puestoEP = {};
  [...pool].sort((a, b) => (b.epsj ?? -1) - (a.epsj ?? -1)).forEach((x, i) => { puestoEP[x.id] = i + 1; });

  // Un valor por columna. Cada uno es exactamente lo que se ve en esa celda:
  // si ordenás por goles, se mueve la columna Goles, no un número escondido.
  const valOp = (x, k) => {
    const i = x.ind || {}, n90 = (i.minutos || 1) / 90;
    const c = cruceDe(x);
    switch (k) {
      case 'am': return x.am;
      case 'defriv': return c ? c.def.puesto : -99;        // puesto 30 = mas goleado
      case 'tiros': return (i.tiros || 0) / n90;
      case 'xg': return (x.xgT != null ? x.xgT : 0) / n90;
      case 'goles': return i.goles || 0;
      case 'debe': return (x.xgT != null ? x.xgT : 0) - (i.goles || 0);
      case 'min': return i.minutos || 0;
      case 'msj': return x.msj ?? -1;
      default: return x.am;
    }
  };
  const lista = pool
    .filter(x => x.ind && (x.ind.minutos || 0) >= S_OP.min && amenaza90(x) != null)
    .map(x => ({ ...x, am: amenaza90(x), pEP: puestoEP[x.id] }))
    .sort((a, b) => S_OP.dir * (valOp(a, S_OP.ord) - valOp(b, S_OP.ord)));

  const valGol = { ARQ: 12, DEF: 9, VOL: 6, DEL: 4 }[S_OP.pos];

  // UNA COLUMNA, UN DATO. Antes tiros y xG compartían celda, y goles y "le
  // deben" también: ordenar por goles movía filas sin que se viera por qué.
  const filas = lista.slice(0, 30).map((x, i) => {
    const i2 = x.ind;
    const debe = (x.xgT != null ? x.xgT : 0) - (i2.goles || 0);
    const c = cruceDe(x);
    const ayCruce = c ? `${NOM(x.eq)} de ${c.condMio}: ${n2(c.atk.v)} goles por partido en ${c.atk.pj} partidos, puesto ${c.atk.puesto} de ${c.atk.total}. `
      + `${NOM(x.riv)} de ${c.condRiv}: recibe ${n2(c.def.v)} por partido en ${c.def.pj} partidos, puesto ${c.def.puesto} de ${c.def.total} (el 1 es el que menos recibe). `
      + `OJO: con ${Math.min(c.atk.pj, c.def.pj)} partidos la muestra es chica — un "0.00 recibidos" no quiere decir que no reciban nunca. `
      + `Esto NO ordena la tabla ni entra en el puntaje: medimos que el corte local/visitante de un equipo no se traslada de un torneo al otro, así que como predicción no sirve. Está para mirarlo, no para decidir con esto.`
      + (c.caliente ? ` 🔥 = su equipo ataca en el tercio de arriba en esta condición Y el rival recibe en el tercio de abajo. Es el mejor cruce posible, y aun así no mueve el puntaje.` : '') : '';
    const roto = x.dimp || x.dpar;
    // Las etiquetas salen de pintarAvisos, igual que en el ranking y en la
    // ficha. Esta tabla se las armaba sola y por eso se le escapaban estados:
    // "Jugó Copa" y "Habilitado" no aparecian en ningun lado (03/09).
    return `<tr style="cursor:pointer;" onclick="auditar('${x.id}')">
      <td class="text-center"><b>${i + 1}</b></td>
      <td><div class="player-info"><div class="player-name">${esc(nombreCorto(x.n))}${x.pEP ? `<span class="op-pep${x.pEP > 30 ? ' op-pep-lejos' : ''}" title="${esc(`En el ranking de PUNTOS de su puesto va ${x.pEP}º. Esta pantalla está ordenada por amenaza de gol, que es una sola pieza del puntaje: el resto es la ficha, la valla y la chance de jugar. Un número muy alto acá quiere decir que genera gol pero el puntaje esperado no lo acompaña.`)}">${x.pEP}º en puntos</span>` : ''}</div>
        <div class="player-sub">${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'L' : 'V'} vs ${esc(NOM(x.riv))}</div>
        <div class="player-tags">${x.tr && x.tr.manual ? `<span class="pill-alerta pill-pase" title="${esc(`Pasó de ${x.tr.desde} a ${x.tr.hacia}${x.tr.cuando ? ' el ' + x.tr.cuando : ''}. Ni la planilla ni el Ayudante de campo lo tienen todavía: el club, el rival y la condición se cargaron a mano. Fijate en el juego antes de ponerlo.`)}">PASE RECIENTE</span>` : ''}${pintarAvisos(x)}${pillCond(x)}${x.pen > 0 ? `<span class="pill-alerta pill-penal">⚫ PENALES ${x.pen}</span>` : ''}</div></div></td>
      <td class="text-center">
        <div class="op-am">${String(+x.am.toFixed(3))}</div>
        <div class="op-cuenta" title="Su parte del ataque de su equipo, por los goles que se espera que ese equipo meta hoy.">${x.sh != null ? pc0(x.sh) : '—'} × <span style="color:${x.lam && x.lam.f >= 1.6 ? 'var(--success)' : x.lam && x.lam.f <= 1 ? 'var(--danger)' : 'inherit'};">${n2(x.lam && x.lam.f)}</span></div>
      </td>
      <td class="text-center">${c
        ? `<span class="cruce${c.caliente ? ' cruce-on' : ''}" title="${esc(ayCruce)}">${c.caliente ? '<span class="cruce-fuego">🔥</span>' : ''}
            <span class="cruce-l"><b>${c.atk.puesto}º</b> metiendo <i>${c.atk.pj}pj</i></span>
            <span class="cruce-l"><b>${c.def.puesto}º</b> el rival recibe <i>${c.def.pj}pj</i></span>
          </span>`
        : '<span class="text-muted">—</span>'}</td>
      <td class="text-center">${por90(x, 'tiros', 't90', v => n1(v))}</td>
      <td class="text-center">${por90(x, 'xg', 'x90', v => String(+Number(v).toFixed(2)))}</td>
      <td class="text-center"><b>${i2.goles || 0}</b></td>
      <td class="text-center"><b style="color:${debe > 0.5 ? 'var(--success)' : debe < -0.5 ? 'var(--danger)' : ''};">${debe > 0 ? '+' : ''}${String(+debe.toFixed(2))}</b></td>
      <td class="text-center">${i2.minutos}'${i2.partidosSinDato ? `<div class="op-cuenta dato-parcial" title="A 365Scores le faltan ${i2.partidosSinDato} partido(s) suyos: los minutos y los tiros salen de menos fútbol del que jugó.">le faltan ${i2.partidosSinDato}</div>` : ''}</td>
      <td class="text-center">${celdaMinutos(x)}</td>
    </tr>`;
  }).join('');

  const th = COLS_OP.map(([titulo, k, ayuda]) => {
    if (!k) return `<th class="${titulo === '#' ? 'text-center' : ''}">${titulo}</th>`;
    const act = S_OP.ord === k;
    return `<th class="text-center col-ordenable${act ? ' col-ordenada' : ''}" data-op-ord="${k}"
      title="${esc(ayuda)}" style="cursor:pointer;">${titulo}${act ? `<span class="orden-flecha">${S_OP.dir === -1 ? '▼' : '▲'}</span>` : ''}</th>`;
  }).join('');

  cont.innerHTML = `
    <div class="op-hero">
      <div>
        <div class="fecha-eyebrow">Fecha ${D.fechaObjetivo ?? '–'}</div>
        <h1>Oportunidades</h1>
        <p>Quién genera más gol <b>por cada 90 minutos en la cancha</b>, sin importar cuánto juegue ni qué ficha traiga.
        Un gol de ${{ARQ:'arquero',DEF:'defensor',VOL:'volante',DEL:'delantero'}[S_OP.pos]} paga <b>${valGol}</b>.
        <b>Tocá el título de una columna para ordenar por esa.</b></p>
      </div>
      <div class="op-controles">
        <div class="main-tabs">${['ARQ', 'DEF', 'VOL', 'DEL'].map(p =>
          `<button class="tab-btn${S_OP.pos === p ? ' active' : ''}" data-op-pos="${p}">${p}</button>`).join('')}</div>
        <label class="orden-check">Mínimo de minutos jugados
          <select id="op-min" class="select-equipo" style="max-width:110px;">
            ${[90, 180, 270, 450].map(v => `<option value="${v}"${S_OP.min === v ? ' selected' : ''}>${v}'</option>`).join('')}
          </select>
        </label>
      </div>
    </div>
    <div class="card">
      <table class="data-table tb-op">
        <thead><tr>${th}</tr></thead>
        <tbody>${filas || `<tr><td colspan="10" style="text-align:center;padding:26px;color:var(--text-muted);">Ninguno llega a ${S_OP.min} minutos jugados.</td></tr>`}</tbody>
      </table>
      <div class="tabla-referencia">
        <b>Amenaza/90 = su parte del ataque × gol del equipo hoy</b>, llevado a 90 minutos; los dos factores están abajo del número.
        <b>El rival ya está adentro</b>: los goles esperados del equipo salen de las cuotas de este partido, así que un rival flojo
        levanta a todo el equipo. Por eso alguien con menos tiros puede quedar más arriba.
        <b>Cruce</b>: el puesto de su equipo metiendo goles en la condición que le toca y el del rival recibiéndolos en la suya —
        el 30 es el más goleado. Al lado de cada puesto va <b>sobre cuántos partidos</b> está hecho, y son pocos: con 7 fechas
        nadie llegó a 4 partidos en las dos condiciones, así que un "0.00 recibidos de visitante" sale de tres partidos y no
        quiere decir que no reciban nunca.
        <b>El cruce no ordena esta tabla</b> — el orden es por Amenaza/90, que sale de las cuotas de HOY. Por eso podés ver a
        alguien primero con un cruce feo: el mercado le está dando goles a su equipo igual. Cuando los dos extremos coinciden
        aparece 🔥. Medimos que el corte local/visitante no se traslada de un torneo al otro, así que <b>no entra en el
        puntaje</b>; lo que sí usa el modelo es la ventaja de local de la liga entera, +30% de xG.
        <b>Si juega</b> son los minutos que aguanta <b>cuando arranca de titular</b>, leídos de sus partidos: los ratos de suplente no cuentan
        y no le bajan el número.
        Un <sup class="falta-mark">−1</sup> al lado de un número quiere decir que a 365Scores le falta ese partido del jugador: el número sale de los que sí tenemos.
        No se filtra por nada: los lesionados y los que están en duda aparecen con su cartel y lo mirás vos.
      </div>
    </div>`;

  cont.querySelectorAll('[data-op-pos]').forEach(b => b.onclick = () => { S_OP.pos = b.dataset.opPos; pintarOportunidades(); });
  cont.querySelectorAll('[data-op-ord]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const k = b.dataset.opOrd;
    if (S_OP.ord === k) S_OP.dir *= -1; else { S_OP.ord = k; S_OP.dir = -1; }
    pintarOportunidades();
  });
  const sm = $('op-min'); if (sm) sm.onchange = () => { S_OP.min = +sm.value; pintarOportunidades(); };
}

// ── PANTALLA DEL MEJOR 11 ───────────────────────────────────────────────────
// Era un modal apretado. Ahora es una seccion propia, con la cancha grande, el
// banco de cuatro suplentes —uno por puesto, como en el juego— y un panel para
// probar cambios sin salir de la pantalla.
const S_ONCE = { banco: null, cambiando: null };

// Suplentes: el mejor de cada puesto que NO esta en el once. En Gran DT el
// suplente entra cuando el titular de su puesto no juega, asi que lo que
// importa es que juegue: se ordena por puntos descontando la chance de no jugar.
// ════════════════════════════════════════════════════════════════════════════
//  EL ONCE QUE VOS EDITASTE SE GUARDA (17/09)
//  ------------------------------------------------------------------------
//  Hasta hoy NO SE GUARDABA. Literal: S.once salia de datos.js en cada carga y
//  cada cambio —un ⇅, un ✕, cambiar de esquema— vivia solo en memoria. Armabas
//  el equipo, sacabas a los que sabias que no jugaban, recargabas la pagina y
//  estaba todo como al principio. No habia ningun localStorage.setItem para el
//  once: por eso "no se guarda" era exactamente cierto.
//
//  Ahora se guarda solo, en cuanto tocas algo, POR CLAVE ESTABLE
//  (nombre@club@puesto) y no por id: los ids son el numero de fila de la
//  planilla de Planeta y se corren en cuanto Planeta publica una nueva.
//
//  Y SE ARRASTRA A LA FECHA SIGUIENTE. Esto es lo que mas rompia: el armado se
//  hace justo cuando el motor pasa de una fecha a la otra, asi que lo que
//  armabas el martes quedaba guardado bajo la fecha vieja y el viernes, con el
//  motor ya en la fecha nueva, aparecia vacio.
const CLAVE_ONCE = f => 'gdt_once_f' + (f != null ? f : ((D && D.fechaObjetivo != null) ? D.fechaObjetivo : 'x'));
const ONCE_MIRAR_ATRAS = 6;

function guardarOnceEditado() {
  try {
    if (!S_ONCE.editado) return;
    const banco = {};
    ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => {
      const id = S_ONCE.banco && S_ONCE.banco[p];
      banco[p] = id ? (claveDe(id) || null) : null;
    });
    localStorage.setItem(CLAVE_ONCE(), JSON.stringify({
      kOnce: clavesDesdeIds(S.once), kBanco: banco, esq: S.esquema,
      cuando: new Date().toISOString()
    }));
  } catch (e) { }
}

function cargarOnceEditado() {
  S_ONCE.editado = false; S_ONCE.heredadoDe = null; S_ONCE.perdidos = 0;
  let r = null, deFecha = null;
  try {
    r = JSON.parse(localStorage.getItem(CLAVE_ONCE()) || 'null');
    if (!r && D && D.fechaObjetivo != null) {
      for (let f = D.fechaObjetivo - 1; f >= D.fechaObjetivo - ONCE_MIRAR_ATRAS && f >= 1; f--) {
        const v = JSON.parse(localStorage.getItem(CLAVE_ONCE(f)) || 'null');
        if (v && Array.isArray(v.kOnce) && v.kOnce.length >= 7) { r = v; deFecha = f; break; }
      }
    }
  } catch (e) { return false; }
  if (!r || !Array.isArray(r.kOnce) || r.kOnce.length < 7) return false;

  const q = idsDesdeClaves(r.kOnce);
  // un jugador que se fue del torneo ya no resuelve; si faltan muchos, el once
  // guardado es de otra epoca y es mas honesto volver al del motor
  if (q.ids.length < 7) return false;
  S.once = q.ids.slice();
  S_ONCE.perdidos = (q.perdidas || []).length;
  if (r.esq) S.esquema = r.esq;
  S_ONCE.banco = {};
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => {
    const k = r.kBanco && r.kBanco[p];
    const j = k ? porClave(k) : null;
    S_ONCE.banco[p] = (j && !S.once.includes(j.id)) ? j.id : null;
  });
  // los huecos del banco (alguien que se fue, o que ahora es titular) se
  // rellenan con el criterio de siempre
  const auto = armarBanco();
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => { if (!S_ONCE.banco[p]) S_ONCE.banco[p] = auto[p]; });
  S_ONCE.editado = true;
  S_ONCE.heredadoDe = deFecha;
  return true;
}

window.volverAlOnceDelMotor = function () {
  if (!confirm('¿Volver al once que recomienda el motor?\n\nSe pierden los cambios que hiciste en este once. Los jugadores que tildaste con la ✕ se mantienen.')) return;
  try { localStorage.removeItem(CLAVE_ONCE()); } catch (e) { }
  S_ONCE.editado = false; S_ONCE.heredadoDe = null; S_ONCE.perdidos = 0;
  S.esquema = D.esquema.optimo.esquema;
  S.once = D.esquema.optimo.once.map(x => x.id);
  S_ONCE.banco = null; S_ONCE.cambiando = null;
  rearmarOnce();
  pintarPantallaOnce();
};

// ════════════════════════════════════════════════════════════════════════════
//  EXPORTAR TU ONCE A equipos.txt (18/09)
//  ------------------------------------------------------------------------
//  Tu once vive en el localStorage de ESTE navegador. Eso quiere decir que si
//  lo armas en la PC de casa y despues abris la pagina en el laburo, o en el
//  celular, o en Vercel, no esta: localStorage es por navegador Y por origen,
//  asi que hasta abrir el index.html local y abrir la version publicada son
//  dos cajones distintos en la misma maquina.
//
//  Lo que SI viaja con la app son los archivos: dataLiga.js (el torneo) y
//  dataFotos.js (el historial). Por eso la salida de todo esto es un archivo:
//  pegas este bloque en equipos.txt, corres ARMAR_LIGA.bat, y tu once pasa a
//  ser un equipo mas del torneo — auditado, publicado y visible desde cualquier
//  maquina, igual que los de tus amigos.
//
//  SIEMPRE SE ESCRIBE EL CLUB. equipos.txt lo permite omitir, pero omitirlo es
//  exactamente lo que hizo perder 9 puntos en la fecha 9: habia dos Ledesma
//  arqueros y el archivo decia solo "Ledesma (instituto)". Con el club puesto
//  en las quince lineas, esa ambiguedad no puede volver a pasar.
function apellidoDe(n) {
  const s = String(n || '').trim();
  return s.includes(',') ? s.split(',')[0].trim() : (s.split(/\s+/).slice(-1)[0] || s);
}
function bloqueEquiposTxt(nombreEquipo) {
  const cap = S.capitan;
  const linea = (id, esCap) => {
    const p = TODOS[id]; if (!p) return null;
    return apellidoDe(p.n) + ' (' + NOM(p.eq) + ')' + (esCap ? ' (C)' : '');
  };
  const orden = { ARQ: 0, DEF: 1, VOL: 2, DEL: 3 };
  const tit = S.once.slice().filter(id => TODOS[id])
    .sort((a, b) => orden[TODOS[a].pos] - orden[TODOS[b].pos])
    .map(id => linea(id, id === cap)).filter(Boolean);
  const banco = ['ARQ', 'DEF', 'VOL', 'DEL']
    .map(pos => (S_ONCE.banco && S_ONCE.banco[pos]) ? linea(S_ONCE.banco[pos], false) : null)
    .filter(Boolean);
  const faltaCap = !tit.some(l => / \(C\)$/.test(l));
  return {
    txt: '= ' + (nombreEquipo || 'Mi equipo') + '\n' + tit.join('\n') +
         (banco.length ? '\n-- suplentes\n' + banco.join('\n') : '') + '\n',
    nTit: tit.length, nBanco: banco.length, faltaCap
  };
}
window.exportarMiOnce = function () {
  const guardado = (() => { try { return localStorage.getItem('gdt_mi_nombre_equipo') || ''; } catch (e) { return ''; } })();
  const nombre = prompt('¿Cómo se llama tu equipo en el Gran DT?\n\n' +
    'Tiene que ser igual al del juego: así el auditor lo cruza con la tabla oficial.', guardado || '');
  if (nombre == null) return;
  try { localStorage.setItem('gdt_mi_nombre_equipo', nombre); } catch (e) { }
  const b = bloqueEquiposTxt(nombre);
  const avisos = [];
  if (b.nTit !== 11) avisos.push('Tu once tiene <b>' + b.nTit + '</b> titulares y tienen que ser 11.');
  if (b.nBanco !== 4) avisos.push('Tenés <b>' + b.nBanco + '</b> suplentes y tienen que ser 4, uno por puesto.');
  if (b.faltaCap) avisos.push('No hay capitán marcado: poné la <b>C</b> en alguno antes de exportar.');
  modalTexto('Tu once para el torneo', `
    ${avisos.length ? `<div class="exp-mal">${avisos.join('<br>')}</div>` : ''}
    <p class="exp-p">Copiá esto y pegalo al final de <code>equipos.txt</code>. Después corré
      <b>ARMAR_LIGA.bat</b> y tu equipo entra al torneo como uno más: lo audita
      <code>AUDITAR_TORNEO.bat</code> contra la tabla oficial y lo ven tus amigos desde cualquier máquina.</p>
    <textarea id="exp-txt" class="exp-txt" readonly rows="${b.nTit + b.nBanco + 3}">${esc(b.txt)}</textarea>
    <div class="exp-botones">
      <button class="vs-btn vs-btn-fuerte" onclick="copiarMiOnce()">copiar al portapapeles</button>
      <span id="exp-ok" class="exp-ok"></span>
    </div>
    <p class="exp-p exp-chico">El club va escrito en las quince líneas a propósito. En la fecha 9 había dos
      Ledesma arqueros, el archivo no aclaraba cuál era y esos 9 puntos no aparecían por ningún lado.</p>`);
};
window.copiarMiOnce = function () {
  const t = $('exp-txt'); if (!t) return;
  t.select(); t.setSelectionRange(0, 99999);
  const ok = $('exp-ok');
  const listo = () => { if (ok) { ok.textContent = '✓ copiado'; setTimeout(() => { ok.textContent = ''; }, 2500); } };
  // el portapapeles moderno no anda en file://, asi que queda el de siempre
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t.value).then(listo, () => { try { document.execCommand('copy'); listo(); } catch (e) { } });
  } else { try { document.execCommand('copy'); listo(); } catch (e) { } }
};

function armarBanco() {
  // EL BANCO LO ELIGE EL MOTOR (17/09). Antes se armaba solo aca, en el
  // navegador, y por eso no existia en ningun archivo: no entraba en salida.json,
  // ni en la foto de Revision, ni lo veia ningun auditor. Consecuencia concreta:
  // en la fecha 9 el once del motor figuraba "8 de 11 jugaron, 72 puntos",
  // comiendose tres ceros que un banco habria cubierto.
  //
  // El criterio es el MISMO que el de los titulares (epsj, lo que suma si entra
  // a la cancha): el suplente es una alternativa de titular, no un seguro. El
  // motor no descarta a nadie por creer que no va a jugar — eso lo tildas vos.
  //
  // Si vos editaste el once, el banco del motor puede tener a alguien que ahora
  // es titular tuyo: en ese caso se rearma aca, con el mismo criterio.
  const delMotor = (D.esquema && D.esquema.optimo && D.esquema.optimo.banco &&
                    Array.isArray(D.esquema.optimo.banco.jugadores))
    ? D.esquema.optimo.banco.jugadores : null;
  const b = {};
  let sirveElDelMotor = !!delMotor;
  if (delMotor) {
    delMotor.forEach(j => { if (j && j.pos) b[j.pos] = j.id || null; });
    ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => {
      const id = b[p];
      if (!id || !TODOS[id] || S.once.includes(id) || estaFuera(TODOS[id])) sirveElDelMotor = false;
    });
  }
  if (sirveElDelMotor) return b;

  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => {
    // el suplente nunca es alguien que yo ya tilde como que no juega: seria un
    // banco de mentira. Se ordena por epsj —lo que suma SI entra— igual que los
    // titulares: el suplente es una alternativa de titular, no un seguro.
    const cand = (D.rankings[p] || [])
      .filter(x => !S.once.includes(x.id) && !estaFuera(x))
      .sort((a, c) => (c.epsj ?? c.ep ?? -1) - (a.epsj ?? a.ep ?? -1));
    b[p] = cand.length ? cand[0].id : null;
  });
  return b;
}

function fichaCancha(p, opts) {
  const o = opts || {};
  const cap = p.id === S.capitan;
  const otro = S.esquema === '__riesgo'
    ? D.esquema.optimo.once.map(z => z.id)
    : (D.arriesgado ? D.arriesgado.ids : null);
  const distinto = !o.banco && otro && !otro.includes(p.id);
  const avisos = [];
  if (p.disp && p.disp.suspendido) avisos.push(['SUSP', '#ef4444', 'Suspendido: no juega']);
  else if (p.fmin === 'al banco (once confirmado)') avisos.push(['BANCO', '#f59e0b', 'Su equipo confirmó el once y no está']);
  else if (p.pj_ != null && p.pj_ < 0.6) avisos.push([pc0(p.pj_), '#f59e0b',
    'Se perdió fechas recientes. NO le baja el puntaje —el motor asume que juega— pero andá a fijarte por qué faltó: si está lesionado, tildalo con la ✕ y el once se rearma sin él.']);
  return `<div class="ficha11${cap ? ' es-capitan' : ''}${distinto ? ' es-distinto' : ''}${o.banco ? ' es-suplente' : ''}${S_ONCE.cambiando === p.id ? ' cambiando' : ''}"
       data-id="${p.id}">
    <div class="f11-top">
      <button class="f11-swap" title="Ver alternativas para este puesto">⇅</button>
      ${o.banco ? '' : `<button class="f11-cap${cap ? '' : ' f11-cap-off'}" data-capitan="${p.id}"
        title="${esc((cap ? 'Es el capitán. ' : 'Ponerle la cinta. ') +
          'La cinta duplica la ficha. Promedio ' + n2(p.fi) + ', esperada en este partido ' + n2(fichaCap(p)) +
          ' (su equipo gana el ' + Math.round(100 * (p.lam ? p.lam.w : 0)) + '%).')}">C</button>`}
      <button class="f11-x" data-sacar="${p.id}"
        title="No juega esta fecha: sacalo y el once se rearma sin él. Es el mismo tilde que en La fecha.">✕</button>
    </div>
    <div class="f11-jersey">${jersey(p.pos)}<span class="f11-num"
      title="${esc('Puntos si entra a la cancha' + (cap ? ', con la cinta ya sumada' : '') + '. Cotización ' + plata(p.pr) +
        (p.msj != null ? ', juega ' + p.msj + " minutos cuando arranca" : ''))}">${n1(cap ? (p.epsj ?? p.ep) + p.fi : (p.epsj ?? p.ep))}</span></div>
    <div class="f11-nombre">${esc(nombreCorto(p.n))}</div>
    <div class="f11-eq">${esc(NOM(p.eq))} · ${p.cond === 'L' ? 'L' : 'V'} ${esc(NOM(p.riv))}</div>
    ${avisos.length ? `<div class="f11-avisos">${avisos.map(([t, c, ay]) =>
      `<span style="color:${c};border-color:${c}66;" title="${esc(ay)}">${t}</span>`).join('')}</div>` : ''}
  </div>`;
}

// AVISO DE TILDADOS (05/09). El once solido se rehace solo cuando tildas a
// alguien; el arriesgado no, asi que si quedo un tildado adentro hay que
// decirlo en vez de mostrar un once que sabemos que esta roto.
function avisoDescartes(esR) {
  const rotos = esR ? tildadosEnRiesgo() : [];
  // LA LISTA DE TILDADOS SE FUE DE ACA (13/09). Estaba repetida: los descartes
  // de la ✕ ya viven en el menu de los tres puntitos, con su "deshacer todos".
  // Tenerla arriba de Mejor 11 ademas ocupaba una barra entera para algo que se
  // toca una vez por fecha, que es justo el motivo por el que se habia movido
  // al menu. Lo que SI se queda es el aviso rojo de abajo, porque ese no esta
  // en ningun otro lado: avisa que el once arriesgado quedo roto.
  if (!rotos.length) return '';
  return `<div class="aviso-fuera">
    <div class="af-rojo">⚠️ El once <b>arriesgado</b> tiene
      ${rotos.length} tildado${rotos.length > 1 ? 's' : ''} adentro
      (${rotos.map(id => esc(nombreCorto((TODOS[id] || {}).n || '?'))).join(', ')}).
      Ese once sale de la simulación y no se rehace en la página: hay que correr
      <code>RECALCULAR</code> para que lo tenga en cuenta.</div>
  </div>`;
}

// El panel que explica el once: que empata con el, que riesgos tiene y quien
// estuvo a punto de entrar. Va abajo de la cancha porque es para revisar la
// decision, no para tomarla.
function bloqueAnalisis() {
  const a = analisisOnce(); if (!a) return '';
  const tarj = (tit, cuerpo, nota) => `<div class="an-card"><h3>${tit}</h3>${cuerpo}${nota ? `<p class="an-nota">${nota}</p>` : ''}</div>`;

  // los diez cambios que menos cuestan, sean de jugador o de formación
  const cambios = a.cambios.slice(0, 10);
  const cAlt = cambios.length ? `<div class="cambios-lista">${cambios.map(c => {
      const barato = c.costo <= 0.15;
      const accion = c.tipo === 'esquema'
        ? `cambiarEsquema('${c.esquema}')`
        : `hacerCambio('${c.sale.id}','${c.entra.id}')`;
      return `<button class="cam-fila${barato ? ' cam-barato' : ''}" onclick="${accion}"
        title="${esc(c.tipo === 'esquema'
          ? 'Pasa a ' + esquemaLindo(c.esquema) + ': entra ' + c.entraN + ' y sale ' + c.saleN + '.'
          : 'Pone a ' + c.entraN + ' (' + c.entraEq + ') en lugar de ' + c.saleN + ' (' + c.saleEq + '), sin tocar la formación.')}">
        <span class="cam-entra">${esc(c.entraN)}</span>
        <span class="cam-flecha">por</span>
        <span class="cam-sale">${esc(c.saleN)}</span>
        <span class="cam-meta">${c.esquema ? esquemaLindo(c.esquema) : 'misma formación'}</span>
        <span class="cam-costo${barato ? ' cam-costo-ok' : ''}">${c.costo <= 0 ? '+' + n2(-c.costo) : '−' + n2(c.costo)}</span>
      </button>`;
    }).join('')}</div>`
    : '<p class="an-vacio">No hay cambios para ofrecer.</p>';

  const cClub = a.clubes.length ? `<ul class="an-lista">${a.clubes.map(x => `<li>
      <b>${esc(x.eq)}</b> <span class="an-sub">${x.n} jugadores · ${n1(x.pts)} puntos, el ${Math.round(100 * x.pts / totalOnce())}% del once</span>
      <div class="an-quienes">${x.quienes.map(esc).join(' · ')}</div></li>`).join('')}</ul>`
    : '<p class="an-vacio">Ninguno repetido: los once son de clubes distintos.</p>';

  const cRiesgo = [];
  a.vallaJunta.forEach(v => cRiesgo.push(`<li><b>${esc(v.eq)}</b>
    <span class="an-sub">${v.n} cobran la <b>misma</b> valla invicta</span>
    <div class="an-quienes">${v.quienes.map(esc).join(' · ')}</div></li>`));
  a.cruces.forEach(c => cRiesgo.push(`<li><b>${esc(c.ataca)}</b> <span class="an-sub">ataca el arco de ${esc(c.contra)} (${esc(c.clubD)})</span>
    <div class="an-quienes">si uno cobra, el otro no — es cobertura, no un error</div></li>`));
  const cCruces = cRiesgo.length ? `<ul class="an-lista">${cRiesgo.join('')}</ul>`
    : '<p class="an-vacio">Sin vallas repetidas ni ataques contra tu propio arco.</p>';

  return `<div class="analisis-once">
    <div class="an-cab"><h2>Por qué este once</h2>
      <p>Ninguna de estas cosas le baja el puntaje esperado —la suma de promedios no depende de cómo se
      correlacionen entre sí— pero cambian la <b>forma</b> de la fecha. Están acá para que las decidas vos.</p></div>
    <div class="an-grid an-grid-ancho">
      ${tarj('🔁 Los cambios que menos cuestan', cAlt,
        'Cada línea es un movimiento: <b>entra</b> el de la izquierda por el de la derecha, y a la derecha del todo lo que te cuesta en puntos. ' +
        'Tocá cualquiera y se aplica. Los <b>resaltados</b> cuestan menos de 0,15 — a esa distancia es un empate y podés elegir por criterio propio. ' +
        'Los que dicen una formación te la cambian; el resto respeta la que tenés.')}
      ${tarj('🏟️ Cuántos del mismo club', cClub,
        'Suben y bajan juntos. No cambia el promedio; sí la diferencia entre una fecha regular y un desastre.')}
      ${tarj('🔀 Riesgos cruzados', cCruces,
        'La valla invicta la cobra el equipo entero: dos del mismo club es una sola jugada, no dos.')}
    </div>
  </div>`;
}

function pintarPantallaOnce() {
  const cont = $('pantalla-once'); if (!cont || !D) return;
  recalcCapitan();
  if (!S_ONCE.banco) S_ONCE.banco = armarBanco();

  const porPos = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  S.once.forEach(id => { const p = TODOS[id]; if (p) porPos[p.pos].push(p); });
  Object.values(porPos).forEach(a => a.sort((x, y) => (y.epsj ?? y.ep) - (x.epsj ?? x.ep)));

  const t = totalOnce(), { c, sd } = costoOnce();
  const esR = S.esquema === '__riesgo';
  const cap = TODOS[S.capitan];
  const esquemaTxt = esR ? esquemaLindo(D.arriesgado ? D.arriesgado.esquema : '') : esquemaLindo(S.esquema);

  // EL SELECTOR TIENE QUE MOSTRAR EL ESQUEMA QUE SE ESTA VIENDO (04/09).
  // En el arriesgado quedaba deshabilitado pero marcando el esquema del solido:
  // decia "3-4-3" arriba de un once que era 4-4-2. El esquema del arriesgado lo
  // elige la simulacion, no vos, por eso el selector sigue deshabilitado — pero
  // ahora al menos dice la verdad.
  const esqVista = esR ? ((D.arriesgado && D.arriesgado.esquema) || S.esquema) : S.esquema;
  const norm11 = v => String(v || '').replace(/^1-/, '');
  const listaEsq = (S.oncesLocales && S.oncesLocales.length) ? S.oncesLocales : D.esquema.todos;
  const opciones = listaEsq.map(e => {
    const v = e.e || e.esquema;
    return `<option value="${v}"${norm11(esqVista) === norm11(v) ? ' selected' : ''}>${esquemaLindo(v)} · ${n1(e.total)}</option>`;
  }).join('');

  // ── el panel de alternativas ──
  let panel = '';
  if (S_ONCE.cambiando) {
    const p = TODOS[S_ONCE.cambiando];
    if (p) {
      const enBanco = Object.values(S_ONCE.banco).includes(p.id);
      // EL SUPLENTE DEL PUESTO TAMBIEN ES UNA OPCION (08/09).
      // Hasta hoy el panel escondia a todo el que ya estuviera en el once o en
      // el banco, asi que la permuta mas obvia —subir al suplente y mandar al
      // titular al banco— era justo la unica que no se podia hacer con el ⇅.
      // Ahora el del banco (o el titular, si estas parado en el banco) aparece
      // primero y marcado como intercambio: los dos cambian de lugar.
      const idBanco = S_ONCE.banco[p.pos];
      const elOtro = enBanco
        ? S.once.map(z => TODOS[z]).filter(z => z && z.pos === p.pos)
        : (idBanco && idBanco !== p.id && TODOS[idBanco] ? [TODOS[idBanco]] : []);
      const libres = (D.rankings[p.pos] || [])
        .filter(x => x.id === p.id || (!estaFuera(x) && !S.once.includes(x.id) && !Object.values(S_ONCE.banco).includes(x.id)))
        .sort((a, c) => (c.epsj ?? c.ep ?? -1) - (a.epsj ?? a.ep ?? -1))
        .slice(0, 12);
      const cand = elOtro.map(x => ({ ...x, _permuta: true })).concat(libres);
      panel = `<div class="panel-cambio">
        <div class="pc-cab">
          <div><b>Alternativas para ${esc(nombreCorto(p.n))}</b>
            <span class="text-muted">· ${NOMBRE_POS_L[p.pos].toLowerCase()} ${enBanco ? 'del banco' : 'del once'}</span></div>
          <button class="pc-cerrar" id="pc-cerrar">Cerrar</button>
        </div>
        <div class="pc-lista">${cand.map(x => {
          const dif = (x.epsj ?? x.ep ?? 0) - (p.epsj ?? p.ep ?? 0);
          const esEl = x.id === p.id;
          return `<button class="pc-item${esEl ? ' pc-actual' : ''}${x._permuta ? ' pc-permuta' : ''}" data-poner="${x.id}"${esEl ? ' disabled' : ''}
            title="${x._permuta ? esc(enBanco ? 'Sube este al banco y baja al que tocaste' : 'Sube el suplente y manda al titular al banco') : ''}">
            <span class="pc-n">${esc(nombreCorto(x.n))}${x._permuta ? '<span class="pc-tag">⇄ ' + (enBanco ? 'del once' : 'del banco') + '</span>' : ''}<small>${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'L' : 'V'} ${esc(NOM(x.riv))}</small></span>
            <span class="pc-d">${x.mesp != null ? x.mesp + "'" : '—'}<small>minutos</small></span>
            <span class="pc-d">${plata(x.pr)}<small>cotización</small></span>
            <span class="pc-p">${n2(x.epsj ?? x.ep)}<small>${esEl ? 'ahora' : (dif >= 0 ? '+' : '') + n2(dif)}</small></span>
          </button>`;
        }).join('')}</div>
        <div class="pc-pie">Ordenado por PUNTOS, o sea lo que rinde si entra a la cancha —no se descuenta nada por
        &laquo;capaz no juega&raquo;. La columna de la derecha muestra cuánto cambia el once si lo ponés.</div>
      </div>`;
    }
  }

  // Si el once es tuyo hay que decirlo, y hay que poder volver al del motor.
  // Sin esto, "guardado" seria indistinguible de "el motor cambio de opinion".
  const btnExportar = esR ? '' : `<button class="vs-btn vs-btn-chico" onclick="exportarMiOnce()"
      title="Genera el bloque para pegar en equipos.txt. Es lo que hace que tu once deje de vivir sólo en este navegador.">guardar mi once para el torneo</button>`;
  const avisoEditado = (S_ONCE.editado && !esR) ? `<div class="once-guardado">
    <span><b>Este es tu once</b>, no el que recomienda el motor: quedó guardado solo con los cambios que hiciste${
      S_ONCE.heredadoDe != null ? `, y viene de la <b>fecha ${S_ONCE.heredadoDe}</b>` : ''}.${
      S_ONCE.perdidos ? ` <b>${S_ONCE.perdidos}</b> ${S_ONCE.perdidos === 1 ? 'jugador ya no está' : 'jugadores ya no están'} en la lista y ${S_ONCE.perdidos === 1 ? 'fue reemplazado' : 'fueron reemplazados'}.` : ''}</span>
    <button class="vs-btn vs-btn-chico" onclick="volverAlOnceDelMotor()">volver al del motor</button>
    ${btnExportar}</div>`
    : (btnExportar ? `<div class="once-guardado once-exportar"><span>Tu once vive sólo en <b>este navegador</b>.
        Pasalo a <code>equipos.txt</code> y lo vas a ver desde cualquier máquina, como los de tus amigos.</span>
        ${btnExportar}</div>` : '');

  cont.innerHTML = `
    ${avisoEditado}
    ${cabecera('Mejor 11', esquemaTxt + ' · ' + (c ? '$' + (c / 1e6).toFixed(1) + 'M' : 's/d'), (() => {
      const of = (S.oncesLocales && S.oncesLocales[0]) || null;
      let sello = '';
      if (esR) sello = '<span class="est-sello est-r">arriesgado</span>';
      else if (of) {
        const igual = S.once.length === of.ids.length && S.once.every(id => of.ids.includes(id));
        sello = igual
          ? '<span class="est-sello est-of" title="El de mayor puntaje esperado. Es el que el motor guarda y contra el que se mide después.">oficial</span>'
          : `<span class="est-sello est-mod" title="${esc('Lo cambiaste vos. El oficial es ' + esquemaLindo(of.e) + ' con ' + n1(of.total) + ' puntos.')}">modificado</span>`;
      }
      return `<div class="est est-pts">${sello}<b>${n1(t)}</b><span class="est-lbl">puntos</span></div>`;
    })())}
    ${avisoDescartes(esR)}

    <div class="once-barra">
      <div class="main-tabs">
        <button class="tab-btn${!esR ? ' active' : ''}" data-modo="solido">🛡️ Sólido</button>
        <button class="tab-btn${esR ? ' active' : ''}" data-modo="riesgo"${D.arriesgado ? '' : ' disabled'}>🚀 Arriesgado</button>
      </div>
      <label class="orden-check">Formación
        <select id="once-esquema" class="select-equipo" style="max-width:120px;"${esR ? ' disabled' : ''}>${opciones}</select>
      </label>
      <div class="once-capitan" title="El capitán duplica SOLO la ficha Clarín, no las incidencias.">
        <span class="oc-lbl">Capitán</span>
        <b>${cap ? esc(nombreCorto(cap.n)) : '—'}</b>
        <span class="text-muted">${cap ? `ficha ${n2(cap.fi)} → ${n2(cap.fi * 2)}` : ''}</span>
      </div>

    </div>

    <div class="cancha">
      <div class="cancha-lineas"></div>
      ${[['DEL', porPos.DEL], ['VOL', porPos.VOL], ['DEF', porPos.DEF], ['ARQ', porPos.ARQ]].map(([pos, arr]) =>
        `<div class="linea11">${arr.map(p => fichaCancha(p)).join('')}</div>`).join('')}
    </div>

    <div class="banco">
      <div class="banco-lbl">Suplentes<small>uno por puesto, como en el juego. Entra si el titular de su puesto no juega.</small></div>
      <div class="banco-fichas">${['ARQ', 'DEF', 'VOL', 'DEL'].map(pos => {
        const p = TODOS[S_ONCE.banco[pos]];
        return p ? fichaCancha(p, { banco: true }) : `<div class="ficha11 vacia">${pos}<span>sin candidato</span></div>`;
      }).join('')}</div>
    </div>

    ${bloqueAnalisis()}

    ${panel}

    ${D.arriesgado && D.arriesgado.dist ? (() => {
      const A = D.arriesgado;
      const fila = (n, d, on) => `<tr class="${on ? 'fila-total' : ''}">
          <td>${n}</td><td class="text-center">${d.media.toFixed(1)}</td><td class="text-center">${d.p99.toFixed(0)}</td>
          <td class="text-center">${(100 * d.p100).toFixed(1)}%</td><td class="text-center">${(100 * d.p120).toFixed(2)}%</td>
          <td class="text-center">${(100 * d.p140).toFixed(3)}%</td><td class="text-center">${(100 * d.p160).toFixed(3)}%</td></tr>`;
      return `<div class="card" style="margin-top:1.2rem;">
        <div class="det-cuerpo">
          <div class="md-titulo">${(A.sims || 0).toLocaleString('es-AR')} fechas simuladas</div>
          <table class="data-table tb-desglose"><thead><tr><th>Once</th><th class="text-center">Promedio</th>
            <th class="text-center">1 de cada 100</th><th class="text-center">≥100</th><th class="text-center">≥120</th>
            <th class="text-center">≥140</th><th class="text-center">≥160</th></tr></thead>
            <tbody>${A.conservador ? fila('🛡️ El de siempre', A.conservador, !esR) : ''}${fila('🚀 Arriesgado', A.dist, esR)}</tbody></table>
          <p class="md-p suave">El arriesgado <b>no es mejor</b>: es otra apuesta. Resigna promedio para levantar el techo —
          mirá el ≥140 y el ≥160, que es donde se gana una fecha. Se le pone un tope de <b>4 nombres compartidos</b> con el sólido
          a propósito: si los dos onces son casi iguales, el domingo suben y bajan juntos y no sirvió de nada.
          El gol de oro no está simulado, así que el techo real es algo más alto que el de la tabla.</p>
        </div></div>`;
    })() : ''}
    ${esR && D.arriesgado && D.arriesgado.porQue ? (() => {
      const porId = {}; (D.arriesgado.porQue || []).forEach(p => porId[p.id] = p);
      const enOrden = ['ARQ', 'DEF', 'VOL', 'DEL'].flatMap(pos => (porPos[pos] || []));
      return `<div class="card" style="margin-top:1.2rem;">
        <div class="det-cuerpo">
          <div class="md-titulo">Por qué está cada uno</div>
          <table class="data-table tb-datos"><thead><tr><th>Jugador</th><th>La apuesta</th></tr></thead><tbody>
          ${enOrden.map(p => { const q = porId[p.id]; if (!q) return '';
            return `<tr><td style="cursor:pointer;" onclick="auditar('${p.id}')">
                <div class="player-info"><div class="player-name">${esc(nombreCorto(p.n))}${q.comun ? '<span class="pill-alerta pill-ok" style="margin-left:6px;">también en el sólido</span>' : ''}</div>
                <div class="player-sub">${esc(NOM(p.eq))} · ${p.cond === 'L' ? 'L' : 'V'} vs ${esc(NOM(p.riv))}</div></div></td>
              <td>${(q.m || []).map(t => `<div class="apuesta-linea">${esc(t)}</div>`).join('')}</td></tr>`;
          }).join('')}
          </tbody></table>
          <p class="md-p suave">Nada de esto dice que vaya a pasar: dice que <b>si pasa, paga mucho</b>. Un gol de defensor son 9 puntos
          y uno de volante 6, así que la fecha enorme casi siempre sale de un gol que nadie esperaba.</p>
        </div></div>`;
    })() : ''}`;

  // ── eventos ──
  cont.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => {
    if (b.dataset.modo === 'riesgo' && D.arriesgado) cambiarEsquema('__riesgo');
    else if (b.dataset.modo === 'solido' && esR) cambiarEsquema(D.esquema.optimo.esquema);
    S_ONCE.cambiando = null; S_ONCE.banco = armarBanco();
    S_ONCE.editado = true; guardarOnceEditado(); pintarPantallaOnce();
  });
  const se = $('once-esquema');
  if (se) se.onchange = () => { cambiarEsquema(se.value); S_ONCE.cambiando = null; S_ONCE.banco = armarBanco();
    S_ONCE.editado = true; guardarOnceEditado(); pintarPantallaOnce(); };
  cont.querySelectorAll('.f11-swap').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const id = b.closest('.ficha11').dataset.id;
    S_ONCE.cambiando = (S_ONCE.cambiando === id) ? null : id;
    pintarPantallaOnce();
    const pc = cont.querySelector('.panel-cambio'); if (pc) pc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  cont.querySelectorAll('.ficha11[data-id]').forEach(f => f.onclick = () => auditar(f.dataset.id));
  cont.querySelectorAll('[data-capitan]').forEach(b => b.onclick = ev => ponerCapitan(b.dataset.capitan, ev));
  cont.querySelectorAll('[data-sacar]').forEach(b => b.onclick = ev => toggleFuera(b.dataset.sacar, ev));
  const cc = $('pc-cerrar'); if (cc) cc.onclick = () => { S_ONCE.cambiando = null; pintarPantallaOnce(); };
  cont.querySelectorAll('[data-poner]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const viejo = S_ONCE.cambiando, nuevo = b.dataset.poner;
    const pos = TODOS[viejo] ? TODOS[viejo].pos : null;
    const i = S.once.indexOf(viejo), j = S.once.indexOf(nuevo);
    const viejoEnBanco = pos && S_ONCE.banco[pos] === viejo;
    const nuevoEnBanco = pos && S_ONCE.banco[pos] === nuevo;
    if (i >= 0 && nuevoEnBanco) { S.once[i] = nuevo; S_ONCE.banco[pos] = viejo; }   // titular ⇄ suplente
    else if (viejoEnBanco && j >= 0) { S.once[j] = viejo; S_ONCE.banco[pos] = nuevo; } // suplente ⇄ titular
    else if (i >= 0) S.once[i] = nuevo;
    else if (viejoEnBanco) S_ONCE.banco[pos] = nuevo;
    S_ONCE.cambiando = null;
    S_ONCE.editado = true; guardarOnceEditado();
    pintarPantallaOnce();
  });
}

// ── navegacion por secciones ────────────────────────────────────────────────
// Cada pantalla a lo ancho, en vez de todo apretado a la vez.
function mostrarSeccion(sec) {
  soltarScroll();
  document.querySelectorAll('.seccion').forEach(el => { el.hidden = (el.id !== 'sec-' + sec); });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (sec === 'jugadores') pintarRankings();
  if (sec === 'fecha') pintarPantallaFecha();
  if (sec === 'once') pintarPantallaOnce();
  if (sec === 'liga') pintarPantallaLiga();
  // Datos ahora arranca con la tabla y el fixture, que viven en el HTML de la
  // seccion y no adentro de #pantalla-datos (ver el comentario del index).
  if (sec === 'datos') { pintarTabla(); pintarFixture(); pintarDatos(); }
  if (sec === 'revision') pintarRevision();
}

// ── DATOS DE LA FECHA: la parte "curiosidades" ─────────────────────────────
// Lo que en Planeta Gran DT es la hoja de datos sueltos. Nada de esto entra en
// el puntaje: son cosas para mirar antes de cerrar el equipo. Cada bloque dice
// de donde sale, para que nunca haya que creerle a un numero porque si.
let _nMas = 0;
function pintarDatos() {
  const cont = $('pantalla-datos'); if (!cont || !D) return;
  const C = D.curiosidades || {};
  const vacio = t => `<div class="dato-vacio">${t}</div>`;
  // CINCO FILAS Y UN BOTON (03/09). La pantalla era una tira de tablas de
  // treinta filas: para llegar a la ley del ex habia que scrollear seis veces.
  // Cada tarjeta muestra las primeras cinco y el resto se abre si lo pedís.
  const cuerpo = (filas, n = 5) => {
    if (filas.length <= n) return `<tbody>${filas.join('')}</tbody>`;
    const id = 'mas' + (++_nMas);
    const falta = filas.length - n;
    // EL COLSPAN TIENE QUE SER EL DE LA TABLA (08/09). Estaba fijo en 9 y estas
    // tablas tienen 3, 4 o 5 columnas: el navegador inventaba las que faltaban
    // y el encabezado dejaba de coincidir con las celdas. Se cuenta cuantos
    // <td> trae la primera fila.
    const nCol = ((filas[0] || '').match(/<td/g) || []).length || 1;
    return `<tbody>${filas.slice(0, n).join('')}</tbody>
      <tbody id="${id}" hidden>${filas.slice(n).join('')}</tbody>
      <tbody><tr class="fila-vermas"><td colspan="${nCol}"><button class="chip-jug chip-mas"
        onclick="const e=document.getElementById('${id}');e.hidden=!e.hidden;this.textContent=e.hidden?'ver los ${falta} restantes':'ver menos';">ver los ${falta} restantes</button></td></tr></tbody>`;
  };
  const fila = c => `<tr>${c.join('')}</tr>`;
  const bloque = (titulo, bajada, cuerpo, nota, ancho) => `
    <div class="card dato-card${ancho ? ' dato-ancho' : ''}">
      <div class="dato-head"><h2>${titulo}</h2><p>${bajada}</p></div>
      ${cuerpo}
      ${nota ? `<details class="tabla-referencia ref-det"><summary>Cómo se lee esta tabla y de dónde salen los números</summary><div>${nota}</div></details>` : ''}
    </div>`;
  // El que ya jugó su partido de esta fecha queda marcado, no escondido: el
  // dato sigue siendo cierto y a mitad de fecha esconderlos dejaba estas tablas
  // con dos filas. Los que faltan jugar van primero (los ordena el motor).
  const chip = x => `<div class="player-info"><div class="player-name">${esc(nombreCorto(x.nombre))}${
      x.yaJugado ? ' <span class="fx-jugado" title="Su partido de esta fecha ya se jugó: el dato sigue valiendo, pero ya no lo podés usar para esta fecha.">JUGADO</span>' : ''}</div>
      <div class="player-sub">${esc(x.equipo)} · ${x.condicion === 'L' ? 'L' : 'V'} vs ${esc(x.rival)}</div></div>`;

  // ── LEY DEL EX ───────────────────────────────────────────────────────────
  const ley = C.leyDelEx || [];
  const tablaLey = ley.length ? `
    <table class="data-table tb-datos">
      <thead><tr>
        <th>Jugador</th>
        <th>Enfrenta a</th>
        <th class="text-center" title="Lo que dice el Ayudante de campo del Gran DT para esta fecha.">Estado</th>
        <th class="text-center" title="Puntos esperados de esta fecha.">Espera</th>
      </tr></thead>
      ${cuerpo(ley.map(x => fila([
        `<td style="cursor:pointer;" onclick="auditar('${x.id}')">${chip(x)}</td>`,
        `<td><b class="dato-ex">${esc(x.ex.club)}</b>
           <div class="player-sub">${x.ex.pj != null
             ? `${x.ex.pj} PJ ahí · ${x.ex.goles || 0} gol${(x.ex.goles || 0) === 1 ? '' : 'es'}`
             : (x.dts != null ? `lo tienen ${Number(x.dts).toLocaleString('es-AR')} equipos` : 'lo marca el Gran DT')}</div></td>`,

        `<td class="text-center">${x.estado ? `<span class="pill-alerta ${x.baja ? 'pill-mal' : (x.estado === 'En duda' ? 'pill-duda' : 'pill-ok')}">${esc(x.estado)}</span>` : '<span class="text-muted">—</span>'}</td>`,
        `<td class="text-center"><b>${n2(x.EP)}</b></td>`
      ])))}
    </table>` : vacio('Ningún jugador de esta fecha enfrenta a un club donde tengamos registrado que jugó.');

  // ── EN RACHA ─────────────────────────────────────────────────────────────
  const rac = C.enRacha || [];
  const tiraGoles = u => `<span class="tira-goles">${u.map(g =>
    `<span class="tg${g.goles > 0 ? ' tg-gol' : (g.min > 0 ? '' : ' tg-no')}" title="${g.fecha != null ? 'Fecha ' + g.fecha + ': ' : ''}${g.min}' · ${g.goles} gol${g.goles === 1 ? '' : 'es'}">${g.goles > 0 ? g.goles : ''}</span>`).join('')}</span>`;
  const tablaRacha = rac.length ? `
    <table class="data-table tb-datos">
      <thead><tr><th>Jugador</th>
        <th class="text-center" title="Goles en los últimos 5 partidos que jugó. Cada cuadrito es un partido, del más viejo al más nuevo.">Últimas 5</th>
        <th class="text-center" title="Fechas seguidas convirtiendo, contadas desde el último partido que jugó.">Racha</th>
        <th class="text-center">Espera</th></tr></thead>
      ${cuerpo(rac.map(x => fila([
        `<td style="cursor:pointer;" onclick="auditar('${x.id}')">${chip(x)}</td>`,
        `<td class="text-center"><b>${x.goles5}</b> gol${x.goles5 === 1 ? '' : 'es'}
           <div class="op-cuenta">en ${x.conGol5} de ${x.pj5}</div>${tiraGoles(x.ultimas)}</td>`,
        `<td class="text-center">${x.partidos >= 2
            ? `<span class="pill-alerta pill-ok">${x.partidos} seguidas</span>`
            : (x.partidos === 1 ? '<span class="op-cuenta">viene de marcar</span>' : '<span class="text-muted">—</span>')}</td>`,
        `<td class="text-center">${n2(x.EP)}</td>`
      ])))}
    </table>` : vacio('Nadie de la liga llega con dos goles o más en sus últimos cinco partidos.');

  // ── LE DEBEN GOLES ───────────────────────────────────────────────────────
  const deb = C.leDeben || [];
  const tablaDeb = deb.length ? `
    <table class="data-table tb-datos">
      <thead><tr><th>Jugador</th><th class="text-center">xG sin penales</th><th class="text-center">Goles</th>
      <th class="text-center">Le deben</th><th class="text-center">Espera</th></tr></thead>
      ${cuerpo(deb.map(x => fila([
        `<td style="cursor:pointer;" onclick="auditar('${x.id}')"><div class="player-info">
           <div class="player-name">${esc(nombreCorto(x.nombre))}</div>
           <div class="player-sub">${esc(x.equipo)} · ${x.minutos}' jugados</div></div></td>`,
        `<td class="text-center">${n2(x.xg)}</td>`,
        `<td class="text-center">${x.goles}</td>`,
        `<td class="text-center"><b style="color:var(--success);">+${n2(x.deuda)}</b></td>`,
        `<td class="text-center">${n2(x.EP)}</td>`
      ])))}
    </table>` : vacio('Nadie con una diferencia grande entre lo que generó y lo que convirtió.');

  // ── COMO LLEGA CADA EQUIPO ───────────────────────────────────────────────
  // REESCRITO (07/09). Antes esto era una sola tabla con ocho columnas y dos
  // numeros en cada celda —local arriba, visitante abajo—: dieciseis numeros
  // por equipo. Habia todo, no se entendia nada, y para contestar "que locales
  // vienen bien esta fecha" habia que adivinar cual de los treinta juega de
  // local. Ahora:
  //   · por defecto se muestra SOLO la condicion que le toca a cada equipo en
  //     el partido de esta fecha, con su rival al lado. Un numero por celda.
  //   · se puede filtrar por los que juegan de local o de visitante.
  //   · las columnas se partieron en dos pestañas, Resultados y Juego, para
  //     que ninguna tabla pase de seis columnas.
  //   · los goles y los puntos van como TOTAL (que es lo que se recuerda:
  //     "Estudiantes hizo 0 goles de visitante") con el promedio abajo en chico.
  // La vista de las dos condiciones sigue estando, en "local y visitante".
  //
  // FUENTES: goles, puntos, tiros, tiros al arco, corners y posesion son de
  // ESPN; el xG generado y concedido, de 365Scores.
  const EC = D.equiposCond || [];
  // SOLO ESTE TORNEO (07/09). La ventana de "los dos torneos" se saco: mezclar
  // el torneo pasado con este para decidir una fecha no sirve —ya medimos que
  // la brecha local/visitante no se traslada de un torneo al otro— y encima
  // obligaba a preguntarse cual de las dos se estaba mirando.
  const vent = 'actual';
  const modoFecha = S.condModo !== 'ambas';
  const tab = S.condTab === 'juego' ? 'juego' : 'res';

  // que condicion y contra quien juega cada equipo ESTA fecha
  const partidoDe = {};
  (D.tablero || []).forEach(t => { partidoDe[t.equipoKey] = { cond: t.condicion, rival: t.rival, jug: t.yaJugado }; });

  const ladoDe = (e, l) => (e[vent] ? e[vent][l] : null);
  const xgDe = (e, l) => { const x = vent === 'anio' ? e.xgAnio : e.xgActual; return x ? x[l] : null; };
  // el lado que le toca a este equipo en el modo "esta fecha"
  const ladoFecha = e => { const p = partidoDe[e.k]; return p ? (p.cond === 'L' ? 'local' : 'visitante') : 'local'; };

  const valorDe = (e, campo, l) => {
    if (campo === 'xgF' || campo === 'xgC') { const x = xgDe(e, l); return x ? (campo === 'xgF' ? x.f : x.c) : null; }
    const st = ladoDe(e, l); if (!st || !st.pj) return null;
    if (campo === 'ptsP') return st.pts / st.pj;
    return st[campo];
  };

  // puestos entre los 30, para el cartelito del mouse
  const EN_CONTRA = { gcP: 1, xgC: 1, tirosRec: 1, tirosArcoRec: 1, cornersRec: 1 };
  const RANK = {};
  ['pts', 'ptsP', 'gfP', 'gcP', 'xgF', 'xgC', 'tiros', 'tirosRec', 'tirosArco', 'tirosArcoRec',
   'corners', 'cornersRec', 'posesion'].forEach(campo => {
    RANK[campo] = { local: {}, visitante: {} };
    ['local', 'visitante'].forEach(l => {
      const vs = EC.map(e => ({ k: e.k, v: valorDe(e, campo, l) })).filter(x => x.v != null)
        .sort((a, b) => EN_CONTRA[campo] ? a.v - b.v : b.v - a.v);
      let pu = 0, prev = null;
      vs.forEach((x, i) => { if (prev === null || x.v !== prev) { pu = i + 1; prev = x.v; } RANK[campo][l][x.k] = { p: pu, n: vs.length }; });
    });
  });
  const puesto = (campo, l, k) => { const r = RANK[campo] && RANK[campo][l][k]; return r ? r.p + 'º de ' + r.n : null; };

  // las columnas de cada pestaña: [clave, titulo, como se saca el numero]
  const COL_RES = [
    ['pts',  'Puntos',  (st) => st.pj ? { g: String(st.pts), c: n2b(st.pts / st.pj) + ' por partido', r: 'pts' } : null],
    ['gfP',  'Goles',   (st) => st.pj ? { g: String(st.gf), c: n2b(st.gfP) + ' por partido', r: 'gfP' } : null],
    ['gcP',  'Le hacen', (st) => st.pj ? { g: String(st.gc), c: n2b(st.gcP) + ' por partido', r: 'gcP' } : null],
    ['pg',   'G–E–P',   (st) => st.pj ? { g: st.pg + '–' + st.pe + '–' + st.pp, c: st.pj + ' jugados', r: null } : null]
  ];
  const COL_JUEGO = [
    ['xgF',       'xG',       (st, e, l) => { const x = xgDe(e, l); return x ? { g: n2b(x.f), c: 'concede ' + n2b(x.c), r: 'xgF' } : null; }],
    ['tiros',     'Tiros',    (st) => st.pj ? { g: n1b(st.tiros), c: 'le hacen ' + n1b(st.tirosRec), r: 'tiros' } : null],
    ['tirosArco', 'Al arco',  (st) => st.pj ? { g: n1b(st.tirosArco), c: 'le hacen ' + n1b(st.tirosArcoRec), r: 'tirosArco' } : null],
    ['corners',   'Córners',  (st) => st.pj ? { g: n1b(st.corners), c: 'concede ' + n1b(st.cornersRec), r: 'corners' } : null],
    ['posesion',  'Posesión %', (st) => st.pj ? { g: n1b(st.posesion), c: '', r: 'posesion' } : null]
  ];
  // TODO JUNTO CUANDO ES UNA SOLA COLUMNA POR EQUIPO (08/09).
  // Resultados y Juego eran dos pestañas: para comparar los puntos de un equipo
  // con su posesión había que ir y volver, y de memoria. En modo "esta fecha"
  // cada dato es UN número, así que entran los nueve en la misma fila y la
  // comparación se hace con el ojo. Las pestañas quedan sólo en "local y
  // visitante", donde cada columna son dos números y nueve serían dieciocho.
  const COL_CRN_C = ['cornersRec', 'Córners−',
    (st) => st.pj ? { g: n1b(st.cornersRec), c: '', r: 'cornersRec' } : null];
  const COL_TODO = [...COL_RES, ...COL_JUEGO.map(c =>
    c[0] === 'corners' ? ['corners', 'Córners+', (st) => st.pj ? { g: n1b(st.corners), c: '', r: 'corners' } : null] : c)];
  COL_TODO.splice(COL_TODO.findIndex(c => c[0] === 'corners') + 1, 0, COL_CRN_C);
  const COLS = modoFecha ? COL_TODO : (tab === 'juego' ? COL_JUEGO : COL_RES);

  const n1b = x => x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1);
  const n2b = x => x == null ? '–' : (Math.round(x * 100) / 100).toFixed(2);

  // ── las filas ───────────────────────────────────────────────────────────
  let filasEC = EC.slice();
  if (modoFecha && S.condFiltro !== 'todos') {
    filasEC = filasEC.filter(e => { const p = partidoDe[e.k]; return p && p.cond === S.condFiltro; });
  }
  // SE ORDENA POR EL NUMERO QUE SE VE (07/09).
  // Antes la tabla arrancaba ordenada por puntos POR PARTIDO mientras la
  // columna mostraba el TOTAL, asi que la columna Puntos se leia
  // "10, 10, 7, 9, 9, 6, 6, 7" y parecia que no estuviera ordenada. Encima el
  // campo del orden (ptsP) no era ninguna de las columnas, asi que ninguna
  // cabecera quedaba marcada y no habia forma de darse cuenta.
  // Ahora cada columna ordena exactamente por su numero grande. El promedio
  // sigue abajo para el que quiera compararlo a mano.
  const campoOrd = S.condOrd.replace(/(L|V|Dif)$/, '');
  const ladoOrd = (S.condOrd.match(/(L|V|Dif)$/) || [, 'L'])[1];
  // el valor grande de cada columna, que es por el que se ordena
  const valorGrande = (e, campo, l) => {
    const st = ladoDe(e, l);
    if (campo === 'xgF' || campo === 'xgC') { const x = xgDe(e, l); return x ? (campo === 'xgF' ? x.f : x.c) : null; }
    if (!st || !st.pj) return null;
    if (campo === 'pts') return st.pts;          // total, que es lo que se muestra
    if (campo === 'gfP') return st.gf;           // total de goles
    if (campo === 'gcP') return st.gc;           // total de goles en contra
    if (campo === 'pg')  return st.pg;           // ganados
    return st[campo];                            // en Juego el grande ya es el promedio
  };
  const valorOrden = e => {
    if (modoFecha) return valorGrande(e, campoOrd, ladoFecha(e));
    if (ladoOrd === 'Dif') { const a = valorGrande(e, campoOrd, 'local'), b = valorGrande(e, campoOrd, 'visitante');
      return (a == null || b == null) ? null : a - b; }
    return valorGrande(e, campoOrd, ladoOrd === 'L' ? 'local' : 'visitante');
  };
  filasEC.sort((a, b) => {
    const va = valorOrden(a), vb = valorOrden(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va !== vb) return (va - vb) * S.condDir;
    return a.equipo.localeCompare(b.equipo);
  });

  // ── cabeceras ───────────────────────────────────────────────────────────
  const thFecha = (titulo, campo, ayuda) => {
    const act = S.condOrd === campo + 'L';
    return `<th class="th-cond th-clic${act ? ' on' : ''}" title="${esc(ayuda)}"
      onclick="ordenarCond('${campo}','L')">${titulo}${act ? (S.condDir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  };
  const thAmbas = (titulo, campo, ayuda) => {
    const chip = (t, lado, tit) => {
      const act = S.condOrd === campo + lado;
      return `<button class="ord-lv${act ? ' on' : ''}" title="${tit}" onclick="ordenarCond('${campo}','${lado}')">${t}${act ? (S.condDir < 0 ? '↓' : '↑') : ''}</button>`;
    };
    return `<th class="th-cond" title="${esc(ayuda)}">${titulo}
      <div class="ord-fila">${chip('L', 'L', 'Ordenar por el número de local')}${chip('V', 'V', 'Ordenar por el número de visitante')}${chip('Δ', 'Dif', 'Ordenar por la diferencia')}</div></th>`;
  };

  const AYUDAS = {
    pts: 'Puntos sumados en esa condición; ordena por ese total. Abajo va el promedio por partido, que es lo comparable cuando uno jugó 3 y otro 4.',
    gfP: 'Goles convertidos en total; ordena por ese total. Abajo, el promedio por partido.',
    gcP: 'Goles recibidos en total; ordena por ese total. Abajo, el promedio por partido.',
    pg:  'Ganados, empatados y perdidos en esa condición.',
    xgF: 'xG generado por partido (365Scores). Abajo, el que concede.',
    tiros: 'Tiros por partido (ESPN). Abajo, los que le hacen.',
    tirosArco: 'Tiros al arco por partido. Abajo, los que recibe al arco.',
    corners: 'Córners a favor por partido. Abajo, los que concede.',
    posesion: 'Porcentaje de posesión promedio.'
  };

  // ── el cartelito del mouse ──────────────────────────────────────────────
  const tipCelda = (e, l, campo) => {
    const st = ladoDe(e, l);
    const lin = [(l === 'local' ? 'De local' : 'De visitante') + (st && st.pj ? ' · ' + st.pj + ' partido' + (st.pj === 1 ? '' : 's') : '')];
    const pares = { pts: [['pts', 'Puntos']], gfP: [['gfP', 'Goles a favor']], gcP: [['gcP', 'Menos goles en contra']],
      xgF: [['xgF', 'xG generado'], ['xgC', 'Menos xG concedido']],
      tiros: [['tiros', 'Tiros'], ['tirosRec', 'Menos tiros recibidos']],
      tirosArco: [['tirosArco', 'Tiros al arco'], ['tirosArcoRec', 'Menos tiros al arco recibidos']],
      corners: [['corners', 'Córners a favor'], ['cornersRec', 'Menos córners concedidos']],
      posesion: [['posesion', 'Posesión']] }[campo] || [];
    pares.forEach(([c, et]) => { const pu = puesto(c, l, e.k); if (pu) lin.push(et + ': ' + pu); });
    return lin.join('\n');
  };

  // EL PUESTO SALE DEL GLOBITO Y SE VE (08/09). Estaba escondido en el title:
  // el dato mas util de la tabla —si 51% de posesion es mucho o poco— solo
  // aparecia si uno adivinaba que tenia que pasar el mouse. Ahora va al lado
  // del numero, chiquito, igual que en la tabla de jugadores. Y la celda se
  // tiñe por el puesto, asi las treinta filas se leen como un dibujo: donde
  // hay verde el equipo esta arriba, donde hay rojo esta ultimo.
  const tinte = (campo, l, k) => {
    const r = RANK[campo] && RANK[campo][l] && RANK[campo][l][k];
    if (!r || !r.n || r.n < 6) return '';
    return ' hq' + Math.min(5, Math.floor((r.p - 1) * 5 / r.n) + 1);
  };
  const celdaUna = (e, l, col) => {
    const st = ladoDe(e, l) || {};
    const v = col[2](st, e, l);
    const campoR = v && v.r ? v.r : null;
    const r = campoR && RANK[campoR] && RANK[campoR][l] ? RANK[campoR][l][e.k] : null;
    return `<td class="cd-num${campoR ? tinte(campoR, l, e.k) : ''}" title="${esc(tipCelda(e, l, col[0]))}">${v
      ? `<div class="cu"><b>${v.g}${r ? `<i class="cu-p">${r.p}º</i>` : ''}</b>${v.c ? `<span>${v.c}</span>` : ''}</div>`
      : '<span class="text-muted">–</span>'}</td>`;
  };
  // El segundo numero en chico. En Resultados el chico es el promedio por
  // partido y en Juego es lo que le hacen; los dos se recortan a la cifra sola
  // porque el texto entero ("2.50 por partido") no entra al lado del grande y
  // quedaba pegado: se leia "102.50".
  const chico = txt => {
    if (!txt) return '';
    const m = txt.match(/-?\d+([.,]\d+)?/);
    if (!m) return '';
    return /por partido|jugado/.test(txt) ? '(' + m[0] + ')' : '/' + m[0];
  };
  const celdaDoble = (e, col) => {
    const vL = col[2](ladoDe(e, 'local') || {}, e, 'local');
    const vV = col[2](ladoDe(e, 'visitante') || {}, e, 'visitante');
    return `<td><div class="lv">
      <span class="lv-l" title="${esc(tipCelda(e, 'local', col[0]))}">${vL ? vL.g : '–'}${vL ? `<i>${chico(vL.c)}</i>` : ''}</span>
      <span class="lv-v" title="${esc(tipCelda(e, 'visitante', col[0]))}">${vV ? vV.g : '–'}${vV ? `<i>${chico(vV.c)}</i>` : ''}</span>
    </div></td>`;
  };

  const cuantosL = EC.filter(e => partidoDe[e.k] && partidoDe[e.k].cond === 'L').length;
  const cuantosV = EC.length - cuantosL;

  const tablaCasa = EC.length ? `
    <div class="cond-barra">
      <span class="cond-lab">Mostrar</span>
      <button class="chip-vent${modoFecha ? ' on' : ''}" onclick="modoCond('fecha')"
        title="Solo la condición en la que juega cada equipo esta fecha.">la condición de esta fecha</button>
      <button class="chip-vent${!modoFecha ? ' on' : ''}" onclick="modoCond('ambas')"
        title="Los dos números de cada equipo, de local y de visitante.">local y visitante</button>
    </div>
    <div class="cond-barra cond-barra2">
      ${!modoFecha ? `<button class="chip-tab${tab === 'res' ? ' on' : ''}" onclick="tabCond('res')">Resultados</button>
      <button class="chip-tab${tab === 'juego' ? ' on' : ''}" onclick="tabCond('juego')">Juego</button>` : ''}
      ${modoFecha ? `<span class="cond-lab">Esta fecha juegan</span>
        <button class="chip-filtro${S.condFiltro === 'todos' ? ' on' : ''}" onclick="filtroCond('todos')">los 30</button>
        <button class="chip-filtro chip-l${S.condFiltro === 'L' ? ' on' : ''}" onclick="filtroCond('L')">${cuantosL} de local</button>
        <button class="chip-filtro chip-v${S.condFiltro === 'V' ? ' on' : ''}" onclick="filtroCond('V')">${cuantosV} de visitante</button>` :
        '<span class="cond-leyenda"><span class="pt-l"></span> local <span class="pt-v"></span> visitante</span>'}
    </div>
    <div class="cond-scroll"><table class="data-table tb-datos tb-cond${modoFecha ? ' tb-una' : ''}">
      <thead><tr>
        <th class="th-num" title="El puesto según la columna por la que está ordenada la tabla.">#</th>
        <th class="th-eq">Equipo</th>
        ${modoFecha ? '<th class="th-cond" title="El partido de esta fecha. Los números de la fila son de esa condición.">Esta fecha</th>' : ''}
        ${COLS.map(c => (modoFecha ? thFecha : thAmbas)(c[1], c[0], AYUDAS[c[0]] || '')).join('')}
      </tr></thead>
      <tbody>${filasEC.map((e, i) => {
        const pa = partidoDe[e.k];
        const l = ladoFecha(e);
        const st = ladoDe(e, l) || {};
        const marca = !modoFecha ? '' : (pa && pa.cond === 'L' ? ' fila-esL' : ' fila-esV');
        return `<tr class="${marca.trim()}">
          <td class="td-num">${i + 1}</td>
          <td class="td-eq"><b>${esc(e.equipo)}</b>
            <div class="op-cuenta">${modoFecha
              ? 'jugó ' + (st.pj || 0) + ' partido' + ((st.pj || 0) === 1 ? '' : 's') + ' de ' + (l === 'local' ? 'local' : 'visitante')
              : 'jugó ' + ((ladoDe(e, 'local') || {}).pj || 0) + ' de local y ' + ((ladoDe(e, 'visitante') || {}).pj || 0) + ' de visitante'}</div></td>
          ${modoFecha ? `<td class="td-parti">${pa
            ? `<span class="pa-cond pa-${pa.cond}">${pa.cond}</span> vs ${esc(pa.rival)}${pa.jug ? ' <span class="pa-jug">ya jugó</span>' : ''}`
            : '<span class="text-muted">sin partido</span>'}</td>` : ''}
          ${COLS.map(c => modoFecha ? celdaUna(e, l, c) : celdaDoble(e, c)).join('')}
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : vacio('Falta <b>dataEspn.json</b>. Abrí <b>BAJAR_ESPN.html</b> en el navegador, bajá el archivo a la carpeta y volvé a correr <b>RECALCULAR.bat</b>.');


  // ── RACHAS DE EQUIPO ─────────────────────────────────────────────────────
  const rq = C.rachas || [];
  const puntito = r => `<span class="result-dot" style="background:${r === 'G' ? '#10b981' : r === 'E' ? '#94a3b8' : '#ef4444'};" title="${r === 'G' ? 'Ganó' : r === 'E' ? 'Empató' : 'Perdió'}"></span>`;
  const tablaRq = rq.length ? `
    <table class="data-table tb-datos">
      <thead><tr><th>Equipo</th>
        <th class="text-center" title="Los últimos 5, del más viejo al más nuevo.">Últimos 5</th>
        <th class="text-center">Viene de</th></tr></thead>
      ${cuerpo(rq.map(t => {
        const partes = [];
        if (t.ganando >= 2) partes.push(`<span class="pill-alerta pill-ok">${t.ganando} triunfos seguidos</span>`);
        else if (t.sinPerder >= 3) partes.push(`<span class="pill-alerta pill-ok">${t.sinPerder} sin perder</span>`);
        if (t.perdiendo >= 2) partes.push(`<span class="pill-alerta pill-mal">${t.perdiendo} derrotas seguidas</span>`);
        else if (t.sinGanar >= 3) partes.push(`<span class="pill-alerta pill-mal">${t.sinGanar} sin ganar</span>`);
        return fila([
          `<td><b>${esc(t.equipo)}</b><div class="player-sub">${t.pts} puntos</div></td>`,
          `<td class="text-center"><span class="form-dots">${(t.forma || []).map(puntito).join('')}</span></td>`,
          `<td class="text-center">${partes.join(' ') || '<span class="text-muted">nada para destacar</span>'}</td>`
        ]);
      }))}
    </table>` : vacio('Todavía no hay partidos jugados.');

  // ── EL ONCE IDEAL DE LA ULTIMA FECHA ─────────────────────────────────────
  const oi = C.onceIdeal;
  const NOMBRE_LINEA = { ARQ: 'Arquero', DEF: 'Defensores', VOL: 'Volantes', DEL: 'Delanteros' };
  const tablaOnce = oi ? `
    <div class="once-ideal-cab compacto">
      <div><span class="oi-lbl">Esquema</span><b>${esc(oi.esquema)}</b></div>
      <div><span class="oi-lbl">Puntaje</span><b>${oi.total}</b></div>
      <div><span class="oi-lbl">Cotización</span><b>$${(oi.costo / 1e6).toFixed(1)}M</b></div>
    </div>
    <div class="once-ideal-lineas">
      ${['ARQ', 'DEF', 'VOL', 'DEL'].map(pos => {
        const g = oi.once.filter(x => x.pos === pos);
        if (!g.length) return '';
        return `<div class="oi-linea">
          <div class="oi-linea-tit">${NOMBRE_LINEA[pos]}</div>
          <div class="oi-lista">${g.map(x => `<div class="oi-fila">
            <span class="oi-pts">${x.pts}</span>
            <span class="oi-nom">${esc(nombreCorto(x.nombre))}${x.nombre === oi.capitan ? '<span class="oi-cinta" title="El de más puntos del once.">C</span>' : ''}</span>
            <span class="oi-eq">${esc(x.equipo)}</span>
          </div>`).join('')}</div>
        </div>`;
      }).join('')}
    </div>
    ${oi.fecha < (D.fechaObjetivo || 0) ? `<p class="oi-nota">Es el once de la fecha <b>${oi.fecha}</b>:
      la planilla de Gran DT publica los puntajes cuando la fecha termina, así que el de la
      fecha ${D.fechaObjetivo} aparece acá recién cuando los cargue.</p>` : ''}`
    : vacio('La planilla de Gran DT todavía no publicó los puntajes de ninguna fecha. En cuanto los cargue, el once ideal aparece solo.');

  // ── FIGURAS ──────────────────────────────────────────────────────────────
  const fig = C.figuras || [];
  const tablaFig = fig.length ? `
    <table class="data-table tb-datos">
      <thead><tr><th>Jugador</th><th class="text-center">Figura</th>
      <th class="text-center" title="Chance de ser figura de su equipo en este partido, según el modelo.">Hoy</th>
      <th class="text-center">Espera</th></tr></thead>
      ${cuerpo(fig.map(x => fila([
        `<td style="cursor:pointer;" onclick="auditar('${x.id}')">${chip(x)}</td>`,
        `<td class="text-center"><b>${x.veces}</b> ${x.veces === 1 ? 'vez' : 'veces'}<div class="op-cuenta">en ${x.pj} partidos</div></td>`,
        `<td class="text-center">${pc0(x.pFigura)}</td>`,
        `<td class="text-center">${n2(x.EP)}</td>`
      ])))}
    </table>` : vacio('Nadie de esta fecha fue figura todavía.');

  // ELIMINADOS (06/09): "En duda", "Cambiaron de club", "Al filo de una
  // amarilla" y "No están". Los cuatro seguian marcados jugador por jugador en
  // la tabla de Jugadores y en el once, que es donde se los ve cuando importan;
  // repetirlos como cuatro tablas mas solo alargaba la pantalla. Nada se perdio:
  // las bajas siguen sin entrar al once recomendado y los carteles siguen ahi.

  // ── UN BLOQUE QUE SE ABRE CON UN CLIC ────────────────────────────────────
  // Todo abierto a la vez era una pared: habia que scrollear seis pantallas
  // para llegar a lo que se mira siempre. Lo que se usa en cada fecha queda
  // abierto y el resto se despliega si lo pedís. <details> es nativo: se
  // acuerda de nada, no necesita JS y anda con el teclado.
  const plegado = (titulo, bajada, cuerpoHtml, nota, abierto, ancho) => `
    <details class="card dato-card dato-plegable${ancho ? ' dato-ancho' : ''}"${abierto ? ' open' : ''}>
      <summary class="dato-head dato-summary">
        <span class="dato-flecha" aria-hidden="true">▸</span>
        <span><h2>${titulo}</h2><p>${bajada}</p></span>
      </summary>
      ${cuerpoHtml}
      ${nota ? `<div class="tabla-referencia">${nota}</div>` : ''}
    </details>`;

  // el encabezado de la pantalla vive en el HTML, arriba de la tabla y el
  // fixture: si se dibujara aca quedaria en el medio, debajo de las dos.
  cont.innerHTML = `
    <div class="datos-col">
      ${bloque('🏠 Cómo llega cada equipo', 'Por defecto, solo la condición en la que juega esta fecha. Ordenalo por la columna que te interese.', tablaCasa,
        'Goles, puntos, tiros, tiros al arco, córners y posesión salen de <b>ESPN</b>; el <b>xG</b> generado y concedido, de <b>365Scores</b> ' +
        '(365 no publica córners ni posesión por equipo, y ESPN no publica xG). El número grande es lo que <b>hace</b> y el chico, ' +
        'después de la barra, lo que <b>le hacen</b>. <b>Nada de esto entra en el puntaje de ningún jugador</b>: es para decidir a mano. ' +
        'Ojo con el PJ de cada lado: ESPN suele traer partidos de la fecha en curso que la tabla de posiciones todavía no cuenta. ' +
        '<br><br><b>Cómo se lee.</b> El número grande de <b>Resultados</b> es el <b>total</b> (los goles que hizo, los puntos que sacó) ' +
        'y abajo va el promedio por partido; en <b>Juego</b> es al revés, el grande es el promedio por partido y abajo lo que le hacen a él. ' +
        'Pasando el mouse por cualquier número aparece el <b>puesto entre los 30</b> en ese dato y en esa condición. ' +
        'En los que empiezan con <b>“Menos”</b> el orden va al revés a propósito: el 1º es el que menos recibe, que es el que está mejor. ' +
        '<br><br><b>Qué se puede y qué no se puede sacar de acá.</b> Medido sobre los 368 partidos de los dos torneos: la brecha ' +
        'local/visitante de un equipo <b>no se traslada de un torneo al otro</b> (r&nbsp;=&nbsp;−0,31 entre el torneo pasado y este, ' +
        'que con 30 equipos no se distingue de cero), y la de córners tampoco (r&nbsp;=&nbsp;−0,07). Que Estudiantes no sume de visitante ' +
        'en estas 4 fechas describe lo que pasó, no anticipa la que viene. Lo que sí se repite de un torneo al otro es el <b>nivel de ' +
        'córners</b> del equipo, sin separar por condición (r&nbsp;=&nbsp;0,45), y la ventaja de local de <b>toda la liga</b> ' +
        '(+0,4 y +0,6 puntos por partido en cada torneo), que es la única de las dos cosas que el modelo usa para el puntaje.', true)}

      ${plegado('📈 Rachas de equipo', 'Los 30, con lo que viene arrastrando cada uno.', tablaRq,
        'Resultados seguidos hasta el último partido jugado, de la tabla de posiciones.', false, true)}

      ${plegado('🎯 Le deben goles', 'Genera más de lo que convierte.', tablaDeb,
        'xG sin penales menos goles de jugada, mínimo 250 minutos. No es una promesa de gol: es que la pelota le está llegando.', false)}

      ${plegado('🔥 En racha', 'Quién viene metiendo goles.', tablaRacha,
        'Los <b>últimos 5 partidos que jugó</b> cada uno, del más viejo al más nuevo — los partidos que se perdió no cuentan. ' +
        'La <b>racha</b> son fechas seguidas convirtiendo hasta el último que jugó. Sale del log partido por partido de 365Scores. ' +
        'Que venga metiendo no cambia el puntaje esperado: el modelo mira el xG y los tiros, no la última semana.', false)}

      ${plegado('⭐ Figuras', 'Cuántas veces fue la figura de su equipo.', tablaFig,
        'VF de la planilla de Gran DT: la figura del partido suma 4 puntos. Al lado, la chance que le da el modelo de serlo hoy.', false)}

      ${plegado(`🏆 El once ideal de la fecha ${oi ? oi.fecha : '–'}`, 'Los que más pagaron la fecha pasada, armados en un equipo válido.', tablaOnce,
        'Sale de los puntajes fecha por fecha de la planilla de Gran DT. Se prueban los diez esquemas válidos y queda el que más suma. ' +
        'Es lo que <b>efectivamente pagó</b>, no una recomendación para la próxima. ' +
        'El Gran DT muestra un total algo mayor porque le suma la cinta de capitán, que duplica la ficha del elegido; ' +
        'la planilla no separa la ficha del resto de los puntos, así que acá va el puntaje limpio.', false)}

      ${plegado('⚔️ Ley del ex', 'Juega contra un club donde ya jugó.', tablaLey,
        'Un ex se detecta de dos formas, las dos con partidos reales atrás: que haya jugado en ese club <b>el torneo pasado</b> ' +
        '(sale del historial de 365Scores) o que se haya ido de ahí <b>en este mismo torneo</b> (lo detectamos al cruzar la planilla ' +
        'de Gran DT con 365Scores). Y que sea el ex no cambia el puntaje esperado — <b>no hay evidencia de que la ley del ex exista</b>; ' +
        'está acá porque es lindo saberlo.', false)}
    </div>`;
}

// LA MISMA CABECERA EN LAS CUATRO PANTALLAS (07/09).
// Cada una arrancaba distinto —una con un hero de cuatro renglones, otra con
// una tarjeta pegada arriba— asi que al cambiar de pestaña todo se corria de
// lugar. Y los parrafos que explicaban que era cada pantalla ocupaban dos
// centimetros antes de que empezara lo que uno viene a ver.
// Una linea: titulo a la izquierda, el dato que importa a la derecha.
function cabecera(titulo, sub, derecha) {
  return `<div class="cab">
    <div class="cab-txt"><h1>${titulo}</h1>${sub ? `<span>${sub}</span>` : ''}</div>
    ${derecha || ''}
  </div>`;
}
const fmtDiaCorto = d => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

// ── LA FECHA: la pantalla que faltaba ──────────────────────────────────────
// La app era un explorador de tablas, y el trabajo de verdad es cerrar un once
// antes de que arranque la fecha. Esto pone adelante lo que decide: cuanto
// falta para el cierre, que se rompio desde la ultima vez que miraste, y los
// tres mejores de cada puesto. Las tablas quedan para discutir un caso.
function pintarPantallaFecha() {
  const cont = $('pantalla-fecha'); if (!cont || !D) return;
  const partidos = (D.partidos || []).slice().sort((a, b) => new Date(a.cuando) - new Date(b.cuando));
  const primero = partidos.length ? new Date(partidos[0].cuando) : null;
  const ultimo = partidos.length ? new Date(partidos[partidos.length - 1].cuando) : null;
  const fmtDia = d => d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const fmtHora = d => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

  // Cuenta regresiva al cierre. En Gran DT los cambios cierran cuando arranca
  // el primer partido de la fecha, asi que el cierre no es un dato aparte: es
  // el horario del primer partido.
  // EL ESTADO DE LA FECHA, EN UN CHIP (07/09).
  // Antes eran tres renglones de texto al costado del titulo explicando que la
  // fecha ya habia arrancado. Lo que hace falta saber es una sola cosa —si
  // podes cambiar el equipo o no— y eso entra en una palabra.
  let cierre = '';
  const enCurso = D.fechaEnCurso;
  const veda = D.curiosidades && D.curiosidades.veda ? new Date(D.curiosidades.veda) : null;
  if (veda && veda > new Date()) {
    const faltan = veda - new Date();
    const h = Math.floor(faltan / 3600000), m = Math.floor((faltan % 3600000) / 60000);
    cierre = `<div class="est est-abierta" title="${esc('Cierra el ' + fmtDia(veda) + ' a las ' + fmtHora(veda) + '. Es el horario de veda que publica el Gran DT.')}">
      <span class="est-lbl">cierra en</span><b>${h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + 'h ' + m + 'm'}</b></div>`;
  } else if (enCurso && new Date(enCurso.ultimo) > new Date()) {
    cierre = `<div class="est est-cerrada" title="${esc('La fecha ' + enCurso.numero + ' ya arrancó: ' + enCurso.jugados + ' de ' + enCurso.total +
      ' partidos jugados. Los cambios abren cuando termine el último. Lo que ves es de referencia.')}">
      <span class="est-lbl">fecha</span><b>en juego</b></div>`;
  } else {
    cierre = `<div class="est est-cerrada" title="Los cambios de esta fecha ya no se pueden hacer.">
      <span class="est-lbl">fecha</span><b>cerrada</b></div>`;
  }

  // Los avisos que quedaron en la portada. Los cuatro que listaban nombres —no
  // juegan, en duda, ley del ex, "todo lo demas esta en Datos"— se sacaron el
  // 07/09: eran listas que ya estan marcadas jugador por jugador en la tabla.
  // Queda el de formaciones confirmadas, que es el unico que cambia el calculo:
  // cuando el club publica el once, los minutos dejan de ser una estimacion.
  const avisos = [];
  {
    const todos = [].concat(...['ARQ', 'DEF', 'VOL', 'DEL'].map(p => D.rankings[p] || []));
    const confirmados = todos.filter(x => x.fmin === 'once confirmado').length;
    if (confirmados) avisos.push(['✅', 'Formaciones confirmadas',
      `${confirmados} jugadores con el once ya publicado: para ellos los minutos no son estimación`, '', 'ok']);
  }

  // ── EL INICIO ES UN VERSUS (07/09) ───────────────────────────────────────
  // Antes acá había una cancha sola con el once del motor. Ahora hay dos: el
  // del motor y el que armaste vos en el juego, con los puntajes de la fecha
  // en vivo si están bajados. Es el mismo S.once de siempre —lo que tocás acá
  // queda tocado en Mejor 11 y al revés—, más S.mi11, que es tuyo y no toca
  // nada del motor.
  if (!S.once.length) rearmarOnce();
  recalcCapitan();
  const esRiesgo = S.esquema === '__riesgo';

  // Si elegiste un capitán que no es el de ficha más alta, conviene decir
  // cuánto cuesta esa decisión en vez de dejarlo pasar callado.
  const capSug11 = capitanSugerido();
  const capElegido = S.capitanManual && TODOS[S.capitanManual];
  const capOtro = capSug11 && TODOS[capSug11];
  const avisoCap = (capElegido && capOtro && S.capitanManual !== capSug11)
    ? `La cinta la elegiste vos: <b>${esc(nombreCorto(capElegido.n))}</b> (ficha esperada ${n2(fichaCap(capElegido))}).
       El que más paga es <b>${esc(nombreCorto(capOtro.n))}</b> (${n2(fichaCap(capOtro))}),
       así que estás resignando <b>${n2(fichaCap(capOtro) - fichaCap(capElegido))}</b> puntos.`
    : '';

  const bloqueOnce = `
    ${bloqueVersus()}
    ${(() => {
      const of = (S.oncesLocales && S.oncesLocales[0]) || null;
      if (!of || esRiesgo) return '';
      const igual = S.once.length === of.ids.length && S.once.every(id => of.ids.includes(id));
      return igual ? '' : `<div class="oi-fuera">
        El once del motor está <b>modificado por vos</b>. El oficial es ${esc(esquemaLindo(of.e))} con ${n1(of.total)} puntos.
        <button class="oi-limpiar" id="oi-volver-of">volver al oficial</button></div>`;
    })()}
    ${avisoCap ? `<div class="oi-fuera oi-cap-aviso">${avisoCap}
      <button class="oi-limpiar" id="oi-cap-auto">volver al automático</button></div>` : ''}`;

  const pct = v => v == null ? '–' : Math.round(v * 100) + '%';
  const fmtCorto = d => d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  // los tres titulares de la fecha, para no tener que leer los quince partidos
  const conDato = partidos.filter(m => m.golesEsperadosLocal != null && !m.yaJugado);
  const totGol = m => (m.golesEsperadosLocal || 0) + (m.golesEsperadosVisitante || 0);
  const porGol = conDato.slice().sort((a, b) => totGol(b) - totGol(a));
  const masGoles = porGol[0];
  const menosGoles = porGol.length > 1 ? porGol[porGol.length - 1] : null;
  const lados = [];
  conDato.forEach(m => {
    lados.push({ eq: m.local, riv: m.visitante, cond: 'L', valla: m.pVallaLocal, pgol: m.pGolLocal, lam: m.golesEsperadosLocal });
    lados.push({ eq: m.visitante, riv: m.local, cond: 'V', valla: m.pVallaVisitante, pgol: m.pGolVisitante, lam: m.golesEsperadosVisitante });
  });
  const mejorValla = lados.slice().sort((a, b) => (b.valla ?? 0) - (a.valla ?? 0))[0];
  const mejorAtaque = lados.slice().sort((a, b) => (b.lam ?? 0) - (a.lam ?? 0))[0];

  const titular = (ic, lbl, val, sub, ayuda) => `
    <div class="fh-tarjeta" title="${esc(ayuda)}">
      <div class="fh-ic">${ic}</div>
      <div class="fh-txt"><div class="fh-lbl">${lbl}</div>
        <div class="fh-val">${val}</div><div class="fh-sub">${sub}</div></div>
    </div>`;

  const titulares = conDato.length ? `<div class="fecha-titulares">
    ${masGoles ? titular('⚽', 'El partido con más gol',
        esc(NOM(masGoles.local)) + ' vs ' + esc(NOM(masGoles.visitante)),
        n2(masGoles.golesEsperadosLocal + masGoles.golesEsperadosVisitante) + ' goles esperados entre los dos',
        'Suma de los goles esperados de los dos equipos, que salen de las cuotas de este partido.') : ''}
    ${mejorAtaque ? titular('🎯', 'El ataque con mejor contexto',
        esc(NOM(mejorAtaque.eq)),
        n2(mejorAtaque.lam) + ' goles esperados ' + (mejorAtaque.cond === 'L' ? 'de local' : 'de visitante') + ' vs ' + esc(NOM(mejorAtaque.riv)),
        'El equipo al que el mercado le da más goles esta fecha. Sus delanteros y volantes arrancan de acá.') : ''}
    ${mejorValla ? titular('🧤', 'La valla más probable',
        esc(NOM(mejorValla.eq)),
        pct(mejorValla.valla) + ' de dejar el arco en cero ' + (mejorValla.cond === 'L' ? 'de local' : 'de visitante'),
        'Chance de no recibir goles. Es lo que le paga 3 al arquero y 2 a cada defensor.') : ''}
    ${menosGoles ? titular('🔒', 'El partido con menos gol',
        esc(NOM(menosGoles.local)) + ' vs ' + esc(NOM(menosGoles.visitante)),
        n2(totGol(menosGoles)) + ' goles esperados entre los dos',
        'El partido más cerrado de la fecha. Es donde más chances hay de valla invicta y menos de que un delantero convierta.') : ''}
  </div>` : '';

  // una tarjeta por partido
  const maxLam = Math.max(0.01, ...conDato.map(m => Math.max(m.golesEsperadosLocal || 0, m.golesEsperadosVisitante || 0)));
  const ladoPartido = (nom, lam, pgol, valla, esLocal, gana) => `
    <div class="pp-lado${gana ? ' pp-fuerte' : ''}">
      <div class="pp-eq">${esc(NOM(nom))}<span class="pp-cond">${esLocal ? 'L' : 'V'}</span></div>
      <div class="pp-barra"><span style="width:${Math.round(100 * (lam || 0) / maxLam)}%;"></span></div>
      <div class="pp-nums">
        <span title="Goles esperados de este equipo en este partido, según las cuotas."><b>${n2(lam)}</b> gol esp.</span>
        <span title="Chance de que este equipo convierta al menos un gol.">${pct(pgol)} mete</span>
        <span title="Chance de que este equipo deje la valla invicta. Paga 3 al arquero y 2 a cada defensor.">${pct(valla)} valla</span>
      </div>
    </div>`;

  const tarjetasPartido = partidos.map(m => {
    const d = new Date(m.cuando);
    const gl = m.golesEsperadosLocal, gv = m.golesEsperadosVisitante;
    return `<div class="part-card${m.yaJugado ? ' part-jugado' : ''}">
      <div class="pp-cab">
        <span class="pp-cuando">${esc(fmtCorto(d))} · ${esc(fmtHora(d))}</span>
        <span class="pp-cab-der">
          ${m.yaJugado ? '<span class="pp-jugado">ya se jugó</span>'
            : (!m.tieneMercado ? '<span class="pp-sinmercado" title="Sin cuotas de las casas para este partido: los goles esperados salen del nivel de los equipos.">sin cuotas</span>' : '')}
          ${(gl != null && gv != null) ? `<span class="pp-total"
            title="Goles esperados entre los dos equipos. Cuanto más alto, más chances de gol y menos de valla invicta.">${n2(gl + gv)} <small>gol esp.</small></span>` : ''}
        </span>
      </div>
      <div class="pp-lados">
        ${ladoPartido(m.local, gl, m.pGolLocal, m.pVallaLocal, true, gl >= gv)}
        ${ladoPartido(m.visitante, gv, m.pGolVisitante, m.pVallaVisitante, false, gv > gl)}
      </div>
    </div>`;
  }).join('');
  cont.innerHTML = `
    ${cabecera('Fecha ' + (D.fechaObjetivo ?? '–'),
      partidos.length + ' partidos' + (primero && ultimo ? ' · ' + esc(fmtDiaCorto(primero)) + ' al ' + esc(fmtDiaCorto(ultimo)) : ''),
      cierre)}

    ${avisos.length ? `<div class="tarjetas-aviso">${avisos.map(([ic, tit, txt, lista, tipo]) => `
      <div class="aviso-card aviso-${tipo}">
        <div class="aviso-top"><span class="aviso-ic">${ic}</span><b>${tit}</b></div>
        <p>${txt}</p>
        ${lista ? `<div class="aviso-lista">${lista}</div>` : ''}
      </div>`).join('')}</div>` : ''}

    ${bloqueOnce}

    ${titulares}

    <div class="fecha-sec-tit">
      <h2>Los ${partidos.length} partidos de la fecha</h2>
      <p>Lo que el modelo espera de cada equipo en <b>este</b> partido. Sale de las cuotas, así que el rival ya está adentro.</p>
    </div>
    <div class="grilla-partidos">${tarjetasPartido}</div>

    <div class="fecha-pie">
      El <b>gol esperado</b> es cuántos goles espera el modelo de ese equipo en este partido; la barra los compara entre los treinta.
      <b>Mete</b> es la chance de que convierta al menos uno y <b>valla</b> la de que no reciba ninguno — eso último es lo que le
      paga 3 al arquero y 2 a cada defensor. Para ver quién de ese equipo se lleva esos goles, andá a <b>Jugadores</b>.
    </div>`;

  // el once del motor comparte estado con la pantalla Mejor 11
  cont.querySelectorAll('[data-sacar]').forEach(b => b.onclick = ev => toggleFuera(b.dataset.sacar, ev));
  cont.querySelectorAll('[data-cambiar]').forEach(b => b.onclick = () => abrirCambio(b.dataset.cambiar));
  cont.querySelectorAll('[data-capitan]').forEach(b => b.onclick = ev => ponerCapitan(b.dataset.capitan, ev));
  // ── mi once: no toca nada del motor ──
  cont.querySelectorAll('[data-mi-slot]').forEach(b => b.onclick = () => {
    const [pos] = b.dataset.miSlot.split(':'); miElegir(pos, '');
  });
  cont.querySelectorAll('[data-mi-jug]').forEach(b => b.onclick = () => {
    const id = b.dataset.miJug; miElegir((TODOS[id] || {}).pos, id);
  });
  cont.querySelectorAll('[data-mi-sacar]').forEach(b => b.onclick = ev => miSacar(b.dataset.miSacar, ev));
  cont.querySelectorAll('[data-mi-cap]').forEach(b => b.onclick = ev => miCapitan(b.dataset.miCap, ev));
  { const e = $('vs-esq'); if (e) e.onchange = () => miEsquema(e.value); }
  ['vs-copiar', 'vs-copiar2'].forEach(id => { const b = $(id); if (b) b.onclick = () => miCopiarDelMotor(); });
  ['vs-pegar', 'vs-pegar2'].forEach(id => { const b = $(id); if (b) b.onclick = () => pegarMiOnce(); });
  cont.querySelectorAll('[data-cinta]').forEach(inp => {
    inp.onclick = e => e.stopPropagation();
    inp.onchange = () => {
      const v = inp.value === '' ? null : parseFloat(inp.value);
      ponerFichaManual(inp.dataset.cinta, v);
      repintarPorMano();
    };
  });
  cont.querySelectorAll('[data-mi-banco]').forEach(b => b.onclick = () => miElegirBanco(b.dataset.miBanco));
  cont.querySelectorAll('[data-mi-banco-x]').forEach(b => b.onclick = ev => miSacarBanco(b.dataset.miBancoX, ev));
  { const b = $('vs-borrar'); if (b) b.onclick = () => miVaciar(); }
  { const se = $('oi-esquema'); if (se) se.onchange = () => cambiarEsquema(se.value); }
  { const vd = $('oi-ver-detalle'); if (vd) vd.onclick = () => mostrarSeccion('once'); }
  { const lm = $('oi-limpiar'); if (lm) lm.onclick = () => limpiarFuera(); }
  { const ca = $('oi-cap-auto'); if (ca) ca.onclick = () => ponerCapitan(S.capitanManual); }
  { const vo = $('oi-volver-of'); if (vo) vo.onclick = () => { const of = S.oncesLocales && S.oncesLocales[0]; if (of) cambiarEsquema(of.e); }; }

  cont.querySelectorAll('[data-ir-puesto]').forEach(b => b.onclick = () => {
    S.pos = b.dataset.irPuesto;
    document.querySelectorAll('.tab-btn[data-tab]').forEach(z => z.classList.toggle('active', z.dataset.tab === S.pos));
    mostrarSeccion('jugadores');
  });
}

function eventos() {
  // Menu de los tres puntos: lo que se usa una vez cada tanto no tiene por que
  // estar siempre a la vista.
  const btnMas = $('btn-menu'), menuMas = $('menu-mas');
  if (btnMas && menuMas) {
    btnMas.onclick = e => { e.stopPropagation(); menuMas.hidden = !menuMas.hidden; btnMas.classList.toggle('abierto', !menuMas.hidden); };
    document.addEventListener('click', e => {
      if (!menuMas.hidden && !menuMas.contains(e.target) && e.target !== btnMas) { menuMas.hidden = true; btnMas.classList.remove('abierto'); }
    });
    menuMas.querySelectorAll('.menu-item').forEach(b => b.addEventListener('click', () => {
      if (b.id === 'menu-fuera') return;          // este tiene sus propios botones
      menuMas.hidden = true; btnMas.classList.remove('abierto');
    }));
  }
  { const bp = $('btn-fuera-publicar'); if (bp) bp.onclick = e => { e.stopPropagation(); exportarDescartes(); }; }
  { const bm = $('btn-cargar-mano'); if (bm) bm.onclick = () => abrirCargarMano(); }   // el menu se cierra solo: es un .menu-item
  { const bl = $('btn-fuera-limpiar'); if (bl) bl.onclick = e => { e.stopPropagation(); limpiarFuera(); }; }
  pintarMenuFuera();
  document.querySelectorAll('.nav-btn[data-sec]').forEach(b => b.onclick = () => mostrarSeccion(b.dataset.sec));
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(z => z.classList.remove('active'));
    b.classList.add('active');
    const t = b.dataset.tab;
    {
      // Líderes dejó de ser una pestaña de esta tabla: ahora es una sección
      // propia del menú de arriba. Acá ya no hay nada que esconder.
      // Antes cambiar de puesto reseteaba el orden a 'sc', que ni siquiera es
      // uno de los botones de la barra: elegias "Amenaza de gol" en DEF,
      // pasabas a DEL y la barra quedaba sin ninguno marcado y la tabla
      // ordenada por otra cosa. El orden que elegiste se respeta.
      S.pos = t;
      pintarRankings();
    }
  });
  const q = $('search-input'); if (q) q.oninput = () => { S.busqueda = sinTildes(q.value.trim()); pintarRankings(); };
  // Filtro por club. La lista sale de los jugadores que hay de verdad en el
  // ranking, no de una lista fija de 30 nombres escrita a mano: si un club no
  // tiene a nadie cargado, no aparece.
  const selEq = $('filtro-equipo');
  if (selEq) {
    const equipos = [...new Set(['ARQ','DEF','VOL','DEL']
      .flatMap(p => (D.rankings[p] || []).map(x => x.eq)))]
      .sort((a, b) => NOM(a).localeCompare(NOM(b), 'es'));
    selEq.innerHTML = '<option value="">Todos los equipos</option>' +
      equipos.map(e => `<option value="${esc(e)}">${esc(NOM(e))}</option>`).join('');
    selEq.onchange = () => { S.equipo = selEq.value; pintarRankings(); };
  }
  document.querySelectorAll('.standings-zona-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.standings-zona-btn').forEach(z => z.classList.remove('active'));
    b.classList.add('active'); pintarTabla();
  });
  document.querySelectorAll('.standings-filter-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.standings-filter-btn').forEach(z => z.classList.remove('active'));
    b.classList.add('active'); S.filtroTabla = b.dataset.filter; pintarTabla();
  });
  const bm = $('btn-mejor-11'); if (bm) bm.onclick = () => mostrarSeccion('once');
  const bw = $('btn-open-weights'); if (bw) bw.onclick = abrirQueMide;
  const bt = $('btn-open-full-standings'); if (bt) bt.onclick = abrirTablaCompleta;
  const bo = $('btn-open-odds-modal'); if (bo) bo.onclick = () => abrirEquipos();
  const btr = $('btn-open-tournament'); if (btr) btr.onclick = abrirEquipos;
  const sel = $('select-active-formation'); if (sel) sel.onchange = () => cambiarEsquema(sel.value);
  // Estos dos botones venian de la version vieja y no hacian NADA: se pintaba
  // "Solido" activo y listo. Ahora si cambian el once.
  const bSol = $('btn-mode-solid'), br = $('btn-mode-risky');
  if (bSol) bSol.onclick = () => cambiarEsquema(D.esquema.optimo.esquema);
  if (br) br.onclick = () => { if (D.arriesgado) cambiarEsquema('__riesgo');
    else modalTexto('Once arriesgado', 'Todavia no esta calculado. Hay que correr ACTUALIZAR_TODO.bat de nuevo para que se genere.'); };
  const bh = $('lbl-health-badge'); if (bh) bh.onclick = abrirSalud;
  const bt2 = $('btn-open-tablero'); if (bt2) bt2.onclick = abrirTablero;
  ['btn-open-backtest', 'btn-open-learning'].forEach(id => {
    const b = $(id); if (b) b.onclick = () => avisoPendiente();   // ya no estan en la cabecera
  });
  const bs = $('btn-sync-now');
  if (bs) bs.onclick = () => modalTexto('Cómo se actualizan los datos', `
    <div class="md-seccion">
      <h4>Los cuatro .bat de la carpeta</h4>
      <p class="md-p"><b>SYNC_PLANETA.bat</b> — la planilla oficial: puntos, cotización, goles, tarjetas, vallas. Es la fuente de la ficha.</p>
      <p class="md-p"><b>SYNC_365.bat</b> — 365Scores: tiros, tiros al arco, xG y minutos, jugador por jugador. Tarda varios minutos.</p>
      <p class="md-p"><b>SYNC_CUOTAS.bat</b> — the-odds-api: 1X2 y Over/Under promediados entre casas, con el margen descontado.</p>
      <p class="md-p"><b>SYNC_COPAS.bat</b> — calendario de liga y copas, para saber quién llega cansado o guarda gente.</p>
    </div>
    <div class="md-seccion">
      <h4>Después</h4>
      <p class="md-p">Los cuatro escriben archivos <code>.json</code> en la carpeta. Con esos archivos se regenera <code>datos.js</code>, y recargando esta página ya ves todo actualizado.</p>
      <p class="md-p suave">Última generación: ${esc(new Date(D.generado).toLocaleString('es-AR'))} · datos de la liga hasta la fecha ${D.ultimaFechaJugada} · analizando la fecha ${D.fechaObjetivo}.</p>
    </div>`);
  document.querySelectorAll('.close-modal').forEach(b => b.onclick = e => cerrarModal(e.target.closest('.modal')));
  document.querySelectorAll('.modal').forEach(m => m.onclick = e => { if (e.target === m) cerrarModal(m); });
  const lc = $('leaders-cat-select'), lp = $('leaders-pos-select');
  if (lc) lc.onchange = pintarLideres;
  if (lp) lp.onchange = pintarLideres;
}
/** Modales apilables. Todos comparten z-index 9999 en el CSS, asi que el que
 *  esta despues en el HTML tapa al que se abrio despues: por eso al tocar un
 *  jugador dentro del Mejor 11 la auditoria aparecia DETRAS de la cancha.
 *  Cada apertura sube un escalon. */
let zModal = 9999;
/** Modal generico: se crea una sola vez y se reusa. Sirve para paneles que no
 *  tienen su propio markup en el HTML. */
function modalTexto(titulo, html) {
  let m = $('modal-generico');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-generico';
    m.className = 'modal';
    m.innerHTML = `<div class="modal-content modal-lg">
        <div class="modal-header"><h2 id="mg-titulo"></h2><button class="close-modal" style="background:none;border:none;color:var(--text-muted);font-size:1.4rem;cursor:pointer;">&times;</button></div>
        <div class="modal-body" id="mg-body"></div></div>`;
    document.body.appendChild(m);
    m.querySelector('.close-modal').onclick = () => cerrarModal(m);
    m.onclick = e => { if (e.target === m) cerrarModal(m); };
  }
  $('mg-titulo').textContent = titulo;
  $('mg-body').innerHTML = html;
  abrirModal('modal-generico');
}


// ── Etiqueta de rotacion ────────────────────────────────────────────────────
// Antes cualquier equipo con indice > 0 mostraba "COPA". River quedo afuera de
// todas las copas y seguia apareciendo con COPA: su indice venia de haber
// jugado el miercoles, no de tener copa por delante. Son dos cosas distintas y
// se leen distinto — el que guarda gente pone suplentes, el que llega cansado
// pone titulares fundidos.

// El esquema se guarda como "1-4-3-3" porque adentro incluye al arquero, pero
// nadie dice "uno cuatro tres tres". Para mostrar se le saca el 1 de adelante.
function esquemaLindo(e) {
  if (!e || typeof e !== 'string') return e || '';
  return e.replace(/^1-/, '');
}

function pillRotacion(m, chico) {
  if (!m) return '';
  const num = v => v == null ? '?' : (v == Math.round(v) ? v : v.toFixed(1));
  if (m.tipo === 'guarda') {
    const d = num(m.dias);
    const t = `Juega ${m.torneo} en ${d} días: es probable que ponga suplentes en la liga`;
    return `<span class="pill-alerta pill-copa" title="${esc(t)}">${chico ? '🏆 ' + d + 'd' : 'COPA en ' + d + ' días'}</span>`;
  }
  const d = num(m.dias);
  const t = `Vino de jugar ${m.torneo} hace ${d} días. Llega con poco descanso, pero no necesariamente rota`;
  return `<span class="pill-alerta pill-cansado" title="${esc(t)}">${chico ? '😴 ' + d + 'd' : d + ' días de descanso'}</span>`;
}

function abrirModal(id) {
  const m = $(id); if (!m) return;
  zModal += 10; m.style.zIndex = zModal;
  m.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function cerrarModal(m) {
  if (!m) return;
  m.classList.remove('active');
  soltarScroll();
}
// EL SCROLL SE SUELTA MIRANDO EL DOM, NO CONFIANDO EN QUIEN CERRO (07/09).
// abrirModal pone document.body.style.overflow='hidden' y solo cerrarModal lo
// devolvia. Siete lugares cerraban el modal con classList.remove('active') a
// mano —el selector de jugadores, el alta de equipo, el pegado, el importar— y
// cada uno dejaba el body trabado para siempre: no se podia scrollear ni salir
// de la pantalla, y parecia que la pagina se habia colgado. Ahora la regla es
// una sola y se verifica sola: si no queda ningun modal abierto, el scroll
// vuelve. Se llama tambien en cada pintada de pantalla, por las dudas.
function soltarScroll() {
  if (!document.querySelector('.modal.active')) {
    document.body.style.overflow = '';
    zModal = 9999;
  }
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const abiertos = [...document.querySelectorAll('.modal.active')];
  if (abiertos.length) cerrarModal(abiertos.sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0)).pop());
});

// ── cabecera ────────────────────────────────────────────────────────────────
function pintarCabecera() {
  const totJug = ['ARQ', 'DEF', 'VOL', 'DEL'].reduce((a, p) => a + D.rankings[p].length, 0);
  const conTiros = Object.values(TODOS).filter(x => x.ind && x.ind.tiros > 0).length;
  const c = D.cuotas || {};
  // En la barra va lo corto. El detalle completo queda en el globito: la
  // cabecera decia "Analisis Estadistico Avanzado y Algoritmo de Armado ·
  // Fecha 7 · 15 de 15 partidos por jugarse · motor v10 · 30/08/2026 · app
  // v19" y eso no se lee, se saltea.
  const st = $('lbl-status-fecha');
  if (st) {
    st.textContent = `Fecha ${D.fechaObjetivo || ''}`;
    st.title = c.pendientes != null
      ? `${c.pendientes} de ${D.partidos.length} partidos por jugarse`
      : `${D.partidos.length} partidos`;
    st.classList.toggle('barra-fecha-alerta', !!c.vencidas);
    if (c.vencidas) { st.textContent = `Fecha ${D.fechaObjetivo} ya jugada`; st.title = 'Hay que actualizar las cuotas'; }
  }
  const df = $('lbl-datos-fecha'); if (df) df.textContent = String(D.ultimaFechaJugada || 5);
  // Version que genero estos datos. Si no dice la que esperas, los archivos
  // nuevos no llegaron a la carpeta y estas mirando una version vieja.
  const lv = $('lbl-version');
  if (lv) {
    const v = D.version || 'sin sello (motor viejo)';
    // EL SELLO DEL BUILD, A LA VISTA (08/09). Lo pone construir.cjs adentro del
    // index. Sirve para una cosa concreta: abrir la pagina publicada, mirar
    // este numero y saber si es la misma que tenés en la carpeta, sin adivinar.
    const meta = document.querySelector('meta[name="gdt-build"]');
    const sello = meta ? meta.getAttribute('content') : null;
    lv.innerHTML = `<b style="color:${D.version ? '#10b981' : '#ef4444'};">motor ${esc(v)}</b>` +
      (sello ? ` · <span title="La huella de este index.html. Tiene que ser la misma en tu carpeta y en la página publicada.">build ${esc(sello)}</span>`
             : ' · <span style="color:#ef4444;">index sin sello: corré construir.cjs</span>');
  }
  // Un solo chip de estado. El detalle (cuantos jugadores, cuantos con tiros
  // medidos, cuantas fichas cierran) esta adentro del modal que abre.
  const v = D.validacion || {};
  const fueraPct = v.pctFuera || 0;
  const hp = $('lbl-health-pct');
  if (hp) hp.textContent = fueraPct <= 2 ? 'OK' : `${100 - Math.round(fueraPct)}%`;
  const hb = $('lbl-health-badge');
  if (hb) {
    hb.title = `${totJug} jugadores en el análisis, ${conTiros} con tiros medidos. ` +
      `${(v.total || 0) - (v.fuera || 0)} de ${v.total || 0} fichas reconstruidas caen dentro del 1-10 de Clarín. Tocá para el detalle.`;
    hb.classList.toggle('chip-ok', fueraPct <= 8);
    hb.classList.toggle('chip-alerta', fueraPct > 8);
  }
  window.__COBERTURA = { totJug, conTiros };
}

// ── fixture ─────────────────────────────────────────────────────────────────
function pintarFixture() {
  const cont = $('fixture-list'); if (!cont) return;
  const sel = $('fixture-round-select');
  const FXC = D.fixtureCompleto || [];
  const fechas = [...new Set(FXC.map(m => m.numeroFecha).filter(f => f != null))].sort((a, b) => a - b);
  if (sel && !sel.dataset.listo) {
    const jugadasPorFecha = {};
    FXC.filter(m => m.terminado).forEach(m => { jugadasPorFecha[m.numeroFecha] = (jugadasPorFecha[m.numeroFecha] || 0) + 1; });
    sel.innerHTML = '<option value="prox">Próxima fecha (con cuotas)</option>' +
      fechas.map(f => {
        const j = jugadasPorFecha[f] || 0, tot = FXC.filter(m => m.numeroFecha === f).length;
        const etiqueta = j === 0 ? 'por jugar' : (j >= tot ? 'jugada' : j + '/' + tot);
        return `<option value="f${f}">Fecha ${f} · ${etiqueta}</option>`;
      }).join('');
    sel.dataset.listo = '1';
    sel.onchange = pintarFixture;
  }
  const modo = sel ? sel.value : 'prox';
  cont.innerHTML = '';

  if (modo !== 'prox') {
    const num = Number(modo.slice(1));
    const lista = FXC.filter(m => m.numeroFecha === num)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    if (!lista.length) { cont.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:0.8rem;">Sin partidos en esa fecha.</div>'; return; }
    // Una FILA POR EQUIPO. El grid "1fr auto 1fr" con los nombres alineados a
    // los bordes tiraba a Boca contra el margen izquierdo y a Lanus contra el
    // derecho, y en 320px de barra lateral "Independiente Rivadavia" se cortaba
    // en "Independiente ...". Asi los nombres arrancan todos en la misma
    // columna, se leen de un vistazo y no hay nada que recortar.
    lista.forEach(m => {
      const div = document.createElement('div');
      div.className = 'fx2-card';
      const zona = m.zona === 'INT' ? 'interzonal' : (m.zona ? 'zona ' + m.zona : '');
      const gl = m.golesLocal, gv = m.golesVisitante;
      const fila = (nombre, goles, gana) => `
        <div class="fx2-row${gana ? ' fx2-gana' : ''}">
          <span class="fx2-name">${esc(NOM(nombre))}</span>
          <span class="fx2-goals">${m.terminado ? goles : ''}</span>
        </div>`;
      div.innerHTML =
        fila(m.local, gl, m.terminado && gl > gv) +
        fila(m.visitante, gv, m.terminado && gv > gl) +
        `<div class="fx2-foot">${fechaCorta(m.fecha)}${zona ? ' · ' + zona : ''}${m.terminado ? '' : ' · por jugar'}</div>`;
      cont.appendChild(div);
    });
    return;
  }

  // ── Tarjeta de partido de la proxima fecha ────────────────────────────────
  // Se rehizo: antes el nombre del equipo entraba DENTRO de cada pill
  // ("Gol Aldosivi Mar del Plata: 68%") y con eso nada entraba en 320px.
  // Ahora cada equipo tiene su columna con sus dos numeros debajo, y la barra
  // 1-X-2 reemplaza tres pills por una sola lectura visual.
  const barra = m => {
    const t = (m.probLocal || 0) + (m.probEmpate || 0) + (m.probVisitante || 0) || 1;
    const w = v => (100 * (v || 0) / t).toFixed(1) + '%';
    return `<div class="fx-bar" title="Probabilidad real segun el mercado, con el margen de la casa ya descontado: ${pc0(m.probLocal)} local · ${pc0(m.probEmpate)} empate · ${pc0(m.probVisitante)} visitante">
      <i style="width:${w(m.probLocal)};background:var(--primary);"></i>
      <i style="width:${w(m.probEmpate)};background:#64748b;"></i>
      <i style="width:${w(m.probVisitante)};background:var(--warning);"></i></div>`;
  };
  // Misma idea que arriba: una fila por equipo, el nombre siempre a la
  // izquierda y los numeros de ese equipo alineados en columna. Antes el local
  // se pegaba al borde izquierdo y el visitante al derecho, con la ultima letra
  // comida, y habia que leer en zigzag para comparar dos numeros que estan uno
  // al lado del otro.
  // Dos renglones por equipo. Antes iba todo en uno solo — nombre, pill de
  // rotacion, gol, valla y cuota — y en 320px de barra lateral el nombre se
  // comia: "Sarmi...", "Lanus" afuera del cuadro. Ahora el nombre tiene la
  // fila entera (y puede ocupar dos renglones si hace falta, sin recortarse)
  // con la cuota 1X2 anclada a la derecha, y los numeros del equipo van
  // debajo, chiquitos y alineados.
  const filaEquipo = (nombre, pGol, pVI, motivo, cuota, etiqueta, cuotaGol) => `
    <div class="fx2-team">
      <div class="fx2-row">
        <span class="fx2-name">${esc(NOM(nombre))}</span>${pillRotacion(motivo, true)}
        <span class="fx2-odd" title="Cuota de mercado para ${etiqueta}">${n2(cuota)}</span>
      </div>
      <div class="fx2-sub">
        <span class="fx2-stat" title="Probabilidad de que convierta al menos un gol, y al lado la cuota que le corresponde. CALCULADO por nosotros resolviendo un Poisson contra el 1X2 y el Over/Under sin margen. Compará esa cuota con la que paga tu casa: si difieren mucho, avisá.">⚽ ${pc0(pGol)}${cuotaGol ? ` <b>${n2(cuotaGol)}</b>` : ''}</span>
        <span class="fx2-stat" title="Probabilidad de que le dejen la valla invicta. CALCULADO igual que la anterior.">🛡️ ${pc0(pVI)}</span>
      </div>
    </div>`;

  // Agrupado por dia, con una banda por jornada. Un chorizo de quince tarjetas
  // iguales no deja ver que el viernes hay dos partidos y el sabado cinco.
  let diaAnterior = null;
  [...D.partidos].sort((a, b) => new Date(a.cuando) - new Date(b.cuando)).forEach(m => {
    const d = new Date(m.cuando);
    const claveDia = d.toDateString();
    if (claveDia !== diaAnterior) {
      diaAnterior = claveDia;
      const banda = document.createElement('div');
      banda.className = 'fx-banda';
      banda.textContent = d.toLocaleDateString('es-AR',
        { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
      cont.appendChild(banda);
    }
    const div = document.createElement('div');
    div.className = 'fx2-card' + (m.yaJugado ? ' fx-pasado' : '');
    const dia = d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(/-/g, '/');
    const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const t = (m.probLocal || 0) + (m.probEmpate || 0) + (m.probVisitante || 0) || 1;
    const w = v => (100 * (v || 0) / t).toFixed(1) + '%';
    div.innerHTML = `
      <div class="fx2-head">
        <span>${m.yaJugado ? '<span class="fx-jugado" title="Este partido ya se jugó">JUGADO</span> ' : ''}${esc(hora)}</span>
        ${m.lineaTotales != null ? `<span class="fx-ou" title="Línea de goles del mercado: las casas ponen el corte en ${m.lineaTotales} goles TOTALES entre los dos equipos y pagan casi lo mismo por encima o por debajo. Cuanto más alta, más goles se esperan en el partido.">${m.lineaTotales} goles</span>` : ''}
        ${badgeCorners(m)}
      </div>
      ${filaEquipo(m.local, m.pGolLocal, m.pVallaLocal, m.motivoRotLocal, m.cuotaLocal, 'que gane el local', m.cuotaGolLocalEstimada)}
      ${filaEquipo(m.visitante, m.pGolVisitante, m.pVallaVisitante, m.motivoRotVisitante, m.cuotaVisitante, 'que gane el visitante', m.cuotaGolVisitanteEstimada)}
      <div class="fx-bar" title="Probabilidad real según el mercado, con el margen de la casa ya descontado: ${pc0(m.probLocal)} local · ${pc0(m.probEmpate)} empate · ${pc0(m.probVisitante)} visitante">
        <i style="width:${w(m.probLocal)};background:var(--primary);"></i>
        <i style="width:${w(m.probEmpate)};background:#64748b;"></i>
        <i style="width:${w(m.probVisitante)};background:var(--warning);"></i></div>
      <div class="fx2-foot">local ${pc0(m.probLocal)} · empate ${pc0(m.probEmpate)} (paga ${n2(m.cuotaEmpate)}) · visitante ${pc0(m.probVisitante)}</div>`;
    cont.appendChild(div);
  });
  cont.insertAdjacentHTML('beforeend',
    `<div class="fx-nota">El número en negrita al lado del <b>⚽</b> es la <b>cuota de gol</b> que sale de nuestro cálculo. Comparala con la que paga tu casa: si difieren mucho en un partido, avisame y lo miramos.
      El número de arriba a la derecha (<b>2.5 goles</b>) es la línea de las casas: cuántos goles TOTALES esperan en ese partido. Cuanto más alta, partido más abierto.
      Las cuotas <b>1 / X / 2</b> son de mercado, promediadas entre casas y con el margen descontado.
      Lo de <b>⚽</b> y <b>🛡️</b> es cálculo nuestro: la cuota de "gol de tal equipo" no existe en el plan gratis de la API.
      El <b>🚩</b> marca los tres partidos de la fecha donde el que más córners genera se cruza con el que más concede, con los córners ya contados por ESPN en este torneo. No suma puntos en Gran DT: es para mirar el partido.</div>`);
}

// ── tabla de posiciones ─────────────────────────────────────────────────────
function filaTabla(t) {
  const b = S.filtroTabla === 'home' ? t.local : S.filtroTabla === 'away' ? t.visitante : t;
  return { ...t, pj: b.pj, pg: b.pg, pe: b.pe, pp: b.pp, gf: b.gf, gc: b.gc, pts: b.pts, dif: b.gf - b.gc };
}
// El torneo se juega en dos zonas de 15. La tabla general no existe: cada
// equipo compite contra los de su zona.
function tablaDeZona(selector) {
  const btn = document.querySelector(selector + '.active');
  const zona = btn ? (btn.dataset.zona === 'zonaB' ? 'B' : 'A') : 'A';
  if (D.tablaZonas && D.tablaZonas[zona] && D.tablaZonas[zona].length) return D.tablaZonas[zona];
  return D.tabla || [];
}
function pintarTabla() {
  const body = $('standings-body'); if (!body) return;
  const filas = tablaDeZona('.standings-zona-btn').map(filaTabla).sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.gf - a.gf);
  const punto = r => {
    const c = r === 'G' ? '#10b981' : r === 'E' ? '#94a3b8' : '#ef4444';
    return `<span class="result-dot" style="background:${c};" title="${r === 'G' ? 'Ganó' : r === 'E' ? 'Empató' : 'Perdió'}"></span>`;
  };
  // La tabla vivia apretada en la barra lateral y solo entraban PJ, PTS y la
  // forma. Ahora que tiene la pantalla entera se muestra completa, como
  // cualquier tabla de posiciones: ganados, empatados, perdidos y goles.
  body.innerHTML = filas.map((t, i) => `
    <tr class="${i === 7 ? 'fila-corte' : ''}" style="cursor:pointer;" onclick="verEquipo('${esc(t.equipo)}')" title="Ver el detalle de ${esc(NOM(t.equipo))}">
      <td class="text-center"><span class="pos-badge${i < 8 ? ' pos-arriba' : ''}"${i === 7 ? ' title="Los ocho primeros de cada zona pasan a los octavos de final"' : ''}>${i + 1}</span></td>
      <td><span class="team-badge-pill">${esc(NOM(t.equipo))}</span></td>
      <td class="text-center" style="font-weight:800;font-size:1.02rem;">${t.pts}</td>
      <td class="text-center">${t.pj}</td>
      <td class="text-center">${t.pg}</td>
      <td class="text-center">${t.pe}</td>
      <td class="text-center">${t.pp}</td>
      <td class="text-center">${t.gf}</td>
      <td class="text-center">${t.gc}</td>
      <td class="text-center" style="color:${t.dif > 0 ? 'var(--success)' : t.dif < 0 ? 'var(--danger)' : 'var(--text-muted)'};">${t.dif > 0 ? '+' : ''}${t.dif}</td>
      <td class="text-center"><span class="form-dots">${(t.forma || []).map(punto).join('')}</span></td>
    </tr>`).join('');
}
function abrirTablaCompleta() {
  const body = $('full-standings-body'); if (!body) return;
  document.querySelectorAll('.full-standings-zona-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.full-standings-zona-btn').forEach(z => z.classList.remove('active'));
    b.classList.add('active'); abrirTablaCompleta();
  });
  document.querySelectorAll('.full-standings-filter-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.full-standings-filter-btn').forEach(z => z.classList.remove('active'));
    b.classList.add('active'); S.filtroTabla = b.dataset.filter; abrirTablaCompleta();
  });
  const filas = tablaDeZona('.full-standings-zona-btn').map(filaTabla).sort((a, b) => b.pts - a.pts || b.dif - a.dif);
  const eq = {}; (D.equipos || []).forEach(e => { eq[e.equipo] = e; });
  body.innerHTML = filas.map((t, i) => {
    const e = Object.values(eq).find(x => x.equipo.toLowerCase().includes(t.equipo.toLowerCase().slice(0, 6))) || null;
    return `<tr>
      <td class="text-center text-muted">${i + 1}</td>
      <td><span class="team-badge-pill">${esc(NOM(t.equipo))}</span></td>
      <td class="text-center">${t.pj}</td><td class="text-center">${t.pg}</td>
      <td class="text-center">${t.pe}</td><td class="text-center">${t.pp}</td>
      <td class="text-center">${t.gf}</td><td class="text-center">${t.gc}</td>
      <td class="text-center" style="color:${t.dif > 0 ? '#10b981' : '#ef4444'};">${t.dif > 0 ? '+' : ''}${t.dif}</td>
      <td class="text-center" style="font-weight:800;">${t.pts}</td>
      <td class="text-center text-muted">${e ? n1(e.total.tirosPorPartido) : 's/d'}</td>
      <td class="text-center text-muted">${e ? n1(e.total.tirosConcedidosPorPartido) : 's/d'}</td>
    </tr>`;
  }).join('');
  abrirModal('full-standings-modal');
}

// ── rankings ────────────────────────────────────────────────────────────────
// SE FUE EL "DESCONTADO" (03/09). Era el puntaje multiplicado por la chance de
// llegar a los 20 minutos, y ordenaba el ranking. Dos motivos para sacarlo:
// primero, ahora sabemos de verdad quien no juega —el Gran DT publica los
// lesionados y los suspendidos, y esos ya no entran al once—; segundo, el que
// decide si un tipo va a ser titular es él, no un promedio. En su lugar queda
// "Si juega": los minutos que aguanta cuando entra, leidos de los partidos que
// jugó. La chance de jugar sigue estando, en su columna, sin ordenar nada.
// SE FUE TAMBIEN "JUEGA" Y LA COTIZACION (03/09).
// "Juega 90%" era una logistica sobre los minutos estimados: un numero nuestro,
// no un dato, y encima el Gran DT marca "posible titular" a unos si y a otros
// no. Ahora que se ven los ultimos tres partidos que arrancó, el numero
// inventado sobra: los minutos de verdad dicen mas y no hay que creerle a
// nadie. La cotizacion se va porque el presupuesto casi nunca aprieta y ocupaba
// una columna que se necesita para futbol; sigue estando en la ficha.
// ── CADA PUESTO VE LO QUE LE SIRVE A ESE PUESTO (08/09) ────────────────────
// Tener las mismas columnas en los cuatro puestos era comodo de programar y
// malo de leer: al arquero le mostraba los cornetes del equipo —que no le
// pagan nada— y para llegar a las columnas del defensor, que SI decide un gol
// de cabeza, habia que scrollear de costado hasta cortarlas.
//   · Cornets (a favor y en contra): defensores y delanteros, que son los que
//     cabecean. Fuera de arqueros y volantes.
//   · Posesion: solo volantes, donde tener la pelota se puede traducir en
//     ficha. Fuera del resto: al central le da igual.
// No cambia ningun puntaje: son columnas para mirar.
const COLS = {
  ARQ: [['#', ''], ['Arquero', 'n'], ['Rol', 'rol'], ['Valla', 'pvi'], ['GC', 'lamc'], ['Ficha', 'fi'], ['Arr.', 'arr'], ['Últimas 5', 'msj'], ['12+', 'p12'], ['Hizo', 'hizo'], ['PTS', 'epsj'], ['', 'fuera']],
  // TIROS/90 VUELVE A DEFENSORES (07/09). La habia sacado para que la tabla
  // entrara a lo ancho, y era justo la columna con la que se decide un caso
  // real: Ávila patea mucho con poco xG y Obando patea poco pero clarisimo.
  // El modelo pesa el xG, pero el volumen de tiros es informacion propia —
  // sobre todo en un defensor, donde un tiro de afuera no aparece en el xG y
  // el gol paga 9. Volantes y delanteros la tenian; defensores no, sin motivo.
  DEF: [['#', ''], ['Defensor', 'n'], ['Rol', 'rol'], ['Valla', 'pvi'], ['Tiros', 'tiros'], ['xG', 'xg'], ['Gol', 'lg'], ['Ficha', 'fi'], ['Arr.', 'arr'], ['Últimas 5', 'msj'], ['12+', 'p12'], ['Crn+', 'crnF'], ['Crn−', 'crnC'], ['Hizo', 'hizo'], ['PTS', 'epsj'], ['', 'fuera']],
  VOL: [['#', ''], ['Volante', 'n'], ['Rol', 'rol'], ['Tiros', 'tiros'], ['xG', 'xg'], ['Gol', 'lg'], ['%Gol', 'delgol'], ['Ficha', 'fi'], ['Arr.', 'arr'], ['Últimas 5', 'msj'], ['12+', 'p12'], ['Pos%', 'pose'], ['Hizo', 'hizo'], ['PTS', 'epsj'], ['', 'fuera']],
  DEL: [['#', ''], ['Delantero', 'n'], ['Rol', 'rol'], ['Tiros', 'tiros'], ['xG', 'xg'], ['Gol', 'lg'], ['%Gol', 'delgol'], ['Ficha', 'fi'], ['Arr.', 'arr'], ['Últimas 5', 'msj'], ['12+', 'p12'], ['Crn+', 'crnF'], ['Crn−', 'crnC'], ['Hizo', 'hizo'], ['PTS', 'epsj'], ['', 'fuera']]
};
// Ordenar por lo MISMO que se muestra. Cuando la columna paso a ser por 90
// minutos, el orden seguia usando el valor por partido: la tabla mostraba
// 5.5, 4.0, 4.3 hacia abajo y parecia rota.
// El xG de aca tiene que ser EL MISMO que muestra la celda: el de sin penales.
// Cuando la columna paso a descontar los penales me olvide de tocar esto, asi
// que la tabla ordenaba por el xG crudo y mostraba el limpio: Alex Luna
// (0.58 crudo con un penal, 0.43 limpio) quedaba arriba de Maroni (0.47 sin
// penales). Los numeros de la columna bajaban y subian sin sentido.
const ritmo90 = (x, campo) => {
  const i = x.ind; if (!i || !i.minutos) return null;
  const total = campo === 'tiros' ? (i.tiros || 0)
                                  : (x.xgT != null ? x.xgT : (i.xg || 0));
  return total / (i.minutos / 90);
};
// ── QUE SE CUENTA DE CADA UNO, SEGUN SU PUESTO (06/09) ──────────────────────
// Antes el globito del rol decia lo mismo para todos: duelos aereos y centros.
// A un enganche no le importa que gane 0.06 duelos aereos, y a un central no le
// importa cuantos centros tira (tira cero). Cada puesto se describe con lo que
// de verdad decide si lo ponés o no, y siempre con la referencia de su puesto
// al lado, que un numero solo no dice nada.
// La mediana se calcula SOLO sobre los candidatos reales (arrancó dos veces o
// jugó tres partidos enteros). Sobre la planilla completa daba 0.03 de xG/90
// para los volantes, porque la mitad de la lista son suplentes con cero: la
// referencia quedaba tan baja que cualquiera parecía un crack.
const medianaDe = (pos, campo) => {
  const k = 'med|' + pos + '|' + String(campo);
  if (S[k] != null) return S[k];
  const v = (D.rankings[pos] || [])
    .filter(y => { const q = y.pmin, min = (y.ind && y.ind.minutos) || 0;
                   return !q || q.arranques >= 2 || min >= 270; })
    .map(campo).filter(x => x != null && !isNaN(x)).sort((a, b) => a - b);
  return (S[k] = v.length ? v[Math.floor(v.length / 2)] : null);
};
function descripcionRol(x) {
  const r = x.rol || {}, i = x.ind || {}, L = x.lam || {};
  const rol = r.rol || '';
  const p = [];
  const n1 = v => (v == null || isNaN(v)) ? 's/d' : Number(v).toFixed(1);
  const n2 = v => (v == null || isNaN(v)) ? 's/d' : Number(v).toFixed(2);
  const pc = v => (v == null || isNaN(v)) ? 's/d' : (v * 100).toFixed(0) + '%';
  const t90 = x.t90, x90 = x.x90;
  const meteG = x.lg != null ? 1 - Math.exp(-x.lg) : null;

  if (x.pos === 'ARQ') {
    p.push(`Le esperan ${n2(L.c)} goles en contra hoy, o sea ${pc(x.pvi)} de valla invicta`);
    if (i.vallas != null && i.pj) p.push(`Lleva ${i.vallas} ${i.vallas === 1 ? 'valla' : 'vallas'} en ${i.pj} partidos`);
    if (i.promedioTorneo) p.push(`Promedia ${n1(i.promedioTorneo)} puntos por fecha en Gran DT`);
    p.push('Un arquero de local saca 6.3 puntos de media y uno de visitante 5.2: es la brecha más grande de los cuatro puestos');
    return p.join('. ') + '.';
  }

  if (/Defensa Central/.test(rol)) {
    const med = 2.00;
    p.push(`CENTRAL. Gana ${n2(r.aereos90)} duelos aéreos por 90 (la mediana de los centrales es ${n2(med)})`);
    p.push(`${pc(x.pvi)} de valla invicta hoy${i.vallas != null && i.pj ? `, y lleva ${i.vallas} en ${i.pj} partidos` : ''}`);
    if (meteG != null) p.push(`${pc(meteG)} de chance de meterla`);
    p.push('Medido sobre 495 partidos: el 64% de los goles de un central son de cabeza. Si lo ponés, comprás un boleto de córner');
    return p.join('. ') + '.';
  }

  if (/Defensa Lateral/.test(rol)) {
    p.push(`LATERAL. Tira ${n2(r.centros90)} centros por 90 y genera ${n2(x90)} de xG`);
    p.push(`Casi no salta: ${n2(r.aereos90)} duelos aéreos por 90 contra 2.00 de un central`);
    p.push(`${pc(x.pvi)} de valla invicta hoy`);
    if (meteG != null) p.push(`${pc(meteG)} de chance de meterla`);
    p.push('Medido: solo el 15% de los goles de un lateral son de cabeza, contra el 64% del central. Su gol viene de otro lado');
    return p.join('. ') + '.';
  }

  if (x.pos === 'DEF') {
    p.push(`Defensor${rol ? ' — 365Scores lo pone de ' + rol.toLowerCase() : ''}`);
    p.push(`${pc(x.pvi)} de valla invicta hoy`);
    if (meteG != null) p.push(`${pc(meteG)} de chance de meterla`);
    return p.join('. ') + '.';
  }

  if (x.pos === 'VOL') {
    p.push(`${ROL_CORTO[rol] ? ROL_CORTO[rol].toUpperCase() : 'VOLANTE'}. Tira ${n2(t90)} veces por 90 y genera ${n2(x90)} de xG (mediana de los volantes: ${n2(medianaDe('VOL', y => y.x90))})`);
    if (x.sh != null) p.push(`Se lleva el ${pc(x.sh)} del ataque de su equipo`);
    if (meteG != null) p.push(`${pc(meteG)} de chance de meterla hoy`);
    if (i.goles != null && i.pj) p.push(`Lleva ${i.goles} ${i.goles === 1 ? 'gol' : 'goles'} y ${i.asistencias || 0} ${i.asistencias === 1 ? 'asistencia' : 'asistencias'} en ${i.pj} partidos`);
    p.push('El gol de un volante paga 6 (8 de visitante) y se lleva la figura el 44% de las veces: es el gol mejor pagado del juego');
    return p.join('. ') + '.';
  }

  // DEL
  p.push(`${ROL_CORTO[rol] ? ROL_CORTO[rol].toUpperCase() : 'DELANTERO'}. ${i.goles || 0} ${i.goles === 1 ? 'gol' : 'goles'} en ${i.pj || 0} partidos`);
  p.push(`Tira ${n2(t90)} veces por 90 y genera ${n2(x90)} de xG (mediana de los delanteros: ${n2(medianaDe('DEL', y => y.x90))})`);
  if (x.sh != null) p.push(`Se lleva el ${pc(x.sh)} del ataque de su equipo`);
  if (meteG != null) p.push(`${pc(meteG)} de chance de meterla hoy`);
  if (r.aereos90 != null && r.aereos90 >= 1.8) p.push(`Salta: ${n2(r.aereos90)} duelos aéreos por 90, número de 9 de área`);
  return p.join('. ') + '.';
}

// Los nombres que publica 365Scores, acortados para que entren en la columna.
const ROL_CORTO = {
  'Defensa Central': 'Central',
  'Defensa Lateral Derecho': 'Lateral D',
  'Defensa Lateral Izquierdo': 'Lateral I',
  'Centrocampista defensivo': 'Volante 5',
  'Mediocampista Central': 'Volante C',
  'Mediocampista Ofensivo': 'Enganche',
  'Volante Derecho': 'Volante D',
  'Volante Izquierdo': 'Volante I',
  'Delantero Derecho': 'Extremo D',
  'Delantero Izquierdo': 'Extremo I',
  'Centro Delantero': '9',
  'Segundo Delantero': '9 y medio',
  'Portero': 'Arquero'
};
const sinTildes = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// QUE PARTE DE SUS PUNTOS SALE DEL GOL (03/09).
// El puntaje esperado suma la ficha y el gol como si fueran la misma moneda, y
// para el PROMEDIO lo son. Para la cola no: la ficha tiene techo 10 y se mueve
// de a decimas, el gol es un salto de 5 a 7 puntos que pasa o no pasa.
// Dos delanteros con el mismo puntaje pueden ser cosas opuestas — uno que saca
// 7 casi siempre y nunca 20, y otro que saca 4 seguido y de vez en cuando 16.
// Esta columna los separa: es el termino del gol dividido por el puntaje si
// juega. Ordenando por aca salen los explosivos primero.
const delGol = x => {
  const d = (x.des || []).find(t => t[0] === 'Gol propio');
  if (!d || !x.epsj) return null;
  return d[1] / x.epsj;
};
const arranquesDe = x => (x.pmin && x.pmin.arranques != null) ? x.pmin.arranques : null;
// P(mete al menos un gol) a partir de los goles esperados. Es lo mismo que
// lamGol pero en el idioma en el que uno piensa: 0.49 goles esperados no se lee,
// "la mete el 39% de las fechas" si.
const meteGol = x => (x.lg == null) ? null : 1 - Math.exp(-x.lg);
// LO QUE HIZO DE VERDAD EN ESTA FECHA.
// Sale de dataVivo.js, la misma fuente separada del Versus y el Torneo. Con la
// fecha a medio jugar, la tabla mostraba el PRONOSTICO de partidos que ya se
// habian jugado: Di María decia 7.8 esperados con el partido terminado y 5
// puntos hechos. El pronostico sigue estando —es lo que calcula el motor— pero
// al lado ahora esta lo que paso.
function hizoDe(x) {
  if (!VIVO || !x) return { estado: 'sin' };
  if (!resuelto(x)) return { estado: 'falta' };
  const v = vivoDe(x.id);
  if (v && v.p != null) return { estado: 'jugo', pts: v.p, sup: !!v.s };
  return { estado: 'nojugo', pts: 0 };
}
// Posesion y corners del EQUIPO del jugador, en la condicion que le toca esta
// fecha. Es el dato que antes habia que ir a buscar a Datos, ordenar la tabla y
// cruzar a ojo: aca es una columna mas y se ordena como cualquier otra.
const condDe = x => x.cond === 'L' ? 'local' : 'visitante';
function valCond(x, campo) {
  const p = perfilCond(x.eq, condDe(x), S.condVent || 'actual');
  return p ? p.val(campo) : null;
}
const valorCol = (x, k) =>
  k === 'pose' ? valCond(x, 'posesion') :
  k === 'crnF' ? valCond(x, 'corners') :
  k === 'crnC' ? valCond(x, 'cornersRec') :
  k === 'hizo' ? (() => { const h = hizoDe(x);
    return h.estado === 'jugo' ? h.pts : h.estado === 'nojugo' ? -1 : null; })() :
  k === 'concViejo' ? (x.conc ? x.conc.pico : null) :
  k === 'rol' ? (x.rol ? (x.rol.aereos90 ?? -1) : -2) :
  k === 'p12' ? (x.p12 ?? null) :
  k === 'lg' ? meteGol(x) :
  k === 'arr' ? arranquesDe(x) :
  k === 'fuera' ? (S.fuera.has(x.id) ? 1 : 0) :
  k === 'delgol' ? delGol(x) :
  k === 'pj' ? x.pj_ :
  k === 'tiros' ? ritmo90(x, 'tiros') :
  k === 'xg' ? ritmo90(x, 'xg') :
  k === 'lamc' ? -x.lam.c :
  k === 'lamf' ? (x.lam ? x.lam.f : null) :
  // El contexto se mide distinto segun el puesto: al arquero y al defensor les
  // paga que el equipo NO reciba; al volante y al delantero, que su equipo meta.
  k === 'ctx' ? ((S.pos === 'ARQ' || S.pos === 'DEF') ? x.pvi : (x.lam ? x.lam.f : null)) :
  k === '' ? x.sc :
  k === 'n' ? x.n : x[k];

function celda(x, k, i) {
  switch (k) {
    case 'pose': case 'crnF': case 'crnC': {
      const campo = k === 'pose' ? 'posesion' : k === 'crnF' ? 'corners' : 'cornersRec';
      const p = perfilCond(x.eq, condDe(x), S.condVent || 'actual');
      if (!p) return '<span class="text-muted">s/d</span>';
      const v = p.val(campo), pu = p.puesto(campo), tot = p.total(campo), med = p.mediana(campo);
      if (v == null) return '<span class="text-muted">s/d</span>';
      const buenos = Math.max(1, Math.round((tot || 30) / 3));
      const cl = pu == null ? '' : pu <= buenos ? ' cnd-bien' : pu > (tot - buenos) ? ' cnd-mal' : '';
      return `<span class="cnd${cl}" title="${esc(NOM(x.eq) + ' de ' + p.cond + ': ' +
        (k === 'pose' ? n1(v) + '% de posesión' : n1(v) + (k === 'crnF' ? ' córners a favor' : ' córners en contra') + ' por partido') +
        '. Puesto ' + pu + ' de ' + tot + ' en esa condición; la mediana de la liga es ' +
        (k === 'pose' ? n1(med) + '%' : n1(med)) + '. Sobre ' + p.pj + ' partidos.')}">${
        k === 'pose' ? n1(v) : n1(v)}<i>${pu}º</i></span>`;
    }
    case 'hizo': {
      const h = hizoDe(x);
      if (h.estado === 'sin') return '<span class="hizo-na">–</span>';
      if (h.estado === 'falta') return `<span class="hizo-falta" title="${esc('Todavía no jugó su partido. El motor le espera ' + n2(x.epsj != null ? x.epsj : x.ep) + ' puntos.')}">·</span>`;
      if (h.estado === 'nojugo') return `<span class="hizo-no" title="Su partido ya se jugó y no sumó: no entró, o entró sin calificación.">no jugó</span>`;
      const esp = x.epsj != null ? x.epsj : x.ep;
      return `<span class="hizo-si${h.pts >= 8 ? ' hizo-alto' : ''}" title="${esc('Puntos que sumó de verdad esta fecha, publicados por Planeta' +
        (h.sup ? ' (entró desde el banco)' : '') + '. El motor le esperaba ' + n2(esp) + '.')}">${h.pts}</span>`;
    }
    // EL TILDE DE "NO JUEGA" (05/09). Va en la fila para poder tildarlo mirando
    // los mismos numeros con los que uno decide, sin abrir nada. stopPropagation
    // porque la fila entera abre la auditoria del jugador.
    case 'fuera': {
      if (esBaja(x)) return `<span class="baja-chip" title="Lo marca el juego como baja: no entra en el once.">baja</span>`;
      const f = S.fuera.has(x.id);
      return `<button class="btn-fuera${f ? ' activo' : ''}" onclick="toggleFuera('${x.id}', event)"
        title="${f ? 'Tildado como que NO JUEGA esta fecha. Tocá para devolverlo.' : 'No juega esta fecha: sacalo de la tabla y del Mejor 11.'}">✕</button>`;
    }
    // CHANCE DE FECHA GRANDE (06/09). La que contesta la pregunta que uno se
    // hace de verdad cuando va a buscar los 100 puntos.
    // EL ROL REAL (06/09). Gran DT dice "DEF" y listo; 365Scores dice si es
    // central o lateral. NO cambia ningun puntaje: es para que sepas a quien
    // estas poniendo. Ordenando por esta columna salen primero los que mas
    // ganan por arriba.
    case 'rol': {
      const r = x.rol;
      const corto = (r && r.rol) ? (ROL_CORTO[r.rol] || r.rol) : (x.pos === 'ARQ' ? 'Arquero' : 's/d');
      const firme = r && r.rolFirme != null && r.rolFirme < 0.6;
      // Debajo del puesto va el dato que importa PARA ESE PUESTO, no siempre el
      // mismo: al central los duelos aéreos, al lateral los centros, al volante
      // y al delantero su chance de gol.
      let pie = '';
      if (x.pos === 'ARQ') pie = pc0(x.pvi) + ' valla';
      else if (r && /Defensa Central/.test(r.rol)) pie = r.aereos90 + ' aé';
      else if (r && /Defensa Lateral/.test(r.rol)) pie = r.centros90 + ' cen';
      else if (x.lg != null) pie = ((1 - Math.exp(-x.lg)) * 100).toFixed(0) + '% gol';
      const ayuda = descripcionRol(x) + (firme ? ' OJO: cambió de puesto en los últimos partidos.' : '')
        + (r && r.partidosRol ? ` (sobre ${r.partidosRol} partidos)` : '') + ' Nada de esto cambia el puntaje.';
      return `<span class="chip-rol${firme ? ' rol-dudoso' : ''}" title="${esc(ayuda)}">${esc(corto)}<small>${pie}</small></span>`;
    }
    case 'p12': {
      if (x.p12 == null) return '<span class="text-muted">—</span>';
      const v = x.p12, cls = v >= 0.20 ? 'dg-alto' : v <= 0.10 ? 'dg-bajo' : '';
      return `<span class="${cls}" title="Chance de hacer 12 puntos o más en esta fecha. De 15 o más: ${((x.p15 || 0) * 100).toFixed(1)}%. Junta el gol, la ficha que sube cuando la mete, la figura (que va atada al gol: un doblete la da el 66% de las veces), la valla y la tarjeta.">${(v * 100).toFixed(0)}%</span>`;
    }
    // ARRANQUES. Cuantas veces fue titular en el torneo. No penaliza el puntaje:
    // es para distinguir al titular fijo del suplente que jugo un partido y
    // quedo alto porque cuando juega, juega los 90 (pasa con los arqueros).
    // CONCENTRACION DEL xG (05/09). Que parte de su xG del torneo salio de un
    // solo partido. 90% quiere decir que su numero es una tarde, no una
    // costumbre. La mediana de la liga es 53%.
    case 'concViejo': {
      const c = x.conc;
      if (!c) return '<span class="text-muted">—</span>';
      const v = c.pico;
      const cls = v >= 0.8 ? 'dg-bajo' : v <= 0.5 ? 'dg-alto' : '';
      return `<span class="${cls}" title="El ${(v * 100).toFixed(0)}% de su xG salió de un solo partido (${c.mejor} de ${(c.mejor + c.sinPico).toFixed(2)}). Repartido en ${c.partidos} ${c.partidos === 1 ? 'partido' : 'partidos'} con remate. Sin ese partido le quedan ${c.sinPico} de xG. Mediana de la liga: 53%.">${(v * 100).toFixed(0)}%</span>`;
    }
    case 'arr': {
      const a = arranquesDe(x);
      if (a == null) return '<span class="text-muted">s/d</span>';
      const cls = a >= 4 ? '' : a <= 1 ? 'dg-bajo' : '';
      return `<span class="${cls}" title="Arrancó ${a} ${a === 1 ? 'vez' : 'veces'} en el torneo">${a}</span>`;
    }
    case 'delgol': {
      const v = delGol(x);
      if (v == null) return '<span class="text-muted">—</span>';
      const d = (x.des || []).find(t => t[0] === 'Gol propio');
      const cls = v >= 0.26 ? 'dg-alto' : v <= 0.15 ? 'dg-bajo' : '';
      const ay = `${(100*v).toFixed(0)}% de sus ${x.epsj} puntos sale del gol (${d[1]}), el resto de la ficha y las incidencias. `
        + (v >= 0.26 ? 'Alto: es de los que dependen de convertir. Saca menos casi siempre y mucho cuando la mete — lo que conviene si vas a buscar una fecha grande.'
           : v <= 0.15 ? 'Bajo: sus puntos vienen de la nota, no del gol. Más parejo fecha a fecha, con menos techo.'
           : 'En el medio.');
      return `<span class="${cls}" title="${esc(ay)}">${(100*v).toFixed(0)}%</span>`;
    }
    case '': {
      const p = S.puestoDe ? S.puestoDe[x.id] : null;
      // Fuera del corte: no tiene puesto porque no compite con los que juegan.
      if (p == null) return `<span class="text-muted" title="No entra en el ranking: es más probable que no llegue a los 20 minutos que exige la ficha. Marcá «ver también los que casi no juegan» para meterlo en la cuenta.">—</span>`;
      const destacado = p <= 10;
      return `<span title="Puesto ${p} de ${S.totalPuesto} ${S.pos}, con el orden que tenés puesto"
        style="font-weight:${destacado ? 800 : 600};color:${destacado ? 'var(--text-main)' : 'var(--text-muted)'};">${p}</span>
        <span class="text-muted" style="font-size:0.62rem;display:block;">de ${S.totalPuesto}</span>`;
    }
    // Antes esto era una sola linea de texto con los avisos pegados adentro:
    // "Talleres · Local vs Central Cordoba (SdE) · COPA · rival de copa" se
    // partia en dos renglones y las etiquetas quedaban tiradas en el medio de
    // la celda. Ahora el partido va en su renglon, sin cortarse, y las
    // etiquetas abajo en su propia fila.
    case 'n': {
      const etq = [];
      // El que patea los penales del equipo. Un penal convertido paga 3 fijos
      // (+2 de visitante) y es la unica fuente de gol que no depende del juego.
      if (x.pen > 0) etq.push(`<span class="pill-alerta pill-penal" title="Pateó ${x.pen} penal${x.pen > 1 ? 'es' : ''} en el torneo: ${x.penC} convertido${x.penC === 1 ? '' : 's'}${x.penE ? ', ' + x.penE + ' errado' + (x.penE === 1 ? '' : 's') : ''}. Es el pateador del equipo.">⚫ PENALES ${x.pen}</span>`);
      // Transferido en el mercado: la planilla de Gran DT ya lo pasó al club
      // nuevo, pero los minutos, los tiros y el xG que le mostramos los hizo en
      // el club anterior. Sirven para saber si es titular, pero no dicen nada
      // de cómo lo va a usar el DT nuevo.
      const pc = pillCond(x); if (pc) etq.push(pc);
      const pcr = pillCorners(x); if (pcr) etq.push(pcr);
      if (x.mrot) etq.push(pillRotacion(x.mrot));
      else if (x.rot > 0) etq.push(`<span class="pill-alerta pill-copa">ROTA</span>`);
      if (x.mrotr) etq.push(`<span class="pill-alerta pill-copa-rival" title="Al rival le pasa esto: ${x.mrotr.tipo === 'guarda' ? 'juega copa en ' + x.mrotr.dias + ' días' : 'viene de jugar hace ' + x.mrotr.dias + ' días'}">RIVAL ${x.mrotr.tipo === 'guarda' ? 'CON COPA' : 'CANSADO'}</span>`);
      const avisos = pintarAvisos(x);
      return `<div class="player-info">
        <div class="player-name">${esc(nombreCorto(x.n))}</div>
        <div class="player-sub">${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'L' : 'V'} vs ${esc(NOM(x.riv))}${textoCond(x)}</div>
        ${(etq.length || avisos.trim()) ? `<div class="player-tags">${avisos}${etq.join('')}</div>` : ''}
      </div>`;
    }
    case 'perf': {
      const c = x.perf.startsWith('SÓLIDO +') ? '#10b981' : x.perf === 'SÓLIDO' ? '#3b82f6' : x.perf === 'RIESGO GOLEADOR' ? '#f59e0b' : '#94a3b8';
      return `<span class="badge-profile" style="color:${c};border-color:${c}55;">${esc(x.perf)}</span>`;
    }
    case 'lamf': {
      const v = x.lam && x.lam.f; if (v == null) return '—';
      const c = v >= 1.6 ? '#10b981' : v >= 1.2 ? '#38bdf8' : v >= 0.95 ? 'var(--text-muted)' : '#f97316';
      return `<span title="Goles que se espera que meta SU EQUIPO en este partido, salido de las cuotas. El promedio de la liga es 1.04." style="color:${c};font-weight:700;">${n2(v)}</span>`;
    }
    case 'lg': {
      const q = meteGol(x);
      if (q == null) return '<span class="text-muted">—</span>';
      const cls = q >= 0.30 ? 'dg-alto' : q <= 0.12 ? 'dg-bajo' : '';
      const top = S.topGol && S.topGol[x.pos] === x.id;
      return `<span class="${cls}${top ? ' gol-top' : ''}" title="${top ? 'EL GOL MÁS SEGURO DE SU PUESTO EN ESTA FECHA. ' : ''}Chance de que meta AL MENOS un gol en este partido: ${(q * 100).toFixed(0)}%. Ordená por esta columna para ver quién tiene el gol más asegurado. Sale de ${(+Number(x.lg).toFixed(3))} goles esperados = su parte del ataque de su equipo × los goles que se espera que meta el equipo hoy × la fracción del partido que juega. LOS MINUTOS YA ESTÁN ADENTRO: el que sale a los 75 tiene su chance recortada en proporción.">${(q * 100).toFixed(0)}%</span>`;
    }
    case 'pvi': return pc0(x.pvi);
    case 'pj_': return pc0(x.pj_);
    case 'ctx': return (S.pos === 'ARQ' || S.pos === 'DEF') ? pc0(x.pvi) : n2(x.lam && x.lam.f);
    case 'mesp': {
      if (x.mesp == null) return '—';
      const t = x.mesp + "'";
      if (x.fmin === 'once confirmado') return `<span style="color:#10b981;font-weight:800;" title="Formación confirmada: es titular">✓ ${t}</span>`;
      if (x.fmin === 'al banco (once confirmado)') return `<span style="color:#ef4444;" title="Formación confirmada: va al banco">banco</span>`;
      return t;
    }
    case 'pr': return `<span style="color:#f59e0b;font-weight:700;">${plata(x.pr)}</span>`;
    case 'lamc': return n2(x.lam.c);
    // POR 90 MINUTOS EN LA CANCHA, no por partido.
    // "Tiros/p" dividia por partidos jugados. Un 9 que vuelve de una lesion y
    // entro 20 minutos tres veces mostraba 1 tiro por partido, cuando su ritmo
    // real es 4.5 por 90. El motor SIEMPRE dividio por minutos; era la tabla la
    // que mostraba otra cosa, asi que en pantalla parecia flojo un jugador que
    // el algoritmo veia bien. El globito aclara de donde sale y, cuando el
    // motor lo achica por tener pocos minutos, con que numero se queda.
    case 'tiros': return por90(x, 'tiros', 't90', v => n1(v));
    // Dos decimales y listo: "0.0021 de xG por 90" es precision falsa, y con
    // cuatro decimales la columna deja de leerse de un vistazo.
    case 'xg':    return por90(x, 'xg',    'x90', v => String(+Number(v).toFixed(2)));
    case 'fi': return n1(x.fi);
    // El numero grande es el de SI ENTRA A LA CANCHA: cuantos puntos hace
    // contando los minutos que se espera que juegue, sin descontar la chance de
    // que no juegue. Esa chance la mira uno en la columna de minutos, y manana
    // con las formaciones confirmadas deja de ser una duda.
    case 'epsj': return x.epsj == null ? '—'
      : `<span class="score-badge" title="Puntos que hace SI entra a la cancha, ya considerando cuántos minutos va a jugar. No descuenta la chance de que no juegue: eso lo mirás en la columna de minutos.">${n1(x.epsj)}</span>`;
    case 'ep': return `<span title="Lo mismo pero descontando la chance de que no llegue a los 20 minutos que exige la ficha" style="color:var(--text-muted);">${n1(x.ep)}</span>`;
    case 'msj': return celdaMinutos(x);
    case 'pj': return `<span class="${x.pj_ < 0.5 ? 'text-muted' : ''}" title="Chance de llegar a los 20 minutos que exige la ficha. Es información: no descuenta puntos ni ordena.">${pc0(x.pj_)}</span>`;
    case 'piso': case 'techo': return n1(x[k]);
    default: return n2(x[k]);
  }
}
// Dos preguntas distintas que la app mezclaba en un solo numero:
//   "cuanto suma esta fecha"  -> descuenta la chance de que no juegue
//   "que tan bueno es"        -> no la descuenta
// Di Maria se perdio UNA fecha de seis y por eso caia al puesto 30 detras de un
// 5 que jugo las seis completas, aunque por partido rinde bastante mas. Las dos
// lecturas son correctas; lo que estaba mal era ofrecer solo una.
// Ritmo por 90 minutos jugados. Si tiene pocos minutos el numero crudo se
// dispara (9 minutos por partido y un tiro = 10 tiros por 90), asi que se
// muestra apagado y el globito dice con cuanto se queda el modelo.
// LOS MINUTOS, COMO SE MIRAN DE VERDAD (03/09).
// Un numero solo no contesta "este tipo termina los partidos o lo sacan a los
// 65?". Se muestra la mediana de cuando arranca y, abajo, los ULTIMOS TRES que
// arrancó con el numero real, coloreados: verde si completó, ámbar si salió
// sobre el final, gris si lo sacaron en el último cuarto.
// LAS ULTIMAS FECHAS DE VERDAD (06/09).
// Antes mostraba los ultimos TRES ARRANQUES, y eso confunde: un tipo que no
// juega hace dos fechas aparecia igual con tres numeros lindos, como si viniera
// jugando. Ahora se muestran las ultimas cinco FECHAS del torneo, jugara o no:
//   verde/ambar/gris = arranco, con los minutos que hizo
//   gris con borde punteado = entro desde el banco
//   ✕ rojo = no jugo esa fecha
// Es solo para mirar: NO entra en ninguna cuenta. El numero grande de la
// izquierda sigue siendo "cuanto juega cuando arranca", que se lee solo de los
// partidos en los que arranco.
const CUANTAS_FECHAS = 5;
function tiraMinutos(x) {
  const d = Array.isArray(x.dlog) ? x.dlog : null;
  if (!d || !d.length) {
    const q = x.pmin;                       // sin el log detallado: como antes
    if (!q || !q.ultimos || !q.ultimos.length) return '';
    return `<span class="tira-min">${q.ultimos.map(m =>
      `<span class="tm tm-largo">${m}</span>`).join('')}</span>`;
  }
  const ult = d.slice(-CUANTAS_FECHAS);
  const desde = d.length - ult.length;
  return `<span class="tira-min">${ult.map((e, i) => {
    const f = desde + i + 1;
    if (!e || !e.m) return `<span class="tm tm-no" title="Fecha ${f}: no jugó">✕</span>`;
    const m = e.m;
    const supl = e.t === false;
    const cls = supl ? 'tm-supl' : m >= 88 ? 'tm-full' : m >= 75 ? 'tm-largo' : m >= 60 ? 'tm-medio' : 'tm-corto';
    const q = supl ? 'entró desde el banco' : 'arrancó';
    return `<span class="tm ${cls}" title="Fecha ${f}: ${q}, ${m} minutos">${m}</span>`;
  }).join('')}</span>`;
}
function ayudaMinutos(x) {
  const q = x.pmin;
  if (!q || !q.arranques) {
    const e = q && q.entrando && q.entrando.length;
    return e ? `Nunca arrancó: entrando jugó ${q.entrando.join(', ')} minutos. El número es de esos partidos.`
             : 'Todavía no hay partidos suyos para leerlo: es una estimación.';
  }
  const p = [];
  p.push(`Arrancó ${q.arranques} ${q.arranques === 1 ? 'vez' : 'veces'}`);
  const d = [];
  if (q.completa) d.push(`${q.completa} completó los 90`);
  if (q.largo) d.push(`${q.largo} salió entre los 75 y los 87`);
  if (q.medio) d.push(`${q.medio} salió entre los 60 y los 74`);
  if (q.corto) d.push(`${q.corto} salió antes de los 60`);
  if (d.length) p.push(d.join(', '));
  if (q.todos && q.todos.length) p.push(`De titular jugó: ${q.todos.join(', ')} minutos`);
  if (q.entrando && q.entrando.length) p.push(`Además entró de suplente ${q.entrando.length} ${q.entrando.length === 1 ? 'vez' : 'veces'} (${q.entrando.join(', ')}'), y eso NO cuenta para este número`);
  // Arranques cortados a los 20 minutos: casi siempre lesión o roja, no una
  // decisión del técnico. Quedan fuera del número, pero se dicen — si no, se ve
  // un 16 en la lista y un 90 arriba y parece un error.
  if (q.cortados && q.cortados.length) p.push(`${q.cortados.length === 1 ? 'Un arranque suyo se cortó' : `${q.cortados.length} arranques suyos se cortaron`} muy temprano (${q.cortados.join(', ')}'), casi seguro lesión o roja: no entra${q.cortados.length === 1 ? '' : 'n'} en el número`);
  p.push(q.fuente);
  return p.join('. ') + '.';
}
function celdaMinutos(x) {
  if (x.msj == null) return '—';
  if (x.fmin === 'once confirmado') return `<span style="color:#10b981;font-weight:800;" title="Formación confirmada: es titular">✓ ${x.msj}'</span>`;
  if (x.fmin === 'al banco (once confirmado)') return `<span style="color:#ef4444;" title="Formación confirmada: va al banco">banco</span>`;
  const q = x.pmin;
  const nunca = q && !q.arranques;
  return `<span title="${esc(ayudaMinutos(x))}">
    <b class="${nunca ? 'text-muted' : ''}">${x.msj}'</b>${nunca ? '<div class="op-cuenta">entrando</div>' : ''}
    ${tiraMinutos(x)}</span>`;
}

function por90(x, campo, campoMotor, fmt) {
  const i = x.ind; if (!i) return 's/d';
  const min = i.minutos || 0;
  if (!min) return '<span class="text-muted" title="No cruzó con 365Scores: no tenemos sus minutos.">s/d</span>';
  // El xG que se muestra es el MISMO que usa el modelo: sin penales.
  // Un penal pateado vale 0.79 de xG y no dice nada de si el tipo genera juego.
  // Módica mostraba 0.79 de xG/90 con dos penales encima; el modelo lo veía en
  // 0.50. Que la tabla diga una cosa y el ranking use otra fue el problema
  // original de esta columna.
  const total = campo === 'tiros' ? (i.tiros || 0) : (x.xgT != null ? x.xgT : (i.xg || 0));
  const crudo = total / (min / 90);
  const delMotor = x[campoMotor];
  const flojo = min < 180;
  // EL NUMERO REAL, NO UN "s/d" (03/09).
  // Estuvo un rato mostrando s/d cuando a 365 le faltaba algún partido, y era
  // peor: Sergio Ojeda tiene SEIS partidos medidos con cero tiros en 483
  // minutos — eso es un dato durísimo, no una ausencia. Lo único que falta es
  // un partido. Así que se muestra lo que hay, con el aviso de cuántos faltan.
  const partes = [];
  if (x.dpar) partes.push(`OJO: son ${i.pj365} de sus ${i.pj} partidos — a 365Scores le falta${i.partidosSinDato === 1 ? '' : 'n'} ${i.partidosSinDato}`);
  if (x.dimp) partes.push(`En los que sí tenemos no pateó nunca, pero la planilla le cuenta ${i.goles} gol${i.goles === 1 ? '' : 'es'}: el gol fue en un partido que 365Scores no tiene`);
  partes.push(campo === 'tiros'
    ? `${total} tiros en ${min} minutos`
    : `${total} de xG en ${min} minutos`);

  if (campo === 'xg' && x.pen > 0 && x.xgT != null && i.xg != null)
    partes.push(`ya sin los ${x.pen} penal${x.pen > 1 ? 'es' : ''} que pateó (${i.xg} crudo − ${(i.xg - x.xgT).toFixed(2)})`);
  if (flojo) partes.push('menos de 180 minutos: con tan poca cancha el ritmo por 90 es poco confiable, por eso va en gris');
  // LA CONCENTRACION DEL xG (06/09). Dejo de ser columna propia: nunca fue un
  // dato aparte, es una ADVERTENCIA sobre este numero. Franco Vázquez tiene
  // 0.25 de xG/90 y el 95% salio de un solo partido: el numero es correcto y
  // la conclusion que uno saca de el, no. Va acá, pegado al numero que corrige.
  if (campo === 'xg' && x.conc) {
    const v = x.conc.pico;
    partes.push(v >= 0.8
      ? `OJO: el ${(v * 100).toFixed(0)}% de ese xG salió de UN SOLO partido — sin ese partido le quedan ${x.conc.sinPico}. Es una tarde, no una costumbre (la mediana de la liga es 53%)`
      : `repartido en ${x.conc.partidos} partidos con remate; el mejor aporta el ${(v * 100).toFixed(0)}% (mediana de la liga 53%)`);
  }
  if (delMotor != null && Math.abs(delMotor - crudo) > 0.05)
    partes.push(`el modelo lo achica a ${fmt(delMotor)} por 90`);
  const conc = (campo === 'xg' && x.conc && x.conc.pico >= 0.8) ? ' xg-concentrado' : '';
  return `<span class="${flojo ? 'ritmo-flojo' : ''}${x.dpar ? ' dato-parcial' : ''}${conc}" title="${esc(partes.join('. ') + '.')}">${fmt(crudo)}${conc ? '<sup class="conc-mark" title="casi todo de un partido">!</sup>' : ''}${x.dpar ? `<sup class="falta-mark">−${i.partidosSinDato}</sup>` : ''}</span>`;
}

// AYUDAS DE CADA COLUMNA. Antes habia una barra "ORDENAR POR" con cinco
// botones (Puntos si juega / Descontado / Amenaza de gol / Ficha / Contexto) y
// resulta que CUATRO de esos cinco ya son columnas de la tabla, y los titulos
// de la tabla ya ordenan al tocarlos. Era la misma funcion dos veces, una al
// lado de la otra. Se va la barra; el orden se toca en el titulo, con la
// flecha marcando por cual esta ordenado y la explicacion en el globito.
const AYUDA_COL = {
  pose: 'Posesión del EQUIPO del jugador, en la condición que le toca esta fecha (local o visitante). Sale de los partidos ya jugados, contados. El número chiquito es el puesto entre los 30 en esa misma condición.',
  crnF: 'Córners a favor por partido que genera su equipo, en la condición que juega esta fecha. El número chiquito es el puesto entre los 30.',
  crnC: 'Córners en contra por partido que concede su equipo, en la condición que juega esta fecha. Puesto 1 = el que menos concede.',
  hizo: 'Los puntos que sumó DE VERDAD en esta fecha, según las fichas de Planeta. Un punto gris quiere decir que su partido todavía no se jugó. La columna PUNTOS de al lado es lo que el motor ESPERA, que es otra cosa.',
  arr: 'Cuántas veces arrancó de titular en el torneo. No baja el puntaje: sirve para distinguir al titular fijo del suplente que jugó un partido y quedó alto (pasa con los arqueros, que cuando juegan juegan los 90).',
  conc: 'Qué parte de su xG del torneo salió de UN solo partido. 90% quiere decir que su número es una tarde, no una costumbre. La mediana de la liga es 53%.',
  fuera: 'Tildá al que SABÉS que no juega: sale de la tabla y el Mejor 11 se rearma sin él. Se guarda por fecha.',
  epsj: 'Los puntos que hace si entra a la cancha, ya considerando cuántos minutos va a jugar. Es el orden por defecto: si no va a jugar, no lo ponés y listo',
  ep:   'Lo mismo, multiplicado por la chance de llegar a los 20 minutos que exige la ficha',
  rol: 'EL PUESTO DE VERDAD, y lo que importa DE ESE PUESTO. Al central se le miran los duelos aéreos, al lateral los centros, al volante y al delantero su chance de gol, al arquero la valla. Pasá el mouse por encima de cada uno. Gran DT tiene cuatro posiciones y punto: un central y un lateral son los dos «DEF» y cobran igual. Esto es lo que publica 365Scores partido por partido, más los duelos aéreos que gana por 90 minutos. NO CAMBIA NINGÚN PUNTAJE, es para que sepas a quién estás poniendo. El juego aéreo es un rasgo estable del jugador (medido: r=0.515 entre la primera y la segunda mitad de sus partidos), pero su vínculo con el gol todavía da p≈0.08 sobre 45 goles: va en la dirección esperada y no alcanza para meterlo al puntaje',
  p12: 'CHANCE DE FECHA GRANDE: qué probabilidad tiene de hacer 12 puntos o más. Es la pregunta que importa cuando vas a buscar los 100 y no el promedio. Junta todo: el gol, la ficha que sube cuando la mete, la figura (que va atada al gol — un doblete la da el 66% de las veces, medido), la valla y la tarjeta. OJO con la escala: contra los puntajes reales del torneo el modelo comprime las diferencias (a los delanteros de local les da 10% cuando la realidad es 6%). Sirve para ORDENAR, no como probabilidad exacta',
  lg:   'METE GOL — EL GOL MÁS SEGURO. Chance de que meta al menos un gol en este partido. Ordená por acá para ver quién tiene el gol más asegurado de su puesto; el puntito verde marca al primero. OJO: NO es lo mismo que PUNTOS. Vombergar tiene el gol más probable de la fecha y es el 7º delantero por puntos, porque su gol de local paga 4 y el de un volante visitante paga 8. Los minutos YA están adentro — al que sale a los 75 se le recorta la chance en proporción, medido. Es distinto de «Peso del gol»: acá se mide qué tan probable es el gol; allá, cuánto de su puntaje depende de ese gol',
  delgol: 'PESO DEL GOL: qué parte de sus puntos sale del GOL y no de la ficha. Es el término del gol dividido por el puntaje si juega. Alto (26% o más) = explosivo: saca poco casi siempre y mucho cuando la mete. Bajo (15% o menos) = parejo, suma por nota. Para el promedio da igual de dónde vengan los puntos; para buscar una fecha grande no: la ficha tiene techo 10 y se mueve de a décimas, el gol es un salto de 5 a 7 puntos. Medido sobre el torneo: entre delanteros, elegir por gol rinde apenas mejor que elegir por lo que venían sumando (8.32 contra 8.09 puntos después); entre volantes es al revés (7.47 la ficha contra 7.09 el gol)',
  lgViejo: 'Goles esperados de ESTE jugador en ESTE partido = su parte del ataque × los goles que se espera que meta su equipo × la fracción del partido que juega. 0.50 quiere decir que se espera medio gol suyo, o sea que mete uno una de cada dos fechas. NO ordena la tabla, y con razón: medido sobre el torneo, el promedio de puntos previo anticipa mejor los puntos que vienen de un delantero (0.22) que su ritmo de gol (0.14)',
  lamf: 'Goles esperados de su equipo en este partido, salidos de las cuotas de hoy. El rival ya está adentro del número',
  fi:   'La nota del 1 al 10 que viene sacando, limpia de bonificaciones: se le restan los goles, la figura, la valla y las tarjetas, así que NO cuenta dos veces lo que ya suma aparte. Es el término más grande del puntaje y el que más separa a un jugador de otro en los cuatro puestos (entre 32% y 37%)',
  pvi:  'Chance de que su equipo termine el partido sin recibir goles',
  mesp: 'Minutos esperados = chance de jugar × minutos que juega cuando entra',
  msj:  'Arriba, los minutos que juega CUANDO ARRANCA de titular — para eso se miran solo los partidos en los que arrancó. Abajo, las últimas CINCO FECHAS del torneo tal cual pasaron: verde completó, ámbar salió sobre el final, gris lo sacaron antes, gris punteado entró desde el banco, ✕ rojo no jugó. Esa tira es solo para mirar, no entra en ninguna cuenta',
  pj:   'Chance de llegar a los 20 minutos que exige la ficha. Es información: no ordena el ranking ni descuenta puntos',
  tiros: 'Tiros por cada 90 minutos EN LA CANCHA, no por partido',
  xg:   'Goles esperados por cada 90 minutos EN LA CANCHA, no por partido',
  pr:   'Lo que cuesta en el Gran DT',
  gc:   'Goles que se espera que le hagan a su equipo',
  lamc: 'GOLES EN CONTRA: los que se espera que le hagan a su equipo en este partido, salidos de las cuotas de hoy. El rival ya está adentro del número.',
};
function pintarSelectorOrden() {
  const cont = $('orden-ranking'); if (!cont) return;
  const hayEpsj = !!((D.rankings.VOL || [])[0] || {}).epsj;
  if (!hayEpsj && S.ordCol === 'epsj') S.ordCol = 'ep';
  cont.innerHTML =
    `<span class="orden-lbl">Tocá el título de una columna para ordenar por esa</span>
     <label class="orden-check" title="${esc('Prendido ves todas las columnas: posesión y córners del equipo en su condición, tiros, xG, rol y chance de fecha grande. ' +
       'Apagado quedan sólo las que cuentan la historia — para cuando le mostrás la app a alguien de afuera. No cambia ningún número.')}">
       <input type="checkbox" id="chk-analista"${S.analista ? ' checked' : ''}>
       <span>🔬 modo analista</span>
     </label>
     <label class="orden-check" title="Por defecto se ocultan los que arrancaron menos de dos veces y jugaron menos de 270 minutos. Rinden bien por minuto, pero no son candidatos.">
       <input type="checkbox" id="chk-ver-todos"${S.verTodos ? ' checked' : ''}>
       <span>ver también los suplentes${S.filtrados ? ` (${S.filtrados})` : ''}</span>
     </label>
`;   // el selector "este torneo / los dos torneos" se fue (08/09): mezclar el
     // semestre pasado no es un dato mas, es OTRO dato. Queda fijo este torneo.

  const chk = $('chk-ver-todos');
  if (chk) chk.onchange = () => { S.verTodos = chk.checked; pintarRankings(); };
  const cha = $('chk-analista');
  if (cha) cha.onchange = () => modoAnalista(cha.checked);
}

// Chequeo de que datos.js este al dia. Cuando falta un campo la pagina no se
// rompe —muestra un guion y sigue— y eso es peor que romperse: parece que el
// cambio no se hubiera aplicado. Antes de callarse, avisa.
// La pagina sabe con que version del motor fue hecha. Si datos.js viene de una
// anterior, lo dice. Antes el sello no servia para esto: cuando arregle el
// cruce de nombres (Rick) no le subi la version al motor, asi que el viejo y el
// nuevo decian los dos "v5" y no habia forma de distinguirlos mirando la app.
const MOTOR_NECESARIO = 38;
function versionMotor() {
  const m = String(D.version || '').match(/v(\d+)/);
  return m ? +m[1] : 0;
}
function faltanCampos() {
  const uno = (D.rankings && D.rankings.VOL && D.rankings.VOL[0]) || null;
  if (!uno) return [];
  const falta = [];
  if (versionMotor() < MOTOR_NECESARIO)
    falta.push(`el <code>datos.js</code> lo generó el motor <b>${D.version || 'sin sello'}</b> y esta página necesita <b>v${MOTOR_NECESARIO}</b> o más`);
  if (uno.epsj == null) falta.push('los puntos "si entra a la cancha"');
  if (uno.mesp == null) falta.push('los minutos esperados');
  if (!D.arriesgado)    falta.push('el once arriesgado');
  return falta;
}
function pintarAvisoDatos() {
  const cont = $('aviso-global'); if (!cont) return;
  const falta = faltanCampos();
  if (!falta.length) { cont.innerHTML = ''; return; }
  cont.innerHTML = `<div class="aviso-viejo">
    <b>Estás mirando datos viejos.</b> ${falta.join(' · ')}.
    Corré <b>ACTUALIZAR_TODO.bat</b> y recargá con <b>Ctrl+F5</b>.
    Hasta entonces, lo que ves en esta pantalla no es lo que calcula el motor nuevo.
  </div>`;
}

// EL BUSCADOR BUSCABA EN UN SOLO PUESTO (07/09).
// Dice "Buscar jugador o equipo" pero filtraba nada mas que la pestaña abierta:
// parado en ARQ, escribir "lanzini" contestaba "No hay arqueros de ese filtro
// que entren en el corte" —y Lanzini es el 3er volante de la liga—. Uno
// concluye que el jugador no esta. Ahora la busqueda mira los cuatro puestos:
// si donde estas no hay ninguno y en otro si, te lleva solo, y siempre se dice
// cuantos hay en cada puesto.
function coincidenciasPorPuesto() {
  const r = { ARQ: 0, DEF: 0, VOL: 0, DEL: 0 };
  if (!S.busqueda) return r;
  // Se cuentan TAMBIEN los que estan tildados. Si no, buscar a alguien que vos
  // mismo escondiste no te lleva a su puesto y el cartel que explica por que no
  // aparece no se pinta nunca: quedas otra vez con "ese jugador no esta".
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pp => {
    r[pp] = (D.rankings[pp] || []).filter(x =>
      (!S.equipo || x.eq === S.equipo) &&
      (sinTildes(x.n).includes(S.busqueda) || sinTildes(x.eq).includes(S.busqueda))).length;
  });
  return r;
}
function irAPuesto(pos) {
  S.pos = pos;
  document.querySelectorAll('.tab-btn[data-tab]').forEach(z => z.classList.toggle('active', z.dataset.tab === pos));
  pintarRankings();
}
window.irAPuesto = irAPuesto;
// los anchos se calculan con el ancho real de la caja: si la ventana cambia,
// hay que rehacerlos o la tabla queda con las medidas de antes
let _tRedim = null;
if (typeof window !== 'undefined') window.addEventListener('resize', () => {
  clearTimeout(_tRedim);
  _tRedim = setTimeout(() => { const s = $('sec-jugadores'); if (s && !s.hidden) pintarRankings(); }, 150);
});

function pintarRankings() {
  const thead = $('rankings-thead'), body = $('players-body');
  if (!thead || !body) return;
  // si buscaste algo que no esta en este puesto pero si en otro, te llevo
  const coin = coincidenciasPorPuesto();
  if (S.busqueda && !coin[S.pos]) {
    const otro = ['ARQ', 'DEF', 'VOL', 'DEL'].filter(p => coin[p]).sort((a, b) => coin[b] - coin[a])[0];
    if (otro) {
      S.pos = otro;
      document.querySelectorAll('.tab-btn[data-tab]').forEach(z => z.classList.toggle('active', z.dataset.tab === otro));
    }
  }
  // EL GOL MÁS SEGURO DE CADA PUESTO (06/09). Se marca con un puntito para que
  // se vea sin ordenar. Es el que tiene mayor chance de meter AL MENOS uno, que
  // no es el mismo que el de más puntos: Vombergar tiene el gol más probable de
  // la fecha y es el 7º delantero por PUNTOS, porque su gol paga 4.
  if (!S.topGol) {
    S.topGol = {};
    ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pp => {
      let mejor = null;
      (D.rankings[pp] || []).forEach(y => {
        if (estaFuera(y) || y.lg == null) return;
        const q = y.pmin, min = (y.ind && y.ind.minutos) || 0;
        if (q && !(q.arranques >= 2 || min >= 270)) return;   // mismos candidatos que la tabla
        if (!mejor || y.lg > mejor.lg) mejor = y;
      });
      if (mejor) S.topGol[pp] = mejor.id;
    });
  }
  pintarAvisoDatos();
  // MODO ANALISTA (07/09).
  // Toda la app se hizo para decidir con datos, y esa es la gracia. Pero cuando
  // se la mostras a alguien de afuera, catorce columnas son ruido. En vez de
  // hacer dos apps, hay un interruptor: prendido ves todo, apagado quedan las
  // que cuentan la historia. Arranca PRENDIDO, que es como se usa.
  const PROFUNDAS = new Set(['rol', 'tiros', 'xg', 'delgol', 'p12', 'pose', 'crnF', 'crnC', 'lamc']);
  const cols = COLS[S.pos].filter(c =>
    (c[1] !== 'hizo' || (VIVO && FECHA_EMPEZO)) &&
    (S.analista || !PROFUNDAS.has(c[1])));
  // si se apago el modo analista estando ordenado por una columna que se fue,
  // el orden pasa a PUNTOS en vez de quedar ordenando por algo invisible
  if (!cols.some(c => c[1] === S.ordCol)) { S.ordCol = 'epsj'; S.ordDir = -1; }
  // EL ANCHO DE CADA COLUMNA, EN PORCENTAJE (08/09).
  // Con table-layout:fixed el ancho lo manda el encabezado y vale para toda la
  // tabla: nunca mas puede pasar que el titulo diga una columna y el numero de
  // abajo sea de la de al lado. Se reparte el 100% con un peso por columna,
  // asi que la tabla ENTRA siempre, sin scroll de costado y sin cortar PUNTOS.
  const PESO = { '': 3.4, n: 21, rol: 6.2, pvi: 5, lamc: 4.6, tiros: 5.6, xg: 5.2,
                 lg: 5.6, delgol: 5.6, fi: 5, arr: 4, msj: 11.5, p12: 4.4,
                 pose: 5.4, crnF: 4.8, crnC: 4.8, hizo: 5, epsj: 7.2, fuera: 3.2 };
  // EN PIXELES, NO EN PORCENTAJE. Con porcentajes + min-width el navegador
  // redondeaba distinto el ancho de cada columna y el total, y las dos ultimas
  // terminaban SUPERPUESTAS: la ✕ se dibujaba encima del puntaje y el puntaje
  // desaparecia. Con pixeles el ancho de la tabla es la suma exacta y no hay
  // nada que repartir.
  const sumaPeso = cols.reduce((a, c) => a + (PESO[c[1]] || 5), 0);
  const caja = thead.closest('.table-responsive');
  const disponible = caja ? caja.clientWidth : 1200;
  const minimo = cols.length * 76;                      // menos que esto no se lee
  const anchoTabla = Math.max(disponible, minimo);
  let usado = 0;
  const anchos = cols.map((c, i) => {
    if (i === cols.length - 1) return anchoTabla - usado;  // la ultima cierra la cuenta
    const w = Math.round((PESO[c[1]] || 5) / sumaPeso * anchoTabla);
    usado += w; return w;
  });
  thead.parentElement.style.width = anchoTabla + 'px';
  thead.parentElement.style.minWidth = '0';
  thead.innerHTML = '<tr>' + cols.map((c, i) => {
    const act = S.ordCol === c[1];
    const flecha = act ? `<span class="orden-flecha">${S.ordDir === -1 ? '▼' : '▲'}</span>` : '';
    return `<th class="${c[1] === 'n' || c[1] === 'perf' ? '' : 'text-center'}${act ? ' col-ordenada' : ''}${c[1] ? ' col-ordenable' : ''}"
      data-k="${c[1]}" title="${esc(AYUDA_COL[c[1]] || 'Tocá para ordenar por esta columna')}"
      style="cursor:pointer;width:${anchos[i]}px;">${c[0]}${flecha}</th>`;
  }).join('') + '</tr>';
  // Si hay muchas columnas y la ventana es chica, en vez de espachurrar las
  // celdas hasta cortarlas la tabla toma un ancho minimo y scrollea de costado.
  // Con table-layout:fixed el encabezado se va con el cuerpo, asi que puede
  // scrollear sin desalinearse nunca.
  thead.querySelectorAll('th').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if (S.ordCol === k) S.ordDir *= -1; else { S.ordCol = k; S.ordDir = -1; }
    pintarRankings();
  });
  // FILTRO DE CANDIDATOS REALES.
  // Ordenar por "si entra a la cancha" sin filtrar pone primero al que no juega:
  // el que entra 7 minutos rinde muy bien POR MINUTO y no sirve para nada. La
  // regla es la del reglamento, no un numero inventado: se muestran los que es
  // mas probable que jueguen los 20 minutos que exige la ficha que lo contrario.
  // Los demas siguen estando, con el interruptor de al lado.
  // Buscar "veron" no encontraba a "Verón, Gastón": comparaba con los acentos
  // puestos. Se comparan los dos lados sin acentos.
  const pasaFiltros = x => (!S.equipo || x.eq === S.equipo) &&
    (!S.busqueda || sinTildes(x.n).includes(S.busqueda) || sinTildes(x.eq).includes(S.busqueda));
  let lista = D.rankings[S.pos].filter(x => !estaFuera(x) && pasaFiltros(x));
  // LOS QUE ESCONDE TU PROPIO TILDE, DICHOS EN VOZ ALTA (07/09).
  // La ✕ los saca de la tabla y hasta hoy no lo decia nadie: buscabas "lanzini",
  // te contestaba "no hay volantes de ese filtro" y concluias que el jugador no
  // estaba en la app. Una exclusion que uno mismo puso, pero invisible, es igual
  // de confusa que un bug.
  const escondidos = D.rankings[S.pos].filter(x => estaFuera(x) && pasaFiltros(x));
  const total = lista.length;
  // EL FILTRO TAMBIEN SE VE (03/09). Antes escondia por "chance de jugar", un
  // numero nuestro que ya no se muestra: filtrar por algo invisible es lo peor
  // de los dos mundos. Ahora la regla es de futbol y se puede comprobar mirando
  // la columna: se ocultan los que NUNCA arrancaron y encima jugaron poco.
  // Con "arrancó alguna vez" alcanzaba para que se colara el arquero suplente
  // que jugó un partido. La regla es: arrancó al menos DOS veces, o jugó tres
  // partidos enteros. Los dos números se pueden comprobar en la columna.
  // LO QUE DICE EL GRAN DT + LAS ULTIMAS 5 FECHAS (17/09).
  // La regla de temporada de arriba mira TODO el torneo, y por eso dejaba
  // pasar al que jugo las fechas 1 a 3 y despues no aparecio nunca mas. Al
  // ordenar por "tiros por 90" la tabla se llenaba de defensores que hace un
  // mes que no pisan la cancha: con 8 minutos jugados, un tiro da 11 por 90.
  //
  // Se suma la unica fuente que sabe si el tipo va a jugar HOY, que es el
  // ayudante de campo del propio juego:
  //   · "Posible Titular", "En duda", "Juega Copa", "Jugó Copa"  → SIEMPRE se
  //     muestran, aunque la regla de temporada los sacara. Si el juego lo tiene
  //     en el radar, es candidato.
  //   · "Habilitado" o "Lesionado" + ni un partido de 20 minutos en las ultimas
  //     cinco fechas → se oculta. "Habilitado" es el estado generico, el que
  //     tiene el que no esta lesionado y tampoco lo van a poner.
  //
  // Los 20 minutos NO son un numero inventado: son los que exige el juego para
  // darle ficha a un jugador. Si en cinco fechas nunca llego a puntuar, no
  // juega, y punto.
  // Nada de esto le baja el puntaje a nadie: es un filtro de la vista y se
  // apaga con el mismo interruptor de siempre.
  if (!S.verTodos && !S.busqueda) lista = lista.filter(esCandidato);
  S.filtrados = total - lista.length;

  // PUESTO DE VERDAD, no el numero de fila.
  // Buscar "Freitas" mostraba "#1 Freitas" solo porque era el unico resultado.
  // El puesto se calcula sobre TODOS los del puesto, ordenados por el mismo
  // criterio, asi cuando lo buscas ves si esta 8vo o 140vo.
  // EL UNIVERSO DEL PUESTO ES EL MISMO QUE SE MUESTRA.
  // Antes el puesto se calculaba sobre TODOS los del puesto y la tabla ocultaba
  // a los que casi no juegan: ordenando por "puntos si juega" la lista mostraba
  // 1, 3, 4... porque el 2 era alguien que entra 15 minutos y esta escondido.
  // Y como ese orden es el que trepa a los de pocos minutos, los agujeros
  // aparecian ahi y desaparecian al ordenar por "descontado". El puesto ahora
  // se cuenta sobre los candidatos de verdad: numeracion sin huecos.
  // EL PUESTO YA NO MIRA "CHANCE DE JUGAR" (05/09).
  // Antes el universo del puesto era `pj_ >= 0.5`, o sea que el numero de al
  // lado del nombre todavia dependia de que el motor creyera que el tipo juega:
  // Misael Aguirre (pj_ 0.29) quedaba fuera de la numeracion aunque por PUNTOS
  // es el 4to defensor de la liga. Ahora el universo es el mismo que se ve, con
  // la regla de futbol —arranco dos veces o jugo tres partidos enteros— y sin
  // los que yo tilde como que no juegan.
  // EL MISMO FILTRO QUE LA LISTA, o la tabla muestra filas sin numero.
  const universo = D.rankings[S.pos].filter(x => {
    if (estaFuera(x)) return false;
    if (S.verTodos) return true;
    return esCandidato(x);
  });
  const cmp = (a, b) => {
    const va = valorCol(a, S.ordCol), vb = valorCol(b, S.ordCol);
    if (typeof va === 'string') return -S.ordDir * String(va).localeCompare(String(vb));
    return S.ordDir * ((va ?? -1e9) - (vb ?? -1e9));
  };
  const puestoDe = {}; const totalPuesto = universo.length;
  [...universo].sort(cmp).forEach((x, i) => { puestoDe[x.id] = i + 1; });
  S.puestoDe = puestoDe; S.totalPuesto = totalPuesto;
  // El selector se pinta DESPUES de saber cuantos quedaron afuera: si se pinta
  // antes muestra el numero de la vuelta anterior.
  pintarSelectorOrden();
  lista = lista.slice().sort(cmp);
  if (!lista.length) {
    const quien = S.equipo ? NOM(S.equipo) : 'ese filtro';
    body.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-muted);padding:26px;">
      ${escondidos.length
        ? `${escondidos.length === 1 ? 'El único que coincide está' : 'Los que coinciden están'} afuera de la tabla${escondidos.some(x => !esBaja(x)) ? ' porque los tildaste con la <b>✕</b>' : ' porque el juego los marca como baja'} — mirá el renglón de arriba.`
        : `No hay ${S.pos === 'ARQ' ? 'arqueros' : S.pos === 'DEF' ? 'defensores' : S.pos === 'VOL' ? 'volantes' : 'delanteros'} de ${esc(quien)} que entren en el corte.
           ${S.filtrados ? `Hay ${S.filtrados} escondidos —los que arrancaron menos de dos veces, y los que el Gran DT da por «Habilitado» o «Lesionado» y hace cinco fechas que no juegan 20 minutos—: marcá «ver también los suplentes».` : ''}`}</td></tr>`;
  } else
  body.innerHTML = lista.slice(0, 120).map((x, i) =>
    `<tr class="${(S.puestoDe[x.id] || 99) <= 10 ? 'fila-top' : ''}" style="cursor:pointer;" onclick="auditar('${x.id}')">` +
    cols.map(c => `<td class="cl-${c[1] || 'num'}${c[1] === 'n' || c[1] === 'perf' ? '' : ' text-center'}">${celda(x, c[1], i)}</td>`).join('') +
    '</tr>').join('')
    // EL CORTE SE DICE. Se muestran 120 y habia 161: los 41 que faltaban
    // desaparecian sin una palabra, que es como no tenerlos.
    + (lista.length > 120 ? `<tr><td colspan="${cols.length}" class="tb-corte">
        Se muestran los primeros <b>120</b> de ${lista.length}. Buscá por nombre o filtrá por club para ver el resto.
      </td></tr>` : '');
  // ¿hay coincidencias en otros puestos, o escondidas por un tilde tuyo?
  // LA FRANJA SOLO CUANDO LA BUSCAS (08/09). Este renglon nacio para contestar
  // "¿por que no aparece Lanzini?", y esa pregunta se hace BUSCANDO. Sin
  // busqueda era una banda amarilla permanente arriba de la tabla avisando que
  // hay una baja: informacion cierta, puesta donde molesta. Sin busqueda, lo
  // mismo va en un renglon gris al pie de la tabla.
  {
    const otros = ['ARQ', 'DEF', 'VOL', 'DEL'].filter(p => p !== S.pos && coin[p]);
    const partes = [];
    if (escondidos.length && S.busqueda) {
      const tildados = escondidos.filter(x => !esBaja(x));
      const bajas = escondidos.filter(x => esBaja(x));
      if (tildados.length) partes.push(
        `<span class="op-tilde">${tildados.length === 1 ? 'Está' : 'Están'} escondido${tildados.length > 1 ? 's' : ''} porque
         vos ${tildados.length === 1 ? 'lo tildaste' : 'los tildaste'} con la ✕:</span> ` +
        tildados.slice(0, 6).map(x =>
          `<button class="op-link" onclick="toggleFuera('${x.id}', event)" title="Destildarlo y devolverlo a la tabla">${esc(nombreCorto(x.n))} ✕</button>`).join(' ') +
        (tildados.length > 6 ? ` y ${tildados.length - 6} más` : ''));
      if (bajas.length) partes.push(
        `<span class="op-tilde">${bajas.length} que el juego marca como baja:</span> ` +
        bajas.slice(0, 6).map(x => esc(nombreCorto(x.n))).join(' · '));
    }
    if (otros.length) partes.push(`Con <b>${esc(S.busqueda)}</b> también hay ${otros.map(p =>
      `<button class="op-link" onclick="irAPuesto('${p}')">${coin[p]} ${NOMBRE_POS_L[p].toLowerCase()}</button>`).join(' · ')}`);
    const av = $('aviso-otros-puestos');
    if (av) { av.innerHTML = partes.join('<br>'); av.hidden = !partes.length; }
    // el pie gris: lo mismo, callado, para cuando no estas buscando nada
    if (!S.busqueda && escondidos.length && lista.length) {
      const tild = escondidos.filter(x => !esBaja(x));
      const baj = escondidos.filter(x => esBaja(x));
      const trozos = [];
      if (tild.length) trozos.push(`${tild.length} ${tild.length === 1 ? 'escondido' : 'escondidos'} por tu ✕: ` +
        tild.slice(0, 8).map(x => `<button class="pie-link" onclick="event.stopPropagation();toggleFuera('${x.id}', event)"
          title="Destildarlo y devolverlo a la tabla">${esc(nombreCorto(x.n))}</button>`).join(' ') +
        (tild.length > 8 ? ` +${tild.length - 8}` : ''));
      if (baj.length) trozos.push(`${baj.length} que el juego marca como baja: ` +
        baj.slice(0, 8).map(x => esc(nombreCorto(x.n))).join(' · ') + (baj.length > 8 ? ` +${baj.length - 8}` : ''));
      body.insertAdjacentHTML('beforeend',
        `<tr class="fila-pie"><td colspan="${cols.length}" class="tb-pie">${trozos.join(' &nbsp;·&nbsp; ')}</td></tr>`);
    }
  }
  // El puesto pinta el acento de las diez primeras filas y la tabla entra con
  // una animacion corta, para que se note que la lista se rehizo entera y no
  // que cambiaron dos numeros sueltos.
  const cont = $('view-rankings');
  if (cont) {
    cont.dataset.pos = S.pos;
    cont.classList.remove('gdt-entra');
    void cont.offsetWidth;          // fuerza el reflow: si no, la animacion no se repite
    cont.classList.add('gdt-entra');
  }
}

// ── LA LUPITA: auditoría completa del jugador ───────────────────────────────

// ── De donde salen los minutos esperados, paso por paso ─────────────────────
// Sin esto es imposible discutir el numero: uno ve "50 minutos esperados" y no
// sabe si el problema son los datos, el promedio, la rotacion o la formula.
// Aca esta la cadena entera, con los minutos fecha por fecha arriba de todo.
function bloqueMinutos(x) {
  const log = Array.isArray(x.mlog) ? x.mlog : null;
  if (!log || !log.length) return '';
  const barras = log.map((m, i) => {
    const alto = Math.max(3, Math.round(38 * Math.min(90, m) / 90));
    const c = m === 0 ? '#ef4444' : m >= 60 ? '#10b981' : m >= 20 ? '#38bdf8' : '#f59e0b';
    return `<div class="min-col" title="Fecha ${i + 1}: ${m} minutos">
      <div class="min-barra"><i style="height:${alto}px;background:${c};"></i></div>
      <div class="min-num">${m}</div><div class="min-f">f${i + 1}</div></div>`;
  }).join('');
  const jugadas = log.filter(m => m >= 20).length;
  const rot = x.rot > 0;
  return `
    <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin:16px 0 6px;">
      De dónde salen los minutos esperados</div>
    <div class="min-graf">${barras}</div>
    <table style="width:100%;border-collapse:collapse;font-size:0.82rem;margin-top:8px;">
      <tbody>
        <tr><td style="padding:5px 10px;">Jugó 20+ minutos en</td>
            <td style="padding:5px 10px;text-align:right;font-weight:700;">${jugadas} de ${log.length} fechas</td></tr>
        <tr><td style="padding:5px 10px;">Promedio pesando más las últimas${rot ? ', ya ajustado por el partido de copa' : ''}</td>
            <td style="padding:5px 10px;text-align:right;font-weight:700;">${x.mest != null ? x.mest + "'" : '—'}</td></tr>
        <tr><td style="padding:5px 10px;">Chance de llegar a los 20' que exige la ficha</td>
            <td style="padding:5px 10px;text-align:right;font-weight:700;">${pc0(x.pj_)}</td></tr>
        <tr><td style="padding:5px 10px;">Minutos que juega cuando entra</td>
            <td style="padding:5px 10px;text-align:right;font-weight:700;">${x.msj || '?'}'</td></tr>
        <tr style="border-top:1px solid rgba(255,255,255,0.1);">
            <td style="padding:7px 10px;font-weight:700;">Minutos esperados = chance × minutos si entra</td>
            <td style="padding:7px 10px;text-align:right;font-weight:800;color:#38bdf8;">${x.mesp}'</td></tr>
      </tbody>
    </table>
    <p class="md-p suave" style="margin-top:6px;">Medido sobre el torneo anterior: de los que jugaron 20+ minutos en
    <b>todas</b> sus fechas previas y promedian 75+ minutos, la siguiente fecha juegan el <b>84%</b> (931 casos).
    Un titular indiscutido se pierde 1 de cada 6 partidos. Cuando 365Scores confirme la formación, esto pasa a 97%.</p>`;
}

window.auditar = function (id) {
  const x = TODOS[id]; if (!x) return;
  const pool = D.rankings[x.pos];
  const col = k => pool.map(y => valorCol(y, k));
  const ind = x.ind || {}, me = x.me || {}, er = x.er || {}, met = x.met || {}, ert = x.ert || {};
  const cond = x.cond === 'L' ? 'de local' : 'de visitante';
  const condR = x.cond === 'L' ? 'de visitante' : 'de local';

  $('audit-title').innerHTML = `${{ARQ:'🧤',DEF:'🛡️',VOL:'⚡',DEL:'🎯'}[x.pos]} ${esc(nombreCorto(x.n))}`;

  // 1) el desglose del puntaje, en puntos, sumando exactamente el EP
  const filasEP = x.des.map(d => {
    let pctObj = null;
    if (d[0].startsWith('Ficha')) pctObj = percentil(x.fi, col('fi'));
    else if (d[0] === 'Valla invicta') pctObj = percentil(x.pvi, col('pvi'));
    else if (d[0] === 'Gol propio') pctObj = percentil(x.lg, pool.map(y => y.lg));
    else if (d[0] === 'Figura') pctObj = percentil(x.pfig, pool.map(y => y.pfig));
    else if (d[0] === 'Tarjetas') pctObj = percentil(x.ta, pool.map(y => y.ta), false);
    else if (d[0] === 'Goles recibidos') pctObj = percentil(-x.lam.c, pool.map(y => -y.lam.c));
    const signo = d[1] > 0 ? '+' : '';
    const color = d[1] > 0 ? '#10b981' : d[1] < 0 ? '#ef4444' : 'var(--text-main)';
    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.07);">
      <td style="padding:11px 14px;font-weight:700;">${esc(d[0])}</td>
      <td style="padding:11px 14px;text-align:center;font-weight:800;color:${color};font-size:1rem;">${signo}${n2(d[1])}</td>
      <td style="padding:11px 14px;color:#e2e8f0;font-size:0.88rem;">${esc(d[2])}</td>
      <td style="padding:11px 14px;">${badgePct(pctObj)}</td></tr>`;
  }).join('');

  const bloque = (titulo, filas) => `
    <div style="margin-top:18px;">
      <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:8px;">${titulo}</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">${filas}</table></div>`;
  const fila = (k, v, extra) => `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
      <td style="padding:7px 0;color:#cbd5e1;">${k}${extra ? ` <span class="text-muted" style="font-size:0.78rem;">${extra}</span>` : ''}</td>
      <td style="padding:7px 0;text-align:right;font-weight:700;">${v}</td></tr>`;
  const filaP = (k, v, pctObj, extra) => `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
      <td style="padding:7px 0;color:#cbd5e1;">${k}${extra ? ` <span class="text-muted" style="font-size:0.78rem;">${extra}</span>` : ''}</td>
      <td style="padding:7px 0;text-align:right;font-weight:700;">${v}</td>
      <td style="padding:7px 0 7px 14px;text-align:right;">${badgePct(pctObj)}</td></tr>`;

  // ── LA FICHA, EN TRES NIVELES ─────────────────────────────────────────────
  // Antes era un chorizo de ocho tablas seguidas: uno abria un jugador y se
  // perdia. Ahora: arriba lo que se mira en dos segundos (tarjetas grandes con
  // el puesto al lado), despues el partido de hoy, despues de donde salen los
  // puntos, y todo el resto plegado.
  const P = (v, arr, mayorMejor) => percentil(v, arr, mayorMejor !== false);
  const tile = (rot, valor, sub, pctObj, ay) => `
    <div class="tile" ${ay ? `title="${esc(ay)}"` : ''}>
      <div class="tile-rot">${rot}</div>
      <div class="tile-val">${valor}</div>
      <div class="tile-sub">${sub || ''}</div>
      ${pctObj ? `<div class="tile-pct">${badgePct(pctObj)}</div>` : ''}
    </div>`;

  const esArquero = x.pos === 'ARQ', esDefensa = x.pos === 'DEF' || esArquero;
  const tiles = [
    tile('Ficha Clarín', n2(x.fi), `${ind.pj || 0} partidos calificados`, P(x.fi, col('fi')),
      'Promedio de la nota del diario, limpia de bonificaciones. Es lo que más pesa en el puntaje.'),
    tile('Puntos en el torneo', String(ind.puntosTorneo ?? '—'),
      ind.promedioTorneo != null ? `${ind.promedioTorneo} por partido` : '',
      P(ind.puntosTorneo, pool.map(y => (y.ind || {}).puntosTorneo)),
      'Puntaje acumulado en el Gran DT y su promedio por partido calificado.'),
    tile('Goles', String(ind.goles || 0),
      `${ind.golesPenal ? ind.golesPenal + ' de penal · ' : ''}${String(+((ind.xgT != null ? x.xgT : x.xgT) ?? 0).toFixed(2))} de xG sin penales`,
      P(ind.goles, pool.map(y => (y.ind || {}).goles)),
      'Goles convertidos en el torneo, y al lado el xG que generó sin contar penales.'),
    esDefensa
      ? tile('Vallas invictas', String(ind.vallas || 0), `de ${ind.pj || 0} partidos`,
          P(ind.vallas, pool.map(y => (y.ind || {}).vallas)),
          `Partidos en los que su equipo no recibió goles. Le pagan ${esArquero ? 3 : 2} puntos cada una.`)
      : tile('Asistencias', String(ind.asistencias || 0), 'en el torneo',
          P(ind.asistencias, pool.map(y => (y.ind || {}).asistencias)),
          'No suman puntos en el Gran DT, pero dicen si genera juego.'),
    tile('Figuras', String(ind.figuras || 0), 'pagan +4 cada una',
      P(ind.figuras, pool.map(y => (y.ind || {}).figuras)),
      'Veces que fue la figura del partido.'),
    tile('Amarillas', String(ind.amarillas || 0), ind.rojas ? `${ind.rojas} roja(s)` : '−2 cada una',
      P(ind.amarillas, pool.map(y => (y.ind || {}).amarillas), false),
      'Cuantas menos, mejor: cada amarilla resta 2.'),
    // TIROS Y xG, LOS TRES NUMEROS (03/09). Antes solo estaba el ritmo por 90 y
    // faltaba lo mas basico: cuantos tiros lleva en el torneo. Van los tres —
    // total, por partido y por cada 90 minutos EN LA CANCHA— porque contestan
    // cosas distintas: el total dice cuanto viene haciendo, el por 90 dice a que
    // ritmo lo hace. Todas las divisiones por 90 son sobre MINUTOS JUGADOS, no
    // sobre partidos: un tipo que entra 20 minutos y patea una vez no patea
    // "1 por partido", patea 4.5 cada 90.
    tile('Tiros', String(ind.tiros || 0),
      `${ind.pj365 ? n1((ind.tiros || 0) / ind.pj365) : '—'} por partido · <b>${ind.minutos ? n1((ind.tiros || 0) / (ind.minutos / 90)) : '—'} cada 90′</b>`,
      P(ind.minutos ? (ind.tiros || 0) / (ind.minutos / 90) : null,
        pool.map(y => { const i = y.ind || {}; return i.minutos ? (i.tiros || 0) / (i.minutos / 90) : null; })),
      `Tiros en el torneo: ${ind.tiros || 0} en ${ind.minutos || 0} minutos${ind.partidosSinDato ? `. OJO: a 365Scores le faltan ${ind.partidosSinDato} partido(s) suyos` : ''}. El percentil compara el ritmo cada 90, no el total.`),
    tile('xG generado', String(+((x.xgT ?? 0)).toFixed(2)),
      `${ind.pj365 ? n2((x.xgT ?? 0) / ind.pj365) : '—'} por partido · <b>${ind.minutos ? n2((x.xgT ?? 0) / (ind.minutos / 90)) : '—'} cada 90′</b>`,
      P(ind.minutos ? (x.xgT ?? 0) / (ind.minutos / 90) : null,
        pool.map(y => { const i = y.ind || {}; return i.minutos ? ((y.xgT ?? 0)) / (i.minutos / 90) : null; })),
      `Goles esperados SIN penales: ${+((x.xgT ?? 0)).toFixed(2)} en ${ind.minutos || 0} minutos. Un penal vale 0.79 de xG y no dice nada de si genera juego, por eso no cuenta.`),
    tile('Minutos', `${ind.minutos || 0}'`,
      `${ind.pj365 || 0} partidos${ind.partidosSinDato ? ` · le faltan ${ind.partidosSinDato} a 365` : ''}`,
      P(ind.minutos, pool.map(y => (y.ind || {}).minutos)),
      'Minutos jugados en el torneo, según 365Scores.'),
    tile('Si arranca, juega', `${x.msj != null ? x.msj + "'" : '—'}`,
      x.pmin && x.pmin.arranques
        ? `arrancó ${x.pmin.arranques} · completó ${x.pmin.completa}`
        : 'nunca arrancó de titular',
      null, ayudaMinutos(x)),
  ].join('');

  // Contexto del partido: lo que cambia SEGUN el rival, que es lo que hace que
  // un jugador valga distinto esta fecha que la que viene.
  const am90 = amenaza90(x);
  const nivelRival = er.nivelDefensa != null
    ? (er.nivelDefensa > 1.08 ? `floja, concede ${Math.round(100 * (er.nivelDefensa - 1))}% más que el promedio`
      : er.nivelDefensa < 0.92 ? `sólida, concede ${Math.round(100 * (1 - er.nivelDefensa))}% menos que el promedio`
      : 'del montón') : 's/d';
  const ctx = `
    <div class="ctx-caja">
      <div class="ctx-titulo">El partido de hoy — ${esc(NOM(x.eq))} ${x.cond === 'L' ? 'local' : 'visitante'} vs ${esc(NOM(x.riv))}</div>
      <div class="ctx-grid">
        ${tile('Gol de su equipo hoy', n2(x.lam.f), 'goles esperados', null,
          'Goles que se espera que meta su equipo en ESTE partido. Sale de las cuotas con el margen descontado.')}
        ${tile('Le hacen hoy', n2(x.lam.c), 'goles esperados en contra', null,
          'Goles que se espera que reciba su equipo en este partido.')}
        ${tile('Valla invicta', pc0(x.pvi), esDefensa ? `paga ${esArquero ? 3 : 2} puntos` : 'del equipo',
          P(x.pvi, col('pvi')), 'Chance de que su equipo termine sin recibir goles.')}
        ${tile('Su parte del ataque', x.sh != null ? pc0(x.sh) : '—',
          'de los goles del equipo', null,
          'Qué porción de los goles de su equipo se espera que haga él. Sale de sus tiros, su xG y sus goles por 90 minutos.')}
        ${tile('Amenaza cada 90′', am90 != null ? String(+am90.toFixed(3)) : '—', 'goles esperados suyos', null,
          'Su parte del ataque por los goles que se espera que meta el equipo hoy, llevado a 90 minutos. Es el número de la pantalla de Oportunidades.')}
        ${tile('Defensa del rival', nivelRival.split(',')[0], nivelRival.includes(',') ? nivelRival.split(', ')[1] : '', null,
          'Cómo viene el rival defendiendo, comparado con el equipo promedio de la liga sobre todos sus partidos.')}
      </div>
      ${x.nrot ? `<div class="ctx-nota">⚑ ${esc(x.nrot)}</div>` : ''}
    </div>`;

  const detalle = (titulo, contenido, abierto) => `
    <details class="det"${abierto ? ' open' : ''}><summary>${titulo}</summary><div class="det-cuerpo">${contenido}</div></details>`;

  $('audit-body').innerHTML = `
    <div class="ficha-cab">
      <div>
        <div class="ficha-nombre">${esc(nombreCorto(x.n))}</div>
        <div class="ficha-sub">${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'Local' : 'Visitante'} vs ${esc(NOM(x.riv))} · ${plata(x.pr)}</div>
        <div class="ficha-pills">${pintarAvisos(x)}${pillCond(x)}${x.pen > 0 ? `<span class="pill-alerta pill-penal">⚫ PENALES ${x.pen}</span>` : ''}</div>
      </div>
      <div class="ficha-puntos">
        <div class="ficha-ep">${n2(x.epsj)}</div>
        <div class="ficha-ep-lbl">puntos si entra a la cancha</div>
        <div class="ficha-ep-sub">${n2(x.ep)} descontando la chance de que no juegue</div>
        <div class="ficha-ep-puesto">${badgePct(P(x.epsj, pool.map(y => y.epsj)))}</div>
      </div>
    </div>

    <div class="tiles">${tiles}</div>

    ${ctx}

    ${detalle('De dónde salen esos puntos, término por término', `
      <table class="tb-desglose">
        <thead><tr><th>Término del reglamento</th><th class="text-center">Puntos</th><th>Cómo se calcula</th><th>Puesto</th></tr></thead>
        <tbody>${filasEP}
          <tr class="fila-total"><td><b>TOTAL</b></td>
            <td class="text-center"><b>${n2(x.ep)}</b></td>
            <td class="text-muted">Suma exacta de los términos de arriba</td>
            <td>${badgePct(percentil(x.ep, col('ep')))}</td></tr>
        </tbody></table>`, true)}

    ${bloquePartidoNumeros(x, S.condVent)}

    ${detalle('Cómo les va de local y de visitante', bloqueCondicion(x))}

    ${detalle('De dónde salen los minutos esperados', bloqueMinutos(x) || '<p class="md-p suave">Sin minutos fecha por fecha para este jugador.</p>')}

    ${detalle('Nivel de los dos equipos y fuente de los goles esperados', `
      ${bloque(`${esc(NOM(x.eq))} — nivel ajustado por jugar ${cond}`, [
        fila('Tiros generados', n1(me.tiros), `· total ${n1(met.tiros)}`),
        fila('Tiros concedidos', n1(me.tirosConcedidos), `· total ${n1(met.tirosConcedidos)}`),
        fila('xG generado', n2(me.xg), `· total ${n2(met.xg)}`),
        fila('xG concedido', n2(me.xgConcedido), `· total ${n2(met.xgConcedido)}`),
        fila('Partidos que respaldan el nivel', String(me.pj ?? 's/d'), 'de los dos torneos')
      ].join(''))}
      ${bloque(`${esc(NOM(x.riv))} — nivel ajustado por jugar ${condR}`, [
        fila('Tiros generados', n1(er.tiros), `· total ${n1(ert.tiros)}`),
        fila('Tiros concedidos', n1(er.tirosConcedidos), `· total ${n1(ert.tirosConcedidos)}`),
        fila('xG generado', n2(er.xg), `· total ${n2(ert.xg)}`),
        fila('xG concedido', n2(er.xgConcedido), `· total ${n2(ert.xgConcedido)}`),
        fila('Fuente de los goles esperados', x.lam.mk
          ? 'Cuotas del mercado, con el margen descontado'
          : 'Nivel del equipo por xG <span class="text-muted">(este partido no tiene cuotas)</span>')
      ].join(''))}`)}

    <div class="ficha-pie">
      Todo lo de arriba es dato medido o cálculo declarado. La ficha se despeja de la planilla oficial
      (<code>puntaje acumulado − bonos conocidos ÷ partidos</code>), los tiros y el xG salen de 365Scores partido por partido,
      las cuotas son promedio de casas con el margen descontado. Ningún peso está puesto a mano:
      el puntaje es la suma de los términos del reglamento.
    </div>`;
  abrirModal('audit-modal');
};

// ── el once ─────────────────────────────────────────────────────────────────
function cuentaPos(e) { const [a, d, v, l] = e.split('-').map(Number); return { ARQ: a, DEF: d, VOL: v, DEL: l }; }
// EL CAPITAN SE PUEDE ELEGIR A MANO (07/09).
// Antes era siempre el de ficha mas alta del once y no habia forma de moverlo:
// al cambiar un jugador la cinta saltaba sola a otro y te quedabas con el
// capitan que el motor eligio, no con el que querias.
// La cinta duplica SOLO la ficha Clarin, asi que la sugerencia sigue siendo la
// ficha mas alta — pero es una sugerencia. Si elegiste uno a mano se respeta
// mientras siga en el once; si lo sacas, vuelve a mandar el automatico.
// La cinta duplica la ficha, asi que se elige por la ficha que se espera EN
// ESTE PARTIDO (fcap), no por el promedio historico del jugador: el resultado
// del equipo mueve la ficha 1.39 puntos y la diferencia entre candidatos suele
// ser 0.05. El motor la calcula; si el datos.js es viejo, cae a la de siempre.
const fichaCap = p => (p && p.fcap != null) ? p.fcap : (p ? p.fi : 0);
function recalcCapitan() {
  if (S.capitanManual && S.once.includes(S.capitanManual)) { S.capitan = S.capitanManual; return; }
  // Y SE GUARDA (07/09). Antes se limpiaba solo en memoria: el localStorage
  // seguia con el capitan viejo y al recargar reaparecia aunque ya no estuviera
  // en el once.
  if (S.capitanManual) { S.capitanManual = null; guardarCapitan(); }
  let mejor = null;
  S.once.forEach(id => { const p = TODOS[id]; if (p && (!mejor || fichaCap(p) > fichaCap(mejor))) mejor = p; });
  S.capitan = mejor ? mejor.id : null;
}
// El capitan automatico, para poder decir cuando el elegido a mano NO es el que
// mas ficha trae y cuanto cuesta la decision.
function capitanSugerido() {
  let mejor = null;
  S.once.forEach(id => { const p = TODOS[id]; if (p && (!mejor || fichaCap(p) > fichaCap(mejor))) mejor = p; });
  return mejor ? mejor.id : null;
}
window.ponerCapitan = function (id, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  if (!S.once.includes(id)) return;
  S.capitanManual = (S.capitanManual === id) ? null : id;   // volver a tocarlo devuelve el automatico
  guardarCapitan(); recalcCapitan();
  pintarOnce(); pintarPantallaOnce(); pintarPantallaFecha();
};
// EL TOTAL DE UN ONCE CUALQUIERA, no solo del que esta puesto.
// Hace falta para poder decir cuanto cuesta un cambio de verdad: se arma el
// once resultante y se compara. Usa la MISMA cuenta que totalOnce() —incluida
// la ficha del capitan— porque si no, el costo que se muestra no coincide con
// el numero que cambia arriba.
function totalDeOnce(ids) {
  let t = 0, masFicha = null;
  ids.forEach(id => {
    const p = TODOS[id]; if (!p) return;
    t += (p.epsj != null ? p.epsj : p.ep);
    if (!masFicha || fichaCap(p) > fichaCap(masFicha)) masFicha = p;
  });
  // el capitan elegido a mano manda mientras siga adentro; si no, el de mas ficha
  const cap = (S.capitanManual && ids.includes(S.capitanManual)) ? TODOS[S.capitanManual] : masFicha;
  return t + (cap ? cap.fi : 0);
}
function totalOnce() {
  // SE FUE EL DESCONTADO (03/09): las fichas de la cancha muestran los puntos
  // si juega, asi que el total tiene que sumar lo mismo o no cierra a ojo.
  let t = 0; S.once.forEach(id => { const p = TODOS[id]; if (p) t += (p.epsj != null ? p.epsj : p.ep); });
  const c = TODOS[S.capitan]; if (c) t += c.fi;
  return t;
}
function costoOnce() {
  let c = 0, sd = 0;
  S.once.forEach(id => { const p = TODOS[id]; if (!p) return; if (p.pr == null) sd++; else c += p.pr; });
  return { c, sd };
}
// ── EL ONCE SE REARMA EN EL NAVEGADOR (05/09) ───────────────────────────────
// Antes el Mejor 11 lo calculaba armar.cjs y viajaba cocinado adentro de
// datos.js: tildar a un lesionado NO lo sacaba del once, seguia ahi hasta la
// proxima corrida de RECALCULAR. Como el tilde es justamente lo que uno hace a
// ultimo momento —cuando sale la noticia— eso lo hacia inutil.
// Ahora la busqueda del once solido se rehace aca, en vivo, sobre los diez
// esquemas, ordenando por PUNTOS (los puntos si entra a la cancha) y salteando
// a los tildados. El capitan es el de ficha mas alta porque la cinta duplica
// SOLO la ficha Clarin.
// El once ARRIESGADO no se rehace: sale de una simulacion de Monte Carlo de
// cientos de miles de fechas que no tiene sentido correr en el navegador. Ese
// sigue siendo el del ultimo RECALCULAR y se avisa si tiene un tildado adentro.
const ESQUEMAS_11 = ['1-3-4-3', '1-4-4-2', '1-4-3-3', '1-3-5-2', '1-4-5-1',
                     '1-5-3-2', '1-3-3-4', '1-4-2-4', '1-5-2-3', '1-5-4-1'];

// UN ESQUEMA QUE SE PUEDA DIBUJAR, SIEMPRE (13/09).
// Nace de un pegado de quince lineas donde la palabra "Suplentes:" no estaba:
// los cuatro del banco entraron como titulares, la formacion salio "1-4-5-5" y
// la cancha dibujo quince huecos. Peor: "vaciar" no lo arreglaba, porque
// limpiaba los jugadores y dejaba guardada la formacion rota. Cualquier cosa
// que no sea uno de los diez esquemas del juego se cambia por el mas parecido,
// midiendo la diferencia puesto por puesto.
function esquemaValido(e) {
  if (ESQUEMAS_11.includes(e)) return e;
  const porDefecto = (S.oncesLocales && S.oncesLocales[0] && S.oncesLocales[0].e) || '1-4-4-2';
  const n = String(e || '').split('-').map(x => parseInt(x, 10));
  if (n.length !== 4 || n.some(x => isNaN(x))) return porDefecto;
  let mejor = porDefecto, mejorD = Infinity;
  ESQUEMAS_11.forEach(x => {
    const q = cuentaPos(x);
    const d = Math.abs(q.DEF - n[1]) + Math.abs(q.VOL - n[2]) + Math.abs(q.DEL - n[3]);
    if (d < mejorD) { mejorD = d; mejor = x; }
  });
  return mejor;
}
function mejor11Local(esq) {
  const c = cuentaPos(esq), once = [];
  for (const pos of ['ARQ', 'DEF', 'VOL', 'DEL']) {
    const cand = (D.rankings[pos] || [])
      .filter(x => !estaFuera(x) && x.epsj != null)
      .sort((a, b) => b.epsj - a.epsj);
    if (cand.length < c[pos]) return null;
    once.push(...cand.slice(0, c[pos]));
  }
  const cap = once.reduce((m, x) => (!m || fichaCap(x) > fichaCap(m)) ? x : m, null);
  return { e: esq, ids: once.map(x => x.id), capitan: cap ? cap.id : null,
           total: once.reduce((t, x) => t + x.epsj, 0) + (cap ? cap.fi : 0) };
}
function rearmarOnce() {
  if (!D || !D.rankings) return;
  const onces = ESQUEMAS_11.map(mejor11Local).filter(Boolean).sort((a, b) => b.total - a.total);
  S.oncesLocales = onces;
  if (!onces.length || S.esquema === '__riesgo') return;
  // AL ABRIR MANDA EL MEJOR DE ACA, NO EL QUE VIENE EN datos.js (07/09).
  // S.esquema arranca con el esquema que eligio armar.cjs, y esta funcion lo
  // respetaba. Pero el motor arma su once sin tus descartes —y hasta hoy lo
  // armaba por EP y no por PUNTOS—, asi que su esquema podia no ser el mejor
  // de los diez que se rehacen aca. Resultado: al abrir la pagina el once
  // quedaba en un esquema que NO era el optimo local y el sello decia
  // "modificado por vos" sin que hubieras tocado nada; le dabas a "volver al
  // oficial", funcionaba, y al recargar volvia a pasar lo mismo.
  // Ahora el esquema del motor solo se respeta si vos lo elegiste a mano.
  // SI VOS EDITASTE EL ONCE, MANDA EL TUYO (17/09).
  // Esta funcion pisaba S.once entero, y la llama repintarTodo() — o sea que
  // alcanzaba con tildar a UNO con la ✕ para perder todos los cambios que
  // habias hecho a mano. Ahora, con un once editado, lo unico que se toca es
  // sacar al que acabas de tildar y poner en su lugar al mejor de su puesto
  // que quede libre, que es justo lo que uno espera al apretar la ✕.
  if (S_ONCE.editado && Array.isArray(S.once) && S.once.length) {
    let cambio = false;
    const ocupados = () => new Set(S.once.concat(
      S_ONCE.banco ? Object.values(S_ONCE.banco).filter(Boolean) : []));
    S.once = S.once.map(id => {
      const p = TODOS[id];
      if (!p || !estaFuera(p)) return id;
      const ya = ocupados();
      const rep = (D.rankings[p.pos] || [])
        .filter(x => !ya.has(x.id) && !estaFuera(x))
        .sort((a, c) => (c.epsj ?? c.ep ?? -1) - (a.epsj ?? a.ep ?? -1))[0];
      if (!rep) return id;              // no hay con quien reemplazarlo: se deja
      cambio = true;
      return rep.id;
    });
    // el banco tambien: un suplente tildado deja de ser suplente
    if (S_ONCE.banco) {
      ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => {
        const id = S_ONCE.banco[pos], p = id ? TODOS[id] : null;
        if (!p || !estaFuera(p)) return;
        const ya = ocupados();
        const rep = (D.rankings[pos] || [])
          .filter(x => !ya.has(x.id) && !estaFuera(x))
          .sort((a, c) => (c.epsj ?? c.ep ?? -1) - (a.epsj ?? a.ep ?? -1))[0];
        S_ONCE.banco[pos] = rep ? rep.id : null;
        if (rep) cambio = true;
      });
    }
    if (cambio) guardarOnceEditado();
    recalcCapitan();
    return;
  }
  const q = (S.esquemaElegido && onces.find(o => o.e === S.esquema)) || onces[0];
  S.esquema = q.e; S.once = q.ids.slice(); S_ONCE.banco = null;
  recalcCapitan();
}
// ── QUE TAN FIRME ES ESTE ONCE ──────────────────────────────────────────────
// El once que sale del ranking es el de mayor puntaje esperado, pero eso no
// quiere decir que sea el unico razonable ni que no tenga riesgos. Esto mide
// tres cosas que el puntaje NO puede mostrar, porque ninguna cambia la media:
//
//   · CUANTOS ONCES EMPATAN. En la fecha 8 los tres mejores esquemas estan
//     dentro de 0.26 puntos y difieren en dos jugadores. Elegir "el mejor"
//     entre cosas que empatan es lo que hace que el once se de vuelta entero
//     cuando un jugador se mueve 0.2. Verlo cambia la pregunta: en vez de
//     "por que cambio" pasa a ser "cual de estos cinco prefiero".
//   · CUANTOS SON DEL MISMO CLUB. Tres de Rosario Central rinden como tres
//     jugadores distintos en el promedio, pero en la fecha real suben y bajan
//     JUNTOS. Es la diferencia entre una fecha regular y un desastre.
//   · A QUIEN LE ESTAS APOSTANDO EN CONTRA. Si tenes al arquero de A y al 9 de
//     B, y A juega contra B, cuando uno cobra el otro no. Eso NO resta puntos
//     esperados —la media es aditiva— pero achica la varianza: es cobertura.
//     Antes el motor lo penalizaba con un x0.92, que era matematicamente
//     incorrecto. Ahora se dice y se decide a mano.
function analisisOnce() {
  if (!D || !S.once || !S.once.length) return null;
  const j = S.once.map(id => TODOS[id]).filter(Boolean);
  const porClub = {}; j.forEach(x => { (porClub[NOM(x.eq)] = porClub[NOM(x.eq)] || []).push(x); });
  const clubes = Object.entries(porClub).filter(([, a]) => a.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([eq, a]) => ({ eq, n: a.length, pts: a.reduce((s, x) => s + (x.epsj ?? x.ep ?? 0), 0),
                         quienes: a.map(x => nombreCorto(x.n)) }));
  // arquero y defensores del mismo club: es LA MISMA valla invicta
  const vallaJunta = Object.entries(porClub)
    .map(([eq, a]) => ({ eq, a: a.filter(x => x.pos === 'ARQ' || x.pos === 'DEF') }))
    .filter(x => x.a.length > 1)
    .map(x => ({ eq: x.eq, n: x.a.length, quienes: x.a.map(y => nombreCorto(y.n)) }));
  // ataque propio contra valla propia
  const defensivos = j.filter(x => x.pos === 'ARQ' || x.pos === 'DEF');
  const cruces = [];
  j.filter(x => x.pos === 'VOL' || x.pos === 'DEL').forEach(a => {
    defensivos.forEach(d => { if (NOM(d.riv) === NOM(a.eq))
      cruces.push({ ataca: nombreCorto(a.n), club: NOM(a.eq), contra: nombreCorto(d.n), clubD: NOM(d.eq) }); });
  });
  // todas las formaciones posibles, con QUIEN entra y QUIEN sale respecto de la
  // que estás viendo. Antes solo decía "1 jugador distinto" y no se podía ni
  // saber cuál era ni elegirla: era un dato muerto.
  const onces = S.oncesLocales || [];
  const mejor = onces.length ? onces[0].total : null;
  const alternativas = onces.map(o => {
    const entran = o.ids.filter(id => !S.once.includes(id)).map(id => TODOS[id]).filter(Boolean);
    const salen = S.once.filter(id => !o.ids.includes(id)).map(id => TODOS[id]).filter(Boolean);
    return { e: o.e, total: o.total, dif: mejor != null ? o.total - mejor : 0,
             actual: o.e === S.esquema, cambian: entran.length,
             entran: entran.map(x => nombreCorto(x.n)), salen: salen.map(x => nombreCorto(x.n)) };
  });
  // LOS CAMBIOS, UNO POR UNO (07/09).
  // Diez formaciones sueltas era la forma equivocada de mostrarlo: entre una y
  // otra se repiten nueve o diez jugadores, asi que leer diez onces enteros
  // para encontrar el jugador que cambia es trabajo al pedo. Lo que se decide
  // de verdad es un MOVIMIENTO: "pongo a este por aquel, y me cuesta tanto".
  // Aca salen los dos tipos juntos, ordenados por lo que cuestan:
  //   · sin tocar la formación: cada titular por el mejor suplente de su puesto
  //   · cambiando la formación: lo que entra y sale en cada esquema alternativo
  // EL COSTO SE MIDE ARMANDO EL ONCE RESULTANTE (07/09).
  // Antes cada tipo de cambio se calculaba con su propia cuenta y las dos
  // estaban mal:
  //   · los de JUGADOR hacian epsj(sale) − epsj(entra), que ignora la ficha del
  //     capitan. Si el que entra tiene mas ficha que el capitan actual, la cinta
  //     se muda y el once suma mas de lo que decia el costo.
  //   · los de ESQUEMA usaban la distancia al MEJOR esquema y no al que estás
  //     viendo. Parado en el 3-4-3, pasar al 3-5-2 figuraba como "0.00" —porque
  //     el 3-5-2 ES el mejor— cuando en realidad te sumaba 0.20 puntos.
  // El sintoma era que un cambio y su inverso no daban opuestos: sacar a Campaz
  // decia 0.00 y volver a meterlo decia −0.10.
  // Ahora hay una sola cuenta para todo: se arma el once que quedaria y se
  // compara contra el actual con totalDeOnce(). Positivo = te cuesta,
  // negativo = te mejora. Y siempre coincide con el numero de arriba.
  const totalHoy = totalDeOnce(S.once);
  const cambios = [];
  // 1) dentro del mismo esquema
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => {
    const dentro = j.filter(x => x.pos === pos);
    const libres = (D.rankings[pos] || [])
      .filter(x => !S.once.includes(x.id) && !estaFuera(x) && x.epsj != null)
      .sort((a, b) => b.epsj - a.epsj);
    if (!dentro.length || !libres.length) return;
    const mejorLibre = libres[0];
    dentro.forEach(t => {
      const nuevos = S.once.map(id => id === t.id ? mejorLibre.id : id);
      cambios.push({ tipo: 'jugador', pos,
        entra: mejorLibre, sale: t, costo: totalHoy - totalDeOnce(nuevos),
        entraN: nombreCorto(mejorLibre.n), saleN: nombreCorto(t.n),
        entraEq: NOM(mejorLibre.eq), saleEq: NOM(t.eq),
        esquema: null });
    });
  });
  // 2) cambiando de esquema
  onces.filter(o => o.e !== S.esquema).forEach(o => {
    const entran = o.ids.filter(id => !S.once.includes(id)).map(id => TODOS[id]).filter(Boolean);
    const salen = S.once.filter(id => !o.ids.includes(id)).map(id => TODOS[id]).filter(Boolean);
    if (!entran.length) return;
    cambios.push({ tipo: 'esquema', pos: null,
      entraN: entran.map(x => nombreCorto(x.n)).join(', '),
      saleN: salen.map(x => nombreCorto(x.n)).join(', '),
      costo: totalHoy - totalDeOnce(o.ids), esquema: o.e, n: entran.length });
  });
  cambios.sort((a, b) => a.costo - b.costo);

  return { clubes, vallaJunta, cruces, alternativas, cambios };
}

// Cuantos tildados hay adentro del once arriesgado, que no se rehace.
const tildadosEnRiesgo = () => (D.arriesgado ? D.arriesgado.ids.filter(id => S.fuera.has(id)) : []);

function cambiarEsquema(e) {
  // El once arriesgado no es un esquema mas: es otro problema de optimizacion.
  // Maximiza la chance de hacer una fecha enorme en vez del promedio.
  if (e === '__riesgo' && D.arriesgado) {
    S.esquema = '__riesgo'; S.once = D.arriesgado.ids.slice();
    S_ONCE.banco = null; S_ONCE.cambiando = null;
    pintarOnce(); pintarPantallaOnce(); pintarPantallaFecha(); return;
  }
  const local = (S.oncesLocales || []).find(x => x.e === e);
  const b = local || D.esquema.todos.find(x => x.e === e || x.esquema === e);
  if (!b) return;
  S.esquema = e; S.once = (b.ids || b.once.map(z => z.id)).slice();
  // si volviste al mejor de todos, deja de contar como eleccion tuya: asi al
  // recargar sigue siendo el oficial y no un esquema "elegido" que empata.
  S.esquemaElegido = !(S.oncesLocales && S.oncesLocales[0] && S.oncesLocales[0].e === e);
  S_ONCE.banco = null; S_ONCE.cambiando = null;
  pintarOnce(); pintarPantallaOnce(); pintarPantallaFecha();
}
function abrirOnce() { pintarOnce(); abrirModal('best11-modal'); }

function jersey(pos) {
  const c = { ARQ: '#a855f7', DEF: '#3b82f6', VOL: '#10b981', DEL: '#ef4444' }[pos] || '#94a3b8';
  return `<svg viewBox="0 0 40 40" width="34" height="34"><path d="M8 6 L14 3 L20 6 L26 3 L32 6 L34 14 L29 16 L29 36 L11 36 L11 16 L6 14 Z"
    fill="${c}" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/></svg>`;
}
function pintarOnce() {
  recalcCapitan();
  const pitch = $('pitch-layout'); if (!pitch) return;
  const sel = $('select-active-formation');
  if (sel) {
    if (!sel.dataset.listo) {
      const ops = ((S.oncesLocales && S.oncesLocales.length) ? S.oncesLocales : D.esquema.todos)
        .map(e => `<option value="${e.e || e.esquema}">${esquemaLindo(e.e || e.esquema)}</option>`);
      if (D.arriesgado) ops.unshift(`<option value="__riesgo">🚀 ARRIESGADO (${esquemaLindo(D.arriesgado.esquema)})</option>`);
      sel.innerHTML = ops.join('');
      sel.dataset.listo = '1';
    }
    sel.value = S.esquema;
  }
  const porPos = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  S.once.forEach(id => { const p = TODOS[id]; if (p) porPos[p.pos].push(p); });
  Object.values(porPos).forEach(a => a.sort((x, y) => (y.epsj ?? y.ep) - (x.epsj ?? x.ep)));

  pitch.innerHTML = '';
  const cont = document.createElement('div'); cont.className = 'pitch-container';
  const grid = document.createElement('div'); grid.className = 'best11-grid';
  [['DEL', porPos.DEL], ['VOL', porPos.VOL], ['DEF', porPos.DEF], ['ARQ', porPos.ARQ]].forEach(([, arr]) => {
    const row = document.createElement('div'); row.className = 'pitch-row';
    arr.forEach(p => {
      const cap = p.id === S.capitan;
      // Los dos onces comparten 8 de 11. Si no se marca cual cambia, apretar
      // "Arriesgado" parece que no hiciera nada.
      const otro = S.esquema === '__riesgo'
        ? D.esquema.optimo.once.map(z => z.id)
        : (D.arriesgado ? D.arriesgado.ids : null);
      const distinto = otro && !otro.includes(p.id);
      const card = document.createElement('div');
      card.className = 'gdt-card-badge' + (cap ? ' captain' : '') + (distinto ? ' gdt-distinto' : '');
      card.title = `${p.n} (${p.eq}) — ${plata(p.pr)}`;
      card.innerHTML = `
        <div class="gdt-card-icons">
          <span class="gdt-badge-icon swap" title="Cambiar jugador" onclick="event.stopPropagation();abrirCambio('${p.id}')">⇅</span>
          ${cap ? '<span class="gdt-badge-icon captain-icon" title="Capitán: duplica la ficha">👑 C</span>' : ''}
        </div>
        <div class="gdt-jersey-wrap">${jersey(p.pos)}</div>
        <div class="gdt-player-name">${esc(nombreCorto(p.n))}</div>
        <div class="gdt-player-team">${esc(NOM(p.eq).toUpperCase())}
          <span style="color:#f59e0b;font-size:0.66rem;display:block;font-weight:700;">${plata(p.pr)}</span></div>
        <div class="gdt-player-score">${n2(cap ? p.ep + p.fi : p.ep)} pts</div>`;
      card.onclick = () => auditar(p.id);
      row.appendChild(card);
    });
    grid.appendChild(row);
  });
  cont.appendChild(grid); pitch.appendChild(cont);

  // Comparacion de las dos distribuciones simuladas. El once de siempre maximiza
  // el promedio; el arriesgado maximiza la chance de una fecha enorme.
  if (D.arriesgado && D.arriesgado.dist) {
    const A = D.arriesgado, esR = S.esquema === '__riesgo';
    const fila = (n, d, on) => `<tr style="${on ? 'background:rgba(56,189,248,0.10);font-weight:700;' : ''}">
        <td style="padding:5px 10px;">${n}</td>
        <td style="padding:5px 10px;text-align:right;">${d.media.toFixed(1)}</td>
        <td style="padding:5px 10px;text-align:right;">${d.p99.toFixed(0)}</td>
        <td style="padding:5px 10px;text-align:right;">${(100 * d.p100).toFixed(1)}%</td>
        <td style="padding:5px 10px;text-align:right;">${(100 * d.p120).toFixed(2)}%</td>
        <td style="padding:5px 10px;text-align:right;">${(100 * d.p140).toFixed(3)}%</td>
        <td style="padding:5px 10px;text-align:right;">${(100 * d.p160).toFixed(3)}%</td></tr>`;
    const caja = document.createElement('div');
    caja.style.cssText = 'margin-top:14px;background:rgba(255,255,255,0.03);border-radius:10px;padding:10px 4px;';
    caja.innerHTML = `
      <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);font-weight:700;padding:0 10px 6px;">
        ${(A.sims || 0).toLocaleString('es-AR')} fechas simuladas</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
        <thead><tr style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">
          <th style="padding:4px 10px;text-align:left;">Once</th><th style="padding:4px 10px;text-align:right;">Promedio</th>
          <th style="padding:4px 10px;text-align:right;">1 de cada 100</th><th style="padding:4px 10px;text-align:right;">≥100</th>
          <th style="padding:4px 10px;text-align:right;">≥120</th><th style="padding:4px 10px;text-align:right;">≥140</th>
          <th style="padding:4px 10px;text-align:right;">≥160</th></tr></thead>
        <tbody>${A.conservador ? fila('El de siempre', A.conservador, !esR) : ''}${fila('⚡ Arriesgado', A.dist, esR)}</tbody>
      </table>
      <div class="text-muted" style="font-size:0.72rem;padding:8px 10px 0;line-height:1.45;">
        El arriesgado busca el mejor once para tu fecha 1 de cada 200, no para el promedio.
        Ojo: la ganancia es real pero chica — los jugadores con más gol ya son los de mayor
        puntaje esperado, así que no queda mucho para canjear. Apilar compañeros de equipo se
        probó y empeora la cola. El gol de oro no está simulado: el techo real es algo más alto.</div>`;
    pitch.appendChild(caja);
  }

  const t = totalOnce(), { c, sd } = costoOnce();
  const el = $('best11-total-score');
  if (el) el.innerHTML = `${n1(t)} pts <span style="font-size:0.8rem;color:var(--text-muted);font-weight:500;">· ${c ? '$' + (c / 1e6).toFixed(1) + 'M' : 's/d'} de $65M${sd ? ` (${sd} sin cotización)` : ''}</span>`;
  const lf = $('lbl-rec-formation');
  const esR = S.esquema === '__riesgo';
  if (lf) lf.textContent = esR ? '🚀 ARRIESGADO · ' + esquemaLindo(D.arriesgado ? D.arriesgado.esquema : '') : '🛡️ ' + esquemaLindo(S.esquema);
  const bs = $('btn-mode-solid'), br = $('btn-mode-risky');
  const prende = (b, on) => { if (!b) return;
    b.style.background = on ? 'var(--primary)' : 'transparent';
    b.style.color = on ? '#fff' : 'var(--text-muted)';
    b.classList.toggle('active', on); };
  prende(bs, !esR); prende(br, esR);
  const lc = $('lbl-rec-captain');
  const cap = TODOS[S.capitan];
  if (lc) lc.textContent = cap ? `${nombreCorto(cap.n)} (${cap.eq}) · ficha ${n2(cap.fi)} → duplica a ${n2(cap.fi * 2)}` : '-';
}
window.abrirCambio = function (id) {
  const p = TODOS[id]; if (!p) return;
  abrirSelector({
    pos: p.pos, actual: id,
    excluidos: new Set(S.once),
    titulo: `Cambiar a ${esc(nombreCorto(p.n))}`,
    nota: 'Ordenado por <b>puntos si entra a la cancha</b>. Cambia el once del motor, no el tuyo.',
    onElegir: nid => hacerCambio(id, nid)
  });
};
window.hacerCambio = function (viejo, nuevo) {
  const i = S.once.indexOf(viejo); if (i >= 0) S.once[i] = nuevo;
  cerrarModal($('team-detail-modal'));
  pintarOnce(); pintarPantallaOnce(); pintarPantallaFecha();
};

// ── líderes ─────────────────────────────────────────────────────────────────
function pintarLideres() {
  const body = $('leaders-body'); if (!body) return;
  const cat = ($('leaders-cat-select') || {}).value || 'xgPerMatch_noPen';
  const posSel = ($('leaders-pos-select') || {}).value || 'ALL';

  // [titulo, como se saca, como se muestra, esPromedio]
  // Las metricas POR PARTIDO piden un minimo de partidos: con 2 partidos
  // cualquiera encabeza un ranking de promedios y eso no dice nada.
  // AL LADO DEL RITMO, EL TOTAL (03/09). Ver "0.45 de xG por partido" sin saber
  // si son 3 de xG en 7 partidos o 0.9 en 2 no sirve para decidir nada. Cada
  // metrica de promedio lleva ahora su acumulado abajo, y las divisiones por 90
  // son sobre MINUTOS JUGADOS, no sobre partidos.
  const por90 = (v, x) => { const m = (x.ind && x.ind.minutos) || 0; return m ? v / (m / 90) : null; };
  const MAP = {
    xgPerMatch_noPen: ['xG cada 90′', x => por90((x.xgT ?? 0), x), n3, true,
      x => `${n2(x.xgT ?? 0)} en el torneo · ${x.ind && x.ind.pj365 ? n3((x.xgT ?? 0) / x.ind.pj365) : '—'} por partido`],
    shotsPerMatch:    ['Tiros cada 90′', x => por90((x.ind && x.ind.tiros) || 0, x), n1, true,
      x => `${(x.ind && x.ind.tiros) || 0} en el torneo · ${x.ind && x.ind.pj365 ? n1(x.ind.tiros / x.ind.pj365) : '—'} por partido`],
    goalsPerMatch:    ['Goles en el torneo', x => x.ind ? x.ind.goles : null, v => String(v ?? 's/d'), false,
      x => `${x.ind && x.ind.minutos ? n2((x.ind.goles || 0) / (x.ind.minutos / 90)) : '—'} cada 90′${x.ind && x.ind.golesPenal ? ` · ${x.ind.golesPenal} de penal` : ''}`],
    avgRating:        ['Ficha Clarín limpia', x => x.fi, n2, true,
      x => `${x.ind ? x.ind.pj : 0} partidos calificados · ${x.ind && x.ind.puntosTorneo != null ? x.ind.puntosTorneo + ' puntos' : ''}`],
    cleanSheets:      ['Vallas invictas', x => x.ind ? x.ind.vallas : null, v => String(v ?? 's/d'), false,
      x => `de ${x.ind ? x.ind.pj : 0} partidos`],
    yellowCards:      ['Amarillas', x => x.ind ? x.ind.amarillas : null, v => String(v ?? 's/d'), false,
      x => `${x.ind && x.ind.rojas ? x.ind.rojas + ' roja(s) · ' : ''}${x.ind && x.ind.minutos ? n2(90 * (x.ind.amarillas || 0) / x.ind.minutos) + ' cada 90′' : ''}`]
  };
  const [titulo, get, fmt, esPromedio, detalle] = MAP[cat] || MAP.xgPerMatch_noPen;
  const h = $('lbl-leader-metric-header'); if (h) h.textContent = titulo;

  // EL MINIMO ES DE MINUTOS, NO DE PARTIDOS (03/09).
  // Al pasar las metricas a "cada 90 minutos", el minimo de 3 PARTIDOS dejo de
  // servir: Nicolás Guerra entro 4 veces y sumó 75 minutos en total, asi que su
  // xG se dividia por 0.83 noventas y quedaba primero de la liga. Un ranking de
  // ritmo necesita un piso de CANCHA. 270 minutos son tres partidos enteros:
  // con menos que eso, el ritmo por 90 es una division por casi nada.
  const MIN_MIN = 270;
  const pjDe = x => (x.ind && (x.ind.pj365 || x.ind.pj)) || 0;
  const minDe = x => (x.ind && x.ind.minutos) || 0;

  let lista = Object.values(TODOS)
    .filter(x => posSel === 'ALL' || x.pos === posSel)
    .filter(x => get(x) != null);
  const antes = lista.length;
  if (esPromedio) lista = lista.filter(x => minDe(x) >= MIN_MIN);
  const filtrados = antes - lista.length;

  const valores = lista.map(get);
  lista = lista.sort((a, b) => get(b) - get(a)).slice(0, 40);

  const nota = $('leaders-nota');
  if (nota) {
    nota.innerHTML = esPromedio
      ? `Ritmo <b>por cada 90 minutos EN LA CANCHA</b>, no por partido. Abajo de cada número, el total del torneo. Se piden <b>${MIN_MIN} minutos como mínimo</b> —tres partidos enteros— porque dividir por media hora de cancha da cualquier cosa (${filtrados} quedaron afuera por poca cancha).`
      : 'Acumulado en el torneo, sin mínimo. Abajo de cada número, el ritmo cada 90 minutos.';
  }

  body.innerHTML = lista.map((x, i) => {
    const p = percentil(get(x), valores, true);
    return `
    <tr style="cursor:pointer;" onclick="auditar('${x.id}')">
      <td class="text-center text-muted">${i + 1}</td>
      <td><div class="player-name">${esc(nombreCorto(x.n))} ${pintarAvisos(x)}</div></td>
      <td class="text-muted">${esc(NOM(x.eq))}</td>
      <td class="text-center"><span class="badge-pos">${x.pos}</span></td>
      <td class="text-center">${pjDe(x) || '–'}<div class="op-cuenta">${minDe(x)}'</div></td>
      <td class="text-center" style="font-weight:800;color:#38bdf8;">${fmt(get(x))}${x.dpar || x.dimp ? '<span class="dato-roto" title="A 365Scores le faltan partidos de este jugador" style="margin-left:4px;">!</span>' : ''}
        <div class="op-cuenta">${detalle ? detalle(x) : ''}</div></td>
      <td class="text-center">${p ? badgePct(p) : '–'}</td>
      <td class="text-center"><button class="chip chip-btn" style="font-size:0.62rem;padding:2px 8px;" onclick="event.stopPropagation();auditar('${x.id}')">ver</button></td>
    </tr>`;
  }).join('');
}

// ── equipos: tiros concedidos, local vs visitante ───────────────────────────
function abrirEquipos() {
  const body = $('team-detail-body'); if (!body) return;
  $('team-detail-title').innerHTML = '⚽ Equipos: quién genera y quién recibe';
  const eqs = (D.equipos || []).slice().sort((a, b) => b.total.tirosConcedidosPorPartido - a.total.tirosConcedidosPorPartido);
  const liga = D.liga || {};
  // Antes esto leia liga.locTiros y liga.visTiros, que NUNCA existieron: el
  // motor guarda xG, no tiros. La pagina mostraba "s/d tiros de local".
  // Se promedian los equipos, que es de donde salia el numero igual.
  const medias = (() => {
    let l = 0, v = 0, n = 0;
    eqs.forEach(e => { l += (e.local && e.local.tirosPorPartido) || 0;
                       v += (e.visitante && e.visitante.tirosPorPartido) || 0; n++; });
    return n ? { loc: l / n, vis: v / n } : { loc: null, vis: null };
  })();
  body.innerHTML = `
    <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;line-height:1.5;">
      Todo medido sobre los partidos jugados, 365Scores. El promedio de la liga es
      <strong>${n1(medias.loc)} tiros de local</strong> y <strong>${n1(medias.vis)} de visitante</strong>,
      y un equipo genera <strong>${n2(liga.locXg)}</strong> de xG en casa contra <strong>${n2(liga.visXg)}</strong> afuera.
      Ojo con los partidos por condición: con 2 o 3 no se puede concluir nada de un equipo puntual.
    </div>
    <div class="table-responsive"><table class="data-table">
      <thead><tr>
        <th>Equipo</th>
        <th class="text-center">Tiros a favor<br><span style="font-weight:400;font-size:0.7rem;">total · L · V</span></th>
        <th class="text-center">Tiros concedidos<br><span style="font-weight:400;font-size:0.7rem;">total · L · V</span></th>
        <th class="text-center">xG conc.<br><span style="font-weight:400;font-size:0.7rem;">total</span></th>
        <th class="text-center">PJ L / V</th>
      </tr></thead>
      <tbody>${eqs.map(e => `
        <tr>
          <td><span class="team-badge-pill">${esc(NOM(e.equipo))}</span> ${pillRotacion(e.motivoRotacion)}</td>
          <td class="text-center">${n1(e.total.tirosPorPartido)}
            <span class="text-muted" style="font-size:0.76rem;"> · ${n1(e.local.tirosPorPartido)} · ${n1(e.visitante.tirosPorPartido)}</span></td>
          <td class="text-center" style="font-weight:800;color:${e.total.tirosConcedidosPorPartido >= 15 ? '#ef4444' : e.total.tirosConcedidosPorPartido <= 10 ? '#10b981' : 'var(--text-main)'};">
            ${n1(e.total.tirosConcedidosPorPartido)}
            <span class="text-muted" style="font-size:0.76rem;font-weight:400;"> · ${n1(e.local.tirosConcedidosPorPartido)} · ${n1(e.visitante.tirosConcedidosPorPartido)}</span></td>
          <td class="text-center">${n2(e.total.xgConcedidoPorPartido)}</td>
          <td class="text-center text-muted">${e.local.pj} / ${e.visitante.pj}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  abrirModal('team-detail-modal');
}
window.verEquipo = function (nombre) { abrirEquipos(); };

// ── ORDEN Y VENTANA DEL BLOQUE LOCAL/VISITANTE ──────────────────────────────
window.ordenarCond = function (campo, lado) {
  const clave = campo + lado;
  if (S.condOrd === clave) S.condDir = -S.condDir; else { S.condOrd = clave; S.condDir = -1; }
  pintarDatos();
};
window.ventanaCond = function (v) {
  S.condVent = v;
  if (document.getElementById('pantalla-datos')) pintarDatos();
  if (document.getElementById('players-body')) pintarRankings();
};
window.modoCond = function (m) {
  S.condModo = m;
  // el orden guarda el lado en la clave; al cambiar de modo hay que normalizarlo
  S.condOrd = S.condOrd.replace(/(L|V|Dif)$/, 'L');
  pintarDatos();
};
window.tabCond = function (t) {
  S.condTab = t;
  // si la columna por la que estaba ordenada no existe en la pestaña nueva,
  // se vuelve a la primera de esa pestaña en vez de quedar sin orden.
  const enRes = ['pts', 'gfP', 'gcP', 'pg'], enJuego = ['xgF', 'tiros', 'tirosArco', 'corners', 'posesion'];
  const campo = S.condOrd.replace(/(L|V|Dif)$/, '');
  const validos = t === 'juego' ? enJuego : enRes;
  if (!validos.includes(campo)) { S.condOrd = (t === 'juego' ? 'xgF' : 'pts') + 'L'; S.condDir = -1; }
  pintarDatos();
};
window.filtroCond = function (f) { S.condFiltro = f; pintarDatos(); };

// ── qué mide cada puesto (reemplaza al modal de pesos) ──────────────────────
function abrirQueMide() {
  const cont = $('weights-container'); if (!cont) return;
  $('pos-weights-label').innerHTML = '📐 Qué mide el algoritmo en cada puesto';
  const pintar = pos => {
    const A = D.aportes[pos];
    const maxSep = Math.max(...A.filas.map(f => f.pctSep));
    cont.innerHTML = `
      <div style="grid-column:1/-1;font-size:0.82rem;color:var(--text-muted);line-height:1.6;margin-bottom:12px;">
        No hay pesos configurables: el puntaje es la <strong>suma de los términos del reglamento</strong>, cada uno en puntos.
        Lo que sigue son dos porcentajes distintos que conviene no confundir — cuánto <em>aporta</em> cada término al puntaje,
        y cuánto <em>separa</em> a un jugador de otro. La ficha aporta la mayoría de los puntos pero decide poco,
        porque es parecida en todos. <strong>Lo que decide es lo que más varía.</strong>
      </div>
      <div style="grid-column:1/-1;" class="table-responsive"><table class="data-table">
        <thead><tr><th>Término</th><th class="text-center">Aporte medio</th><th class="text-center">% del puntaje</th>
          <th class="text-center">Va de … a …</th><th class="text-center">% de lo que separa</th><th></th></tr></thead>
        <tbody>${A.filas.map(f => `<tr>
          <td>${esc(f.k)}</td>
          <td class="text-center">${f.m > 0 ? '+' : ''}${n2(f.m)}</td>
          <td class="text-center text-muted">${n1(f.pctPje)}%</td>
          <td class="text-center text-muted">${n2(f.p10)} a ${n2(f.p90)}</td>
          <td class="text-center" style="font-weight:800;color:#38bdf8;">${n1(f.pctSep)}%</td>
          <td style="width:140px;"><div class="stat-bar-container"><div class="stat-bar-fill" style="width:${Math.round(100 * f.pctSep / maxSep)}%;"></div></div></td>
        </tr>`).join('')}
        <tr style="background:rgba(56,189,248,0.07);">
          <td style="font-weight:800;">Puntaje esperado</td>
          <td class="text-center" style="font-weight:800;">${n2(A.epMedio)}</td>
          <td class="text-center">100%</td>
          <td class="text-center text-muted">${n2(A.epP10)} a ${n2(A.epP90)}</td>
          <td class="text-center">100%</td><td></td></tr>
        </tbody></table></div>
      <div style="grid-column:1/-1;font-size:0.78rem;color:var(--text-muted);margin-top:10px;">
        Medido sobre ${A.n} titulares de esta fecha.</div>`;
  };
  document.querySelectorAll('.modal-pos-weight-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.modal-pos-weight-btn').forEach(z => z.classList.remove('active'));
    b.classList.add('active'); pintar(b.dataset.pos);
  });
  const act = document.querySelector('.modal-pos-weight-btn.active');
  pintar(act ? act.dataset.pos : 'DEF');
  abrirModal('weights-modal');
}

/** Qué significa el "ficha reconstruida" de la cabecera, y por qué no da 100%. */
function abrirSalud() {
  const v = D.validacion || {};
  const ok = (v.total || 0) - (v.fuera || 0);
  const casos = (v.ejemplos || []).map(e => `
    <div class="md-caso">
      <b>${esc(e.nombre)}</b> · ${esc(e.pos)} · ${esc(NOM(e.equipo || ''))}<br>
      <span class="md-num">${e.pts} puntos totales · ${e.ct} partido(s) con nota · ${e.vi} valla(s) invicta(s) · ${e.ta} amarilla(s)${e.tr ? ' · ' + e.tr + ' roja(s)' : ''}${e.goles ? ' · ' + e.goles + ' gol(es)' : ''}</span><br>
      Ficha que sale de la cuenta: <b style="color:var(--danger);">${e.cruda}</b> — imposible, la nota de Clarín va de 1 a 10.<br>
      <span style="color:var(--text-muted);">Motivo: ${esc(e.razon || '')}</span>
    </div>`).join('');
  const cob = window.__COBERTURA || {};
  modalTexto('Estado de los datos', `
    <div class="md-seccion">
      <h4>Cobertura</h4>
      <p class="md-p"><b>${cob.totJug || '?'}</b> jugadores en el análisis (los que nunca jugaron quedan afuera),
      de los cuales <b>${cob.conTiros || '?'}</b> tienen tiros y xG medidos por 365Scores.
      Datos hasta la <b>fecha ${D.ultimaFechaJugada || '?'}</b>.</p>
    </div>
    <div class="md-seccion">
      <h4>Qué mide la ficha reconstruida</h4>
      <p class="md-p">La planilla de Planeta Gran DT <b>no publica la nota que le puso Clarín a cada jugador</b>. Publica los puntos totales acumulados, que son la nota más los bonos: gol, figura, valla invicta, tarjetas.</p>
      <p class="md-p">Entonces la reconstruimos al revés: <b>ficha = (puntos totales − bonos conocidos) ÷ partidos calificados</b>. Si la cuenta está bien, cada resultado tiene que caer entre 1 y 10, que es el rango en el que califica Clarín. Ese es el control: <b>${ok} de ${v.total || 0}</b> caen adentro, con una media de ${n2(v.media)}.</p>
    </div>
    <div class="md-seccion">
      <h4>Por qué no llega al 100%</h4>
      <p class="md-p">Aclaración primero, porque el cartel anterior se prestaba a confusión: <b>un jugador sí puede sumar puntos negativos</b>. Ficha 2 menos una roja de 4 son −2, y eso es normal. Lo que no puede ser negativa es la <b>nota de Clarín</b>, que va de 1 a 10. Cuando la cuenta da una nota fuera de ese rango es que algo no cierra — y hay ${v.fuera || 0} casos, que no son todos por el mismo motivo:</p>
      ${casos}
      <p class="md-p suave"><b>Motivo 1 — bonos de partidos sin nota.</b> Un suplente entra a los 80 minutos, no llega a los 20 que Clarín exige para calificarlo, pero igual se lleva la valla invicta o la amarilla. La cuenta le resta un bono de un partido que no tiene nota y lo divide por menos partidos de los que corresponden. No se arregla desde acá: haría falta el detalle partido por partido y la planilla solo publica acumulados.</p>
      <p class="md-p suave"><b>Motivo 2 — la fila no cierra consigo misma.</b> Los bonos que declara suman más que los puntos que acumuló en todo el torneo. Un gol de oro de visitante de un delantero vale 11 puntos él solo; si el jugador figura con eso y con 3 puntos en el torneo, hay algo mal cargado en la planilla, no en la cuenta.</p>
      <p class="md-p suave">Son ${v.fuera || 0} de ${v.total || 0} jugadores (${n2(v.pctFuera)}%), todos con un solo partido calificado, y ninguno entra en las recomendaciones. Prefiero mostrarte el número real antes que redondear a 100 y que no te enteres.</p>
    </div>`);
}

/** TABLERO DE LA FECHA — que defensas estan solidas, cuales vulnerables, y
 *  donde conviene poner delanteros. Una fila por equipo con su partido. */
function abrirTablero() {
  const T = D.tablero || [];
  if (!T.length) { modalTexto('Contexto de la fecha', '<p class="md-p">No hay datos de la próxima fecha.</p>'); return; }
  // Los partidos que ya se jugaron van al fondo: no hay nada que decidir ahi.
  const ordenar = campo => T.slice().sort((a, b) =>
    (a.yaJugado ? 1 : 0) - (b.yaJugado ? 1 : 0) || (b[campo] || 0) - (a[campo] || 0));
  const porDefensa = ordenar('pValla');
  const porAtaque = ordenar('lamFavor');
  const pendientes = T.filter(t => !t.yaJugado).length;
  const vl = (D.liga && D.liga.ventajaLocal) || null;

  const barra = (v, max, color) => {
    const w = Math.max(2, Math.min(100, 100 * v / max));
    return `<div class="tb-bar"><i style="width:${w}%;background:${color};"></i></div>`;
  };
  // "Su nivel" en abstracto no dice nada. Lo que interesa es si ese equipo es
  // mejor o peor que el equipo promedio de la liga, y en cuanto. Se muestra la
  // palabra primero y el numero como respaldo.
  const nivel = (v, esDefensa) => {
    const pct = Math.round(100 * (v - 1));
    // En DEFENSA, mas alto = concede mas = peor. En ATAQUE, mas alto = mejor.
    const bueno = esDefensa ? pct < -8 : pct > 8;
    const malo  = esDefensa ? pct > 8  : pct < -8;
    const color = bueno ? '#10b981' : malo ? '#ef4444' : 'var(--text-muted)';
    const palabra = Math.abs(pct) <= 8 ? 'del montón'
      : esDefensa ? (pct < 0 ? 'sólida' : 'floja')
                  : (pct > 0 ? 'peligroso' : 'inofensivo');
    const explica = esDefensa
      ? `Recibe ${Math.abs(pct)}% ${pct < 0 ? 'menos' : 'más'} de lo que recibe el equipo promedio de la liga`
      : `Genera ${Math.abs(pct)}% ${pct > 0 ? 'más' : 'menos'} de lo que genera el equipo promedio de la liga`;
    return `<span title="${explica}" style="color:${color};font-weight:700;white-space:nowrap;">${palabra}
      <span style="font-weight:600;opacity:0.75;font-size:0.86em;">${pct >= 0 ? '+' : ''}${pct}%</span></span>`;
  };

  const filaDef = t => `
    <tr class="${t.yaJugado ? 'tb-jugado' : ''}">
      <td><b>${esc(t.equipo)}</b> <span class="text-muted">${t.condicion === 'L' ? 'local' : 'visita'}</span>${t.yaJugado ? ' <span class="fx-jugado">JUGADO</span>' : ''}</td>
      <td class="text-muted">vs ${esc(t.rival)}</td>
      <td class="text-center"><b>${pc0(t.pValla)}</b>${barra(t.pValla, 0.6, '#10b981')}</td>
      <td class="text-center">${n2(t.lamContra)}</td>
      <td class="text-center">${nivel(t.miDefensa, true)}</td>
      <td class="text-center">${pillRotacion(t.motivoRotacion)}</td>
    </tr>`;
  const filaAtq = t => `
    <tr class="${t.yaJugado ? 'tb-jugado' : ''}">
      <td><b>${esc(t.equipo)}</b> <span class="text-muted">${t.condicion === 'L' ? 'local' : 'visita'}</span>${t.yaJugado ? ' <span class="fx-jugado">JUGADO</span>' : ''}</td>
      <td class="text-muted">vs ${esc(t.rival)}</td>
      <td class="text-center"><b>${n2(t.lamFavor)}</b>${barra(t.lamFavor, 2.2, '#eb6834')}</td>
      <td class="text-center">${nivel(t.suDefensa, true)}</td>
      <td class="text-center">${nivel(t.miAtaque, false)}</td>
      <td class="text-center">${t.motivoRotacionRival ? `<span class="pill-alerta pill-copa-rival">${t.motivoRotacionRival.tipo === 'guarda' ? 'copa en ' + t.motivoRotacionRival.dias + 'd' : t.motivoRotacionRival.dias + 'd de descanso'}</span>` : ''}</td>
    </tr>`;

  const tabla = (titulo, sub, cabeceras, filas, datos) => `
    <div class="md-seccion">
      <h4>${titulo}</h4>
      <p class="md-p suave">${sub}</p>
      <div style="overflow-x:auto;"><table class="data-table tb-tabla"><thead><tr>
        ${cabeceras.map(c => `<th${c[1] ? ' class="text-center"' : ''}${c[2] ? ` title="${esc(c[2])}"` : ''}>${c[0]}</th>`).join('')}
      </tr></thead><tbody>${datos.map(filas).join('')}</tbody></table></div>
    </div>`;

  modalTexto(`Contexto de la fecha ${D.fechaObjetivo || ''}`, `
    ${pendientes < T.length ? `<p class="md-p"><b>${pendientes / 2} de ${T.length / 2} partidos siguen por jugarse.</b> Los que ya terminaron quedan abajo y atenuados.</p>` : ''}
    ${vl ? `<p class="md-p suave">Ventaja de local en la liga, medida sobre ${vl.partidos} partidos: un equipo genera <b>${n2(vl.xgLocal)}</b> de xG jugando en casa contra <b>${n2(vl.xgVisitante)}</b> de visitante — <b>${vl.pctMas}% más</b>. Los números de abajo ya lo tienen aplicado.</p>` : ''}
    ${tabla('Dónde poner defensores y arquero',
      'Ordenado por la chance de que el equipo termine el partido sin recibir goles. Eso es lo que le paga a un defensor (+2) y a un arquero (+3).',
      [['Equipo'], ['Partido'],
       ['Termina 0 en contra', 1, 'Probabilidad de valla invicta en ESTE partido, calculada desde las cuotas de las casas'],
       ['Goles que le hacen', 1, 'Goles que se espera que reciba en ESTE partido'],
       ['Qué tan buena es su defensa', 1, 'Compara al equipo con el equipo promedio de la liga, sobre TODOS sus partidos. No es de este partido: es cómo viene'],
       ['Ojo con', 1, 'Poco descanso o partido de copa cerca']],
      filaDef, porDefensa)}
    ${tabla('Dónde poner delanteros y volantes',
      'Ordenado por cuántos goles se espera que meta el equipo en este partido. Una defensa rival “floja” es donde se convierte.',
      [['Equipo'], ['Partido'],
       ['Goles que va a meter', 1, 'Goles esperados a favor en ESTE partido, calculados desde las cuotas'],
       ['Cómo está la defensa rival', 1, 'El rival comparado con el equipo promedio de la liga. Floja = concede más que el promedio'],
       ['Cómo está su ataque', 1, 'El equipo comparado con el equipo promedio de la liga, sobre todos sus partidos'],
       ['Ojo con el rival', 1, 'Si el rival llega cansado o guarda gente para la copa']],
      filaAtq, porAtaque)}
    <div class="md-seccion">
      <h4>Cómo leer las dos últimas columnas</h4>
      <p class="md-p suave">Dicen <b>cómo viene el equipo</b>, no cómo le va a ir en este partido. Se lo compara
      con el equipo promedio de la liga sobre <b>todos</b> sus partidos: “sólida −18%” quiere decir que recibe
      un 18% menos de lo que recibe un equipo cualquiera. Entre −8% y +8% es del montón y no dice nada.</p>
      <p class="md-p suave">Las dos primeras columnas de cada tabla sí son <b>de este partido</b>: salen de las
      cuotas de las casas de apuestas con el margen descontado, no de nuestro promedio. Cuando las dos cosas no
      coinciden —una defensa sólida con pocas chances de valla invicta— es porque el rival de turno es duro.</p>
      <p class="md-p suave">El nivel se calcula con el torneo actual más el anterior: medimos que el corte
      local/visitante de cada equipo no se traslada de un torneo al otro, pero el nivel general sí, y la
      ventaja de local de la liga también.</p>
    </div>`);
}

function avisoPendiente() {
  alert('Todavía no hay nada que mostrar acá, y prefiero decírtelo antes que inventarlo.\n\n' +
    'El backtesting y el registro de aciertos necesitan comparar lo que recomendó el algoritmo\n' +
    'contra los puntajes reales. Eso recién se puede hacer cuando termine una fecha con el\n' +
    'motor nuevo andando, o cuando corras SYNC_365_HISTORICO.bat para traer el torneo anterior.');
}

// ════════════════════════════════════════════════════════════════════════════
//  VERSUS — el once del motor contra el tuyo, con los puntajes de la fecha
//  en vivo.
//
//  DE DONDE SALEN LOS PUNTOS: de dataVivo.js, que arma SYNC_VIVO.bat leyendo
//  los posts de Planeta Gran DT. Es una fuente SEPARADA de la que usa el motor
//  a proposito: Planeta corrige los puntajes cuando la fecha termina, y si el
//  motor comiera de ahi cada correccion le cambiaria el pasado. Aca los puntos
//  se usan para mirar la fecha mientras se juega, nada mas: no entran en ningun
//  ranking, ni en el once, ni en el costo de un cambio.
//
//  LO QUE NO SE PUEDE SABER: Planeta publica el TOTAL de Gran DT de cada
//  jugador, no la ficha por separado, y la cinta de capitan duplica SOLO la
//  ficha. Asi que el doble del capitan no se puede sumar salvo cuando la ficha
//  de Clarin de ese jugador aparece en el bloque de destacados. Cuando no
//  aparece se dice "falta la ficha" y no se inventa un numero.
// ════════════════════════════════════════════════════════════════════════════

// dataVivo.js puede ser de otra fecha (te olvidaste de correr el sync, o lo
// corriste el lunes cuando el motor ya paso a la fecha siguiente). En ese caso
// no sirve para nada y es mejor ignorarlo que mostrar puntos de otra semana.
let VIVO = (() => {
  const v = (typeof window !== 'undefined') ? window.VIVO : null;
  if (!v || !D) return null;
  if (v.fecha !== D.fechaObjetivo) return null;
  return v;
})();
const VIVO_VIEJO = !!(typeof window !== 'undefined' && window.VIVO && !VIVO);
// LA COLUMNA "HIZO" SOLO CUANDO LA FECHA ARRANCO DE VERDAD (08/09).
// Que exista dataVivo.js de esta fecha no quiere decir que se este jugando:
// el archivo puede quedar de la fecha anterior con el mismo numero, o bajarse
// el jueves. La pregunta es de futbol y se contesta con el fixture: hay algun
// partido cuya hora ya paso. Antes de eso, "Hizo" son ceros y guiones que solo
// ensucian la tabla.
const FECHA_EMPEZO = (() => {
  if (!D || !Array.isArray(D.partidos)) return false;
  const ahora = Date.now();
  return D.partidos.some(m => { const t = Date.parse(m.cuando); return t && t <= ahora; });
})();
// los equipos cuyo partido ya salio publicado: para ellos la fecha esta cerrada
const EQ_RESUELTOS = new Set();
// CUANTOS PUNTAJES PUBLICADOS ALCANZAN PARA DAR UN EQUIPO POR CERRADO (13/09).
// SYNC_VIVO agrega un partido a la lista en cuanto Planeta publica EL RESULTADO,
// que sale antes que las fichas. Con eso, un equipo cuyo 1-2 ya se sabe pero
// cuyos jugadores todavia no tienen puntaje quedaba "cerrado", y los 25 sin
// puntaje se mostraban como "no jugo: 0". Paso justo con Atl. Tucuman - River.
// Medido en la fecha 9: los equipos publicados tienen entre 13 y 16 jugadores
// con puntaje, y los que no, 0 o 3 (Planeta adelanta los destacados). El corte
// en 8 separa los dos grupos con margen de los dos lados.
const MIN_PUBLICADOS = 8;
function rearmarResueltos() {
  EQ_RESUELTOS.clear();
  if (!VIVO) return;
  const cuenta = {};
  Object.keys(VIVO.puntos || {}).forEach(id => {
    const p = TODOS[id]; if (!p) return;
    const c = claveEquipo(p.eq); if (c) cuenta[c] = (cuenta[c] || 0) + 1;
  });
  (VIVO.partidos || []).forEach(m => [m.cl, m.cv].forEach(c => {
    if (c && (cuenta[c] || 0) >= MIN_PUBLICADOS) EQ_RESUELTOS.add(c);
  }));
}
rearmarResueltos();

// ── PUNTAJES CARGADOS A MANO ───────────────────────────────────────────────
// Planeta publica por tandas y a veces un partido tarda medio dia. Mientras
// tanto uno YA sabe el puntaje —sale por Twitter— y no poder ponerlo obliga a
// mirar una tabla que uno sabe incompleta. Esto deja escribirlo y que valga
// hasta que llegue el oficial, que siempre manda.
// Se guarda por clave estable, no por id: los id cambian en cada RECALCULAR.
const CLAVE_MANO = () => 'gdt_mano_f' + ((D && D.fechaObjetivo != null) ? D.fechaObjetivo : 'x');
let MANO = {};
function cargarMano() {
  MANO = {};
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE_MANO()) || '{}');
    if (r && typeof r === 'object') MANO = r;
  } catch (e) { }
  // Los que viajan con la app (dataManual.js) van ABAJO de los tuyos: si vos
  // cargaste otro numero para el mismo jugador, manda el tuyo.
  const pub = (typeof window !== 'undefined' && window.MANUAL) ? window.MANUAL : null;
  if (pub && pub.puntos && (pub.fecha == null || !D || pub.fecha === D.fechaObjetivo)) {
    Object.keys(pub.puntos).forEach(k => { if (MANO[k] == null) MANO[k] = pub.puntos[k]; });
  }
}
function guardarMano() { try { localStorage.setItem(CLAVE_MANO(), JSON.stringify(MANO)); } catch (e) { } }
const manoDe = id => { const k = claveDe(id); return (k && MANO[k] != null) ? MANO[k] : null; };
// EL ESPERADO DE OTRA FECHA. datos.js solo tiene el de la fecha que viene: para
// rearmar la foto de una que ya paso hay que leerlo de dataHist.js. Mientras
// este mapa esta puesto, todo lo que pregunte "cuanto esperaba el motor de
// este" contesta con el numero de ESA fecha, no con el de hoy.
let ESP_DE = null;
// El once que el motor recomendaba en la fecha que se esta rescatando. Sin
// esto, revisar la fecha 8 mostraba el once que el motor recomienda para la 9
// con los puntos de la 8: un equipo que no existio nunca.
let MOTOR_DE_ESA_FECHA = null;
// la clave estable DEL JUGADOR. Ojo: claveDe() toma un id, no el objeto.
const kDe = p => (p && (p.k || (p.id != null ? claveDe(p.id) : null))) || null;
function espDe(p) {
  if (ESP_DE) { const v = ESP_DE[kDe(p)]; return v == null ? null : v; }
  return p.epsj != null ? p.epsj : (p.ep || 0);
}
// Corre fn como si VIVO fuera otro archivo y los esperados fueran los de esa
// fecha. Deja todo como estaba, pase lo que pase.
function conVivo(v, esperados, fn) {
  const vAntes = VIVO, eAntes = ESP_DE;
  VIVO = v; ESP_DE = esperados || null; rearmarResueltos();
  try { return fn(); }
  finally { VIVO = vAntes; ESP_DE = eAntes; rearmarResueltos(); }
}
const vivoDe = id => {
  const of = (VIVO && VIVO.puntos && VIVO.puntos[id]) ? VIVO.puntos[id] : null;
  if (of) return of;                       // el oficial de Planeta manda siempre
  const m = manoDe(id);
  return m == null ? null : { p: m, mano: true };
};
// Un jugador con puntaje a mano esta resuelto aunque su equipo no lo este.
const resuelto = p => !!p && (EQ_RESUELTOS.has(claveEquipo(p.eq)) || manoDe(p.id) != null);

// ── MI ONCE ────────────────────────────────────────────────────────────────
// El que usaste vos en el juego. Vive en el localStorage de ESTE navegador,
// igual que los descartes: es tuyo y no viaja con la app.
const CLAVE_MI11 = () => 'gdt_mi11_f' + ((D && D.fechaObjetivo != null) ? D.fechaObjetivo : 'x');
// EL ONCE SE ARRASTRA DE UNA FECHA A LA OTRA (17/09).
// Se guardaba en 'gdt_mi11_f' + la fecha del motor, asi que en cuanto el motor
// pasaba a la fecha siguiente la clave cambiaba y tu once aparecia VACIO. No se
// borraba —seguia guardado bajo la fecha vieja— pero desde la pantalla era
// exactamente lo mismo: "nunca se guarda el equipo". Y en Gran DT uno no rearma
// once jugadores cada semana, cambia dos o tres.
// Ahora, si no hay nada guardado para la fecha de hoy, se busca hacia atras la
// ultima que si tenga y se arranca de ahi. El once viejo NO se pisa: cuando
// toques algo se guarda bajo la fecha nueva y la vieja queda como estaba.
// Se puede hacer porque el once se guarda por CLAVE ESTABLE (nombre@equipo@pos)
// y no por id: los ids son el numero de fila de datos.js y se corren en cada
// corrida del motor, las claves no.
const MI11_MIRAR_ATRAS = 6;
function leerMi11Crudo(f) {
  try { return JSON.parse(localStorage.getItem('gdt_mi11_f' + f) || 'null'); } catch (e) { return null; }
}
function cargarMi11() {
  S.mi11 = []; S.miCap = null; S.miEsq = null; S.miPerdidos = 0; S.miHeredadoDe = null;
  try {
    let r = JSON.parse(localStorage.getItem(CLAVE_MI11()) || 'null');
    if (!r && D && D.fechaObjetivo != null) {
      for (let f = D.fechaObjetivo - 1; f >= D.fechaObjetivo - MI11_MIRAR_ATRAS && f >= 1; f--) {
        const v = leerMi11Crudo(f);
        if (v && ((Array.isArray(v.kOnce) && v.kOnce.length) || (Array.isArray(v.once) && v.once.length))) {
          r = v; S.miHeredadoDe = f; break;
        }
      }
    }
    if (r) {
      // formato nuevo: por clave estable. El viejo (por id) se lee igual, pero
      // solo sirve dentro de la misma corrida del motor.
      if (Array.isArray(r.kOnce)) {
        const q = idsDesdeClaves(r.kOnce);
        S.mi11 = q.ids; S.miPerdidos = q.perdidas.length;
        S.miCap = r.kCap ? ((porClave(r.kCap) || {}).id || null) : null;
      } else if (Array.isArray(r.once)) {
        S.mi11 = r.once.filter(id => TODOS[id]);
        S.miCap = (r.cap && TODOS[r.cap]) ? r.cap : null;
      }
      S.miEsq = r.esq || null;
    }
  } catch (e) { }
  if (S.miCap && !S.mi11.includes(S.miCap)) S.miCap = null;
  if (!S.miEsq) S.miEsq = (S.oncesLocales && S.oncesLocales[0] && S.oncesLocales[0].e) || '1-4-4-2';
  if (S.miHeredadoDe != null && !S.mi11.length) S.miHeredadoDe = null;
}
function guardarMi11() {
  try {
    localStorage.setItem(CLAVE_MI11(), JSON.stringify({
      kOnce: clavesDesdeIds(S.mi11), kCap: claveDe(S.miCap), esq: S.miEsq
    }));
  } catch (e) { }
}
function slotsMi() {
  const c = cuentaPos(S.miEsq), porPos = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  S.mi11.forEach(id => { const p = TODOS[id]; if (p) porPos[p.pos].push(p); });
  const out = {};
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => {
    const a = porPos[pos].slice(0, c[pos]);
    while (a.length < c[pos]) a.push(null);
    out[pos] = a;
  });
  return out;
}
function normalizarMi11() {
  // Si quedo guardada una formacion imposible, se arregla sola aca: esta
  // funcion corre en cada pintada del Versus, asi que un once roto se
  // endereza con abrir la pagina, sin tener que borrar nada a mano.
  S.miEsq = esquemaValido(S.miEsq);
  // deja adentro solo los que entran en la formacion elegida y ordena por puesto
  const s = slotsMi();
  S.mi11 = ['ARQ', 'DEF', 'VOL', 'DEL'].flatMap(pos => s[pos].filter(Boolean).map(p => p.id));
  if (S.miCap && !S.mi11.includes(S.miCap)) S.miCap = null;
  if (!S.miCap && S.mi11.length) {
    let mejor = null;
    S.mi11.forEach(id => { const p = TODOS[id]; if (p && (!mejor || fichaCap(p) > fichaCap(mejor))) mejor = p; });
    S.miCap = mejor ? mejor.id : null;
  }
}

// ── EL MARCADOR DE UN ONCE ─────────────────────────────────────────────────
function marcadorDe(ids, capId) {
  const det = [], pendientes = [];
  let real = 0, esperado = 0, jugaron = 0, cerrados = 0;
  ids.forEach(id => {
    const p = TODOS[id]; if (!p) return;
    if (resuelto(p)) {
      cerrados++;
      const v = vivoDe(id);
      const jugo = !!(v && v.p != null);
      const pts = jugo ? v.p : 0;
      if (jugo) jugaron++;
      real += pts;
      det.push({ p, estado: jugo ? 'jugo' : 'nojugo', pts, sup: !!(v && v.s), mano: !!(v && v.mano) });
    } else {
      pendientes.push(id);
      esperado += (p.epsj != null ? p.epsj : (p.ep || 0));
      det.push({ p, estado: 'falta', pts: null });
    }
  });
  // la cinta
  const cap = TODOS[capId];
  let cinta = { estado: 'nadie', valor: 0, quien: null };
  if (cap) {
    const q = nombreCorto(cap.n);
    const aMano = (typeof fichaManual === 'function') ? fichaManual(cap.id) : null;
    const v = vivoDe(cap.id);
    if (aMano != null) cinta = { estado: 'ok', valor: aMano, quien: q, id: cap.id, mano: true };
    else if (!resuelto(cap)) cinta = { estado: 'falta', valor: fichaCap(cap), quien: q, id: cap.id };
    // regla del juego: si el capitan no suma puntos, la cinta se pierde
    else if (!(v && v.p != null)) cinta = { estado: 'perdida', valor: 0, quien: q, id: cap.id };
    else if (VIVO && VIVO.fichas && VIVO.fichas[cap.id] != null) cinta = { estado: 'ok', valor: VIVO.fichas[cap.id], quien: q, id: cap.id };
    else cinta = { estado: 'sindato', valor: 0, quien: q, id: cap.id };
  }
  // COBRADA = el capitan ya jugo Y sabemos su ficha. Solo esa se suma a lo
  // hecho; la 'falta' es la ficha ESPERADA y vive en la proyeccion, no en el
  // marcador real.
  cinta.cobrada = (cinta.estado === 'ok');
  return {
    ids, real, esperado, jugaron, cerrados, pendientes, det, cinta,
    hecho: real + (cinta.cobrada ? cinta.valor : 0),
    proyeccion: real + esperado + cinta.valor,
    n: ids.length
  };
}

// ── QUIEN GANA LA FECHA ────────────────────────────────────────────────────
// Se simula SOLO lo que todavia no se jugo, y solo los jugadores que NO se
// repiten entre los dos onces: si los dos tienen a Di María, sus puntos suman
// igual de los dos lados y no cambian quien gana. Eso no es un atajo, es la
// cuenta correcta, y ademas achica muchisimo el ruido de la simulacion.
//
// Cada jugador pendiente se sortea como: lo que el motor espera de el, mas un
// residuo sacado del historial REAL de puntajes de su puesto (los F1..F18 de la
// planilla de Planeta, 2.792 fechas-jugador). Se usa el histograma y no una
// campana porque la distribucion es torcida: la mediana es 5 y la cola llega a
// 29. Con una campana, las remontadas del domingo saldrian menos de lo que
// pasan de verdad.
//
// LO QUE ESTA SIMULACION NO TIENE: que dos jugadores del mismo equipo suben y
// bajan juntos. Al ignorarlo, la chance queda un poco mas cerrada de lo real
// cuando los onces se apilan en pocos clubes.
const _ACUM = {};
function _acumDe(pos) {
  if (_ACUM[pos]) return _ACUM[pos];
  const v = D.varPuntos && D.varPuntos[pos];
  if (!v || !v.h) return null;
  const ks = Object.keys(v.h).map(Number).sort((a, b) => a - b);
  const cum = []; let c = 0;
  ks.forEach(k => { c += v.h[k]; cum.push(c); });
  return (_ACUM[pos] = { ks, cum, tot: c, media: v.media });
}
// EL SORTEO TIENE QUE DAR SIEMPRE LO MISMO (13/09).
// Las chances salen de simular miles de fechas. Con Math.random() cada pintada
// de la pantalla tiraba dados nuevos, asi que abrir un equipo para mirarle el
// once movia el numero de otro: "85,0%" pasaba a "85,9%" sin que cambiara nada.
// No estaba mal calculado —con 8.000 simulaciones el error es de ~0,4 puntos y
// eso es exactamente lo que se movia— pero un numero que baila cuando uno solo
// mira no se puede leer, y peor, no se puede creer.
// Con semilla fija el mismo estado da SIEMPRE el mismo resultado, y si el
// numero cambia es porque cambio algo de verdad.
let _sem = 1;
function _resembrar(n) { _sem = (n >>> 0) || 1; }
function _rnd() {                                   // mulberry32
  _sem = (_sem + 0x6D2B79F5) | 0;
  let t = Math.imul(_sem ^ (_sem >>> 15), 1 | _sem);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const SEMILLA = 20260913;
function _sortear(p) {
  const base = (p.epsj != null ? p.epsj : (p.ep || 0));
  const a = _acumDe(p.pos);
  if (!a || !a.tot) return base;
  const r = _rnd() * a.tot;
  let lo = 0, hi = a.cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a.cum[m] <= r) lo = m + 1; else hi = m; }
  return base + (a.ks[lo] - a.media);
}
function chanceGanar(A, B, sims) {
  if (!D.varPuntos) return null;
  const setB = new Set(B.pendientes), setA = new Set(A.pendientes);
  const soloA = A.pendientes.filter(id => !setB.has(id)).map(id => TODOS[id]).filter(Boolean);
  const soloB = B.pendientes.filter(id => !setA.has(id)).map(id => TODOS[id]).filter(Boolean);
  // LA CINTA VA A LOS DOS LADOS O A NINGUNO.
  // Si de un capitan sabemos la ficha y del otro no, sumarsela a uno solo
  // inventa una ventaja que no existe: pasaba que el motor ganaba 100% de las
  // simulaciones porque su capitan todavia no habia jugado —y por eso contaba
  // su ficha esperada— y el tuyo ya habia jugado sin ficha publicada.
  const sinCinta = (A.cinta.estado === 'sindato') !== (B.cinta.estado === 'sindato') ||
                   A.cinta.estado === 'sindato' && B.cinta.estado === 'sindato';
  const cA = sinCinta ? 0 : A.cinta.valor, cB = sinCinta ? 0 : B.cinta.valor;
  const base = (A.real + cA) - (B.real + cB);
  // "cerrado" es que no queda NADA por jugarse de ninguno de los dos onces.
  // Que los pendientes sean los mismos jugadores no cierra la fecha: la
  // diferencia ya no puede cambiar, pero los puntos si.
  const terminado = !A.pendientes.length && !B.pendientes.length;
  if (!soloA.length && !soloB.length) {
    return { a: base > 0 ? 1 : 0, b: base < 0 ? 1 : 0, empate: base === 0 ? 1 : 0,
             sims: 0, cerrado: terminado, decidido: true, sinCinta };
  }
  // 30.000 en vez de 6.000: son 12 ms y bajan el error de la simulacion de
  // ~0,6 puntos a ~0,26. Con la semilla fija el numero ya no baila, pero que
  // ademas sea preciso hace que un 85,3 signifique 85,3 y no "85 y monedas".
  const N = sims || 30000;
  _resembrar(SEMILLA);
  let ga = 0, gb = 0, emp = 0;
  for (let i = 0; i < N; i++) {
    let d = base;
    for (let k = 0; k < soloA.length; k++) d += _sortear(soloA[k]);
    for (let k = 0; k < soloB.length; k++) d -= _sortear(soloB[k]);
    if (d > 0.001) ga++; else if (d < -0.001) gb++; else emp++;
  }
  return { a: ga / N, b: gb / N, empate: emp / N, sims: N, cerrado: false, decidido: false, sinCinta };
}

// ── LA PANTALLA ────────────────────────────────────────────────────────────
// Sigla del club para la ficha chica. Las iniciales solas no sirven: "River"
// quedaba en "R" y "Boca" en "B". Tres letras de la primera palabra mas la
// inicial de la segunda distingue lo que hay que distinguir —ESTL y ESTR, GIML
// y GIMM— sin tener que mantener una tabla a mano.
const SIGLA = e => {
  const w = String(NOM(e) || '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, ' ')
    .split(/\s+/).filter(x => x.length > 1);
  if (!w.length) return '';
  return (w[0].slice(0, 3) + (w[1] ? w[1][0] : '')).toUpperCase();
};
// En una ficha de 82px no entra "Ángel Correa". El apellido alcanza para
// reconocerlo y el nombre entero esta en el globo de ayuda.
const APELLIDO = n => String(n || '').split(',')[0].trim() || nombreCorto(n);
function fichaVersus(d, opts) {
  const o = opts || {}, p = d.p;
  if (!p) return `<button class="vsj vsj-vacia" data-mi-slot="${o.pos}:${o.idx}"
    title="Elegir un ${NOMBRE_POS_SING[o.pos]} para este puesto">+<small>${o.pos}</small></button>`;
  const cap = o.cap === p.id;
  const num = d.estado === 'falta' ? n1(p.epsj != null ? p.epsj : p.ep) : String(d.pts);
  const quien = nombreCorto(p.n) + ' — ' + NOM(p.eq) + ' ' + (p.cond === 'L' ? 'de local' : 'de visitante') +
    ' vs ' + NOM(p.riv) + '. ';
  const ayuda = quien + (d.estado === 'jugo'
    ? (d.mano
      ? `${d.pts} puntos cargados A MANO por vos. Planeta todavía no publicó este partido; cuando lo publique, el oficial pisa este número solo.`
      : `Ya jugó: ${d.pts} puntos${d.sup ? ' (entró desde el banco)' : ''}. Publicado por Planeta.`)
    : d.estado === 'nojugo'
      ? 'Su partido ya se jugó y no sumó: no entró, o entró sin calificación.'
      : `Todavía no jugó. ${n1(p.epsj != null ? p.epsj : p.ep)} es lo que el motor espera de él.`);
  return `<div class="vsj vsj-${d.estado}${cap ? ' vsj-cap' : ''}" title="${esc(ayuda)}"
      ${o.mio ? `data-mi-jug="${p.id}"` : `data-cambiar="${p.id}"`}>
    <span class="vsj-pts">${num}${d.mano ? '<i class="mano-m" title="Cargado a mano">✎</i>' : ''}</span>
    <span class="vsj-nom">${esc(APELLIDO(p.n))}</span>
    <span class="vsj-eq">${esc(SIGLA(p.eq))}<i>${p.cond === 'L' ? 'L' : 'V'}</i></span>
    ${cap ? '<span class="vsj-c">C</span>' : ''}
    ${o.mio
      ? `<button class="vsj-x" data-mi-sacar="${p.id}" title="Sacarlo de tu once">✕</button>
         ${cap ? '' : `<button class="vsj-cc" data-mi-cap="${p.id}" title="Ponerle la cinta">C</button>`}`
      : `<button class="vsj-x" data-sacar="${p.id}" title="No juega esta fecha: sacalo y el once se rearma sin él">✕</button>
         ${cap ? '' : `<button class="vsj-cc" data-capitan="${p.id}" title="${esc('Ponerle la cinta. Duplica la ficha: la esperada en este partido es ' + n2(fichaCap(p)) + '.')}">C</button>`}`}
  </div>`;
}
function canchaVersus(m, opts) {
  const o = opts || {};
  const porPos = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  if (o.mio) {
    const s = slotsMi();
    ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => s[pos].forEach((p, i) => {
      const d = p ? (m.det.find(x => x.p.id === p.id) || { p, estado: 'falta', pts: null }) : { p: null };
      porPos[pos].push(fichaVersus(d, { mio: true, cap: S.miCap, pos, idx: i }));
    }));
  } else {
    const orden = { ARQ: [], DEF: [], VOL: [], DEL: [] };
    m.det.forEach(d => orden[d.p.pos].push(d));
    Object.values(orden).forEach(a => a.sort((x, y) =>
      (y.p.epsj != null ? y.p.epsj : y.p.ep) - (x.p.epsj != null ? x.p.epsj : x.p.ep)));
    ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => orden[pos].forEach(d =>
      porPos[pos].push(fichaVersus(d, { cap: S.capitan }))));
  }
  return `<div class="vs-cancha">${['DEL', 'VOL', 'DEF', 'ARQ']
    .map(pos => porPos[pos].length ? `<div class="vs-linea">${porPos[pos].join('')}</div>` : '').join('')}</div>`;
}

// LOS CUATRO DEL BANCO, EN EL INICIO (13/09).
// El juego son quince, no once: si el titular no llega a los 20 minutos entra
// el suplente de su puesto y esos puntos cuentan. Tenerlos solo en el Torneo de
// amigos hacia que pegar una lista de quince en el Versus no tuviera donde
// caer, y que uno no viera de que banco depende.
function tiraBanco(banco, opts) {
  const o = opts || {};
  const chip = pos => {
    const id = (banco || {})[pos], p = id ? TODOS[id] : null;
    if (!p) return o.mio
      ? `<button class="vsb vsb-vacia" data-mi-banco="${pos}"
           title="${esc('Elegir el suplente ' + pos + '. Entra solo si tu titular de ese puesto no juega.')}">+<small>${pos}</small></button>`
      : `<span class="vsb vsb-vacia vsb-off"><small>${pos}</small></span>`;
    const v = vivoDe(p.id);
    const jugo = !!(v && v.p != null);
    const num = jugo ? String(v.p) : n1(p.epsj != null ? p.epsj : p.ep);
    const ayuda = nombreCorto(p.n) + ' — ' + NOM(p.eq) + ' ' + (p.cond === 'L' ? 'de local' : 'de visitante') +
      ' vs ' + NOM(p.riv) + '. Suplente de ' + pos + ': entra solo si el titular de ese puesto no juega.' +
      (jugo ? ' Ya jugó: ' + v.p + ' puntos.' : '');
    return `<div class="vsb" title="${esc(ayuda)}"${o.mio ? ` data-mi-banco="${pos}"` : ''}>
      <span class="vsb-pos">${pos}</span>
      <span class="vsb-nom">${esc(APELLIDO(p.n))}</span>
      <span class="vsb-pts">${num}</span>
      ${o.mio ? `<button class="vsb-x" data-mi-banco-x="${pos}" title="Sacarlo del banco">✕</button>` : ''}
    </div>`;
  };
  return `<div class="vs-banco" title="${esc('El banco. Uno por puesto: entra automáticamente si el titular de ese puesto juega menos de 20 minutos.')}">
    <span class="vs-banco-lbl">BANCO</span>
    ${['ARQ', 'DEF', 'VOL', 'DEL'].map(chip).join('')}
  </div>`;
}

function bloqueVersus() {
  if (!S.once.length) rearmarOnce();
  recalcCapitan();
  if (S.mi11 == null) cargarMi11();
  normalizarMi11();

  const A = marcadorDe(S.once, S.capitan);
  const hayMio = S.mi11.length > 0;
  const B = marcadorDe(S.mi11, S.miCap);
  const enJuego = !!VIVO && (A.cerrados > 0 || B.cerrados > 0);

  const ch = hayMio && S.mi11.length === 11 ? chanceGanar(A, B) : null;
  const pa = ch ? Math.round(ch.a * 100) : null;
  const pb = ch ? Math.round(ch.b * 100) : null;

  // LA CINTA TIENE QUE VERSE SIEMPRE (13/09).
  // Con la fecha empezada el marcador mostraba "80.0 · 7 de 11 ya jugaron" y de
  // la cinta no decia una palabra. Si el capitan ya jugo pero Planeta no
  // publico su ficha, la cinta vale 0 y no habia forma de darse cuenta ni de
  // arreglarlo desde esta pantalla: el casillero para escribir la ficha existia
  // solo en el Torneo de amigos. Pasa siempre que el puntaje se carga a mano,
  // porque a mano viene el total y la ficha no.
  const lineaCinta = c => {
    if (!c || c.estado === 'nadie') return '';
    const q = esc(c.quien || '');
    if (c.estado === 'perdida') return `<div class="vs-cinta vs-cinta-mal"
      title="${esc('Regla del juego: si el capitán no suma puntos, la cinta se pierde. El suplente que lo reemplaza no la hereda.')}">
      cinta perdida · ${q} no sumó</div>`;
    if (c.estado === 'falta') return `<div class="vs-cinta"
      title="${esc(c.quien + ' todavía no jugó. ' + n2(c.valor) + ' es la ficha que el motor le espera; ya está contada en la proyección.')}">
      cinta <b>+${n1(c.valor)}</b> esperada · ${q}</div>`;
    if (c.estado === 'ok') return `<div class="vs-cinta vs-cinta-ok"
      title="${esc(c.mano ? 'Ficha cargada por vos. Manda sobre lo que diga Planeta.' : 'Ficha de Clarín publicada por Planeta.')}">
      cinta <b>+${n1(c.valor)}</b> · ${q}${c.mano ? ' ✎' : ''}
      <input type="number" step="0.5" min="-5" max="10" value="${c.valor}" data-cinta="${c.id}"
        title="La ficha del capitán. La cinta la duplica, así que este número se suma una vez más."></div>`;
    // sindato: jugó, pero no sabemos su ficha. Es el caso que lo hacía valer 0.
    return `<div class="vs-cinta vs-cinta-falta"
      title="${esc('La cinta duplica la FICHA, y Planeta publica el total sin separarla. Escribí la ficha de ' + c.quien + ' (1 a 10) y el total va a coincidir exacto con el del juego.')}">
      cinta: falta la ficha de ${q}
      <input type="number" step="0.5" min="-5" max="10" value="" placeholder="—" data-cinta="${c.id}"></div>`;
  };

  const lado = (m, quien, ic, clase, extra) => `
    <div class="vs-lado ${clase}">
      <div class="vs-quien">${ic} ${quien}</div>
      <div class="vs-pts">${enJuego ? n1(m.hecho) : n1(m.proyeccion)}</div>
      <div class="vs-meta">${enJuego
        ? `${m.jugaron} de ${m.n} ya jugaron · proyección <b>${n1(m.proyeccion)}</b>`
        : `${n1(m.real + m.esperado)} esperados + ${n2(m.cinta.valor)} de la cinta`}</div>
      ${lineaCinta(m.cinta)}
      ${extra || ''}
    </div>`;

  // PEGAR LA LISTA (13/09). Antes las unicas dos formas de cargar tu once eran
  // tocar hueco por hueco o copiar el del motor y editarlo. Pero el once uno ya
  // lo tiene escrito en el juego: pegarlo es un paso, los otros dos son quince.
  // El pegador ya existia para los equipos de tus amigos —abrirPegar()— y el
  // equipo propio pasa por el mismo camino que cualquier otro (ponerOnce y
  // compania ya saben escribir en S.mi11 cuando el equipo es el tuyo). Lo unico
  // que faltaba era el boton.
  const vacio = `<div class="vs-lado vs-mio vs-lado-vacio">
      <div class="vs-quien">👤 El tuyo</div>
      <div class="vs-cta">
        <p>Cargá el once que usaste vos y mirá la fecha como un partido.</p>
        <button class="vs-btn vs-btn-fuerte" id="vs-pegar">Pegar mi lista</button>
        <button class="vs-btn" id="vs-copiar">Copiar el del motor y editarlo</button>
        <span class="vs-cta-o">o tocá los huecos de la cancha de acá abajo</span>
      </div>
    </div>`;

  // barra de chances
  const barra = ch ? `
    <div class="vs-barra" title="${esc(ch.cerrado
      ? 'La fecha ya está cerrada para los dos onces: esto ya no es una chance, es el resultado.'
      : 'Sale de simular ' + ch.sims.toLocaleString('es-AR') + ' veces lo que falta jugar, con la variación real de puntajes por puesto medida sobre la planilla de Planeta.')}">
      <span class="vs-b-a" style="width:${pa}%"></span>
      <span class="vs-b-e" style="width:${Math.max(0, 100 - pa - pb)}%"></span>
      <span class="vs-b-b" style="width:${pb}%"></span>
    </div>
    <div class="vs-frase">${ch.cerrado
      ? (pa > pb ? 'La fecha terminó: <b>gana el motor</b>.' : pb > pa ? 'La fecha terminó: <b>ganás vos</b>.' : 'La fecha terminó <b>empatada</b>.')
      : ch.decidido
        ? `${pa > pb ? '<b>Gana el motor</b>' : pb > pa ? '<b>Ganás vos</b>' : '<b>Empate</b>'}: lo que falta jugar es
           <b>igual para los dos</b> —los mismos jugadores en los dos onces—, así que la diferencia ya no cambia.
           <small>${A.pendientes.length} jugadores todavía por jugar, pero suman lo mismo de cada lado</small>`
        : `<b>${pa}%</b> el motor · <b>${pb}%</b> vos${ch.empate > 0.005 ? ` · ${Math.round(ch.empate * 100)}% empate` : ''}
           <small>sobre ${ch.sims.toLocaleString('es-AR')} simulaciones de lo que falta jugar${ch.sinCinta
             ? ', sin contar la cinta: falta la ficha de alguno de los dos capitanes' : ''}</small>`}</div>` : '';

  // la cinta, que es lo unico que no se puede leer de los puntos publicados
  const notaCinta = (m, quien) => {
    if (m.cinta.estado === 'sindato') return `${quien}: falta la ficha de <b>${esc(m.cinta.quien)}</b> para saber cuánto pagó la cinta —cargala en <b>Torneo de amigos</b>.`;
    if (m.cinta.estado === 'perdida') return `${quien}: <b>${esc(m.cinta.quien)}</b> no jugó, así que la cinta se perdió.`;
    if (m.cinta.estado === 'ok') return `${quien}: la cinta de <b>${esc(m.cinta.quien)}</b> pagó <b>+${n1(m.cinta.valor)}</b>.`;
    return '';
  };
  const notas = enJuego ? [notaCinta(A, 'Motor'), hayMio ? notaCinta(B, 'Vos') : ''].filter(Boolean) : [];

  const estadoFecha = VIVO
    ? `${(VIVO.partidos || []).length} de ${(D.partidos || []).length} partidos publicados`
    : (VIVO_VIEJO ? 'sin puntajes de esta fecha: corré SYNC_VIVO' : 'todavía sin puntajes: corré SYNC_VIVO');

  const costoMi = S.mi11.reduce((t, id) => t + ((TODOS[id] || {}).pr || 0), 0);
  const cabMi = hayMio ? `
    <span class="vs-herr vs-herr-der">
      <select id="vs-esq" class="vs-sel" title="Formación de tu once">
        ${ESQUEMAS_11.map(e => `<option value="${e}"${e === S.miEsq ? ' selected' : ''}>${esquemaLindo(e)}</option>`).join('')}
      </select>
      <span class="vs-plata${costoMi > 65e6 ? ' vs-plata-mal' : ''}"
        title="${esc('Lo que sale tu once. El tope del juego es $65.000.000.')}">$${(costoMi / 1e6).toFixed(1)}M</span>
      <button class="vs-btn vs-btn-chico" id="vs-pegar2" title="Pegar tu once como lista de texto, igual que lo ves en el juego">pegar lista</button>
      <button class="vs-btn vs-btn-chico" id="vs-copiar2" title="Reemplaza tu once por el del motor">copiar el del motor</button>
      <button class="vs-btn vs-btn-chico" id="vs-borrar" title="Vaciar tu once">vaciar</button>
    </span>` : '';

  // Arrastrar el once sin decirlo seria peor que no arrastrarlo: hay que saber
  // que lo que se ve es el de la fecha pasada y todavia no lo tocaste.
  const avisoHeredado = (hayMio && S.miHeredadoDe != null) ? `<div class="vs-heredado">
    Este es el once que tenías en la <b>fecha ${S.miHeredadoDe}</b>, traído tal cual para que
    cambies lo que quieras en vez de armarlo de cero.${S.miPerdidos
      ? ` <b>${S.miPerdidos}</b> ${S.miPerdidos === 1 ? 'jugador ya no está' : 'jugadores ya no están'} en la lista
          (se fueron del torneo o cambiaron de club): ${S.miPerdidos === 1 ? 'quedó un hueco' : 'quedaron huecos'} en la cancha.`
      : ''} La fecha ${S.miHeredadoDe} queda guardada como estaba.</div>` : '';

  return `
  <div class="vs">
    ${avisoHeredado}
    <div class="vs-cab">
      <div class="vs-cab-txt"><h2>La fecha, como un partido</h2>
        <p>El once del motor contra el que armaste vos. Los puntos salen de las fichas de Planeta y
        <b>no entran en ningún cálculo</b> del motor.</p></div>
      <div class="est ${enJuego ? 'est-abierta' : 'est-neutra'}" title="${esc(VIVO
        ? 'Bajado el ' + fechaCorta(VIVO.generado) + '. Corré SYNC_VIVO.bat para actualizar.'
        : 'Corré SYNC_VIVO.bat para bajar los puntajes de esta fecha. Mientras tanto se comparan los puntos esperados, que es lo útil antes de que arranque.')}">
        <span class="est-lbl">${enJuego ? 'en vivo' : 'puntajes'}</span><b>${esc(estadoFecha)}</b></div>
    </div>

    <div class="vs-marcador">
      ${lado(A, 'El motor', '🤖', 'vs-motor')}
      <div class="vs-medio"><span class="vs-vs">VS</span></div>
      ${hayMio ? lado(B, 'El tuyo', '👤', 'vs-mio') : vacio}
    </div>
    ${barra}
    ${notas.length ? `<div class="vs-notas">${notas.join(' · ')}</div>` : ''}

    <div class="vs-canchas">
      <div class="vs-col">
        <div class="vs-col-tit">🤖 El motor <small>${esquemaLindo(S.esquema === '__riesgo' ? (D.arriesgado ? D.arriesgado.esquema : S.esquema) : S.esquema)}</small>
          <span class="vs-herr vs-herr-der">
            <button class="vs-btn vs-btn-chico${S.esquema !== '__riesgo' ? ' on' : ''}"
              onclick="cambiarEsquema('${S.esquema === '__riesgo' ? ((S.oncesLocales && S.oncesLocales[0] && S.oncesLocales[0].e) || (D.esquema && D.esquema.optimo.esquema)) : S.esquema}')"
              title="El once que más puntos espera en promedio.">🛡️</button>
            <button class="vs-btn vs-btn-chico${S.esquema === '__riesgo' ? ' on' : ''}"${D.arriesgado ? ` onclick="cambiarEsquema('__riesgo')"` : ' disabled'}
              title="${D.arriesgado ? 'Resigna promedio para tener más chance de una fecha grande. Sale de la simulación.' : 'No hay once arriesgado en este datos.js'}">🚀</button>
            <button class="vs-btn vs-btn-chico" id="oi-ver-detalle" title="Abrir la pantalla Mejor 11">detalle →</button>
          </span></div>
        ${canchaVersus(A)}
        ${tiraBanco(armarBanco(), {})}
      </div>
      <div class="vs-col">
        <div class="vs-col-tit">👤 El tuyo <small>${hayMio ? esquemaLindo(S.miEsq) : 'sin armar'}</small>${cabMi}</div>
        ${hayMio ? canchaVersus(B, { mio: true }) : `<div class="vs-cancha vs-cancha-vacia">${(() => {
          const s = slotsMi();
          return ['DEL', 'VOL', 'DEF', 'ARQ'].map(pos => `<div class="vs-linea">${s[pos]
            .map((_, i) => fichaVersus({ p: null }, { pos, idx: i })).join('')}</div>`).join('');
        })()}</div>`}
        ${tiraBanco((equipoMio() || {}).banco, { mio: true })}
      </div>
    </div>

    <div class="vs-pie">
      Los puntos que ves son los que publica <b>Planeta Gran DT</b> y son los del juego, sin el doble del capitán:
      Planeta publica el total y no la ficha por separado, así que la cinta solo se puede sumar cuando la ficha de
      ese jugador sale en los destacados. Lo que todavía no se jugó se muestra como <b>puntos esperados</b>.
    </div>
  </div>`;
}

// ── acciones de mi once ────────────────────────────────────────────────────
function repintarVersus() { guardarMi11(); pintarPantallaFecha(); }
window.miCopiarDelMotor = function () {
  S.miEsq = (S.esquema === '__riesgo' && D.arriesgado) ? D.arriesgado.esquema : S.esquema;
  S.mi11 = S.once.slice(); S.miCap = S.capitan;
  normalizarMi11(); repintarVersus();
};
window.miVaciar = function () {
  S.mi11 = []; S.miCap = null;
  // vaciar tiene que dejarlo COMO NUEVO: si no se toca la formacion, un once
  // que quedo con quince huecos sigue con quince huecos despues de vaciarlo.
  S.miEsq = esquemaValido(S.miEsq);
  repintarVersus();
};
// Abre el mismo pegador que usan los equipos del torneo, apuntado al tuyo. El
// equipo propio se busca por la marca .mio y no por el id: una liga guardada de
// antes puede traerlo con otro id y quedaria sin pegador y sin decir por que.
// El equipo propio dentro de la liga. Ahi vive el banco: S.mi11 guarda los
// once y el banco es lo unico "de liga" que tiene el equipo tuyo.
function equipoMio() {
  if (!S.liga) cargarLiga();
  return ((S.liga && S.liga.equipos) || []).find(x => x.mio) || null;
}
window.pegarMiOnce = function () {
  if (!S.liga) cargarLiga();
  const t = ((S.liga && S.liga.equipos) || []).find(x => x.mio);
  if (!t) { alert('No encuentro tu equipo. Recargá la página con Ctrl+F5.'); return; }
  abrirPegar(t.id);
};
window.miSacar = function (id, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  S.mi11 = S.mi11.filter(x => x !== id);
  if (S.miCap === id) S.miCap = null;
  normalizarMi11(); repintarVersus();
};
window.miCapitan = function (id, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  if (S.mi11.includes(id)) S.miCap = id;
  repintarVersus();
};
window.miEsquema = function (e) { S.miEsq = esquemaValido(e); normalizarMi11(); repintarVersus(); };
window.miElegirBanco = function (pos) {
  const t = equipoMio(); if (!t) return;
  const actual = (t.banco || {})[pos] || null;
  abrirSelector({
    pos, actual,
    // en el banco no puede estar alguien que ya es titular tuyo
    excluidos: new Set(S.mi11),
    titulo: `Elegir el suplente ${pos} de tu equipo`,
    nota: 'Entra solo si tu titular de ese puesto <b>no juega</b>. Es parte de los quince del juego.',
    onElegir: id => {
      t.banco = t.banco || {}; t.banco[pos] = id;
      guardarLiga(); cerrarModal($('team-detail-modal')); repintarVersus();
    }
  });
};
window.miSacarBanco = function (pos, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  const t = equipoMio(); if (!t || !t.banco) return;
  delete t.banco[pos]; guardarLiga(); repintarVersus();
};
window.miElegir = function (pos, saliendo) {
  abrirSelector({
    pos, actual: saliendo || null,
    excluidos: new Set(S.mi11),
    titulo: saliendo
      ? `Cambiar a ${esc(nombreCorto((TODOS[saliendo] || {}).n || ''))}`
      : `Elegir ${NOMBRE_POS_SING[pos]} para tu once`,
    nota: 'Este es <b>tu</b> once, el que pusiste en el juego. No cambia nada del motor: sirve para comparar.',
    onElegir: id => miPoner(pos, saliendo || '', id)
  });
};
window.miPoner = function (pos, saliendo, entra) {
  if (saliendo) S.mi11 = S.mi11.map(id => id === saliendo ? entra : id);
  else S.mi11.push(entra);
  if (saliendo && S.miCap === saliendo) S.miCap = entra;
  normalizarMi11();
  cerrarModal($('team-detail-modal'));
  repintarVersus();
};

// ════════════════════════════════════════════════════════════════════════════
//  LA LIGA — el torneo de amigos, en vivo
//
//  Compara N equipos (el del motor, el tuyo y los de tus amigos) con los
//  puntajes que va publicando Planeta. Sale de dataVivo.js, la misma fuente
//  separada que usa el Versus del inicio: NO alimenta al motor.
//
//  LAS REGLAS DEL JUEGO QUE SE APLICAN ACA (verificadas, no de memoria):
//   · Suplentes: son 4, uno por puesto (1 ARQ, 1 DEF, 1 VOL, 1 DEL). Cuando un
//     titular no juega al menos 20 minutos, el suplente de SU MISMO PUESTO lo
//     reemplaza automaticamente. Como es uno por puesto, si se caen dos
//     defensores solo entra por uno.
//   · Capitan: duplica SOLO la calificacion Clarin (la ficha del 1 al 10), no
//     el puntaje entero. Y —esto es literal del reglamento de Planeta— "si el
//     jugador Capitan no suma puntos en la fecha, el suplente que lo reemplaza
//     NO duplica su Calificacion Clarin, ya que no fue elegido como Capitan".
//     O sea: si tu capitan no juega, la cinta se pierde. No se pasa a nadie.
//
//  LO QUE NO SE PUEDE LEER SOLO: Planeta publica el TOTAL de cada jugador, no
//  la ficha por separado. Cuando la ficha del capitan sale en los destacados de
//  Clarin la tomamos de ahi; cuando no, hay un casillero para escribirla a mano
//  y que el total de la app sea EXACTAMENTE el que suma el juego.
// ════════════════════════════════════════════════════════════════════════════

const CLAVE_LIGA = 'gdt_liga_v1';
const PUESTOS = ['ARQ', 'DEF', 'VOL', 'DEL'];

function ligaVacia() { return { equipos: [] }; }
// LA LIGA PUBLICADA (dataLiga.js).
// Los equipos viven en el localStorage de cada navegador, asi que un amigo que
// abre la app no ve ninguno. Este archivo es la forma de que los vea sin tener
// que importar nada: viaja con la app, igual que datos.js y dataVivo.js.
// Nadie puede romper la version publicada desde el navegador: lo que cada uno
// toca queda en su maquina y esto sigue siendo la referencia.
const LIGA_BASE = (typeof window !== 'undefined' && window.LIGA_BASE) ? window.LIGA_BASE : null;
function equiposDesdePaquete(pk) {
  const out = [];
  (pk.equipos || []).forEach((t, i) => {
    const q = idsDesdeClaves(t.kOnce || []);
    const banco = {};
    PUESTOS.forEach(pos => {
      const k = (t.kBanco || {})[pos]; const p = k && porClave(k); if (p) banco[pos] = p.id;
    });
    out.push({
      id: 'pub' + i, nombre: t.nombre || ('Equipo ' + (i + 1)),
      // el flag "mio" NUNCA viaja: el equipo propio de cada uno es el suyo
      mio: false, dt: t.dt || null, esq: t.esq, cap: t.kCap ? ((porClave(t.kCap) || {}).id || null) : null,
      once: q.ids, banco, fichas: {}, perdidos: q.perdidas.length,
      // Las claves tienen que quedar puestas: el equipo entra por el mismo
      // camino que cualquier otro y ese camino resuelve por clave. Sin esto
      // el bucle de abajo los dejaba sin un solo jugador —y en silencio.
      kOnce: t.kOnce || [], kCap: t.kCap || null, kBanco: t.kBanco || {}
    });
  });
  return out;
}

function cargarLiga() {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE_LIGA) || 'null');
    S.liga = (r && Array.isArray(r.equipos)) ? r : ligaVacia();
  } catch (e) { S.liga = ligaVacia(); }
  S.ligaPerdidos = [];
  S.ligaHayNueva = false;
  let sembrada = false;
  if (LIGA_BASE) {
    const propios = S.liga.equipos.filter(t => !t.mio).length;
    // Se siembra una sola vez. Si despues el tipo los borra a todos a proposito,
    // no se los volvemos a meter en cada recarga: el sello `publicado` dice que
    // esta liga ya paso por aca.
    if (!propios && !S.liga.publicado) {
      // primera vez en este navegador: se arranca con la liga publicada
      S.liga.equipos = S.liga.equipos.concat(equiposDesdePaquete(LIGA_BASE));
      S.liga.fichas = Object.assign({}, LIGA_BASE.fichas || {}, S.liga.fichas || {});
      if (LIGA_BASE.dts && LIGA_BASE.dts.length) S.liga.dts = LIGA_BASE.dts;
      if (LIGA_BASE.camp) S.liga.camp = LIGA_BASE.camp;
      S.liga.publicado = LIGA_BASE.publicado || null;
      sembrada = true;
    } else if (LIGA_BASE.publicado && LIGA_BASE.publicado !== S.liga.publicado) {
      // hay una version mas nueva, pero NO se pisa lo que el tipo tenga cargado:
      // se avisa y decide el
      S.ligaHayNueva = true;
    }
  }
  S.liga.fichas = S.liga.fichas || {};
  S.liga.dts = S.liga.dts || [];
  S.liga.camp = S.liga.camp || { general: {}, fechas: {} };
  S.liga.onces = S.liga.onces || {};
  // las que quedaron guardadas adentro de un equipo se mudan al mapa nuevo
  S.liga.equipos.forEach(t => {
    if (!t.fichas) return;
    Object.keys(t.fichas).forEach(f => {
      const k = t.kCap ? (f + '|' + t.kCap) : null;
      if (k && S.liga.fichas[k] === undefined) S.liga.fichas[k] = t.fichas[f];
    });
  });
  S.liga.equipos.forEach(t => {
    // TODO lo guardado viaja por clave estable, no por id: ver el comentario de
    // POR_CLAVE. Lo que no se puede recuperar se cuenta y se avisa; nunca se
    // rellena con el jugador que haya caido en ese id.
    const q = idsDesdeClaves(t.kOnce || []);
    t.once = q.ids;
    if (q.perdidas.length) S.ligaPerdidos.push({ eq: t.nombre, n: q.perdidas.length });
    t.cap = t.kCap ? ((porClave(t.kCap) || {}).id || null) : null;
    t.dt = t.dt || null;
    t.revisado = t.revisado ?? null;
    const b = {};
    PUESTOS.forEach(pos => { const k = (t.kBanco || {})[pos]; const p = k && porClave(k); if (p) b[pos] = p.id; });
    t.banco = b;
    t.fichas = t.fichas || {};
    if (t.cap && !t.once.includes(t.cap)) t.cap = null;
  });
  // Si se sembro de la liga publicada hay que GUARDARLA. Si no, cada recarga
  // vuelve a sembrar desde cero: nunca aparece el aviso de version nueva y se
  // pisa lo que el tipo haya tocado.
  if (sembrada) guardarLiga();
  // "El tuyo" es el mismo once que el del Versus del inicio: no se duplica.
  // Lo unico propio que guarda la liga de ese equipo es el banco y la ficha
  // del capitan.
  if (!S.liga.equipos.some(t => t.mio)) {
    S.liga.equipos.unshift({ id: '__mio', nombre: 'El mío', mio: true, once: [], banco: {}, fichas: {} });
  }
}
function guardarLiga() {
  try {
    const guardar = { fichas: S.liga.fichas || {}, publicado: S.liga.publicado || null,
      dts: S.liga.dts || [], camp: S.liga.camp || null, misPuntos: S.liga.misPuntos ?? null,
      onces: S.liga.onces || {}, equipos: S.liga.equipos.map(t => {
      const kBanco = {};
      PUESTOS.forEach(pos => { const k = claveDe((t.banco || {})[pos]); if (k) kBanco[pos] = k; });
      return { id: t.id, nombre: t.nombre, mio: !!t.mio, dt: t.dt || null,
               revisado: t.revisado ?? null, esq: esqDe(t),
               kOnce: clavesDesdeIds(t.mio ? S.mi11 : t.once),
               kCap: claveDe(t.mio ? S.miCap : t.cap),
               kBanco, fichas: t.fichas || {} };
    }) };
    localStorage.setItem(CLAVE_LIGA, JSON.stringify(guardar));
  } catch (e) { }
}
const FECHA_K = () => String((D && D.fechaObjetivo != null) ? D.fechaObjetivo : 'x');
// LA FICHA CARGADA A MANO ES DEL JUGADOR, NO DEL EQUIPO (07/09).
// Antes vivia adentro de cada equipo. Dos problemas: si dos amigos ponian de
// capitan al mismo jugador habia que escribirla dos veces, y en el equipo del
// motor se perdia sin decir nada —ese equipo se rearma en cada pintada y no se
// guarda, asi que el numero se escribia en un objeto que moria ahi mismo—.
// Ahora es un dato de la fecha: la ficha de Clarin de Fulano en la fecha 8.
const KF = (id) => FECHA_K() + '|' + (claveDe(id) || id);
function fichaManual(id) {
  if (!id || !S.liga || !S.liga.fichas) return null;
  const v = S.liga.fichas[KF(id)];
  return (v === undefined || v === null || v === '') ? null : v;
}
function ponerFichaManual(id, valor) {
  if (!S.liga) return;
  S.liga.fichas = S.liga.fichas || {};
  if (valor === null || valor === '' || isNaN(valor)) delete S.liga.fichas[KF(id)];
  else S.liga.fichas[KF(id)] = Number(valor);
  guardarLiga();
}

// El equipo del motor no se guarda: se lee del once que esta puesto ahora.
function equipoMotor() {
  const banco = armarBanco();
  return { id: '__motor', nombre: 'El motor', motor: true,
           once: S.once.slice(), banco, cap: S.capitan, esq: S.esquema, fichas: {} };
}
const onceDe = t => t.motor ? t.once : (t.mio ? S.mi11 : t.once);
const capDe = t => t.motor ? t.cap : (t.mio ? S.miCap : t.cap);
const esqDe = t => t.motor ? t.esq : (t.mio ? S.miEsq : t.esq);
function equiposLiga() { return [equipoMotor()].concat(S.liga.equipos); }
// EL TORNEO SON LOS DTs, Y NADA MAS (08/09).
// El once del motor y el tuyo no compiten con tus amigos: son el laboratorio.
// Mezclarlos en la misma tabla ensucia el espectaculo —y encima el motor casi
// siempre iba adelante, que no le interesa a nadie—. Van aparte, y ahi si tiene
// gracia: "si el motor jugara el torneo, iria 2º".
const esLab = t => !!(t.motor || t.mio);
function equiposTorneo() {
  const l = (S.liga && S.liga.equipos) || [];
  const hayDTs = !!(S.liga.dts && S.liga.dts.length);
  return l.filter(t => !esLab(t)).map(t => ({ ...t, suelto: hayDTs && !t.dt }));
}
function equiposLab() {
  const mio = ((S.liga && S.liga.equipos) || []).find(t => t.mio);
  return [equipoMotor()].concat(mio ? [mio] : []);
}

// ── EL MARCADOR DE UN EQUIPO, CON BANCO Y CINTA ────────────────────────────
function marcadorEquipo(t) {
  const once = (onceDe(t) || []).map(id => TODOS[id]).filter(Boolean);
  const banco = t.banco || {};
  const capId = capDe(t);
  const det = [], pendientes = [], entraron = [];
  let real = 0, esperado = 0, jugaron = 0, cerrados = 0;
  const caidos = { ARQ: [], DEF: [], VOL: [], DEL: [] };

  once.forEach(p => {
    if (resuelto(p)) {
      cerrados++;
      const v = vivoDe(p.id);
      const jugo = !!(v && v.p != null);
      const pts = jugo ? v.p : 0;
      if (jugo) { jugaron++; real += pts; }
      else caidos[p.pos].push(p);
      det.push({ p, estado: jugo ? 'jugo' : 'nojugo', pts, sup: !!(v && v.s), mano: !!(v && v.mano) });
    } else {
      pendientes.push(p.id);
      esperado += (p.epsj != null ? p.epsj : (p.ep || 0));
      det.push({ p, estado: 'falta', pts: null });
    }
  });

  // ── el banco ──
  // Uno por puesto: si se cayeron dos defensores, entra por uno solo.
  const banquito = [];
  PUESTOS.forEach(pos => {
    const s = TODOS[banco[pos]];
    if (!s) { banquito.push({ pos, p: null }); return; }
    const hayHueco = caidos[pos].length > 0;
    if (!hayHueco) { banquito.push({ pos, p: s, estado: 'espera' }); return; }
    const porQuien = caidos[pos][0];
    if (resuelto(s)) {
      const v = vivoDe(s.id);
      const jugo = !!(v && v.p != null);
      const pts = jugo ? v.p : 0;
      if (jugo) { jugaron++; real += pts; entraron.push({ entra: s, sale: porQuien, pts }); }
      banquito.push({ pos, p: s, estado: jugo ? 'entro' : 'nojugo', pts, porQuien });
    } else {
      pendientes.push(s.id);
      esperado += (s.epsj != null ? s.epsj : (s.ep || 0));
      banquito.push({ pos, p: s, estado: 'entra-falta', porQuien });
    }
  });

  // ── la cinta ──
  const cap = TODOS[capId];
  const manual = fichaManual(capId);
  // `cobrada` dice si la cinta YA se pago o si es todavia una expectativa. Sin
  // esa distincion la columna Puntos mezclaba puntos reales con una estimacion
  // —el capitan que no jugo sumaba su ficha esperada— y ese numero ya no
  // coincidia con el del juego, que es justamente para lo que sirve.
  let cinta = { estado: 'nadie', valor: 0, cobrada: false, quien: null, id: capId || null };
  if (cap) {
    const q = nombreCorto(cap.n);
    const v = vivoDe(cap.id);
    const capJugo = !!(v && v.p != null);
    if (manual != null && manual !== '') {
      cinta = { estado: 'mano', valor: Number(manual), cobrada: true, quien: q, id: cap.id };
    } else if (!resuelto(cap)) {
      cinta = { estado: 'falta', valor: fichaCap(cap), cobrada: false, quien: q, id: cap.id };
    } else if (!capJugo) {
      // regla del juego: si el capitan no suma, la cinta se pierde. El suplente
      // que lo reemplaza NO duplica su ficha.
      cinta = { estado: 'perdida', valor: 0, cobrada: true, quien: q, id: cap.id };
    } else if (VIVO && VIVO.fichas && VIVO.fichas[cap.id] != null) {
      cinta = { estado: 'clarin', valor: VIVO.fichas[cap.id], cobrada: true, quien: q, id: cap.id };
    } else {
      cinta = { estado: 'sindato', valor: 0, cobrada: false, quien: q, id: cap.id };
    }
  }

  const costo = (onceDe(t) || []).concat(PUESTOS.map(x => banco[x]))
    .reduce((a, id) => a + ((TODOS[id] || {}).pr || 0), 0);

  const cintaCobrada = cinta.cobrada ? cinta.valor : 0;
  const cintaPendiente = cinta.cobrada ? 0 : cinta.valor;
  return {
    t, det, banquito, entraron, pendientes, cinta, costo, cintaCobrada, cintaPendiente,
    real, esperado, jugaron, cerrados, n: once.length,
    // PUNTOS = lo que YA cobro, y nada mas. Es el numero que tiene que dar
    // igual al del juego.
    total: real + cintaCobrada,
    // PROYECCION = eso mas lo que falta jugar, incluida la ficha del capitan
    // si todavia no jugo.
    proyeccion: real + cintaCobrada + esperado + cintaPendiente
  };
}

// ── QUIEN GANA LA FECHA, CON N EQUIPOS ─────────────────────────────────────
// Con dos equipos alcanzaba con mirar los jugadores que NO se repiten. Con
// ocho no: un jugador que tienen seis de los ocho igual mueve la tabla entre
// esos seis y los otros dos. Asi que se sortea cada jugador pendiente UNA sola
// vez por simulacion y ese mismo numero se le suma a todos los equipos que lo
// tienen. Eso respeta que los equipos que comparten jugadores suben y bajan
// juntos, que es exactamente lo que pasa el domingo.
//
// Lo que esta simulacion NO tiene: que dos jugadores del MISMO CLUB tambien
// suben y bajan juntos (si el club golea, cobran todos). Al ignorarlo, las
// distancias quedan un poco mas cerradas de lo que son en la realidad.
function chancesLiga(ms, sims) {
  if (!D.varPuntos || ms.length < 2) return null;
  const union = [...new Set([].concat(...ms.map(m => m.pendientes)))]
    .map(id => TODOS[id]).filter(Boolean);
  const idx = {}; union.forEach((p, i) => idx[p.id] = i);
  const base = ms.map(m => m.total + m.cintaPendiente);
  const mios = ms.map(m => m.pendientes.map(id => idx[id]).filter(i => i != null));
  if (!union.length) {
    // ya no queda nada por jugarse: no es una chance, es el resultado
    const max = Math.max(...base);
    const g = base.map(b => b === max ? 1 : 0), n = g.reduce((a, b) => a + b, 0);
    return { p: g.map(x => x / n), sims: 0, cerrado: true, pendientes: 0 };
  }
  const N = sims || 40000;      // 50 ms; error de simulacion ~0,26 puntos
  _resembrar(SEMILLA);
  const gan = ms.map(() => 0);
  const tiro = new Float64Array(union.length);
  const tot = new Float64Array(ms.length);
  for (let s = 0; s < N; s++) {
    for (let i = 0; i < union.length; i++) tiro[i] = _sortear(union[i]);
    let max = -Infinity;
    for (let e = 0; e < ms.length; e++) {
      let v = base[e];
      const mi = mios[e];
      for (let k = 0; k < mi.length; k++) v += tiro[mi[k]];
      tot[e] = v; if (v > max) max = v;
    }
    let empatan = 0;
    for (let e = 0; e < ms.length; e++) if (tot[e] > max - 1e-9) empatan++;
    for (let e = 0; e < ms.length; e++) if (tot[e] > max - 1e-9) gan[e] += 1 / empatan;
  }
  return { p: gan.map(g => g / N), sims: N, cerrado: false, pendientes: union.length };
}

// ── PEGAR UN EQUIPO ────────────────────────────────────────────────────────
// Cargar ocho equipos a mano, jugador por jugador, son 120 clics. Lo practico
// es pegar la lista como sale del juego. Aca no viene el club, asi que el
// cruce se hace contra los 755 nombres de una: cuando hay un solo candidato se
// asigna solo, y cuando hay dos "Fernández" se pregunta en vez de adivinar.
const _norm = s => (s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
function candidatosNombre(txt) {
  const n = _norm(txt); if (!n) return [];
  const tok = n.split(' ');
  const todos = Object.values(TODOS);
  const partes = p => { const q = p.n.split(','); return { ap: _norm(q[0]), nom: _norm(q.slice(1).join(' ')) }; };
  let hit = todos.filter(p => { const x = partes(p); return (x.nom + ' ' + x.ap) === n || (x.ap + ' ' + x.nom) === n; });
  if (hit.length) return hit;
  hit = todos.filter(p => {
    const x = partes(p); if (!x.ap) return false;
    if (!(n === x.ap || n.endsWith(' ' + x.ap))) return false;
    const pila = x.nom.split(' ')[0];
    return !pila || tok.includes(pila);
  });
  if (hit.length) return hit;
  hit = todos.filter(p => {
    const x = partes(p); const ap1 = x.ap.split(' ')[0], pila = x.nom.split(' ')[0];
    return ap1 && pila && tok.includes(ap1) && tok.includes(pila);
  });
  if (hit.length) return hit;
  return todos.filter(p => {
    const x = partes(p); const ap1 = x.ap.split(' ')[0];
    return ap1 && (n === x.ap || n.endsWith(' ' + ap1) || n === ap1);
  });
}
// Lee el texto pegado. Formato: una linea por jugador, el capitan con (C) al
// final, y la palabra "Suplentes:" separando los cuatro del banco.
function leerPegado(txt) {
  const lineas = String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = { titulares: [], suplentes: [], cap: null };
  let enBanco = false;
  lineas.forEach(l => {
    if (/^suplentes?\s*:?\s*$/i.test(l)) { enBanco = true; return; }
    let nombre = l.replace(/^\d+[.)\-\s]+/, '').trim();
    const esCap = /\(\s*c\s*\)\s*$|\s+c$/i.test(nombre);
    nombre = nombre.replace(/\(\s*c\s*\)\s*$/i, '').replace(/\s+c$/i, '').trim();
    // por si pegan "Nombre 7" con el puntaje al lado
    nombre = nombre.replace(/\s+-?\d+$/, '').replace(/\s+s\/c$/i, '').trim();
    if (!nombre) return;
    const fila = { texto: nombre, cands: candidatosNombre(nombre), elegido: null, cap: esCap };
    if (fila.cands.length === 1) fila.elegido = fila.cands[0].id;
    (enBanco ? out.suplentes : out.titulares).push(fila);
    if (esCap) out.cap = fila;
  });
  return out;
}

// ── LA PANTALLA ────────────────────────────────────────────────────────────
function fichaLiga(d, o) {
  o = o || {};
  const p = d.p;
  if (!p) return `<button class="lgj lgj-vacia" data-slot="${o.pos}:${o.idx}">+<small>${o.pos}</small></button>`;
  const esperado = n1(p.epsj != null ? p.epsj : p.ep);
  const num = (d.estado === 'falta' || d.estado === 'entra-falta' || d.estado === 'espera') ? esperado : String(d.pts);
  const ayuda = nombreCorto(p.n) + ' — ' + NOM(p.eq) + ' ' + (p.cond === 'L' ? 'de local' : 'de visitante') +
    ' vs ' + NOM(p.riv) + '. ' + ({
      jugo: `Ya jugó: ${d.pts} puntos.`,
      nojugo: 'Su partido ya se jugó y no sumó.',
      falta: `Todavía no jugó. ${esperado} es lo que el motor espera de él.`,
      entro: `Entró por ${d.porQuien ? nombreCorto(d.porQuien.n) : 'un titular'}, que no jugó: suma ${d.pts}.`,
      'entra-falta': `Entra por ${d.porQuien ? nombreCorto(d.porQuien.n) : 'un titular'}, que no jugó. Todavía no jugó su partido.`,
      espera: 'En el banco. Entra solo si el titular de su puesto no juega.'
    }[d.estado] || '');
  return `<div class="lgj lgj-${d.estado}${o.cap ? ' lgj-cap' : ''}" title="${esc(ayuda)}"
      ${o.editable ? `data-jug="${p.id}"` : ''}>
    <span class="lgj-pts">${num}</span>
    <span class="lgj-nom">${esc(APELLIDO(p.n))}</span>
    <span class="lgj-eq">${esc(SIGLA(p.eq))}<i>${p.cond === 'L' ? 'L' : 'V'}</i></span>
    ${o.cap ? '<span class="lgj-c">C</span>' : ''}
    ${o.editable ? `<button class="lgj-x" data-sacar="${p.id}" title="Sacarlo">✕</button>
       ${o.cap || o.banco ? '' : `<button class="lgj-cc" data-cap="${p.id}" title="Ponerle la cinta">C</button>`}` : ''}
  </div>`;
}

function textoCinta(m) {
  const c = m.cinta;
  if (c.estado === 'nadie') return '<span class="lg-cinta-na" title="Este equipo no tiene capitán elegido.">sin cinta</span>';
  const q = esc(c.quien);
  if (c.estado === 'perdida') return `<span class="lg-cinta-mal" title="${esc(
    'Regla del juego: si el capitán no suma puntos en la fecha, la cinta se pierde. El suplente que lo reemplaza no duplica su ficha, porque no fue elegido capitán. Capitán: ' + c.quien)}">se perdió</span>`;
  if (c.estado === 'falta') return `<span class="lg-cinta-esp" title="${esc(
    q + ' todavía no jugó. ' + n2(c.valor) + ' es la ficha que el motor le espera en este partido.')}">+${n1(c.valor)} esp.</span>`;
  if (c.estado === 'clarin') return `<span class="lg-cinta-ok" title="${esc(
    'Ficha de Clarín publicada por Planeta para ' + c.quien + '.')}">+${n1(c.valor)}</span>`;
  if (c.estado === 'mano') return `<span class="lg-cinta-ok" title="${esc(
    'Ficha cargada a mano para ' + c.quien + '. Manda sobre lo que diga Planeta.')}">+${n1(c.valor)} ✎</span>`;
  return `<span class="lg-cinta-falta" title="${esc(
    'Planeta no publicó la ficha de ' + c.quien + ' (solo publica las destacadas). Escribila acá y el total va a coincidir exacto con el del juego.')}">falta</span>`;
}

function pintarPantallaLiga() {
  const cont = $('pantalla-liga'); if (!cont || !D) return;
  soltarScroll();
  if (!S.liga) cargarLiga();
  if (S.mi11 == null) cargarMi11();
  if (!S.once.length) rearmarOnce();
  recalcCapitan();

  const eqs = equiposTorneo();
  const ms = eqs.map(marcadorEquipo);
  const msLab = equiposLab().map(marcadorEquipo);
  // "LO TIENEN X DE Y" CUENTA SOLO EL TORNEO (12/09).
  // Antes esto era propiedadTorneo(ms.concat(msLab)) y el denominador incluia
  // los dos equipos del laboratorio —el del motor y el propio—, que NO compiten.
  // Resultado: Correa aparecia "7 de 9" cuando en el torneo son 7 equipos, y la
  // lista de duenos de abajo nombraba 5. El numero y los nombres no cerraban, y
  // para el grupo era directamente enganoso. El laboratorio se mide contra el
  // torneo, no forma parte de el.
  _PROP = propiedadTorneo(ms);
  const ch = chancesLiga(ms);
  const sueltos = ms.filter(m => m.t.suelto);
  const enJuego = !!VIVO && ms.some(m => m.cerrados > 0);
  const orden = ms.map((m, i) => ({ m, i })).sort((a, b) =>
    (b.m.total - a.m.total) || (b.m.proyeccion - a.m.proyeccion));
  const lider = orden.length ? orden[0].m.total : 0;

  const estadoFecha = VIVO
    ? `${(VIVO.partidos || []).length} de ${(D.partidos || []).length} partidos publicados`
    : (VIVO_VIEJO ? 'sin puntajes de esta fecha: corré SYNC_VIVO' : 'todavía sin puntajes: corré SYNC_VIVO');

  const filas = orden.map(({ m, i }, pos) => {
    const t = m.t, sel = S.ligaAbierto === t.id;
    const pct = ch ? Math.round(ch.p[i] * 1000) / 10 : null;
    // el "−0.0" de un empate tecnico es ruido: si la diferencia no se ve, no se escribe
    const brecha = lider - m.total;
    const dif = (pos === 0 || brecha < 0.05) ? '' : '−' + n1(brecha);
    return `<tr class="lg-fila${sel ? ' lg-abierta' : ''}${t.motor ? ' lg-motor' : ''}${t.mio ? ' lg-mio' : ''}"
        data-abrir="${t.id}">
      <td class="lg-pos">${pos + 1}</td>
      <td class="lg-nom"><b>${esc(t.nombre)}</b>${t.motor ? '<span class="lg-tag">motor</span>' : ''}${t.mio ? '<span class="lg-tag lg-tag-mio">vos</span>' : ''}
        <small>${esqDe(t) ? esquemaLindo(esqDe(t)) : 's/formación'}${m.n !== 11 ? ` · <b class="lg-ojo">${m.n} titulares</b>` : ''}
        · banco ${PUESTOS.filter(x => (t.banco || {})[x]).length}/4</small></td>
      <td class="text-center lg-jug" title="${esc('Jugadores que ya tienen puntaje publicado, contando los suplentes que entraron.')}">${m.jugaron}<small>/${m.n}</small></td>
      <td class="text-center lg-pts" title="${esc('Los ' + n1(m.real) + ' de los jugadores' +
        (m.cinta.valor ? ' MÁS ' + n1(m.cinta.valor) + ' de la cinta' : '') +
        '. Es el número que tiene que coincidir con el del juego.')}"><b>${n1(m.total)}</b>${dif ? `<small>${dif}</small>` : ''}</td>
      <td class="text-center">${textoCinta(m)}</td>
      <td class="text-center lg-proy" title="${esc('Lo que ya sumó más lo que el motor espera de los que todavía no jugaron.')}">${n1(m.proyeccion)}</td>
      <td class="lg-chance">${pct == null ? '<span class="text-muted">s/d</span>' : `
        <div class="lg-barra"><span style="width:${Math.min(100, pct)}%"></span></div>
        <b>${pct < 0.1 && pct > 0 ? '<0,1' : String(pct).replace('.', ',')}%</b>`}</td>
    </tr>` + (sel ? `<tr class="lg-detalle-fila"><td colspan="7">${detalleEquipo(m)}</td></tr>` : '');
  }).join('');

  // ¿LOS EQUIPOS SON DE ESTA FECHA? (17/09)
  // Los onces se cargan cuando arranca la fecha. Apenas el motor pasa a la
  // siguiente, dataLiga.js sigue teniendo los de la anterior y la pantalla los
  // muestra como si fueran los de hoy, con proyección y todo: 78 puntos para
  // un equipo que nadie armó. Se compara contra el primer partido de la fecha.
  const equiposViejos = (() => {
    const ed = LIGA_BASE && LIGA_BASE.equiposEditado;
    if (!ed || !D.partidos || !D.partidos.length) return null;
    const t = new Date(ed).getTime();
    const arranca = Math.min(...D.partidos.map(m => new Date(m.cuando).getTime()).filter(isFinite));
    if (!isFinite(arranca) || !isFinite(t) || t >= arranca) return null;
    return { ed, arranca };
  })();
  // NO SE MUESTRAN LOS EQUIPOS DE LA FECHA ANTERIOR (18/09).
  // Antes salia un cartel de advertencia y abajo la tabla igual, con proyeccion
  // y chance de ganar para onces que nadie confirmo. El pedido fue claro: en la
  // pantalla de la fecha que viene no va NADA de la fecha pasada. Los equipos
  // viejos no se pierden — estan en Revision, que es donde corresponde mirarlos.
  if (equiposViejos) {
    cont.innerHTML = `
      ${cabecera('Torneo de amigos', 'Fecha ' + (D.fechaObjetivo ?? '–'), '')}
      <div class="card tr-card vac">
        <div class="vac-ic">🏆</div>
        <h2>Todavía no están los equipos de la fecha ${D.fechaObjetivo}</h2>
        <p>Los onces se cargan cuando arranca la fecha. Los últimos que hay en
        <code>equipos.txt</code> son del ${fechaCorta(equiposViejos.ed)}, o sea de la fecha anterior,
        y no se muestran acá a propósito: proyectar una fecha con onces que nadie confirmó
        es inventar.</p>
        <p>Cuando los tengas, pegalos en <code>equipos.txt</code> y corré <b>ARMAR_LIGA.bat</b>.
        Tu propio once lo sacás del botón <b>«guardar mi once para el torneo»</b> en Mejor 11.</p>
        <button class="vs-btn vs-btn-fuerte" onclick="mostrarSeccion('revision')">ver las fechas que ya se jugaron</button>
      </div>`;
    return;
  }
  const avisoViejos = '';

  cont.innerHTML = `
    ${avisoViejos}
    ${cabecera('Torneo de amigos', 'Fecha ' + (D.fechaObjetivo ?? '–') + ' · ' + eqs.length + (eqs.length === 1 ? ' equipo' : ' equipos'),
      `<div class="est ${enJuego ? 'est-abierta' : 'est-neutra'}" title="${esc(VIVO
        ? 'Bajado el ' + fechaCorta(VIVO.generado) + '. Corré SYNC_VIVO.bat para actualizar.'
        : 'Corré SYNC_VIVO.bat para bajar los puntajes de esta fecha.')}">
        <span class="est-lbl">${enJuego ? 'en vivo' : 'puntajes'}</span><b>${esc(estadoFecha)}</b></div>`)}

    ${!ms.length ? `<div class="card tr-card vac">
      <div class="vac-ic">🏆</div>
      <h2>Todavía no hay torneo cargado</h2>
      <p>Entrá a tu torneo en el Gran DT, copiá la tabla entera y pegala acá: salen todos los DTs con su nombre,
      su equipo y sus puntos. Después le cargás el once a cada uno y esto se llena solo cada domingo.</p>
      <div class="vac-btns">
        <button class="vs-btn vs-btn-fuerte" onclick="abrirCargarGranDT()">Pegar la tabla del Gran DT</button>
        <button class="vs-btn" onclick="abrirNuevoEquipoLibre()">o cargar un equipo suelto</button>
      </div>
      <p class="vac-nota">Tu once y el del motor no entran acá: están más abajo, en <b>el laboratorio</b>.</p>
    </div>` : ''}
    ${bloquePodio(ms, ch)}
    ${bloqueTitulares(ms, _PROP, ch)}

    <div class="card lg-card"${!ms.length ? ' hidden' : ''}>
      <table class="data-table lg-tabla">
        <thead><tr>
          <th class="text-center"></th><th>Equipo</th>
          <th class="text-center">Jugaron</th>
          <th class="text-center" title="Lo que suma el equipo en el juego: los puntos de los jugadores más lo que paga la cinta. La columna de al lado dice cuánto de esto es la cinta.">Puntos</th>
          <th class="text-center" title="Cuánto aporta el capitán. Ya está sumado en Puntos, no va aparte. La cinta duplica sólo la ficha de Clarín (del 1 al 10), no el puntaje entero.">de eso, la cinta</th>
          <th class="text-center">Proyección</th>
          <th>Chance de ganar la fecha</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${S.ligaHayNueva ? `<div class="lg-perdidos lg-nueva">
        Hay una <b>versión más nueva</b> del torneo publicada con la app${LIGA_BASE.fecha != null ? ' (fecha ' + LIGA_BASE.fecha + ')' : ''}.
        No te la traje sola para no pisarte lo que tengas cargado.
        <button class="vs-btn vs-btn-chico" onclick="traerLigaPublicada()">traer la publicada</button>
      </div>` : ''}
      ${(S.ligaPerdidos && S.ligaPerdidos.length) ? `<div class="lg-perdidos">
        <b>Ojo:</b> ${S.ligaPerdidos.map(x => x.n + ' jugador' + (x.n > 1 ? 'es' : '') + ' de <b>' + esc(x.eq) + '</b>').join(', ')}
        ${S.ligaPerdidos.length === 1 && S.ligaPerdidos[0].n === 1 ? 'no está' : 'no están'} en el <code>datos.js</code> de ahora.
        Suele pasar cuando cambian de club o cuando Planeta publica una planilla nueva. Quedaron como huecos en la cancha:
        completalos tocándolos. <b>No les puse a otro jugador en el lugar.</b>
      </div>` : ''}
      ${sueltos.length ? `<div class="lg-perdidos">
        <b>${sueltos.length} equipo${sueltos.length > 1 ? 's' : ''} suelto${sueltos.length > 1 ? 's' : ''}</b>
        que no ${sueltos.length > 1 ? 'corresponden' : 'corresponde'} a ningún DT del torneo — probablemente ${sueltos.length > 1 ? 'los creaste' : 'lo creaste'} a mano antes de cargar la tabla.
        ${sueltos.map(m => `<span class="su-eq">${esc(m.t.nombre)}
          <button class="op-link" onclick="asignarADT('${m.t.id}')">asignar a un DT</button>
          <button class="op-link su-borrar" onclick="borrarEquipo('${m.t.id}')">borrar</button></span>`).join('')}
      </div>` : ''}
      <div class="lg-acciones">
        <button class="vs-btn vs-btn-fuerte" id="lg-nuevo">+ Agregar equipo</button>
        <button class="vs-btn lg-mas" id="lg-menu" title="Compartir, importar y cómo se calcula">···</button>
      </div>
    </div>

    ${bloqueFechaPasada()}
    ${bloqueLaboratorio(msLab, ms)}
    ${bloqueCaraACara(ms.concat(msLab))}
    ${bloquePropiedad(ms, _PROP)}
    ${bloqueCampeonato(ms)}`;

  cont.querySelectorAll('[data-abrir]').forEach(tr => tr.onclick = ev => {
    if (ev.target.closest('input,select,button,.lg-detalle')) return;
    S.ligaAbierto = (S.ligaAbierto === tr.dataset.abrir) ? null : tr.dataset.abrir;
    pintarPantallaLiga();
  });
  eventosDetalle(cont);
  cont.querySelectorAll('[data-cara]').forEach(sl => sl.onchange = () => {
    if (sl.dataset.cara === 'a') S.caraA = sl.value; else S.caraB = sl.value;
    pintarPantallaLiga();
  });
  { const b = $('lg-nuevo'); if (b) b.onclick = () => abrirNuevoEquipo(); }
  { const b = $('cmp-cargar'); if (b) b.onclick = () => abrirCargarGranDT(); }
  { const i = $('lab-mis'); if (i) { i.onclick = e => e.stopPropagation();
      i.onchange = () => ponerMisPuntos(i.value.trim()); } }
  { const b = $('lg-menu'); if (b) b.onclick = () => menuTorneo(); }
}

// ── EL DETALLE DE UN EQUIPO ────────────────────────────────────────────────
function detalleEquipo(m) {
  const t = m.t, editable = !t.motor;
  const once = onceDe(t) || [];
  const capId = capDe(t);
  const porPos = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  if (editable) {
    const c = cuentaPos(esqDe(t) || '1-4-4-2');
    const ya = { ARQ: [], DEF: [], VOL: [], DEL: [] };
    once.forEach(id => { const p = TODOS[id]; if (p) ya[p.pos].push(p); });
    PUESTOS.forEach(pos => {
      const a = ya[pos].slice(0, c[pos]);
      while (a.length < c[pos]) a.push(null);
      a.forEach((p, i) => porPos[pos].push(fichaLiga(
        p ? (m.det.find(x => x.p.id === p.id) || { p, estado: 'falta' }) : { p: null },
        { editable: true, cap: capId === (p && p.id), pos, idx: i })));
    });
  } else {
    const o = { ARQ: [], DEF: [], VOL: [], DEL: [] };
    m.det.forEach(d => o[d.p.pos].push(d));
    Object.values(o).forEach(a => a.sort((x, y) =>
      (y.p.epsj != null ? y.p.epsj : y.p.ep) - (x.p.epsj != null ? x.p.epsj : x.p.ep)));
    PUESTOS.forEach(pos => o[pos].forEach(d => porPos[pos].push(fichaLiga(d, { cap: capId === d.p.id }))));
  }

  const cap = TODOS[capId];
  const cintaEdit = (cap && m.cinta.estado !== 'perdida' && m.cinta.estado !== 'falta') ? `
    <label class="lg-ficha-in" title="${esc('La ficha de Clarín del capitán, del 1 al 10. La cinta la duplica, así que este número se suma una vez más. ' +
      'Escribilo si Planeta no la publicó y el total va a coincidir exacto con el del juego.')}">
      Ficha de ${esc(nombreCorto(cap.n))}
      <input type="number" step="0.5" min="-5" max="10" value="${m.cinta.estado === 'mano' || m.cinta.estado === 'clarin' ? m.cinta.valor : ''}"
        placeholder="—" data-ficha="${capId}">
      ${m.cinta.estado === 'clarin' ? '<small>la publicó Planeta</small>' : (m.cinta.estado === 'mano' ? '<small>cargada por vos</small>' : '<small>Planeta no la publicó</small>')}
    </label>` : (cap && m.cinta.estado === 'perdida'
      ? `<div class="lg-ficha-in lg-ficha-mal">La cinta de <b>${esc(nombreCorto(cap.n))}</b> se perdió: no jugó.
         <small>Por reglamento el suplente que lo reemplaza no duplica su ficha.</small></div>` : '');

  return `<div class="lg-detalle">
    <div class="lg-det-cab">
      <div>
        <b>${esc(t.nombre)}</b>
        <span class="text-muted">${m.jugaron} de ${m.n} jugaron · ${n1(m.real)} de los jugadores${m.cinta.valor ? ' + ' + n1(m.cinta.valor) + ' de la cinta' : ''}
        · cuesta $${(m.costo / 1e6).toFixed(1)}M</span>
      </div>
      ${editable ? `<div class="vs-herr">
        <select class="vs-sel" data-esq="${t.id}" title="Formación">
          ${ESQUEMAS_11.map(e => `<option value="${e}"${e === esqDe(t) ? ' selected' : ''}>${esquemaLindo(e)}</option>`).join('')}
        </select>
        <button class="vs-btn vs-btn-chico" data-pegar="${t.id}">pegar lista</button>
        <button class="vs-btn vs-btn-chico" onclick="copiarDeOtro('${t.id}')">copiar de otro</button>
        <button class="vs-btn vs-btn-chico" data-renombrar="${t.id}">renombrar</button>
        ${t.mio ? '' : `<button class="vs-btn vs-btn-chico" data-borrar="${t.id}">borrar equipo</button>`}
      </div>` : '<span class="text-muted lg-det-nota">Es el once que está puesto en Mejor 11. Se edita ahí.</span>'}
    </div>
    <div class="lg-det-cuerpo">
      <div class="lg-cancha">${['DEL', 'VOL', 'DEF', 'ARQ'].map(pos =>
        porPos[pos].length ? `<div class="lg-linea">${porPos[pos].join('')}</div>` : '').join('')}</div>
      <div class="lg-lateral">
        <div class="lg-banco">
          <div class="lg-banco-tit">Suplentes
            <small>uno por puesto. Si un titular no juega 20 minutos, entra el de su puesto — y solo por uno.</small></div>
          <div class="lg-banco-fichas">${PUESTOS.map(pos => {
            const b = m.banquito.find(x => x.pos === pos) || { pos, p: null };
            return fichaLiga(b, { editable, banco: true, pos: 'B' + pos, idx: 0 });
          }).join('')}</div>
        </div>
        ${cintaEdit}
        ${m.entraron.length ? `<div class="lg-entraron">
          ${m.entraron.map(e => `<div><b>${esc(APELLIDO(e.entra.n))}</b> entró por ${esc(APELLIDO(e.sale.n))}
            <span>+${e.pts}</span></div>`).join('')}
        </div>` : ''}
      </div>
    </div>
    ${bloqueAportes(m, _PROP)}
  </div>`;
}

function eventosDetalle(cont) {
  const eqDe = id => equiposLiga().find(x => x.id === id);
  cont.querySelectorAll('[data-slot]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const t = eqDe(S.ligaAbierto); if (!t) return;
    const [pos] = b.dataset.slot.split(':');
    elegirParaLiga(t, pos.replace(/^B/, ''), pos[0] === 'B' && pos.length > 1, null);
  });
  cont.querySelectorAll('[data-jug]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const t = eqDe(S.ligaAbierto); if (!t || t.motor) return;
    const id = b.dataset.jug, p = TODOS[id];
    const esBanco = Object.values(t.banco || {}).includes(id);
    elegirParaLiga(t, p.pos, esBanco, id);
  });
  cont.querySelectorAll('[data-sacar]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const t = eqDe(S.ligaAbierto); if (!t || t.motor) return;
    const id = b.dataset.sacar;
    PUESTOS.forEach(pos => { if (t.banco[pos] === id) delete t.banco[pos]; });
    ponerOnce(t, (onceDe(t) || []).filter(x => x !== id));
    if (capDe(t) === id) ponerCap(t, null);
    guardarLiga(); pintarPantallaLiga();
  });
  cont.querySelectorAll('[data-cap]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const t = eqDe(S.ligaAbierto); if (!t || t.motor) return;
    ponerCap(t, b.dataset.cap); guardarLiga(); pintarPantallaLiga();
  });
  cont.querySelectorAll('[data-esq]').forEach(s => s.onchange = ev => {
    ev.stopPropagation();
    const t = eqDe(s.dataset.esq); if (!t) return;
    ponerEsq(t, s.value); recortarAEsquema(t); guardarLiga(); pintarPantallaLiga();
  });
  cont.querySelectorAll('[data-ficha]').forEach(inp => {
    inp.onclick = ev => ev.stopPropagation();
    inp.onchange = () => {
      const v = inp.value.trim();
      ponerFichaManual(inp.dataset.ficha, v === '' ? null : Number(v.replace(',', '.')));
      pintarPantallaLiga();
    };
  });
  cont.querySelectorAll('[data-pegar]').forEach(b => b.onclick = ev => {
    ev.stopPropagation(); abrirPegar(b.dataset.pegar);
  });
  cont.querySelectorAll('[data-renombrar]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const t = eqDe(b.dataset.renombrar); if (!t) return;
    const n = prompt('Nombre del equipo', t.nombre);
    if (n && n.trim()) { t.nombre = n.trim().slice(0, 30); guardarLiga(); pintarPantallaLiga(); }
  });
  cont.querySelectorAll('[data-borrar]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const t = eqDe(b.dataset.borrar); if (!t || t.mio || t.motor) return;
    if (!confirm('¿Borrar el equipo "' + t.nombre + '"? No se puede deshacer.')) return;
    S.liga.equipos = S.liga.equipos.filter(x => x.id !== t.id);
    S.ligaAbierto = null; guardarLiga(); pintarPantallaLiga();
  });
}

// ── escribir en un equipo (el mio comparte estado con el Versus del inicio) ──
function ponerOnce(t, ids) {
  // tocar el once lo deja "sin revisar" otra vez: es la señal de que hay algo
  // a medio hacer, y es lo que evita dar por bueno un equipo a medias
  if (t.mio) { S.mi11 = ids; guardarMi11(); } else { t.once = ids; t.revisado = null; }
}
function ponerCap(t, id) { if (t.mio) { S.miCap = id; guardarMi11(); } else t.cap = id; }
function ponerEsq(t, e) { if (t.mio) { S.miEsq = e; guardarMi11(); } else t.esq = e; }
function recortarAEsquema(t) {
  const c = cuentaPos(esqDe(t) || '1-4-4-2'), ya = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  (onceDe(t) || []).forEach(id => { const p = TODOS[id]; if (p) ya[p.pos].push(p); });
  ponerOnce(t, PUESTOS.flatMap(pos => ya[pos].slice(0, c[pos]).map(p => p.id)));
  if (capDe(t) && !(onceDe(t) || []).includes(capDe(t))) ponerCap(t, null);
}
window.elegirParaLiga = function (t, pos, esBanco, saliendo) {
  abrirSelector({
    pos, actual: saliendo || null,
    excluidos: new Set((onceDe(t) || []).concat(Object.values(t.banco || {}))),
    titulo: (esBanco ? 'Suplente ' : '') + NOMBRE_POS_SING[pos] + ' para ' + esc(t.nombre),
    nota: esBanco
      ? 'El suplente entra solo si un titular de este puesto no juega 20 minutos. Es uno por puesto: si se te caen dos, entra por uno.'
      : null,
    onElegir: id => ponerEnLiga(t.id, pos, esBanco ? 1 : 0, saliendo || '', id)
  });
};
window.ponerEnLiga = function (tid, pos, esBanco, saliendo, entra) {
  const t = equiposLiga().find(x => x.id === tid); if (!t) return;
  if (esBanco) { t.banco = t.banco || {}; t.banco[pos] = entra; }
  else if (saliendo) {
    ponerOnce(t, (onceDe(t) || []).map(id => id === saliendo ? entra : id));
    if (capDe(t) === saliendo) ponerCap(t, entra);
  } else ponerOnce(t, (onceDe(t) || []).concat([entra]));
  recortarAEsquema(t);
  guardarLiga();
  cerrarModal($('team-detail-modal'));
  pintarPantallaLiga();
};

// ── PEGAR UNA LISTA ────────────────────────────────────────────────────────
let _PROP = null;
// ALTA DE EQUIPO EN DOS CLICS.
// Antes lo unico que habia era pegar la lista, y si no la tenias a mano no
// podias empezar. Ahora se crea con el nombre y listo: el equipo aparece
// abierto en la tabla y se completa tocando los huecos, con el buscador.
window.traerLigaPublicada = function () {
  if (!LIGA_BASE) return;
  if (!confirm('Traer la liga publicada reemplaza los equipos que tengas cargados acá ' +
    '(tu propio equipo no se toca). ¿Seguimos?')) return;
  S.liga.equipos = S.liga.equipos.filter(t => t.mio).concat(equiposDesdePaquete(LIGA_BASE));
  S.liga.fichas = Object.assign({}, S.liga.fichas || {}, LIGA_BASE.fichas || {});
  if (LIGA_BASE.dts && LIGA_BASE.dts.length) S.liga.dts = LIGA_BASE.dts;
  if (LIGA_BASE.camp) S.liga.camp = LIGA_BASE.camp;
  S.liga.publicado = LIGA_BASE.publicado || null;
  S.ligaHayNueva = false;
  guardarLiga(); cargarLiga(); pintarPantallaLiga();
};

window.modoAnalista = function (v) {
  S.analista = !!v;
  try { localStorage.setItem('gdt_analista', v ? '1' : '0'); } catch (e) { }
  pintarRankings();
};

window.abrirNuevoEquipo = function () {
  // Si el torneo ya esta cargado desde el Gran DT, los DTs son estos y no hay
  // que escribir ningun nombre: se elige de la lista. Escribir "Nacho" a mano
  // cada fecha era trabajo que la app ya tenia hecho y no usaba.
  const dts = (S.liga.dts || []).filter(d => !(S.liga.equipos || []).some(t => t.dt === d.id));
  if ((S.liga.dts || []).length) {
    $('team-detail-title').innerHTML = 'Cargar el once de un DT';
    $('team-detail-body').innerHTML = `
      <p class="exp-txt">Estos son los <b>${S.liga.dts.length}</b> del torneo, como los trajo la tabla del Gran DT.
      Elegí a quién cargarle el once.</p>
      ${dts.length ? `<div class="dt-lista">${dts.map(d => `
        <button class="dt-fila" onclick="abrirParaDT('${d.id}')">
          <span class="dt-eq">${esc(d.equipo)}<small>${esc(d.persona)}</small></span>
          <span class="dt-pts">${(S.liga.camp && S.liga.camp.general[d.id]) ? S.liga.camp.general[d.id].pts + ' pts' : ''}</span>
        </button>`).join('')}</div>`
        : '<p class="exp-txt">Ya están los onces de los ' + S.liga.dts.length + ' cargados.</p>'}
      <p class="exp-txt exp-nota">Elegís uno y se abre para <b>pegar la lista</b> tal como te la pasaron.
      ¿Falta alguien o entró uno nuevo al torneo? Volvé a pegar la tabla del Gran DT con <b>actualizar</b>
      y aparece solo. O <button class="op-link" onclick="abrirNuevoEquipoLibre()">cargá uno que no está en la tabla</button>.</p>`;
    abrirModal('team-detail-modal');
    return;
  }
  abrirNuevoEquipoLibre();
};

window.abrirNuevoEquipoLibre = function () {
  $('team-detail-title').innerHTML = 'Nuevo equipo';
  $('team-detail-body').innerHTML = `
    <div class="ne-caja">
      <label class="ne-lbl">¿De quién es el equipo?
        <input type="text" id="ne-nombre" maxlength="30" placeholder="Nacho" autocomplete="off"></label>
      <div class="ne-btns">
        <button class="vs-btn vs-btn-fuerte" id="ne-pegar">Crear y pegar la lista</button>
        <button class="vs-btn" id="ne-mano">armarlo a mano</button>
      </div>
      <p class="ne-nota">Pegar la lista es lo más rápido: sale de la foto que te pasan por el grupo.
      A mano son quince búsquedas cortas, tocando cada hueco de la cancha.</p>
    </div>`;
  abrirModal('team-detail-modal');
  const inp = $('ne-nombre');
  const crear = () => {
    const n = (inp.value || '').trim() || 'Equipo';
    const t = { id: 'e' + Date.now().toString(36), nombre: n, esq: '1-4-4-2', once: [], banco: {}, fichas: {} };
    S.liga.equipos.push(t); guardarLiga();
    S.ligaAbierto = t.id;
    cerrarModal($('team-detail-modal'));
    pintarPantallaLiga();
    setTimeout(() => { const f = document.querySelector('.lg-abierta'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
  };
  $('ne-mano').onclick = crear;
  $('ne-pegar').onclick = () => abrirPegar(null, (inp.value || '').trim());
  inp.onkeydown = e => { if (e.key === 'Enter') crear(); };
  setTimeout(() => { try { inp.focus(); } catch (e) { } }, 60);
};

let _pegado = null;
window.abrirPegar = function (tid, nombreSugerido) {
  _pegado = { tid, filas: null };
  const t = tid ? equiposLiga().find(x => x.id === tid) : null;
  const nombrePrevio = t ? t.nombre : (nombreSugerido || '');
  $('team-detail-title').innerHTML = t ? 'Pegar el equipo de ' + esc(t.nombre) : 'Agregar un equipo';
  $('team-detail-body').innerHTML = `
    <p class="exp-txt">Pegá la lista como la ves en el juego: <b>un jugador por línea</b>, el capitán con
    <b>(C)</b> al final, y la palabra <b>Suplentes:</b> antes de los cuatro del banco. Da igual si sobran
    números o puntajes al costado, se limpian solos.</p>
    <div class="lg-pegar">
      <label>Nombre del equipo
        <input type="text" id="lg-p-nombre" maxlength="30" value="${esc(nombrePrevio)}" placeholder="Los Pibes FC"></label>
      <textarea id="lg-p-txt" rows="16" placeholder="Rodrigo Rey
Marcos Rojo
...
Ángel Correa (C)
Suplentes:
Facundo Cambeses
Elías Gómez
Manuel Lanzini
Adrián Martínez"></textarea>
      <button class="vs-btn vs-btn-fuerte" id="lg-p-leer">Leer la lista</button>
    </div>
    <div id="lg-p-res"></div>
    <p class="exp-txt exp-nota">¿No la tenés escrita?
      <button class="op-link" onclick="armarAMano('${tid || ''}')">armalo tocando la cancha</button></p>`;
  abrirModal('team-detail-modal');
  $('lg-p-leer').onclick = () => {
    // NO PERDER LO QUE YA ELEGISTE (13/09). Uno lee la lista, resuelve a mano
    // los tres apellidos repetidos, se da cuenta de que escribio mal un cuarto,
    // lo corrige arriba y vuelve a apretar "Leer la lista"... y perdia los tres
    // que ya habia resuelto. Se guardan por el texto de la linea y se vuelven a
    // aplicar si ese jugador sigue siendo un candidato posible para esa linea.
    const previas = {};
    if (_pegado.filas) {
      [].concat(_pegado.filas.titulares, _pegado.filas.suplentes)
        .forEach(f => { if (f.elegido) previas[f.texto.toLowerCase()] = f.elegido; });
    }
    const r = leerPegado($('lg-p-txt').value);
    [].concat(r.titulares, r.suplentes).forEach(f => {
      const y = previas[f.texto.toLowerCase()];
      if (!f.elegido && y && f.cands.some(c => c.id === y)) f.elegido = y;
    });
    _pegado.filas = r;
    pintarPegado();
  };
};
function pintarPegado() {
  const r = _pegado.filas;
  const total = r.titulares.length + r.suplentes.length;
  const ok = [...r.titulares, ...r.suplentes].filter(f => f.elegido).length;
  const fila = (f, i, banco) => `<tr>
    <td>${esc(f.texto)}${f.cap ? ' <span class="lg-tag">C</span>' : ''}</td>
    <td>${f.cands.length === 0
      ? '<span class="lg-cinta-mal">no lo encontré</span>'
      : `<select data-fila="${banco ? 'S' : 'T'}:${i}">
          ${f.cands.length > 1 ? '<option value="">— elegí —</option>' : ''}
          ${f.cands.slice(0, 12).map(p => `<option value="${p.id}"${p.id === f.elegido ? ' selected' : ''}>${esc(p.n)} · ${esc(NOM(p.eq))} · ${p.pos}</option>`).join('')}
        </select>`}</td></tr>`;
  $('lg-p-res').innerHTML = `
    <p class="exp-txt"><b>${ok}</b> de ${total} cruzaron solos.
    ${ok < total ? 'Los que quedaron con un desplegable tienen más de un candidato o ninguno: elegí o dejalos afuera. Prefiero preguntarte antes que ponerte a otro jugador.' : ''}</p>
    <table class="data-table"><thead><tr><th>Lo que pegaste</th><th>Quién es</th></tr></thead>
      <tbody>${r.titulares.map((f, i) => fila(f, i, false)).join('')}
      ${r.suplentes.length ? `<tr><td colspan="2" class="lg-sep">Suplentes</td></tr>` : ''}
      ${r.suplentes.map((f, i) => fila(f, i, true)).join('')}</tbody></table>
    <button class="vs-btn vs-btn-fuerte" id="lg-p-guardar">Guardar el equipo</button>`;
  $('lg-p-res').querySelectorAll('[data-fila]').forEach(s => s.onchange = () => {
    const [tipo, i] = s.dataset.fila.split(':');
    (tipo === 'T' ? _pegado.filas.titulares : _pegado.filas.suplentes)[+i].elegido = s.value || null;
  });
  $('lg-p-guardar').onclick = guardarPegado;
}
function guardarPegado() {
  const r = _pegado.filas;
  const nombre = ($('lg-p-nombre').value || '').trim() || 'Equipo';
  // SI PEGASTE QUINCE Y NO ESCRIBISTE "Suplentes:", LOS CUATRO ULTIMOS SON EL
  // BANCO (13/09). Es lo que significa una lista de quince y es como la copia
  // el juego. Antes entraban los quince como titulares y la cancha se rompia.
  let filasTit = r.titulares.slice(), filasSup = r.suplentes.slice();
  if (!filasSup.length && filasTit.length > 11) {
    filasSup = filasTit.slice(11);
    filasTit = filasTit.slice(0, 11);
  }
  const tit = filasTit.map(f => f.elegido).filter(Boolean);
  const banco = {};
  filasSup.forEach(f => { const p = TODOS[f.elegido]; if (p && !banco[p.pos]) banco[p.pos] = p.id; });
  const capFila = filasTit.find(f => f.cap) || filasSup.find(f => f.cap);
  const cap = capFila && capFila.elegido ? capFila.elegido : null;
  // la formacion sale de los puestos que pegaste, no de una lista fija
  const c = { ARQ: 0, DEF: 0, VOL: 0, DEL: 0 };
  tit.forEach(id => { const p = TODOS[id]; if (p) c[p.pos]++; });
  const esqCrudo = [c.ARQ, c.DEF, c.VOL, c.DEL].join('-');
  // ...pero tiene que ser una de las diez del juego. Si no cruzaron todos, o
  // pegaste dos arqueros, el esquema crudo no se puede dibujar.
  const esq = esquemaValido(esqCrudo);
  let t = _pegado.tid ? equiposLiga().find(x => x.id === _pegado.tid) : null;
  if (!t) {
    t = { id: 'e' + Date.now().toString(36), nombre, once: [], banco: {}, fichas: {} };
    S.liga.equipos.push(t);
  }
  t.nombre = nombre;
  ponerEsq(t, esq);
  ponerOnce(t, tit);
  ponerCap(t, cap);
  t.banco = banco;
  guardarLiga();
  cerrarModal($('team-detail-modal'));
  // Si lo que se pego es el once propio, el que hay que repintar es el Versus
  // de "La fecha": es donde vive. Sin esto se guardaba bien y no se veia nada.
  if (t.mio) { normalizarMi11(); pintarPantallaFecha(); }
  else S.ligaAbierto = t.id;
  pintarPantallaLiga();
  if (tit.length !== 11 || esq !== esqCrudo) setTimeout(() => {
    const l = [];
    if (tit.length !== 11) l.push('Quedaron ' + tit.length + ' titulares, no 11. Los que no cruzaron quedaron afuera: completalos tocando los huecos de la cancha.');
    if (esq !== esqCrudo) l.push('La formacion que salia de la lista (' + esqCrudo + ') no es una de las del juego, asi que la puse en ' + esq + '.');
    alert(l.join('\n\n'));
  }, 60);
}

// ── pasarle la liga a alguien ──────────────────────────────────────────────
// El paquete de la liga, listo para viajar. Va por clave estable (nombre + club
// + puesto), no por id: los id son el numero de fila de la planilla de Planeta
// y cambian cada fecha, asi que un id no significa nada en la maquina de otro.
function paqueteLiga(nombreMio) {
  return {
    v: 5, fecha: D.fechaObjetivo, publicado: new Date().toISOString(),
    fichas: S.liga.fichas || {}, dts: S.liga.dts || [], camp: S.liga.camp || null,
    equipos: S.liga.equipos.map(t => {
      const kBanco = {};
      PUESTOS.forEach(pos => { const k = claveDe((t.banco || {})[pos]); if (k) kBanco[pos] = k; });
      return {
        // El equipo propio viaja como uno mas y SIN la marca de "mio": para tu
        // amigo, tu equipo no es el suyo. Cada uno conserva el propio.
        nombre: (t.mio && nombreMio) ? nombreMio : t.nombre, dt: t.dt || null,
        esq: esqDe(t), kOnce: clavesDesdeIds(onceDe(t)), kCap: claveDe(capDe(t)), kBanco,
        // los nombres van al lado para que el archivo se entienda al abrirlo
        nombres: (onceDe(t) || []).map(id => (TODOS[id] || {}).n || id)
      };
    })
  };
}

function exportarLiga() {
  const tMio = S.liga.equipos.find(x => x.mio);
  const sinNombre = tMio && (!tMio.nombre || tMio.nombre === 'El mío');
  $('team-detail-title').innerHTML = 'Compartir el torneo';
  $('team-detail-body').innerHTML = `
    <p class="exp-txt">Los equipos viven <b>en tu navegador</b>: si le pasás la app a un amigo, él la abre y
    no ve ninguno. Hay dos formas de que los vea.</p>

    <div class="cp-caja">
      <h4>1 · Publicarlos con la app <span class="cp-tag">recomendado</span></h4>
      <p>Bajás el archivo <code>dataLiga.js</code>, lo dejás en la carpeta del proyecto y corrés
      <b>SUBIR_A_GITHUB.bat</b>. A partir de ahí, el que entre a tu página <b>ve todos los equipos y los
      puntajes al día</b>, sin tocar nada. Lo que cada uno modifique queda sólo en su navegador: tu versión
      publicada no se la puede romper nadie.</p>
      <label class="cp-lbl">Tu equipo se va a publicar con este nombre
        <input type="text" id="cp-nombre" maxlength="30" value="${esc(tMio ? tMio.nombre : 'El mío')}"
          class="${sinNombre ? 'cp-ojo' : ''}"></label>
      ${sinNombre ? '<p class="cp-aviso">Poné tu nombre: a tus amigos «El mío» no les va a decir nada.</p>' : ''}
      <button class="vs-btn vs-btn-fuerte" id="cp-bajar">Bajar dataLiga.js</button>
    </div>

    <div class="cp-caja">
      <h4>2 · Pasarles el texto</h4>
      <p>Si no querés publicar, copiá esto y que lo peguen en <b>importar</b>. Hay que rehacerlo cada vez
      que cambie algo.</p>
      <textarea class="exp-json" id="cp-json" readonly onclick="this.select()"></textarea>
    </div>`;
  abrirModal('team-detail-modal');
  const refrescar = () => {
    const n = ($('cp-nombre').value || '').trim() || 'El mío';
    $('cp-json').value = JSON.stringify(paqueteLiga(n));
  };
  $('cp-nombre').oninput = refrescar;
  refrescar();
  $('cp-bajar').onclick = () => {
    const n = ($('cp-nombre').value || '').trim() || 'El mío';
    const cuerpo = '// dataLiga.js — los equipos del torneo de amigos, para que los vea todo el que abra la app.\n' +
      '// Lo genera el boton "compartir" del Torneo de amigos. Se puede volver a bajar cuando cambie algo.\n' +
      '// Cada uno puede editar lo que quiera en SU navegador: esto no se toca.\n' +
      'window.LIGA_BASE=' + JSON.stringify(paqueteLiga(n)) + ';\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([cuerpo], { type: 'text/javascript' }));
    a.download = 'dataLiga.js';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
}
function importarLiga() {
  $('team-detail-title').innerHTML = 'Importar una liga';
  $('team-detail-body').innerHTML = `
    <p class="exp-txt">Pegá acá lo que te pasaron. <b>Reemplaza</b> los equipos que tengas cargados.</p>
    <textarea class="exp-json" id="lg-imp"></textarea>
    <button class="vs-btn vs-btn-fuerte" id="lg-imp-ok">Importar</button>`;
  abrirModal('team-detail-modal');
  $('lg-imp-ok').onclick = () => {
    let d; try { d = JSON.parse($('lg-imp').value); } catch (e) { alert('Eso no es una liga válida.'); return; }
    if (!d || !Array.isArray(d.equipos)) { alert('Eso no es una liga válida.'); return; }
    let perdidos = 0;
    if (d.fichas) S.liga.fichas = Object.assign(S.liga.fichas || {}, d.fichas);
    S.liga.equipos = d.equipos.map((t, i) => {
      // v2 viaja por clave; v1 (por id) se acepta pero solo sirve si el otro
      // corrio el motor con la misma planilla, asi que se avisa.
      const q = t.kOnce ? idsDesdeClaves(t.kOnce)
                        : { ids: (t.once || []).filter(x => TODOS[x]), perdidas: [] };
      perdidos += q.perdidas.length;
      const banco = {};
      PUESTOS.forEach(pos => {
        const k = (t.kBanco || {})[pos];
        if (k) { const p = porClave(k); if (p) banco[pos] = p.id; }
        else if (t.banco && t.banco[pos] && TODOS[t.banco[pos]]) banco[pos] = t.banco[pos];
      });
      const cap = t.kCap ? ((porClave(t.kCap) || {}).id || null) : (TODOS[t.cap] ? t.cap : null);
      return { id: 'e' + Date.now().toString(36) + i, nombre: t.nombre || ('Equipo ' + (i + 1)),
               mio: !!t.mio, esq: t.esq, cap, once: q.ids, banco, fichas: t.fichas || {} };
    });
    const mio = S.liga.equipos.find(x => x.mio);
    if (mio) { S.mi11 = mio.once; S.miCap = mio.cap; S.miEsq = mio.esq; mio.once = []; guardarMi11(); }
    else S.liga.equipos.unshift({ id: '__mio', nombre: 'El mío', mio: true, once: [], banco: {}, fichas: {} });
    if (perdidos) alert('Importé la liga, pero ' + perdidos + ' jugador(es) no los encontré en tu datos.js.\n' +
      'Suele ser porque cambiaron de club o porque tu planilla es más vieja. Quedaron como huecos en la cancha.');
    guardarLiga();
    cerrarModal($('team-detail-modal'));
    pintarPantallaLiga();
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  EL SELECTOR DE JUGADORES, CON BUSCADOR
//  Antes cada lugar donde habia que elegir un jugador tiraba la lista entera
//  del puesto ordenada por puntos: para poner a Adrián Martínez habia que
//  bajar por sesenta delanteros. Ahora hay UN solo selector, con buscador por
//  nombre o por club, y lo usan los tres lugares que eligen jugadores: el
//  Mejor 11, el Versus del inicio y el Torneo de amigos.
// ════════════════════════════════════════════════════════════════════════════
let _SEL = null;
const _qn = s => (s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

window.abrirSelector = function (op) {
  // op: {pos, titulo, nota, excluidos:Set, actual:id, onElegir:fn}
  _SEL = op;
  $('team-detail-title').innerHTML = op.titulo;
  $('team-detail-body').innerHTML = `
    <div class="sel-barra">
      <input type="text" id="sel-q" class="sel-q" autocomplete="off" spellcheck="false"
        placeholder="Buscar por apellido, nombre o club…">
      <span class="sel-cnt" id="sel-cnt"></span>
    </div>
    ${op.nota ? `<p class="sel-nota">${op.nota}</p>` : ''}
    <div id="sel-lista" class="sel-lista"></div>`;
  abrirModal('team-detail-modal');
  const inp = $('sel-q');
  inp.oninput = () => pintarSelector();
  inp.onkeydown = e => {
    // Enter elige al primero de la lista: escribís "adri" y ya está.
    if (e.key !== 'Enter') return;
    const b = $('sel-lista').querySelector('[data-sel]');
    if (b) b.click();
  };
  $('sel-lista').onclick = e => {
    const b = e.target.closest('[data-sel]'); if (!b) return;
    const id = b.dataset.sel, fn = _SEL && _SEL.onElegir;
    cerrarModal($('team-detail-modal'));
    if (fn) fn(id);
  };
  pintarSelector();
  setTimeout(() => { try { inp.focus(); } catch (e) { } }, 60);
};

function pintarSelector() {
  if (!_SEL) return;
  const q = _qn(($('sel-q') || {}).value || '');
  const tok = q.split(' ').filter(Boolean);
  const ex = _SEL.excluidos || new Set();
  const base = (D.rankings[_SEL.pos] || []).filter(x => !ex.has(x.id) || x.id === _SEL.actual);
  const pega = x => {
    if (!tok.length) return true;
    const heno = _qn(x.n) + ' ' + _qn(NOM(x.eq)) + ' ' + _qn(SIGLA(x.eq));
    return tok.every(t => heno.includes(t));
  };
  const lista = base.filter(pega).sort((a, b) =>
    (b.epsj != null ? b.epsj : b.ep) - (a.epsj != null ? a.epsj : a.ep));
  const cnt = $('sel-cnt');
  if (cnt) cnt.textContent = lista.length + (lista.length === 1 ? ' jugador' : ' jugadores') +
    (tok.length ? ' de ' + base.length : '');
  const tope = tok.length ? 60 : 40;
  $('sel-lista').innerHTML = lista.length ? lista.slice(0, tope).map(x => {
    const v = vivoDe(x.id), res = resuelto(x);
    const vivo = res
      ? (v && v.p != null
        ? `<span class="sel-vivo sel-vivo-si" title="Ya jugó esta fecha.">${v.p}</span>`
        : `<span class="sel-vivo sel-vivo-no" title="Su partido ya se jugó y no sumó.">0</span>`)
      : (VIVO ? '<span class="sel-vivo sel-vivo-falta" title="Todavía no jugó su partido.">·</span>' : '');
    const baja = x.disp && x.disp.suspendido;
    return `<button class="sel-fila${x.id === _SEL.actual ? ' sel-actual' : ''}" data-sel="${x.id}"
        ${x.id === _SEL.actual ? 'disabled' : ''}>
      ${vivo}
      <span class="sel-nom">${esc(nombreCorto(x.n))}${baja ? '<i class="sel-baja" title="El Gran DT lo marca como que no juega">no juega</i>' : ''}
        <small>${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'de local' : 'de visitante'} vs ${esc(NOM(x.riv))}</small></span>
      <span class="sel-pr">${x.pr != null ? '$' + (x.pr / 1e6).toFixed(1) + 'M' : '—'}</span>
      <span class="sel-ep" title="Puntos que el motor espera de él si entra a la cancha.">${n2(x.epsj != null ? x.epsj : x.ep)}</span>
    </button>`;
  }).join('') + (lista.length > tope ? `<div class="sel-mas">…y ${lista.length - tope} más. Afiná la búsqueda.</div>` : '')
    : `<div class="sel-vacio">No hay ningún ${NOMBRE_POS_SING[_SEL.pos]} que coincida con “${esc(($('sel-q') || {}).value || '')}”.</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  TORNEO DE AMIGOS — analisis
//  Todo lo que sigue sale de dos cosas que ya estan: los puntajes publicados
//  (dataVivo.js) y los equipos cargados. Nada se estima salvo lo que falta
//  jugar, y eso va siempre dicho como esperado.
// ════════════════════════════════════════════════════════════════════════════

// Cuantos equipos del torneo tienen a cada jugador. Es el dato que convierte
// una tabla de puntos en una tabla de decisiones: 8 puntos de alguien que
// tienen todos no te acerca a nadie; 8 de uno que tenes solo vos, si.
function propiedadTorneo(ms) {
  const cuenta = {}, comoTitular = {};
  ms.forEach(m => {
    const ids = new Set((onceDe(m.t) || []).concat(Object.values(m.t.banco || {})));
    ids.forEach(id => { cuenta[id] = (cuenta[id] || 0) + 1; });
    (onceDe(m.t) || []).forEach(id => { comoTitular[id] = (comoTitular[id] || 0) + 1; });
  });
  return { cuenta, comoTitular, equipos: ms.length };
}

// Lo que aporto cada jugador de un equipo, ordenado. La cinta va sumada en la
// fila del capitan, que es donde el juego la cobra.
function aportesDe(m, prop) {
  const filas = [];
  m.det.forEach(d => filas.push({
    p: d.p, estado: d.estado, pts: d.pts,
    esperado: d.p.epsj != null ? d.p.epsj : (d.p.ep || 0),
    cinta: (m.cinta.id === d.p.id) ? m.cinta.valor : 0,
    cintaCobrada: (m.cinta.id === d.p.id) ? m.cinta.cobrada : false,
    banco: false
  }));
  m.banquito.forEach(b => {
    if (!b.p) return;
    if (b.estado !== 'entro' && b.estado !== 'entra-falta') return;   // los que esperan no aportan
    filas.push({
      p: b.p, estado: b.estado === 'entro' ? 'jugo' : 'falta', pts: b.pts,
      esperado: b.p.epsj != null ? b.p.epsj : (b.p.ep || 0),
      cinta: 0, banco: true, porQuien: b.porQuien
    });
  });
  filas.forEach(f => {
    f.suma = (f.estado === 'falta' ? f.esperado : (f.pts || 0)) + f.cinta;
    f.real = f.estado !== 'falta';
    // 0 es un valor real: un jugador del motor o del equipo propio puede no
    // estar en ningun equipo del torneo. Antes el || 1 lo disfrazaba de 1.
    f.tienen = prop ? (prop.cuenta[f.p.id] || 0) : 0;
  });
  return filas.sort((a, b) => b.suma - a.suma);
}

// ── CARA A CARA ────────────────────────────────────────────────────────────
// La cuenta que de verdad define una fecha entre dos equipos. Los jugadores
// que los dos tienen suman igual de los dos lados: no definen nada, por mas
// puntos que hagan. Lo unico que mueve la aguja son los que NO comparten.
function caraACara(mA, mB) {
  const idsA = new Set((onceDe(mA.t) || []));
  const idsB = new Set((onceDe(mB.t) || []));
  const comparten = [...idsA].filter(id => idsB.has(id)).map(id => TODOS[id]).filter(Boolean);
  const soloA = [...idsA].filter(id => !idsB.has(id)).map(id => TODOS[id]).filter(Boolean);
  const soloB = [...idsB].filter(id => !idsA.has(id)).map(id => TODOS[id]).filter(Boolean);
  const cuenta = (jug, m) => {
    let real = 0, esp = 0, faltan = 0, jugaron = 0;
    const det = jug.map(p => {
      const d = m.det.find(x => x.p.id === p.id) || { p, estado: 'falta', pts: null };
      const cinta = (m.cinta.id === p.id) ? m.cinta.valor : 0;
      if (d.estado === 'falta') { faltan++; esp += (p.epsj != null ? p.epsj : (p.ep || 0)) + cinta; }
      else { if (d.estado === 'jugo') jugaron++; real += (d.pts || 0) + cinta; }
      return { p, estado: d.estado, pts: d.pts, cinta };
    }).sort((x, y) => (y.pts != null ? y.pts : -1) - (x.pts != null ? x.pts : -1));
    return { det, real, esp, faltan, jugaron };
  };
  const cA = cuenta(soloA, mA), cB = cuenta(soloB, mB);
  const cC = cuenta(comparten, mA);
  return { comparten: cC, soloA: cA, soloB: cB, dif: cA.real - cB.real };
}

// ── LA VISTA ───────────────────────────────────────────────────────────────
function barraAporte(v, max) {
  const w = max > 0 ? Math.max(1, Math.round(100 * Math.abs(v) / max)) : 0;
  return `<span class="ap-barra${v < 0 ? ' ap-neg' : ''}"><i style="width:${w}%"></i></span>`;
}

function bloqueAportes(m, prop) {
  const filas = aportesDe(m, prop);
  if (!filas.length) return '<p class="tr-vacio">Este equipo todavía no tiene jugadores cargados.</p>';
  const max = Math.max(...filas.map(f => Math.abs(f.suma)), 1);
  const yaJugaron = filas.filter(f => f.real);
  const faltan = filas.filter(f => !f.real);
  const etiqueta = f => {
    if (f.banco) return `<span class="ap-tag ap-tag-banco" title="${esc('Entró por ' + (f.porQuien ? nombreCorto(f.porQuien.n) : 'un titular') + ', que no jugó.')}">entró</span>`;
    if (f.estado === 'nojugo') return '<span class="ap-tag ap-tag-mal" title="Su partido ya se jugó y no sumó.">no jugó</span>';
    if (f.estado === 'falta') return '<span class="ap-tag ap-tag-esp" title="Todavía no jugó su partido.">falta</span>';
    return '';
  };
  const fila = f => `<tr class="${f.real ? '' : 'ap-pendiente'}">
    <td class="ap-nom">
      <b>${esc(nombreCorto(f.p.n))}</b>${f.cinta ? '<span class="ap-c" title="Es el capitán: la cinta ya está sumada en su fila.">C</span>' : ''}
      ${etiqueta(f)}
      <small>${esc(NOM(f.p.eq))} · ${f.p.cond === 'L' ? 'L' : 'V'} vs ${esc(NOM(f.p.riv))}</small></td>
    <td class="ap-pts">${f.real ? n1(f.suma) : '<i>' + n1(f.suma) + '</i>'}${f.cinta ? `<small>${f.pts} + ${n1(f.cinta)} cinta</small>` : ''}</td>
    <td class="ap-bar">${barraAporte(f.suma, max)}</td>
    <td class="ap-tienen">${(() => {
      const n = f.tienen, tot = prop ? prop.equipos : 1;
      if (n === 0) return `<span class="ap-dif" title="${esc('No lo tiene ninguno de los ' + tot + ' equipos del torneo.')}">nadie</span>`;
      if (n <= 1) return `<span class="ap-dif" title="${esc('Sólo este equipo lo tiene. Cada punto suyo es diferencia pura contra todos los demás.')}">único</span>`;
      if (n >= tot) return `<span class="ap-todos" title="${esc('Lo tienen los ' + tot + ' equipos. Sume lo que sume, no acerca ni aleja a nadie.')}">todos</span>`;
      return `<span title="${esc(n + ' de los ' + tot + ' equipos del torneo lo tienen.')}">${n}<i>/${tot}</i></span>`;
    })()}</td>
  </tr>`;
  const nReal = yaJugaron.length, ptsReal = yaJugaron.reduce((a, f) => a + f.suma, 0);
  const ptsFalta = faltan.reduce((a, f) => a + f.suma, 0);
  const unicos = filas.filter(f => f.tienen <= 1).length;
  return `<div class="tr-aportes">
    <div class="ap-resumen">
      <span><b>${nReal}</b> ya cobraron · <b>${n1(ptsReal)}</b> puntos</span>
      ${faltan.length ? `<span><b>${faltan.length}</b> por jugar · <b>${n1(ptsFalta)}</b> esperados</span>` : '<span>no queda nadie por jugar</span>'}
      ${prop && prop.equipos > 1 ? `<span title="${esc('Jugadores que no tiene ningún otro equipo del torneo. Son los únicos que le pueden sacar diferencia a los demás.')}"><b>${unicos}</b> que no tiene nadie más</span>` : ''}
    </div>
    <table class="ap-tabla">
      <thead><tr><th>Jugador</th><th class="ap-th-pts">Puntos</th><th></th>
        <th class="text-center" title="Cuántos equipos del torneo lo tienen. Un jugador que tienen todos no define nada; uno que tenés solo vos, sí.">lo tienen</th></tr></thead>
      <tbody>${yaJugaron.map(fila).join('')}
      ${faltan.length ? `<tr class="ap-sep"><td colspan="4">Todavía no jugaron — ${n1(faltan.reduce((a, f) => a + f.suma, 0))} esperados</td></tr>` : ''}
      ${faltan.map(fila).join('')}</tbody>
    </table>
  </div>`;
}

function bloqueCaraACara(ms) {
  if (ms.length < 2) return '';
  const nom = t => t.nombre;
  if (!S.caraA || !ms.some(m => m.t.id === S.caraA)) S.caraA = ms[0].t.id;
  if (!S.caraB || S.caraB === S.caraA || !ms.some(m => m.t.id === S.caraB)) {
    const otro = ms.find(m => m.t.id !== S.caraA && m.t.mio) || ms.find(m => m.t.id !== S.caraA);
    S.caraB = otro ? otro.t.id : null;
  }
  const mA = ms.find(m => m.t.id === S.caraA), mB = ms.find(m => m.t.id === S.caraB);
  if (!mA || !mB) return '';
  const c = caraACara(mA, mB);
  const sel = (val, cual) => `<select class="vs-sel tr-sel" data-cara="${cual}">
    ${ms.map(m => `<option value="${m.t.id}"${m.t.id === val ? ' selected' : ''}>${esc(m.t.nombre)}</option>`).join('')}</select>`;
  const col = (cc, m, lado) => `<div class="cc-col cc-${lado}">
    <div class="cc-col-cab"><b>${n1(cc.real)}</b>
      <span>${cc.det.length} propios${cc.faltan ? ' · ' + cc.faltan + ' por jugar (' + n1(cc.esp) + ' esp.)' : ''}</span></div>
    ${cc.det.length ? `<ul class="cc-lista">${cc.det.map(d => `<li class="${d.estado === 'falta' ? 'cc-falta' : ''}">
      <span class="cc-p">${d.estado === 'falta' ? '<i>' + n1((d.p.epsj != null ? d.p.epsj : d.p.ep) + d.cinta) + '</i>' : n1((d.pts || 0) + d.cinta)}</span>
      <span class="cc-n">${esc(nombreCorto(d.p.n))}${d.cinta ? ' <b class="ap-c">C</b>' : ''}<small>${esc(SIGLA(d.p.eq))}</small></span></li>`).join('')}</ul>`
      : '<p class="cc-nada">Ninguno propio: los once son los mismos.</p>'}
  </div>`;
  const gana = c.dif > 0.05 ? nom(mA.t) : c.dif < -0.05 ? nom(mB.t) : null;
  return tarjetaPleg('cara', 'Cara a cara',
    'Los que <b>los dos tienen</b> suman igual de los dos lados. La fecha se define <b>sólo</b> con los que no comparten.',
    `<div class="cc-sels">${sel(S.caraA, 'a')}<span class="cc-vs">vs</span>${sel(S.caraB, 'b')}</div>
    <div class="cc-compartidos" title="${esc('Estos ' + c.comparten.det.length + ' jugadores están en los dos equipos. Suman ' + n1(c.comparten.real) + ' puntos a cada uno.')}">
      <b>${c.comparten.det.length}</b> jugadores compartidos${c.comparten.det.length ? ` · ${n1(c.comparten.real)} puntos que suman <b>a los dos</b>${c.comparten.faltan ? ` · ${c.comparten.faltan} por jugar` : ''}` : ''}
      ${c.comparten.det.length ? `<div class="cc-comp-nombres">${c.comparten.det.map(d => esc(nombreCorto(d.p.n))).join(' · ')}</div>` : ''}
    </div>
    <div class="cc-grid">
      ${col(c.soloA, mA, 'a')}
      <div class="cc-medio"><span class="cc-dif ${c.dif > 0 ? 'cc-dif-a' : c.dif < 0 ? 'cc-dif-b' : ''}">${c.dif > 0 ? '+' : ''}${n1(c.dif)}</span>
        <small>de diferencia<br>en lo propio</small></div>
      ${col(c.soloB, mB, 'b')}
    </div>
    <p class="cc-pie">${gana
      ? `Hoy <b>${esc(gana)}</b> gana la pulseada por <b>${n1(Math.abs(c.dif))}</b> en lo que no comparten.`
      : 'Empatados en lo que no comparten.'}
      ${(c.soloA.faltan || c.soloB.faltan)
        ? ` Quedan por jugar <b>${c.soloA.faltan}</b> de ${esc(nom(mA.t))} y <b>${c.soloB.faltan}</b> de ${esc(nom(mB.t))}: ahí se define.`
        : ' Ya no queda nada por jugarse entre los diferenciales.'}</p>`, false);
}

function bloquePropiedad(ms, prop) {
  if (ms.length < 2) return '';
  // DE QUIEN ES CADA JUGADOR.
  // Sin esto, "Marabel 11 puntos, unico" no dice a quien le sirvio, que es
  // justo lo que uno quiere saber. Se guarda tambien si lo tiene de titular o
  // de suplente: no es lo mismo, y el que mira la tabla necesita distinguirlo.
  // OJO: aca entran SOLO los equipos del torneo. El del motor y el propio se
  // miden aparte, en el laboratorio, y no cuentan para nada de esto.
  const duenos = {};
  ms.forEach(m => {
    const titulares = new Set(onceDe(m.t) || []);
    const todos = new Set([...titulares].concat(Object.values(m.t.banco || {})));
    todos.forEach(id => {
      (duenos[id] = duenos[id] || []).push({ nombre: m.t.nombre, banco: !titulares.has(id) });
    });
  });
  const filas = [];
  Object.keys(prop.cuenta).forEach(id => {
    const p = TODOS[id]; if (!p) return;
    const v = vivoDe(id), res = resuelto(p);
    filas.push({ p, n: prop.cuenta[id], tit: prop.comoTitular[id] || 0,
                 pts: res ? (v && v.p != null ? v.p : 0) : null,
                 esp: p.epsj != null ? p.epsj : (p.ep || 0), de: duenos[id] || [] });
  });
  if (!filas.length) return '';
  const masElegidos = filas.slice().sort((a, b) => b.n - a.n || (b.pts ?? b.esp) - (a.pts ?? a.esp)).slice(0, 8);
  const unicos = filas.filter(f => f.n === 1 && f.pts != null).sort((a, b) => b.pts - a.pts).slice(0, 8);
  const fila = (f, conDueno) => `<li>
    <span class="pr-pts${f.pts == null ? ' pr-esp' : (f.pts >= 8 ? ' pr-alto' : '')}"
      title="${esc(f.pts == null ? 'Todavía no jugó: ' + n1(f.esp) + ' es lo que el motor espera de él.' : 'Puntos que ya sumó, sin contar la cinta de nadie.')}">${f.pts == null ? n1(f.esp) : f.pts}</span>
    <span class="pr-n">${esc(nombreCorto(f.p.n))}<small>${esc(NOM(f.p.eq))}${conDueno && f.de.length === 1 ? ' · lo tiene <b>' + esc(f.de[0].nombre) + '</b>' : ''}</small></span>
    <span class="pr-c" title="${esc(f.de.length ? 'Lo tienen: ' + f.de.map(d => d.nombre + (d.banco ? ' (banco)' : '')).join(', ') : '')}">${f.n}<i>/${prop.equipos}</i></span></li>`;

  // ── LA TABLA COMPLETA ──────────────────────────────────────────────────
  // Las dos listas de arriba son los extremos. Esto es el plantel entero del
  // torneo con los nombres de los duenos A LA VISTA, no escondidos en un
  // title que en el celular no se puede ni abrir.
  const todas = filas.slice().sort((a, b) =>
    b.n - a.n || (b.pts ?? b.esp) - (a.pts ?? a.esp) || a.p.n.localeCompare(b.p.n));
  const chip = d => `<span class="pr-eq${d.banco ? ' pr-eq-banco' : ''}"${d.banco
    ? ' title="' + esc('Lo tiene en el banco: sólo suma si se le cae un titular de ese puesto.') + '"' : ''}>${esc(d.nombre)}${d.banco ? ' <i>banco</i>' : ''}</span>`;
  const filaTabla = f => `<tr>
    <td class="pt-nom"><b>${esc(nombreCorto(f.p.n))}</b><small>${esc(NOM(f.p.eq))} · ${f.p.pos}</small></td>
    <td class="pt-pts">${f.pts == null
      ? `<i title="${esc('Todavía no jugó. Es lo que el motor le espera.')}">${n1(f.esp)}</i>`
      : `<b class="${f.pts >= 8 ? 'pr-alto' : ''}">${f.pts}</b>`}</td>
    <td class="pt-n">${f.n === prop.equipos
      ? `<span class="ap-todos" title="${esc('Lo tienen los ' + prop.equipos + ' equipos: sume lo que sume, la tabla no se mueve.')}">todos</span>`
      : `${f.n}<i>/${prop.equipos}</i>`}</td>
    <td class="pt-de">${f.de.map(chip).join('')}</td>
  </tr>`;

  return tarjetaPleg('prop', 'Quién tiene a quién',
    'Contra qué te estás midiendo de verdad, y qué apuesta salió bien.',
    `<p class="pr-nota">Cuenta los <b>${prop.equipos}</b> equipos del torneo. El del motor y el tuyo
      no entran acá: no compiten, se miden aparte en el laboratorio.</p>
    <div class="pr-grid">
      <div><h3>Los más elegidos</h3>
        <p class="pr-sub">Están en casi todos los equipos: lo que hagan casi no cambia la tabla.</p>
        <ul class="pr-lista">${masElegidos.map(f => fila(f, false)).join('')}</ul></div>
      <div><h3>Los diferenciales que rindieron</h3>
        <p class="pr-sub">Los tiene <b>un solo</b> equipo y ya sumaron. Cada punto acá es ventaja pura.</p>
        ${unicos.length ? `<ul class="pr-lista">${unicos.map(f => fila(f, true)).join('')}</ul>`
          : '<p class="tr-vacio">Todavía ninguno: o no hay diferenciales, o no jugaron.</p>'}</div>
    </div>
    <details class="pr-det"><summary>El plantel completo del torneo — ${todas.length} jugadores repartidos entre ${prop.equipos} equipos</summary>
      <div class="table-responsive"><table class="pr-tabla">
        <thead><tr><th>Jugador</th><th class="pt-th-pts" title="Puntos que ya sumó. En cursiva, lo que el motor le espera si todavía no jugó.">Pts</th>
          <th class="pt-th-n">Lo tienen</th><th>Quiénes</th></tr></thead>
        <tbody>${todas.map(filaTabla).join('')}</tbody>
      </table></div>
    </details>`, false);
}

// ════════════════════════════════════════════════════════════════════════════
//  EL PARTIDO EN NUMEROS — posesion y corners por condicion
//  Todo esto ya estaba guardado en equiposCond desde el 07/09, pero enterrado
//  en la pantalla Datos: para saber cuanta posesion tiene Velez de local y
//  cuantos corners concede Estudiantes de visitante habia que ir a Datos, abrir
//  la tabla, ordenar y cruzar a ojo. Es el dato con el que uno decide y estaba
//  a cuatro clics del jugador. Ahora vive al lado del jugador.
//
//  Nada de esto se estima: son los partidos que se jugaron, contados. El puesto
//  al lado de cada numero es sobre los 30 equipos EN ESA MISMA CONDICION, que
//  es lo que hace que el numero signifique algo: 55% de posesion no dice nada,
//  "55%, 4º de local" si.
// ════════════════════════════════════════════════════════════════════════════
const METRICAS_COND = [
  ['posesion',     'Posesión',          '%',  true,  'Porcentaje de pelota. Sale de los partidos ya jugados en esta condición.'],
  ['corners',      'Córners a favor',   '',   true,  'Córners que genera por partido en esta condición.'],
  ['cornersRec',   'Córners en contra', '',   false, 'Córners que le hacen por partido en esta condición. Menos es mejor.'],
  ['tiros',        'Tiros',             '',   true,  'Tiros que patea por partido en esta condición.'],
  ['tirosRec',     'Tiros en contra',   '',   false, 'Tiros que le patean por partido. Menos es mejor.'],
  ['tirosArco',    'Al arco',           '',   true,  'Tiros al arco por partido en esta condición.'],
  ['tirosArcoRec', 'Al arco en contra', '',   false, 'Tiros al arco que le patean por partido. Menos es mejor.'],
  ['gfP',          'Goles a favor',     '',   true,  'Goles por partido en esta condición.'],
  ['gcP',          'Goles en contra',   '',   false, 'Goles que recibe por partido. Menos es mejor.']
];

let _RANKCOND = null;
function rankCond(ventana) {
  const v = ventana || 'actual';
  _RANKCOND = _RANKCOND || {};
  if (_RANKCOND[v]) return _RANKCOND[v];
  const EC = D.equiposCond || {};
  const out = { local: {}, visitante: {} };
  ['local', 'visitante'].forEach(c => {
    METRICAS_COND.forEach(([campo, , , mayorMejor]) => {
      const filas = Object.values(EC)
        .map(e => ({ k: e.k, val: e[v] && e[v][c] ? e[v][c][campo] : null }))
        .filter(f => f.val != null);
      filas.sort((a, b) => mayorMejor ? b.val - a.val : a.val - b.val);
      const r = {};
      filas.forEach((f, i) => { r[f.k] = { puesto: i + 1, total: filas.length, val: f.val }; });
      (out[c][campo] = r);
    });
    // la referencia de la liga: la mediana, no el promedio, que un outlier la corre
    METRICAS_COND.forEach(([campo]) => {
      const vals = Object.values(out[c][campo]).map(z => z.val).sort((a, b) => a - b);
      out[c][campo]._mediana = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    });
  });
  return (_RANKCOND[v] = out);
}

function perfilCond(equipo, cond, ventana) {
  const EC = D.equiposCond || {};
  const k = claveEquipo(equipo);
  const e = Object.values(EC).find(z => z.k === k);
  if (!e) return null;
  const v = ventana || 'actual';
  const d = e[v] && e[v][cond];
  if (!d || !d.pj) return null;
  const R = rankCond(v);
  const xg = (v === 'actual' ? e.xgActual : e.xgAnio);
  return {
    equipo: e.equipo, k, pj: d.pj, cond,
    xgF: xg && xg[cond] ? xg[cond].f : null,
    xgC: xg && xg[cond] ? xg[cond].c : null,
    val: campo => d[campo],
    puesto: campo => (R[cond][campo] && R[cond][campo][k]) ? R[cond][campo][k].puesto : null,
    total: campo => (R[cond][campo] && R[cond][campo][k]) ? R[cond][campo][k].total : null,
    mediana: campo => R[cond][campo] ? R[cond][campo]._mediana : null
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  CORNERS: el que mas genera contra el que mas concede
//  ------------------------------------------------------------------------
//  El dato ya estaba —las columnas Crn+ y Crn− lo muestran por jugador— pero
//  para encontrar el partido donde un equipo que tira muchos corners visita a
//  uno que los regala habia que ordenar dos tablas y cruzarlas a mano. Esto lo
//  hace solo y marca los partidos con 🚩.
//
//  NADA de esto se estima. corners y cornersRec son córners CONTADOS por ESPN
//  en los partidos ya jugados de ESTE torneo, separados por condicion. Lo unico
//  que se hace es promediar los dos lados de la misma pregunta:
//
//     corners esperados de A  =  (los que A genera de local
//                               + los que B concede de visitante) / 2
//
//  y restarle la misma cuenta hecha con las MEDIANAS de la liga, para que el
//  numero diga "cuantos corners de mas que un partido normal", no "8.4".
//
//  Con 3 o 4 partidos por condicion el promedio se mueve mucho: por eso se
//  exige un minimo de partidos, se muestra sobre cuantos sale y solo se marcan
//  los 3 partidos con mas ventaja. Es una señal para mirar, no un pronostico.
// ════════════════════════════════════════════════════════════════════════════
const CRN_MIN_PJ = 3;   // menos partidos que esto en la condicion: no se marca
const CRN_TOP    = 3;   // cuantos partidos de la fecha se marcan
const CRN_MIN_V  = 1.0; // ventaja minima sobre la liga para que valga marcarlo

let _CRN = null;
function cornersFecha() {
  const v = S.condVent || 'actual';
  _CRN = _CRN || {};
  if (_CRN[v]) return _CRN[v];
  const R = rankCond(v);
  const mediana = (cond, campo) => (R[cond] && R[cond][campo]) ? R[cond][campo]._mediana : null;
  const salida = { lista: [], porPartido: {}, porEquipo: {} };

  (D.partidos || []).forEach(m => {
    const L = perfilCond(m.local, 'local', v);
    const V = perfilCond(m.visitante, 'visitante', v);
    if (!L || !V || L.pj < CRN_MIN_PJ || V.pj < CRN_MIN_PJ) return;
    const cL = L.val('corners'), rL = L.val('cornersRec');
    const cV = V.val('corners'), rV = V.val('cornersRec');
    if ([cL, rL, cV, rV].some(z => z == null)) return;
    const mLc = mediana('local', 'corners'), mLr = mediana('local', 'cornersRec');
    const mVc = mediana('visitante', 'corners'), mVr = mediana('visitante', 'cornersRec');
    if ([mLc, mLr, mVc, mVr].some(z => z == null)) return;

    const espL = (cL + rV) / 2, baseL = (mLc + mVr) / 2;
    const espV = (cV + rL) / 2, baseV = (mVc + mLr) / 2;
    const esL = (espL - baseL) >= (espV - baseV);

    salida.lista.push({
      local: m.local, visitante: m.visitante, yaJugado: !!m.yaJugado,
      lado: esL ? 'L' : 'V',
      equipo: esL ? m.local : m.visitante,
      rival:  esL ? m.visitante : m.local,
      condEq: esL ? 'local' : 'visitante',
      condRi: esL ? 'visitante' : 'local',
      esp:    esL ? espL : espV,
      base:   esL ? baseL : baseV,
      vent:   esL ? espL - baseL : espV - baseV,
      genera: esL ? cL : cV,
      pGen:   esL ? L.puesto('corners') : V.puesto('corners'),
      concede: esL ? rV : rL,
      pCon:   esL ? V.puesto('cornersRec') : L.puesto('cornersRec'),
      total:  esL ? L.total('corners') : V.total('corners'),
      pj: Math.min(L.pj, V.pj)
    });
  });

  salida.lista.sort((a, b) => b.vent - a.vent);
  salida.lista.filter(x => x.vent >= CRN_MIN_V).slice(0, CRN_TOP).forEach((x, i) => {
    x.orden = i + 1;
    salida.porPartido[claveEquipo(x.local) + '|' + claveEquipo(x.visitante)] = x;
    salida.porPartido[claveEquipo(x.visitante) + '|' + claveEquipo(x.local)] = x;
    salida.porEquipo[claveEquipo(x.equipo)] = x;   // solo el que GENERA: ahi esta la chance
  });
  return (_CRN[v] = salida);
}

// Texto largo, uno solo, para que el globito diga lo mismo en los tres lugares.
function cornersAyuda(c) {
  return `${NOM(c.equipo)} de ${c.condEq} genera ${n1(c.genera)} córners por partido`
    + (c.pGen ? ` (${c.pGen}º de ${c.total} en esa condición)` : '')
    + ` y ${NOM(c.rival)} de ${c.condRi} concede ${n1(c.concede)}`
    + (c.pCon ? ` (${c.pCon}º de ${c.total}, contando 1 al que menos concede)` : '')
    + `. Da ${n1(c.esp)} córners esperados para ${NOM(c.equipo)}, contra ${n1(c.base)} de un partido promedio:`
    + ` ${n1(c.vent)} de más. Córners contados por ESPN en este torneo, sobre ${c.pj} partidos por lado`
    + `; con esa muestra el número se mueve, es para mirar el partido, no un pronóstico.`
    + ` No entra en el puntaje de Gran DT: los córners no suman por sí solos.`;
}

// La pilita que va al lado del nombre del jugador, solo para los del equipo que
// genera los corners: es ahi donde esta la chance.
function pillCorners(x) {
  if (x.pos === 'ARQ') return '';   // la chance del corner es cabecear: el arquero no
  const c = cornersFecha().porEquipo[claveEquipo(x.eq)];
  if (!c) return '';
  return `<span class="pill-alerta pill-corner" title="${esc(cornersAyuda(c))}">🚩 CÓRNERS +${n1(c.vent)}</span>`;
}

// El cartelito de la tarjeta del fixture.
function badgeCorners(m) {
  const c = cornersFecha().porPartido[claveEquipo(m.local) + '|' + claveEquipo(m.visitante)];
  if (!c) return '';
  return `<span class="fx-corner" title="${esc(cornersAyuda(c))}">🚩 ${n1(c.esp)} córners ${
    esc(NOM(c.equipo))}</span>`;
}

// El bloque que va en la ficha del jugador: su equipo y el rival, cada uno en
// la condicion que le toca HOY, uno al lado del otro.
function bloquePartidoNumeros(x, ventana) {
  const v = ventana || 'actual';
  const cMio = x.cond === 'L' ? 'local' : 'visitante';
  const cRiv = x.cond === 'L' ? 'visitante' : 'local';
  const mio = perfilCond(x.eq, cMio, v), riv = perfilCond(x.riv, cRiv, v);
  if (!mio && !riv) return '';
  const celda = (p, campo, unidad, mayorMejor) => {
    if (!p) return '<td class="pn-v">s/d</td>';
    const val = p.val(campo), pu = p.puesto(campo), tot = p.total(campo);
    if (val == null) return '<td class="pn-v">s/d</td>';
    const buenos = tot ? Math.max(1, Math.round(tot / 3)) : 10;
    const clase = pu == null ? '' : pu <= buenos ? ' pn-bien' : pu > tot - buenos ? ' pn-mal' : '';
    return `<td class="pn-v${clase}"><b>${unidad === '%' ? n1(val) + '%' : n1(val)}</b>${
      pu ? `<i title="${esc('Puesto entre los ' + tot + ' equipos, contando sólo los partidos de ' + p.cond + '.')}">${pu}º</i>` : ''}</td>`;
  };
  const filas = METRICAS_COND.map(([campo, etiqueta, unidad, mayorMejor, ayuda]) => `
    <tr><td class="pn-k" title="${esc(ayuda + (mayorMejor ? '' : ' El puesto 1 es el que menos.'))}">${etiqueta}</td>
      ${celda(mio, campo, unidad, mayorMejor)}
      ${celda(riv, campo, unidad, mayorMejor)}
      <td class="pn-med" title="La mediana de los 30 equipos en esa condición: la referencia para saber si el número es alto o bajo.">${
        (() => { const m = (mio || riv).mediana(campo); return m == null ? '–' : (unidad === '%' ? n1(m) + '%' : n1(m)); })()}</td>
    </tr>`).join('');
  const filaXg = (mio && mio.xgF != null) || (riv && riv.xgF != null) ? `
    <tr class="pn-xg"><td class="pn-k" title="Goles esperados por partido, medidos de los partidos jugados en esa condición. No son las cuotas de este partido.">xG a favor</td>
      <td class="pn-v">${mio && mio.xgF != null ? '<b>' + n2(mio.xgF) + '</b>' : 's/d'}</td>
      <td class="pn-v">${riv && riv.xgF != null ? '<b>' + n2(riv.xgF) + '</b>' : 's/d'}</td><td class="pn-med">–</td></tr>
    <tr class="pn-xg"><td class="pn-k">xG en contra</td>
      <td class="pn-v">${mio && mio.xgC != null ? '<b>' + n2(mio.xgC) + '</b>' : 's/d'}</td>
      <td class="pn-v">${riv && riv.xgC != null ? '<b>' + n2(riv.xgC) + '</b>' : 's/d'}</td><td class="pn-med">–</td></tr>` : '';
  // La bandera de corners, arriba de todo: es lo unico de este bloque que
  // compara los DOS equipos entre si en vez de mostrarlos uno al lado del otro.
  const crn = cornersFecha().porPartido[claveEquipo(x.eq) + '|' + claveEquipo(x.riv)];
  const avisoCrn = !crn ? '' : `<div class="pn-corner" title="${esc(cornersAyuda(crn))}">
    <b>🚩 Partido de córners</b>
    <span>${esc(NOM(crn.equipo))} de ${crn.condEq} genera <b>${n1(crn.genera)}</b> por partido y ${
      esc(NOM(crn.rival))} de ${crn.condRi} concede <b>${n1(crn.concede)}</b>:
      <b>${n1(crn.esp)}</b> esperados contra ${n1(crn.base)} de un partido promedio.</span></div>`;
  return `<div class="pn-caja">
    <div class="md-titulo">El partido, en números
      <span class="pn-vent">
        <button class="pn-vbtn${v === 'actual' ? ' on' : ''}" onclick="verPartidoNumeros('${x.id}','actual')">este torneo</button>
        <button class="pn-vbtn${v === 'anio' ? ' on' : ''}" onclick="verPartidoNumeros('${x.id}','anio')">los dos torneos</button>
      </span></div>
    ${avisoCrn}
    <table class="pn-tabla">
      <thead><tr><th></th>
        <th>${esc(NOM(x.eq))}<small>de ${cMio}${mio ? ' · ' + mio.pj + ' PJ' : ''}</small></th>
        <th>${esc(NOM(x.riv))}<small>de ${cRiv}${riv ? ' · ' + riv.pj + ' PJ' : ''}</small></th>
        <th class="pn-med">liga<small>mediana</small></th></tr></thead>
      <tbody>${filas}${filaXg}</tbody>
    </table>
    <p class="pn-pie">Cada número es lo que pasó en los partidos <b>de esa condición</b>, contados, sin ningún ajuste.
    El <b>puesto</b> de al lado es sobre los 30 equipos en esa misma condición: es lo que convierte un 55% de posesión
    en «4º de local». Verde es tercio de arriba, rojo tercio de abajo.
    ${(mio && mio.pj < 5) || (riv && riv.pj < 5) ? '<b>Ojo:</b> con menos de 5 partidos en una condición, el número se mueve mucho con un partido.' : ''}</p>
  </div>`;
}
window.verPartidoNumeros = function (id, v) {
  const cont = document.querySelector('.pn-caja');
  if (cont) cont.outerHTML = bloquePartidoNumeros(TODOS[id], v);
};

// ════════════════════════════════════════════════════════════════════════════
//  LEER LA TABLA DEL GRAN DT
//  El juego muestra dos tablas: la de la fecha y la general. Copiando y pegando
//  cualquiera de las dos salen los DTs del torneo con nombre, equipo, puntos y
//  fechas ganadas. Con eso ya no hace falta escribir "Nacho" a mano cada vez:
//  los siete quedan cargados y cada fecha se les pone el once.
//
//  El ancla del parseo es la linea "N vez" / "N veces", que es lo unico que
//  aparece SIEMPRE y en un formato fijo. Desde ahi: los puntos son la linea
//  siguiente, y para atras estan el equipo, la persona y los numeros de puesto.
//  Buscar por posicion de linea no servia: la general tiene una columna de mas
//  (Dif.) y algunas filas traen "Modifico equipo" y otras no.
// ════════════════════════════════════════════════════════════════════════════
function leerTablaGranDT(txt) {
  const lin = String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
  const filas = [];
  const esNum = l => /^-?\d+$/.test(l);
  for (let i = 0; i < lin.length; i++) {
    const m = lin[i].match(/^(\d+)\s+(?:vez|veces)$/i);
    if (!m) continue;
    const ganadas = Number(m[1]);
    // los puntos: la primera linea siguiente que sea un numero
    let pts = null;
    for (let j = i + 1; j < lin.length && j <= i + 3; j++) {
      if (esNum(lin[j])) { pts = Number(lin[j]); break; }
      break;
    }
    if (pts == null) continue;
    // para atras: saltear "Modifico equipo", despues equipo, despues persona
    let k = i - 1;
    if (/^modific/i.test(lin[k] || '')) k--;
    const equipo = lin[k] || ''; k--;
    const persona = lin[k] || ''; k--;
    // lo que queda para atras son el puesto y, si esta, la diferencia
    let puesto = null;
    while (k >= 0 && (esNum(lin[k]) || lin[k] === '-')) {
      if (esNum(lin[k])) puesto = Number(lin[k]);
      k--;
      if (puesto != null && (k < 0 || !(esNum(lin[k]) || lin[k] === '-'))) break;
    }
    if (!persona || !equipo || /^(posición|posicion|dt|puntos|ganó fecha|gano fecha|dif\.?)$/i.test(persona)) continue;
    filas.push({ puesto, persona, equipo, ganadas, pts });
  }
  // el puesto sale del orden real, no de lo que diga la columna
  filas.sort((a, b) => b.pts - a.pts);
  filas.forEach((f, i) => { f.puesto = i + 1; });
  return filas;
}

// ── EL PLANTEL DEL TORNEO ──────────────────────────────────────────────────
// Los DTs son fijos: los mismos siete todas las fechas. Lo que cambia cada
// fecha es el once de cada uno. Antes habia que escribir el nombre a mano cada
// vez que se agregaba un equipo; ahora se pegan una vez y quedan.
const idDT = persona => 'dt_' + _qn(persona).replace(/\s+/g, '_').slice(0, 40);

function guardarTablaGranDT(filas, tipo, fecha) {
  S.liga.dts = S.liga.dts || [];
  S.liga.camp = S.liga.camp || { general: {}, fechas: {} };
  filas.forEach(f => {
    const id = idDT(f.persona);
    let dt = S.liga.dts.find(d => d.id === id);
    if (!dt) { dt = { id, persona: f.persona, equipo: f.equipo }; S.liga.dts.push(dt); }
    else { dt.persona = f.persona; dt.equipo = f.equipo; }
    if (tipo === 'general') S.liga.camp.general[id] = { pts: f.pts, ganadas: f.ganadas };
    else {
      S.liga.camp.fechas[String(fecha)] = S.liga.camp.fechas[String(fecha)] || {};
      S.liga.camp.fechas[String(fecha)][id] = f.pts;
      // las fechas ganadas tambien vienen en la tabla de la fecha
      const g = S.liga.camp.general[id] || {};
      S.liga.camp.general[id] = { pts: g.pts, ganadas: f.ganadas };
    }
  });
  if (tipo !== 'general') {
    S.liga.camp.fuentes = S.liga.camp.fuentes || {};
    S.liga.camp.fuentes[String(fecha)] = 'juego';   // lo pegado del juego manda
  }
  S.liga.camp.actualizado = new Date().toISOString();
  guardarLiga();
}

// La tabla del campeonato, lista para pintar. Ordena por los puntos generales;
// si de esa fecha tambien hay datos, calcula cuanto se movio cada uno.
function tablaCampeonato() {
  const C = (S.liga && S.liga.camp) || null;
  if (!C || !S.liga.dts || !S.liga.dts.length) return null;
  const fechas = Object.keys(C.fechas || {}).map(Number).sort((a, b) => a - b);
  const ultima = fechas.length ? fechas[fechas.length - 1] : null;
  const anterior = fechas.length > 1 ? fechas[fechas.length - 2] : null;
  // SE BANCA TENER SOLO UNA DE LAS DOS TABLAS (08/09).
  // Si pegas nada mas que la tabla de la fecha, antes la columna Puntos quedaba
  // llena de guiones, el "lider" colgado al costado y los 90 en la columna de
  // la fecha: parecia que las columnas estuvieran corridas. Ahora, si no hay
  // tabla general, el acumulado se arma sumando las fechas que si estan, y se
  // dice de donde sale cada numero.
  const sumaFechas = id => {
    let t = null;
    fechas.forEach(f => { const v = (C.fechas[String(f)] || {})[id]; if (v != null) t = (t || 0) + v; });
    return t;
  };
  // las fechas ganadas, si el juego no las trajo, se cuentan de las que tenemos
  const ganadasCalc = {};
  fechas.forEach(f => {
    const d = C.fechas[String(f)] || {};
    const max = Math.max(...Object.values(d).map(Number).filter(v => !isNaN(v)));
    Object.keys(d).forEach(id => { if (d[id] === max) ganadasCalc[id] = (ganadasCalc[id] || 0) + 1; });
  });
  const hayGeneral = Object.values(C.general || {}).some(g => g && g.pts != null);
  const filas = S.liga.dts.map(dt => {
    const g = (C.general || {})[dt.id] || {};
    const dela = ultima != null ? (C.fechas[String(ultima)] || {})[dt.id] : null;
    const suma = sumaFechas(dt.id);
    return {
      dt,
      pts: g.pts != null ? g.pts : suma,
      origen: g.pts != null ? 'juego' : (suma != null ? 'suma' : null),
      ganadas: g.ganadas != null ? g.ganadas : (ganadasCalc[dt.id] || 0),
      ganadasCalc: !(g.ganadas != null),
      fecha: dela != null ? dela : null,
      // el once cargado en la app para esta fecha, si lo hay
      equipo: (S.liga.equipos || []).find(t => t.dt === dt.id) || null
    };
  }).filter(f => f.pts != null || f.fecha != null);
  if (!filas.length) return null;
  filas.sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
  filas.forEach((f, i) => { f.puesto = i + 1; });
  // el puesto que tenia ANTES de la ultima fecha: puntos generales menos lo de
  // esa fecha. Solo se puede si tenemos las dos cosas.
  if (ultima != null && fechas.length + (hayGeneral ? 1 : 0) > 1 &&
      filas.every(f => f.pts != null && f.fecha != null)) {
    const antes = filas.map(f => ({ id: f.dt.id, p: f.pts - f.fecha }))
      .sort((a, b) => b.p - a.p);
    const puestoAntes = {}; antes.forEach((a, i) => { puestoAntes[a.id] = i + 1; });
    filas.forEach(f => { f.movio = puestoAntes[f.dt.id] - f.puesto; });
  }
  const lider = filas[0].pts;
  filas.forEach(f => { f.dif = (f.pts != null && lider != null) ? f.pts - lider : null; });
  return { filas, ultima, anterior, fechas, actualizado: C.actualizado, hayGeneral,
           soloUnaFecha: !hayGeneral && fechas.length <= 1 };
}

// ── LA PANTALLA DEL CAMPEONATO ─────────────────────────────────────────────
function bloqueCampeonato(ms) {
  const t = tablaCampeonato();
  if (!t) return `<div class="card tr-card cmp-vacio">
    <div class="tr-cab"><h2>El campeonato</h2>
      <p>Todavía no está cargado. En el Gran DT, copiá la tabla de tu torneo y pegala acá:
      salen los DTs con nombre, equipo y puntos, y no hay que escribir nada a mano.</p></div>
    <div class="lg-acciones"><button class="vs-btn vs-btn-fuerte" id="cmp-cargar">Pegar la tabla del Gran DT</button></div>
  </div>`;
  const mov = f => {
    if (f.movio == null) return '';
    if (f.movio === 0) return '<span class="cmp-mov cmp-igual" title="No se movió de puesto en la última fecha.">=</span>';
    return `<span class="cmp-mov ${f.movio > 0 ? 'cmp-sube' : 'cmp-baja'}"
      title="${esc('En la fecha ' + t.ultima + ' ' + (f.movio > 0 ? 'subió ' : 'bajó ') + Math.abs(f.movio) + ' puesto' + (Math.abs(f.movio) > 1 ? 's' : '') + '.')}">${f.movio > 0 ? '▲' : '▼'}${Math.abs(f.movio)}</span>`;
  };
  const filas = t.filas.map(f => `<tr class="${f.equipo ? '' : 'cmp-sin'}">
    <td class="cmp-pos">${f.puesto}${mov(f)}</td>
    <td class="cmp-dt"><b>${esc(f.dt.equipo)}</b><small>${esc(f.dt.persona)}</small></td>
    <td class="cmp-pts"><b>${f.pts != null ? f.pts : '–'}</b></td>
    <td class="cmp-dif">${f.dif ? f.dif : (f.puesto === 1 ? '<span class="cmp-lider">líder</span>' : '–')}</td>
    <td class="text-center">${f.fecha != null ? `<span class="cmp-f">${f.fecha}</span>` : '<span class="text-muted">–</span>'}</td>
    <td class="text-center cmp-gan" title="${esc('Fechas que ganó en el torneo.' + (f.ganadasCalc ? ' Contadas sobre las fechas que están cargadas acá, no las trae el juego.' : ''))}">${
      f.ganadas ? `<b>${f.ganadas}</b>${f.ganadas === 1 ? ' 🏆' : ' 🏆'}` : '<span class="text-muted">0</span>'}</td>
    <td class="cmp-once">${f.equipo
      ? `<span class="cmp-ok" title="${esc('El once de ' + f.dt.equipo + ' está cargado en la app: ya entra en la tabla en vivo y en el cara a cara.')}">✓</span>`
      : `<button class="vs-btn vs-btn-chico" onclick="abrirParaDT('${f.dt.id}')">cargar el once</button>`}</td>
  </tr>`).join('');
  const sinOnce = t.filas.filter(f => !f.equipo).length;
  return `<div class="card tr-card">
    <div class="tr-cab">
      <h2>El campeonato</h2>
      <p>La tabla general del torneo, como la trae el Gran DT. La <b>flecha</b> es lo que se movió cada uno
      en la fecha ${t.ultima != null ? t.ultima : '–'}: sale de restarle a los puntos generales los de esa fecha,
      no de una cuenta nuestra.</p>
    </div>
    <table class="data-table cmp-tabla">
      <thead><tr>
        <th>#</th><th>DT</th>
        <th class="text-center" title="${esc(t.hayGeneral
          ? 'Puntos acumulados en el torneo, tal como los trae la tabla general del Gran DT.'
          : 'Todavía no pegaste la tabla general: esto es la suma de las fechas que hay cargadas.')}">${
          t.hayGeneral ? 'Puntos' : 'Suma de<br>las fechas'}</th>
        <th class="text-center" title="Diferencia con el líder.">Dif.</th>
        <th class="text-center" title="Lo que hizo en la última fecha cargada.">Fecha ${t.ultima != null ? t.ultima : ''}</th>
        <th class="text-center" title="Fechas ganadas en el torneo.">Fechas ganadas</th>
        <th class="text-right"></th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${bloqueCierre(ms || [])}
    <div class="lg-acciones">
      <button class="vs-btn" id="cmp-cargar">Actualizar con la tabla del Gran DT</button>
      ${sinOnce ? `<span class="cmp-falta">Faltan <b>${sinOnce}</b> onces por cargar para que entren en la tabla en vivo</span>` : ''}
    </div>
    ${!t.hayGeneral ? `<div class="lg-perdidos">
      Falta la <b>tabla general</b> del campeonato: lo que ves es la suma de ${t.fechas.length === 1 ? 'la única fecha' : 'las ' + t.fechas.length + ' fechas'} que cargaste.
      Pegá la general del Gran DT y aparecen los puntos del torneo entero.
      <button class="vs-btn vs-btn-chico" onclick="abrirCargarGranDT()">pegarla</button>
    </div>` : ''}

  </div>`;
}

// ── PEGAR LA TABLA ─────────────────────────────────────────────────────────
window.abrirCargarGranDT = function () {
  $('team-detail-title').innerHTML = 'Cargar el torneo desde el Gran DT';
  $('team-detail-body').innerHTML = `
    <p class="exp-txt">Entrá a tu torneo en el Gran DT, seleccioná la tabla entera y pegala acá.
    Sirven las dos: la <b>general</b> (la del campeonato) y la de <b>la fecha</b>. Da igual si arrastrás
    los títulos de las columnas, se ignoran.</p>
    <div class="lg-pegar">
      <textarea id="gdt-txt" rows="12" placeholder="Posición
DT
Ganó fecha
Puntos
1
Jose Gauna
ATILIO CHARA FC
Modificó equipo
1 vez
90
..."></textarea>
      <button class="vs-btn vs-btn-fuerte" id="gdt-leer">Leer la tabla</button>
    </div>
    <div id="gdt-res"></div>`;
  abrirModal('team-detail-modal');
  $('gdt-leer').onclick = () => {
    const filas = leerTablaGranDT($('gdt-txt').value);
    const res = $('gdt-res');
    if (!filas.length) {
      res.innerHTML = `<p class="cmp-error">No pude leer ninguna fila. Fijate de copiar la tabla entera,
        con la columna que dice «1 vez» o «0 veces»: esa es la que me sirve de ancla.</p>`;
      return;
    }
    const max = Math.max(...filas.map(f => f.pts));
    const pareceFecha = max < 200;   // una fecha da ~40-120; el acumulado, cientos
    res.innerHTML = `
      <p class="exp-txt">Leí <b>${filas.length}</b> DTs. ${pareceFecha
        ? 'Por los puntos parece la tabla <b>de una fecha</b>.'
        : 'Por los puntos parece la tabla <b>general</b> del campeonato.'}</p>
      <table class="data-table"><thead><tr><th>#</th><th>DT</th><th>Equipo</th><th class="text-center">Puntos</th><th class="text-center">Ganó</th></tr></thead>
        <tbody>${filas.map(f => `<tr><td>${f.puesto}</td><td>${esc(f.persona)}</td><td>${esc(f.equipo)}</td>
          <td class="text-center"><b>${f.pts}</b></td><td class="text-center">${f.ganadas}</td></tr>`).join('')}</tbody></table>
      <div class="gdt-btns">
        <button class="vs-btn${pareceFecha ? '' : ' vs-btn-fuerte'}" id="gdt-gral">Es la tabla general</button>
        <label class="gdt-fecha">Es la fecha
          <input type="number" id="gdt-nf" min="1" max="30" value="${D.ultimaFechaJugada ?? D.fechaObjetivo ?? 1}"
            title="La fecha a la que corresponde esta tabla. Por defecto, la última que se jugó — que es la que uno pega.">
          <button class="vs-btn${pareceFecha ? ' vs-btn-fuerte' : ''}" id="gdt-fec">guardar</button></label>
      </div>`;
    const cerrar = () => { cerrarModal($('team-detail-modal')); pintarPantallaLiga(); };
    $('gdt-gral').onclick = () => { guardarTablaGranDT(filas, 'general'); cerrar(); };
    // POR DEFECTO, LA ULTIMA JUGADA (09/09). Estaba puesto en la fecha OBJETIVO,
    // que es la que VIENE: pegabas la tabla de la 8 el martes y se guardaba como
    // fecha 9. Uno pega la tabla de la fecha que ya se jugó, no la de la próxima.
    $('gdt-fec').onclick = () => { guardarTablaGranDT(filas, 'fecha', Number($('gdt-nf').value) || D.ultimaFechaJugada || D.fechaObjetivo); cerrar(); };
  };
};

// Crear el equipo de un DT que ya esta en el torneo: sin escribir el nombre.
// UN SOLO CAMINO PARA CARGAR UN EQUIPO (08/09).
// Habia dos: elegir un DT de la tabla, o crear uno suelto escribiendo el
// nombre; y cada uno terminaba en un lugar distinto —uno en la fila vacia,
// otro en un modal con dos botones—. Como los equipos llegan por foto al grupo,
// el camino corto es siempre el mismo: elegis el DT y pegas la lista. Si
// preferis armarlo tocando la cancha, hay un renglon abajo del pegado.
window.abrirParaDT = function (dtId, saltarPegar) {
  const dt = (S.liga.dts || []).find(d => d.id === dtId); if (!dt) return;
  let t = (S.liga.equipos || []).find(x => x.dt === dtId);
  if (!t) {
    t = { id: 'e' + Date.now().toString(36), nombre: dt.equipo, dt: dtId, esq: '1-4-4-2', once: [], banco: {}, fichas: {} };
    S.liga.equipos.push(t); guardarLiga();
  }
  S.ligaAbierto = t.id;
  pintarPantallaLiga();
  setTimeout(() => { const f = document.querySelector('.lg-abierta'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
  // si el once esta vacio, lo primero que uno quiere es pegarlo
  if (!saltarPegar && !(onceDe(t) || []).length) setTimeout(() => abrirPegar(t.id), 120);
};
window.armarAMano = function (tid) {
  cerrarModal($('team-detail-modal'));
  S.ligaAbierto = tid || S.ligaAbierto;
  pintarPantallaLiga();
  setTimeout(() => { const f = document.querySelector('.lg-abierta'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
};

// ── EL LABORATORIO ─────────────────────────────────────────────────────────
// El once del motor y el tuyo, afuera de la tabla del torneo. La gracia no es
// que compitan: es medir. "Si el motor jugara el torneo iria 2º" dice algo del
// motor; meterlo en la tabla con tus amigos no dice nada de nadie.
// Tus puntos en el campeonato. No salen de la tabla del Gran DT porque vos no
// sos uno de los DTs que pegaste: los cargas a mano una vez por fecha y con eso
// se puede decir en que puesto irias, que es la pregunta.
function puestoEnGeneral(pts) {
  const t = tablaCampeonato();
  if (!t || pts == null) return null;
  const conPts = t.filas.filter(f => f.pts != null).map(f => f.pts).sort((a, b) => b - a);
  if (!conPts.length) return null;
  const arriba = conPts.filter(p => p > pts).length;
  const lider = conPts[0];
  return { puesto: arriba + 1, total: conPts.length + 1, dif: pts - lider, lider };
}
// Bloques que se pliegan. La pantalla tenia cinco tarjetas apiladas y habia que
// scrollear medio metro para llegar al campeonato. Arriba queda el show —podio,
// titulares, tabla— y el analisis se abre cuando uno lo quiere. Cada uno se
// acuerda de como lo dejaste.
function abiertoPleg(id, porDefecto) {
  try { const v = localStorage.getItem('gdt_pleg_' + id); return v == null ? !!porDefecto : v === '1'; }
  catch (e) { return !!porDefecto; }
}
window.togglePleg = function (id) {
  const ab = abiertoPleg(id, false);
  try { localStorage.setItem('gdt_pleg_' + id, ab ? '0' : '1'); } catch (e) { }
  const c = document.querySelector('[data-pleg="' + id + '"]');
  if (c) c.classList.toggle('pleg-abierto', !ab);
};
function tarjetaPleg(id, titulo, sub, cuerpo, porDefecto) {
  const ab = abiertoPleg(id, porDefecto);
  return `<div class="card tr-card pleg${ab ? ' pleg-abierto' : ''}" data-pleg="${id}">
    <div class="tr-cab pleg-cab" onclick="togglePleg('${id}')">
      <div><h2>${titulo}<span class="pleg-fl">▾</span></h2>
      ${sub ? `<p>${sub}</p>` : ''}</div>
    </div>
    <div class="pleg-cuerpo">${cuerpo}</div>
  </div>`;
}

// ── LA FECHA PASADA, EQUIPO POR EQUIPO ─────────────────────────────────────
// Vive en el Torneo de amigos y no en Revisión a propósito: Revisión es el
// laboratorio —cuánto le erró el motor—, y esto es la historia del torneo, que
// es lo que uno mira cuando entra acá.
//
// Se arma con DOS fuentes, y conviene tener clara la diferencia:
//   · los PUNTOS salen de la tabla del Gran DT que pegaste. Son los del juego,
//     están para los siete DTs y son la verdad.
//   · el DETALLE (quién jugó, la cinta, el mejor y el peor) sale de la foto que
//     la app saca cuando termina la fecha, y sólo existe para los equipos que
//     tenías cargados esa semana. Del que no tenías, se dice que no está en vez
//     de inventarlo.
let FP_ABIERTO = null;   // qué equipo está desplegado
let FP_FECHA = null;     // qué fecha se está mirando
window.fpVer = function (id) { FP_ABIERTO = (FP_ABIERTO === id) ? null : id; pintarPantallaLiga(); };
window.fpFecha = function (n) { FP_FECHA = +n; FP_ABIERTO = null; pintarPantallaLiga(); };

// las fechas de las que se sabe algo, de la más nueva a la más vieja
function fechasConDatos() {
  const s = new Set();
  const C = (S.liga && S.liga.camp) || null;
  if (C && C.fechas) Object.keys(C.fechas).forEach(f => s.add(+f));
  Object.keys(leerHist()).forEach(f => s.add(+f));
  return [...s].filter(n => !isNaN(n)).sort((a, b) => b - a);
}
function bloqueFechaPasada() {
  const todas = fechasConDatos();
  if (!todas.length) return '';
  // la pasada es la última terminada: si el motor está en la 9, es la 8
  const cerradas = todas.filter(n => D.fechaObjetivo == null || n < D.fechaObjetivo);
  const porDefecto = cerradas.length ? cerradas[0] : todas[0];
  const f = (FP_FECHA != null && todas.includes(FP_FECHA)) ? FP_FECHA : porDefecto;

  const C = (S.liga && S.liga.camp) || null;
  const oficiales = (C && C.fechas && C.fechas[String(f)]) || {};
  const foto = leerHist()[f] || null;
  const dts = (S.liga && S.liga.dts) || [];

  // una fila por DT del torneo; si no hay DTs, por equipo de la foto
  let filas = [];
  if (dts.length) {
    filas = dts.map(dt => ({
      id: dt.id, nombre: dt.equipo, persona: dt.persona,
      pts: oficiales[dt.id] != null ? oficiales[dt.id] : null,
      det: foto ? (foto.equipos || []).find(e => e.dt === dt.id) || null : null
    }));
  } else if (foto) {
    filas = (foto.equipos || []).map((e, i) => ({
      id: 'f' + i, nombre: e.nombre, persona: '', pts: e.total, det: e
    }));
  }
  filas = filas.filter(x => x.pts != null || x.det);
  if (!filas.length) return '';
  // el que no tiene puntos del juego usa los que calculó la app, y se avisa
  filas.forEach(x => { if (x.pts == null && x.det) { x.pts = x.det.total; x.calculado = true; } });
  filas.sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
  const top = filas[0].pts;
  const conDetalle = filas.filter(x => x.det).length;

  const selector = todas.length > 1
    ? `<div class="fp-sel">${todas.slice(0, 6).map(n => `<button class="chip-filtro${n === f ? ' on' : ''}"
        onclick="fpFecha(${n})">Fecha ${n}</button>`).join('')}</div>` : '';

  const cuerpo = `
    ${selector}
    <table class="data-table fp-tabla">
      <thead><tr>
        <th class="text-center">#</th><th>DT</th>
        <th class="text-center" title="Los puntos que le dio el juego en esa fecha.">Puntos</th>
        <th class="text-center" title="Cuánto le sacó el ganador de la fecha.">Dif.</th>
        <th class="text-center" title="Cuántos de su once llegaron a los 20 minutos.">Jugaron</th>
        <th title="El capitán y lo que pagó la cinta.">La cinta</th>
        <th title="El que más y el que menos sumó de su once.">Su mejor y su peor</th>
        <th class="text-right"></th>
      </tr></thead>
      <tbody>${filas.map((x, i) => filaFP(x, i, top, f)).join('')}</tbody>
    </table>
    <p class="fp-pie">Los <b>puntos</b> son los del <b>Gran DT</b>, de la tabla que pegaste.
    ${conDetalle
      ? `El detalle de la derecha sale de la foto que guardó la app, y existe para
         <b>${conDetalle}</b> de los ${filas.length} equipos: son los que tenías cargados esa fecha.`
      : `Todavía no hay foto de esta fecha, así que no puedo mostrar el detalle de ningún equipo.`}
    ${conDetalle < filas.length
      ? `De los otros <b>${filas.length - conDetalle}</b> sólo tengo el puntaje. Esto no se puede arreglar
         para atrás —cargarles el once ahora sería el de la fecha que viene, no el que jugaron—: para
         tenerlo la próxima, cargá sus onces <b>antes de que termine la fecha</b>.` : ''}</p>`;
  return tarjetaPleg('fpasada', 'La fecha pasada · fecha ' + f,
    'Cómo terminó, equipo por equipo.', cuerpo, true);
}

function filaFP(x, i, top, fecha) {
  const d = x.det;
  const brecha = top - x.pts;
  const abierto = FP_ABIERTO === x.id;
  // el mejor y el peor del once, de los que efectivamente jugaron
  let mejor = null, peor = null, jug = null;
  if (d) {
    const jugaron = (d.once || []).filter(j => j.real != null);
    if (jugaron.length) {
      const orden = jugaron.slice().sort((a, b) => b.real - a.real);
      mejor = orden[0]; peor = orden[orden.length - 1];
    }
    jug = d.jugaron + '/' + d.n;
  }
  let cinta = '<span class="text-muted">–</span>';
  if (d && d.cinta && d.cinta.quien) {
    const c = d.cinta, q = esc(c.quien);
    if (c.estado === 'perdida') cinta = `<span class="mal">se perdió</span> <small>${q} no jugó</small>`;
    else if (c.estado === 'sindato' || c.valor == null || (!c.valor && c.estado !== 'mano'))
      cinta = `<span class="text-muted">sin ficha</span> <small>${q} · Planeta no la publicó</small>`;
    else cinta = `<b>+${n1(c.valor)}</b> <small>${q}${c.estado === 'mano' ? ' · a mano' : ''}</small>`;
  }
  // control: lo que calculó la app contra lo que dio el juego
  const desvio = (d && !x.calculado && d.total != null) ? +(d.total - x.pts).toFixed(1) : null;
  return `<tr class="fp-fila${abierto ? ' fp-on' : ''}">
      <td class="text-center fp-pos">${i + 1}</td>
      <td><b>${esc(x.nombre)}</b>${x.persona ? `<small>${esc(x.persona)}</small>` : ''}</td>
      <td class="text-center"><b class="fp-pts">${x.pts}</b>${x.calculado
        ? '<div class="fp-nota" title="No estaba en la tabla del juego: es lo que calculó la app.">calculado</div>' : ''}</td>
      <td class="text-center">${x.pts === top
        ? '<span class="cmp-lider">ganó</span>'
        : (brecha === 0 ? '<span class="text-muted">igualó</span>' : '−' + brecha)}</td>
      <td class="text-center">${jug || '<span class="text-muted">–</span>'}</td>
      <td class="fp-cinta">${cinta}</td>
      <td class="fp-mp">${mejor
        ? `<span class="fp-b">${esc(mejor.n)} <b>${mejor.real}</b></span>
           <span class="fp-m">${esc(peor.n)} <b>${peor.real}</b></span>`
        : '<span class="text-muted">no tenías su once cargado</span>'}</td>
      <td class="text-right">${d
        ? `<button class="vs-btn vs-btn-chico" onclick="fpVer('${x.id}')">${abierto ? 'cerrar' : 'ver el once'}</button>`
        : ''}</td>
    </tr>
    ${abierto && d ? `<tr class="fp-det"><td colspan="8">${detalleFP(d, desvio, fecha)}</td></tr>` : ''}`;
}

function detalleFP(d, desvio, fecha) {
  const orden = (d.once || []).slice().sort((a, b) => (b.real ?? -99) - (a.real ?? -99));
  const linea = j => `<div class="fp-j${j.real == null ? ' fp-j-no' : ''}">
      <span class="fp-j-n">${esc(j.n)}${j.cap ? ' <i class="rev-c">C</i>' : ''}<small>${esc(j.eq)} · ${j.pos}</small></span>
      <span class="fp-j-p">${j.real == null ? '<span class="text-muted">no jugó</span>' : j.real}</span>
      ${j.esp != null && j.real != null
        ? `<span class="fp-j-d ${j.real - j.esp >= 0 ? 'ok' : 'mal'}">${j.real - j.esp >= 0 ? '+' : ''}${n1(j.real - j.esp)}</span>`
        : '<span class="fp-j-d text-muted">·</span>'}
    </div>`;
  const banco = (d.banco || []).filter(b => b);
  return `<div class="fp-caja">
    <div class="fp-cols">
      <div>
        <h4>El once <span>${d.esq ? esc(esquemaLindo(d.esq)) : ''}</span></h4>
        ${orden.map(linea).join('')}
      </div>
      ${banco.length ? `<div>
        <h4>El banco</h4>
        ${banco.map(b => `<div class="fp-j${b.entro ? ' fp-j-entro' : ''}">
          <span class="fp-j-n">${esc(b.n)}<small>${esc(b.eq)} · ${b.pos}${b.entro ? ' · entró' : ''}</small></span>
          <span class="fp-j-p">${b.real == null ? '<span class="text-muted">–</span>' : b.real}</span>
          <span class="fp-j-d text-muted">·</span></div>`).join('')}
      </div>` : ''}
    </div>
    <div class="fp-cierre">
      <span>La app le calculó <b>${n1(d.total)}</b> con las fichas de Planeta.</span>
      ${desvio == null ? ''
        : (Math.abs(desvio) < 0.05
            ? '<span class="ok">Coincide exacto con el juego.</span>'
            : `<span class="${Math.abs(desvio) <= 1.5 ? '' : 'mal'}">Contra el juego hay <b>${desvio > 0 ? '+' : ''}${n1(desvio)}</b> de diferencia${
                Math.abs(desvio) <= 1.5
                  ? ' — suele ser una ficha que Planeta no publicó.'
                  : ': con esa distancia, el once que tenés cargado no es el que jugó esa fecha.'}</span>`)}
      <span class="fp-tercera">La columna de la derecha es contra lo que esperaba el motor;
        el punto gris es que de ese jugador no quedó guardado el esperado.</span>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  LA FECHA ANTERIOR: el archivo de lo que ya pasó
// ════════════════════════════════════════════════════════════════════════════
// El problema que resuelve. Cuando corrés ACTUALIZAR_TODO, datos.js pasa a la
// fecha siguiente y TODO lo de la fecha que terminó desaparece: los puntos
// reales, lo que el motor esperaba de cada uno, quién ganó el torneo. La app
// vivía sólo en presente, y por eso no se podía contestar la única pregunta que
// importa —¿le acertó el motor?— con un número en vez de con una sensación.
//
// La foto se toma SOLA cuando los 15 partidos están publicados, y se guarda
// entera: nombres, equipos, puntos y esperados adentro del propio registro. No
// depende de datos.js, así que sigue estando cuando el motor ya está en la 9.
const CLAVE_HIST = 'gdt_hist_v1';

// ════════════════════════════════════════════════════════════════════════════
//  LAS FOTOS VIENEN DE UN ARCHIVO (17/09)
//  ------------------------------------------------------------------------
//  dataFotos.js lo escribe foto.cjs desde datos.js + dataVivo.js + dataHist.js
//  + dataLiga.js, con las reglas del juego. Antes esto se calculaba aca y se
//  guardaba en el localStorage, con tres consecuencias que se sufrieron todas:
//  en Vercel cada visitante abria SU localStorage vacio y no veia NINGUN
//  historial; la foto salia cuando uno abria la pagina, asi que una fecha a
//  medio publicar quedaba clavada para siempre; y ningun auditor la podia
//  revisar porque no era un archivo.
//
//  EL ARCHIVO MANDA. Si una fecha esta en dataFotos.js, esa es la buena: la
//  calculo la cadena con los datos completos, es igual para todos y esta
//  auditada. El localStorage queda solo para las fechas que el archivo todavia
//  no tiene (por ejemplo la que se esta jugando ahora).
function fotosDeArchivo() {
  const F = (typeof window !== 'undefined') ? window.FOTOS : null;
  return (F && typeof F === 'object') ? F : {};
}
const fotoEsDeArchivo = n => !!fotosDeArchivo()[n];

function leerHist() {
  const arch = fotosDeArchivo();
  try {
    const x = JSON.parse(localStorage.getItem(CLAVE_HIST) || '{}');
    const local = (x && typeof x === 'object') ? x : {};
    return Object.assign({}, local, arch);   // el archivo pisa al navegador
  } catch (e) { return Object.assign({}, arch); }
}
function leerHistLocal() {
  try { const x = JSON.parse(localStorage.getItem(CLAVE_HIST) || '{}'); return (x && typeof x === 'object') ? x : {}; }
  catch (e) { return {}; }
}
function guardarHist(h) {
  try { localStorage.setItem(CLAVE_HIST, JSON.stringify(h)); return true; }
  catch (e) {
    // el localStorage se llenó: se tiran las fechas más viejas antes de rendirse
    try {
      const ns = Object.keys(h).map(Number).sort((a, b) => a - b);
      while (ns.length > 3) { delete h[ns.shift()]; }
      localStorage.setItem(CLAVE_HIST, JSON.stringify(h)); return true;
    } catch (e2) { return false; }
  }
}
function fechasGuardadas() { return Object.keys(leerHist()).map(Number).sort((a, b) => b - a); }

// El detalle de un once, con lo esperado y lo real de cada uno
function fotoOnce(t) {
  const m = marcadorEquipo(t);
  const jug = j => { const e = espDe(j.p); return {
    k: kDe(j.p), n: nombreCorto(j.p.n), eq: NOM(j.p.eq), pos: j.p.pos,
    esp: e == null ? null : +e.toFixed(2),
    real: j.pts, cap: capDe(t) === j.p.id
  }; };
  const once = m.det.map(jug);
  const banco = m.banquito.filter(b => b.p).map(b => { const e = espDe(b.p); return {
    k: kDe(b.p), n: nombreCorto(b.p.n), eq: NOM(b.p.eq), pos: b.pos,
    esp: e == null ? null : +e.toFixed(2),
    real: b.pts != null ? b.pts : null, entro: b.estado === 'entro'
  }; });
  return {
    nombre: t.nombre, dt: t.dt || null, motor: !!t.motor, mio: !!t.mio,
    esq: t.esq || null, once, banco,
    cinta: { quien: m.cinta.quien, valor: m.cinta.valor, estado: m.cinta.estado },
    total: +m.total.toFixed(1),
    // lo que el motor esperaba de ESE once antes de que se jugara
    esperado: +once.reduce((a, x) => a + (x.esp || 0), 0).toFixed(1),
    // cuantos del once tienen esperado: si faltan, el total de arriba no es comparable
    sinEsp: once.filter(x => x.esp == null).length,
    // MANZANAS CON MANZANAS. Con la fecha a medio jugar, comparar el esperado
    // de los once contra los puntos de los ocho que ya jugaron da una
    // diferencia falsa de veinte puntos. Para la resta se usa solo lo que se
    // esperaba de los que YA tienen resultado.
    espHecho: +once.filter(x => x.real != null && x.esp != null).reduce((a, x) => a + x.esp, 0).toFixed(1),
    espHechoDe: once.filter(x => x.real != null && x.esp != null).length,
    realDeEsos: +once.filter(x => x.real != null && x.esp != null).reduce((a, x) => a + (x.real || 0), 0).toFixed(1),
    jugaron: m.jugaron, n: m.n
  };
}

// La foto entera de la fecha. Se puede volver a sacar: la nueva pisa a la vieja.
window.capturarFecha = function (silencio, fechaForzada) {
  if (!D || D.fechaObjetivo == null || !VIVO) return null;
  const n = (fechaForzada != null) ? fechaForzada : D.fechaObjetivo;
  // todos los jugadores con puntaje real, con lo que el motor les esperaba:
  // esta es la tabla con la que después se mide si el modelo acierta
  const jug = [];
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => (D.rankings[pos] || []).forEach(x => {
    const v = vivoDe(x.id); if (!v || v.p == null) return;
    const e2 = espDe(x);
    jug.push({ k: kDe(x), n: nombreCorto(x.n), eq: NOM(x.eq), pos,
               esp: e2 == null ? null : +e2.toFixed(2), real: v.p });
  }));
  const foto = {
    fecha: n,
    cuando: new Date().toISOString(),
    partidos: (VIVO.partidos || []).length,
    deTotal: (D.partidos || []).length,
    completa: fechaTerminada(),
    version: D.version || null,
    motor: fotoOnce(MOTOR_DE_ESA_FECHA || equipoMotor()),
    mio: (() => { const t = ((S.liga && S.liga.equipos) || []).find(z => z.mio);
                  return (t && (onceDe(t) || []).length) ? fotoOnce(t) : null; })(),
    equipos: equiposTorneo().filter(t => (onceDe(t) || []).length).map(fotoOnce),
    jugadores: jug
  };
  // La foto de archivo manda: la calculo la cadena con los datos completos y es
  // la que ven todos. Pisarla con una sacada a mano seria volver al problema.
  if (fotoEsDeArchivo(n)) {
    if (!silencio) alert('La fecha ' + n + ' ya está guardada en el archivo (dataFotos.js), que es el que ven todos.\n\n' +
      'Esa foto la calcula la cadena con la fecha terminada, así que no hace falta sacarla a mano. ' +
      'Si está mal, corré  foto.cjs  de nuevo.');
    return fotosDeArchivo()[n];
  }
  const h = leerHistLocal(); h[n] = foto;
  const ok = guardarHist(h);
  if (!silencio) {
    if (ok) alert('Guardada la fecha ' + n + ' en este navegador.\n\n' +
      'Ojo: esta foto es tuya y no la ven los demás. La definitiva la escribe foto.cjs cuando cierra la fecha.');
    else alert('No entró en el navegador: hay demasiadas fechas guardadas.');
  }
  return ok ? foto : null;
};

// ── RESCATE: la fecha que quedó sin foto ───────────────────────────────────
// Pasa cuando uno corre ACTUALIZAR_TODO sin abrir el index en el medio: el
// motor pasa a la fecha siguiente y los esperados de la anterior se van con él.
// Se puede rearmar igual, con dos archivos que SÍ quedaron: dataVivo.js tiene
// los puntos reales de esa fecha, y dataHist.js el esperado de cada jugador.
//
// La trampa: los ids de dataVivo.js son el número de fila de datos.js, y datos.js
// se rehizo. Si los ids ya no corresponden, los puntos se le colgarían a OTRO
// jugador, en silencio. Por eso vivo.cjs sella contra qué datos.js cruzó, y sin
// ese sello el rescate no se hace: se pide correr SYNC_VIVO de nuevo.
function estadoRescate() {
  const V = (typeof window !== 'undefined') ? window.VIVO : null;
  if (!V || !D || V.fecha == null) return null;
  if (V.fecha === D.fechaObjetivo) return null;       // de eso se encarga autoCapturar
  if (leerHist()[V.fecha]) return null;               // ya está guardada
  const H = (typeof window !== 'undefined') && window.HIST ? window.HIST[V.fecha] : null;
  // {} ES VERDADERO (13/09). Este chequeo era "!H.esperados", y un objeto vacio
  // pasa. Las fechas viejas de dataHist.js vienen con esperados:{} y once:[]
  // porque su historial/fecha_N.json es anterior al campo "todos". Con eso, el
  // rescate se daba por listo, corria SOLO al abrir la pagina, y guardaba una
  // foto con CERO esperados y —peor— con el once que el motor recomienda HOY,
  // que es un equipo que en esa fecha no existio. Esa foto despues no habia
  // forma de distinguirla de una buena.
  const cuantos = (H && H.esperados) ? Object.keys(H.esperados).length : 0;
  if (!H || cuantos < 50) return { fecha: V.fecha, falta: 'hist' };
  // sin el once de esa fecha, la foto mostraria el once de hoy con los puntos
  // de entonces: mejor no tenerla que tenerla mal
  if (!Array.isArray(H.once) || H.once.length < 7) return { fecha: V.fecha, falta: 'once' };
  if (!V.generadoCon || V.generadoCon !== D.generado) return { fecha: V.fecha, falta: 'sello' };
  return { fecha: V.fecha, listo: true, V, esperados: H.esperados, n: cuantos };
}
window.rescatarFecha = function (silencio) {
  const e = estadoRescate();
  if (!e || !e.listo) { if (!silencio) alert('No se puede rearmar esa fecha todavía.'); return null; }
  // el once del motor de ESA fecha, si quedó guardado
  const H = window.HIST[e.fecha];
  const r = (H && Array.isArray(H.once) && H.once.length) ? idsDesdeClaves(H.once) : null;
  MOTOR_DE_ESA_FECHA = (r && r.ids.length >= 7)
    ? { id: '__motor', nombre: 'El motor', motor: true, once: r.ids,
        banco: {}, cap: (H.capitan && porClave(H.capitan) ? porClave(H.capitan).id : null),
        esq: H.esquema || null, fichas: {} }
    : null;
  const f = conVivo(e.V, e.esperados, () => capturarFecha(true, e.fecha));
  MOTOR_DE_ESA_FECHA = null;
  if (!silencio && f) { REV_FECHA = e.fecha; pintarRevision(); }
  return f;
};

// Se saca sola cuando ya se jugó todo. Es gratis y evita el "me olvidé".
function autoCapturar() {
  try {
    // primero, la que quedó colgada de la fecha pasada
    const r = estadoRescate();
    if (r && r.listo) rescatarFecha(true);
  } catch (e) { }
  try {
    if (!D || !VIVO || D.fechaObjetivo == null) return;
    if (fotoEsDeArchivo(D.fechaObjetivo)) return;   // la buena ya esta en el archivo
    const h = leerHist(), y = h[D.fechaObjetivo];
    const hay = (VIVO.partidos || []).length;
    // LA FOTO DE LA FECHA EN CURSO SE REFRESCA SOLA (13/09).
    // Antes solo se sacaba con la fecha terminada. Pero si uno apretaba
    // "actualizar la foto" un sábado a la tarde, esa foto —con dos partidos
    // publicados— quedaba clavada en Revisión todo el fin de semana, diciendo
    // "2 de 11 jugaron" mientras el Versus ya mostraba siete. Dos pantallas de
    // la misma app contando cosas distintas.
    if (y && !y.completa && hay > (y.partidos || 0)) { capturarFecha(true); return; }
    if (!fechaTerminada()) return;
    // si ya está guardada con los mismos partidos, no se toca
    if (y && y.completa && y.partidos >= hay) return;
    capturarFecha(true);
  } catch (e) { }
}

// ── LA PANTALLA ────────────────────────────────────────────────────────────
let REV_FECHA = null;
window.verRevision = function (n) { REV_FECHA = +n; pintarRevision(); };
// Una foto mal sacada no se arregla sola: queda guardada en el navegador y
// pisa cualquier intento posterior. Sin un boton para tirarla, el unico camino
// era vaciar el localStorage entero y perder tambien las buenas.
window.borrarFoto = function (n) {
  if (fotoEsDeArchivo(n)) {
    alert('La fecha ' + n + ' viene del archivo dataFotos.js, no de este navegador.\n\n' +
      'No se puede borrar desde acá, y es a propósito: es la foto que ven todos. ' +
      'Si quedó mal, se rehace corriendo  foto.cjs  con esa fecha.');
    return;
  }
  const h = leerHistLocal();
  if (!h[n]) return;
  if (!confirm('¿Borrar la foto de la fecha ' + n + '?\n\n' +
    'Se puede volver a sacar mientras dataVivo.js siga siendo de esa fecha. ' +
    'Si ya pasó, esa foto se pierde.')) return;
  delete h[n]; guardarHist(h);
  REV_FECHA = null;
  pintarRevision();
};

function bloqueRescate(r) {
  if (!r || r.fecha == null) return '';
  if (r.listo) return `<div class="rev-aviso rev-resc">La <b>fecha ${r.fecha}</b> no está guardada, pero
    se puede rearmar: tengo los puntos reales y lo que el motor esperaba de ${r.n} jugadores.
    <button class="vs-btn vs-btn-chico" onclick="rescatarFecha()">rearmar la fecha ${r.fecha}</button></div>`;
  if (r.falta === 'sello') return `<div class="rev-aviso">La <b>fecha ${r.fecha}</b> se puede rearmar, pero
    <b>dataVivo.js</b> se cruzó contra un <code>datos.js</code> anterior: sus números de jugador ya no
    corresponden y colgarle los puntos a otro sería peor que no tenerlos.
    Corré <b>SYNC_VIVO.bat</b> —tarda dos segundos— y volvé a entrar acá.</div>`;
  if (r.falta === 'once') return `<div class="rev-aviso">La <b>fecha ${r.fecha}</b> quedó sin foto y en
    <b>dataHist.js</b> no está el once que el motor recomendaba esa semana. Rearmarla mostraría el once
    de <b>hoy</b> con los puntos de entonces: un equipo que nunca existió. Prefiero no hacerla.</div>`;
  return `<div class="rev-aviso">La <b>fecha ${r.fecha}</b> quedó sin foto y en <b>dataHist.js</b> no está
    lo que el motor esperaba de cada jugador esa semana —su <code>historial/fecha_${r.fecha}.json</code> es
    anterior al campo que lo guarda—. Sin eso, la foto no tendría con qué comparar.</div>`;
}
function pintarRevision() {
  const cont = $('pantalla-revision'); if (!cont) return;
  const hs = leerHist();
  const ns = fechasGuardadas();
  if (!ns.length) {
    const puede = !!(D && VIVO && D.fechaObjetivo != null);
    cont.innerHTML = `
      ${cabecera('Revisión', 'Lo que pasó en las fechas que ya se jugaron', '')}
      ${bloqueRescate(estadoRescate())}
      <div class="card rev-vacio">
        <h2>Todavía no hay ninguna fecha guardada</h2>
        <p>Esta pantalla no calcula nada en vivo: muestra la <b>foto</b> de una fecha terminada —lo que
        sacó cada uno, lo que el motor esperaba, y cómo salió el torneo—. La foto se saca sola cuando
        los partidos están todos publicados, y queda guardada aunque el motor pase a la fecha siguiente.</p>
        ${puede ? `<p>Ahora mismo el motor está en la <b>fecha ${D.fechaObjetivo}</b> con
          <b>${(VIVO.partidos || []).length}</b> de ${(D.partidos || []).length} partidos publicados.
          ${fechaTerminada() ? 'Ya se jugó todo: podés guardarla.' : 'Cuando estén los ' + (D.partidos || []).length + ' se guarda sola.'}</p>
          <button class="vs-btn vs-btn-fuerte" onclick="capturarFecha()">Guardar la fecha ${D.fechaObjetivo} ahora</button>`
          : '<p>Falta <b>dataVivo.js</b>: corré <b>SYNC_VIVO.bat</b>.</p>'}
      </div>`;
    return;
  }
  if (REV_FECHA == null || !hs[REV_FECHA]) REV_FECHA = ns[0];
  // LA FOTO QUE NO SE SACO A TIEMPO. Si dataVivo.js quedo de una fecha anterior
  // a la del motor y esa fecha no esta guardada, ya no se puede reconstruir:
  // datos.js no tiene mas los esperados de esa semana. Se avisa, aunque sea
  // para que la proxima vez el orden sea el correcto.
  const resc = estadoRescate();
  const f = hs[REV_FECHA];
  const enCurso = !!(D && D.fechaObjetivo === f.fecha);
  const deArchivo = fotoEsDeArchivo(f.fecha);

  const selector = `<div class="rev-sel">${ns.map(n => `<button class="chip-filtro${n === REV_FECHA ? ' on' : ''}"
      onclick="verRevision(${n})">Fecha ${n}</button>`).join('')}
      ${deArchivo ? '' : `<button class="chip-filtro rev-borrar" onclick="borrarFoto(${f.fecha})"
        title="${esc('Tirar la foto de la fecha ' + f.fecha + '. Sirve cuando quedó mal sacada.')}">✕ borrar esta foto</button>`}
    </div>`;

  // UNA FOTO POBRE HAY QUE DECIRLA (13/09). Si la mayoría del once no tiene
  // esperado, todas las comparaciones de abajo son aire, y hasta ahora eso se
  // veía como un montón de "s/d" sueltos sin explicar de dónde salían.
  const sinEsp = ((f.motor && f.motor.sinEsp) || 0) + ((f.mio && f.mio.sinEsp) || 0);
  const totEsp = ((f.motor && f.motor.once) || []).length + ((f.mio && f.mio.once) || []).length;
  const avisoPobre = (totEsp > 0 && sinEsp >= totEsp / 2) ? `<div class="rev-aviso rev-aviso-mal">
    Esta foto se sacó <b>sin los esperados</b> de la fecha ${f.fecha}: ${sinEsp} de ${totEsp} jugadores
    no tienen con qué compararse. Salió de un rescate que no debería haber corrido.
    Lo más sano es <b>borrarla</b> con el botón de arriba.</div>` : '';

  cont.innerHTML = `
    ${cabecera('Revisión', 'Fecha ' + f.fecha + ' · ' + (f.completa ? 'terminada' : f.partidos + ' de ' + f.deTotal + ' partidos') +
      ' · foto del ' + fechaCorta(f.cuando), deArchivo ? '' : `<button class="vs-btn vs-btn-chico" onclick="capturarFecha()"
        title="Vuelve a sacar la foto de la fecha que el motor tiene ahora. Si ya existe, la pisa.">actualizar la foto</button>`)}
    ${deArchivo ? (f.recuperada ? `<div class="rev-archivo rev-recuperada">
      <b>Fecha recuperada.</b> Esto es el once que el motor recomendó esa semana —guardado antes de que se
      jugara— contra lo que pagó cada uno según la planilla. Lo que <b>no</b> hay, y no se inventa:
      la <b>cinta</b> (la planilla no guarda la ficha fecha por fecha), el <b>torneo de amigos</b>
      (equipos.txt tiene los onces de ahora, no los de entonces) y el <b>banco</b>.
      ${f.escalaDudosa ? `<br><b>Ojo con esta fecha:</b> el once se reconstruyó a mano y sus esperados salen
        de una versión anterior del motor —esperaba ${f.motor ? n1(f.motor.esperado) : '–'} cuando en las
        siguientes esperaba entre 58 y 66—. La diferencia contra lo real no es comparable con las otras fechas.` : ''}
      </div>` : `<div class="rev-archivo">Esta fecha viene del <b>archivo</b>, no de tu navegador: la calculó
      la cadena con la fecha terminada y es la misma que ven todos.${f.motor && f.motor.sinBanco
        ? ' <b>El once del motor va sin suplentes</b>: el banco se empezó a guardar el 17/09 y esta fecha es anterior, así que compitió con 11 contra los 15 de cada equipo.'
        : ''}</div>`) : `<div class="rev-aviso">Esta foto está guardada <b>solo en este navegador</b>: no la ven los demás
      y se pierde si limpiás Chrome. La definitiva la escribe <b>foto.cjs</b> cuando cierra la fecha.</div>`}
    ${selector}
    ${avisoPobre}
    ${enCurso && !f.completa ? `<div class="rev-aviso">La fecha ${f.fecha} <b>todavía se está jugando</b>:
      lo de abajo es la foto de <b>${f.partidos}</b> de ${f.deTotal} partidos${
        VIVO && (VIVO.partidos || []).length > (f.partidos || 0)
          ? `, y ya hay <b>${(VIVO.partidos || []).length}</b> publicados. Se rehace sola al entrar; si no, tocá "actualizar la foto"`
          : '. Cuando estén los ' + f.deTotal + ', se rehace sola'}.</div>` : ''}
    ${bloqueRescate(resc)}
    ${bloqueRevTres(f)}
    ${bloqueRevMotor(f)}
    ${bloqueRevMio(f)}
    ${bloqueRevTorneo(f)}
    ${bloqueRevAciertos(f)}`;
}

// ── LOS TRES: el motor, el tuyo y el que ganó el torneo ────────────────────
function bloqueRevTres(f) {
  const gan = (f.equipos || []).slice().sort((a, b) => b.total - a.total)[0] || null;
  const tarj = (t, rot, ic) => {
    if (!t) return '';
    // se comparan SOLO los que tienen las dos cosas: resultado y esperado.
    // Si de alguno no quedo el esperado —una fecha rescatada de la que solo
    // sobrevivio el top 25— se dice, en vez de restar peras con manzanas.
    const esp = (t.espHecho != null) ? t.espHecho : t.esperado;
    const base = (t.realDeEsos != null) ? t.realDeEsos : t.total;
    const dif = base - esp;
    const faltan = t.sinEsp || 0;
    return `<div class="rev-t">
      <div class="rev-t-rot">${ic} ${rot}</div>
      <div class="rev-t-nom">${esc(t.nombre)}</div>
      <div class="rev-t-pts">${n1(t.total)}</div>
      <div class="rev-t-esp" title="${esc('El motor esperaba ' + n1(esp) + ' de los ' + (t.espHechoDe || 0) +
        ' que tienen resultado y esperado; esos hicieron ' + n1(base) + '.' +
        (faltan ? ' De ' + faltan + ' no quedó guardado el esperado.' : ''))}">
        esperaba ${n1(esp)} · <b class="${dif >= 0 ? 'ok' : 'mal'}">${dif >= 0 ? '+' : ''}${n1(dif)}</b>
        ${faltan ? `<span class="rev-falta" title="De estos no quedó el esperado del motor: sólo cuentan en los puntos, no en la comparación.">${faltan} s/d</span>` : ''}</div>
      <div class="rev-t-sub">${t.jugaron} de ${t.n} jugaron${t.cinta && t.cinta.quien
        ? ' · cinta ' + (t.cinta.estado === 'perdida' ? '<b class="mal">perdida</b>' : '+' + n1(t.cinta.valor)) : ''}</div>
    </div>`;
  };
  return `<div class="card rev-card">
    <div class="tr-cab"><h2>Cómo terminó la fecha ${f.fecha}</h2>
      <p>Los tres onces que importan, con lo que sacaron de verdad y lo que el motor esperaba de cada uno.</p></div>
    <div class="rev-tres">
      ${tarj(f.motor, 'El motor', '🤖')}
      ${tarj(f.mio, 'El tuyo', '👤')}
      ${gan ? tarj({ ...gan, nombre: gan.nombre }, 'Ganó el torneo', '🏆') : ''}
    </div>
    ${(() => {
      const a = f.motor, b = f.mio;
      if (!a || !b) return '';
      const d = b.total - a.total;
      return `<p class="rev-frase">${d === 0
        ? `Empataron en <b>${n1(a.total)}</b>.`
        : (d > 0 ? `Tu once le ganó al motor por <b>${n1(d)}</b>.` : `El motor te ganó por <b>${n1(-d)}</b>.`)}
        ${gan ? (gan.total > Math.max(a.total, b.total)
          ? ` Los dos abajo de <b>${esc(gan.nombre)}</b>, que hizo ${n1(gan.total)}.`
          : ` Los dos arriba del mejor del torneo, que hizo ${n1(gan.total)}.`) : ''}</p>`;
    })()}
  </div>`;
}

// ── EL MOTOR: dónde acertó y dónde no ──────────────────────────────────────
function bloqueRevMotor(f) {
  const m = f.motor; if (!m) return '';
  const filas = m.once.slice().sort((a, b) => (b.real ?? -99) - (a.real ?? -99));
  return tarjetaPleg('rev-motor', 'El once del motor, jugador por jugador',
    'Lo que esperaba de cada uno contra lo que sacó. La diferencia es el error del modelo en ese jugador.',
    `<table class="data-table rev-tabla">
      <thead><tr><th>Jugador</th><th class="text-center">Esperaba</th><th class="text-center">Hizo</th>
        <th class="text-center">Diferencia</th></tr></thead>
      <tbody>${filas.map(j => filaRev(j)).join('')}</tbody>
      ${pieRev(m, 'del once del motor')}
    </table>`, true);
}
function pieRev(t, que) {
  const esp = t.espHecho != null ? t.espHecho : t.esperado;
  const base = t.realDeEsos != null ? t.realDeEsos : t.total;
  const d = base - esp;
  const n = t.espHechoDe != null ? t.espHechoDe : t.n;
  return `<tfoot><tr>
    <td><b>Los ${n} ${que} que jugaron y tienen esperado</b></td>
    <td class="text-center"><b>${n1(esp)}</b></td>
    <td class="text-center"><b>${n1(base)}</b></td>
    <td class="text-center"><b class="${d >= 0 ? 'ok' : 'mal'}">${d >= 0 ? '+' : ''}${n1(d)}</b></td></tr>
    ${base !== t.total ? `<tr><td colspan="4" class="rev-pie-nota">El equipo hizo <b>${n1(t.total)}</b> en total
      —con la cinta y con los que no entran en esta comparación—.</td></tr>` : ''}</tfoot>`;
}
function filaRev(j) {
  const d = (j.real == null || j.esp == null) ? null : j.real - j.esp;
  return `<tr>
    <td><div class="player-info"><div class="player-name">${esc(j.n)}${j.cap ? ' <span class="rev-c">C</span>' : ''}</div>
      <div class="player-sub">${esc(j.eq)} · ${j.pos}</div></div></td>
    <td class="text-center">${j.esp == null ? '<span class="text-muted" title="De este jugador no quedó guardado lo que el motor esperaba.">s/d</span>' : n1(j.esp)}</td>
    <td class="text-center"><b>${j.real == null ? '<span class="text-muted">no jugó</span>' : j.real}</b></td>
    <td class="text-center">${d == null ? '<span class="text-muted">–</span>'
      : (Math.abs(d) < 0.05 ? '<span class="text-muted">clavado</span>'
        : `<span class="${d > 0 ? 'ok' : 'mal'}">${d > 0 ? '+' : ''}${n1(d)}</span>`)}</td>
  </tr>`;
}

// ── TU ONCE, Y LO QUE TE PERDISTE ──────────────────────────────────────────
function bloqueRevMio(f) {
  const t = f.mio; if (!t) return '';
  const m = f.motor;
  const mios = new Set(t.once.map(j => j.k));
  // el que el motor tenía y vos no: lo que te costó no hacerle caso
  const perdidos = m ? m.once.filter(j => !mios.has(j.k)).sort((a, b) => (b.real ?? -99) - (a.real ?? -99)) : [];
  const ganados = m ? t.once.filter(j => !m.once.some(z => z.k === j.k)).sort((a, b) => (b.real ?? -99) - (a.real ?? -99)) : [];
  const suma = a => a.reduce((x, j) => x + (j.real || 0), 0);
  const dif = suma(ganados) - suma(perdidos);
  return tarjetaPleg('rev-mio', 'Tu once contra el del motor',
    'Los que compartían no mueven nada. La fecha se decidió en los que no.',
    `<table class="data-table rev-tabla">
      <thead><tr><th>Tu once</th><th class="text-center">Esperaba</th><th class="text-center">Hizo</th><th class="text-center">Diferencia</th></tr></thead>
      <tbody>${t.once.slice().sort((a, b) => (b.real ?? -99) - (a.real ?? -99)).map(filaRev).join('')}</tbody>
      ${pieRev(t, 'de tu once')}
    </table>
    ${(perdidos.length || ganados.length) ? `<div class="rev-cruce">
      <div class="rev-col">
        <h4>Los tuyos que el motor no tenía <span>${n1(suma(ganados))} pts</span></h4>
        ${ganados.length ? ganados.map(j => `<div class="rev-l"><span>${esc(j.n)}<small>${esc(j.eq)}</small></span>
          <b class="${(j.real || 0) >= 6 ? 'ok' : ''}">${j.real == null ? 'no jugó' : j.real}</b></div>`).join('')
          : '<p class="rev-nada">Ninguno: pusiste el once del motor.</p>'}
      </div>
      <div class="rev-col">
        <h4>Los del motor que no pusiste <span>${n1(suma(perdidos))} pts</span></h4>
        ${perdidos.length ? perdidos.map(j => `<div class="rev-l"><span>${esc(j.n)}<small>${esc(j.eq)}</small></span>
          <b class="${(j.real || 0) >= 6 ? 'mal' : ''}">${j.real == null ? 'no jugó' : j.real}</b></div>`).join('')
          : '<p class="rev-nada">Ninguno.</p>'}
      </div>
    </div>
    <p class="rev-frase">${dif === 0 ? 'Los cambios que hiciste dieron exactamente lo mismo.'
      : (dif > 0 ? `Tus cambios sumaron <b class="ok">${n1(dif)}</b> más que lo que decía el motor.`
                 : `Tus cambios costaron <b class="mal">${n1(-dif)}</b> respecto de hacerle caso al motor.`)}</p>` : ''}`, false);
}

// ── EL TORNEO EN ESA FECHA ─────────────────────────────────────────────────
function bloqueRevTorneo(f) {
  const eq = (f.equipos || []).slice().sort((a, b) => b.total - a.total);
  if (!eq.length) return '';
  const max = eq[0].total || 1;
  return tarjetaPleg('rev-torneo', 'El torneo de amigos en la fecha ' + f.fecha,
    'Lo que sacó cada uno. Los puntos son los que calculó la app con las fichas de Planeta.',
    `<table class="data-table rev-tabla">
      <thead><tr><th>#</th><th>Equipo</th><th class="text-center">Jugaron</th>
        <th class="text-center">Puntos</th><th class="text-center">Esperaba</th><th>&nbsp;</th></tr></thead>
      <tbody>${eq.map((t, i) => `<tr>
        <td class="text-center">${i + 1}</td>
        <td><b>${esc(t.nombre)}</b>${t.cinta && t.cinta.estado === 'perdida'
          ? '<div class="player-sub mal">perdió la cinta</div>'
          : (t.cinta && t.cinta.quien ? `<div class="player-sub">cinta: ${esc(t.cinta.quien)} +${n1(t.cinta.valor)}</div>` : '')}</td>
        <td class="text-center">${t.jugaron}/${t.n}</td>
        <td class="text-center"><b class="rev-p">${n1(t.total)}</b></td>
        <td class="text-center"><span class="text-muted">${n1(t.espHecho != null ? t.espHecho : t.esperado)}</span></td>
        <td class="rev-barra"><i style="width:${Math.max(2, 100 * t.total / max)}%"></i></td>
      </tr>`).join('')}</tbody>
    </table>
    ${(() => {
      const conMotor = f.motor ? [...eq, { nombre: 'El motor', total: f.motor.total }] : eq;
      const conMio = f.mio ? [...conMotor, { nombre: 'El tuyo', total: f.mio.total }] : conMotor;
      const orden = conMio.slice().sort((a, b) => b.total - a.total);
      const pMotor = f.motor ? orden.findIndex(x => x.nombre === 'El motor') + 1 : null;
      const pMio = f.mio ? orden.findIndex(x => x.nombre === 'El tuyo') + 1 : null;
      if (!pMotor && !pMio) return '';
      return `<p class="rev-frase">Si hubieran jugado la fecha con ellos:
        ${pMotor ? `el motor terminaba <b>${pMotor}º de ${orden.length}</b>` : ''}${pMotor && pMio ? ' y ' : ''}${pMio ? `el tuyo <b>${pMio}º</b>` : ''}.</p>`;
    })()}`, false);
}

// ── DÓNDE ACERTÓ Y DÓNDE SE EQUIVOCÓ EL MOTOR, EN TODA LA LIGA ─────────────
// No sobre los onces: sobre los 400 jugadores que puntuaron. Es la única forma
// de saber si el modelo está bien calibrado o si acertó de casualidad.
function bloqueRevAciertos(f) {
  // SOLO LOS QUE TIENEN LAS DOS COSAS. Con esp null la resta daba real - 0 y
  // el "sesgo" era el promedio de puntos de la liga: un numero sin sentido.
  const j = (f.jugadores || []).filter(x => x.real != null && x.esp != null);
  const conReal = (f.jugadores || []).filter(x => x.real != null).length;
  if (j.length < 20) return '';
  const err = j.map(x => ({ ...x, d: x.real - x.esp }));
  const n = err.length;
  const media = err.reduce((a, x) => a + x.d, 0) / n;
  const eam = err.reduce((a, x) => a + Math.abs(x.d), 0) / n;
  const arriba = err.filter(x => x.d > 0).length;
  const top = err.slice().sort((a, b) => b.d - a.d).slice(0, 8);
  const fondo = err.slice().sort((a, b) => a.d - b.d).slice(0, 8);
  const lista = a => a.map(x => `<div class="rev-l"><span>${esc(x.n)}<small>${esc(x.eq)} · ${x.pos}</small></span>
    <b>${x.real}</b><i>esperaba ${n1(x.esp)}</i><b class="${x.d >= 0 ? 'ok' : 'mal'}">${x.d >= 0 ? '+' : ''}${n1(x.d)}</b></div>`).join('');
  return tarjetaPleg('rev-cal', 'Qué tan bien le pegó el motor',
    n >= conReal - 2
      ? 'Sobre los ' + n + ' jugadores que puntuaron en la fecha, no sólo los de los onces.'
      : 'Sobre ' + n + ' de los ' + conReal + ' que puntuaron: de los otros no quedó guardado el esperado. ' +
        'Ojo con eso — los que quedaron son los mejor rankeados de cada puesto, así que esto no es toda la liga.',
    `<div class="rev-nums">
      <div class="rev-n"><b>${media >= 0 ? '+' : ''}${n2(media)}</b><span>sesgo medio</span>
        <i>${Math.abs(media) < 0.3 ? 'centrado: no tira ni para arriba ni para abajo'
            : (media > 0 ? 'el motor esperó de MENOS: la fecha rindió más de lo previsto'
                         : 'el motor esperó de MÁS: la fecha rindió menos de lo previsto')}</i></div>
      <div class="rev-n"><b>${n2(eam)}</b><span>error medio</span>
        <i>lo que se equivoca por jugador, para cualquier lado</i></div>
      <div class="rev-n"><b>${Math.round(100 * arriba / n)}%</b><span>superó lo esperado</span>
        <i>queda abajo del 50% incluso con el modelo perfecto: la mayoría saca poco y unos pocos hacen
        una fecha enorme, y esos pocos son los que levantan el promedio</i></div>
    </div>
    <div class="rev-cruce">
      <div class="rev-col"><h4>Los que reventaron el pronóstico</h4>${lista(top)}</div>
      <div class="rev-col"><h4>Los que lo dejaron pagando</h4>${lista(fondo)}</div>
    </div>
    <p class="rev-nota-cal">Una fecha sola no dice si el modelo es bueno: dice cómo salió esta. Cuando haya
    varias guardadas se puede mirar si el sesgo se repite —eso sí es del modelo— o si se va turnando, que
    es lo que hace el azar.</p>`, false);
}

function bloqueLaboratorio(msLab, msTorneo) {
  const conOnce = msLab.filter(m => m.n > 0);
  if (!conOnce.length) return '';
  const puestoEntre = m => {
    if (!msTorneo.length) return null;
    const mejores = msTorneo.filter(z => z.total > m.total).length;
    return { puesto: mejores + 1, total: msTorneo.length + 1 };
  };
  const misPts = (S.liga && S.liga.misPuntos != null) ? S.liga.misPuntos : null;
  const enGral = puestoEnGeneral(misPts);
  const tarjeta = m => {
    const p = puestoEntre(m);
    const ic = m.t.motor ? '🤖' : '👤';
    return `<div class="lab-t ${m.t.motor ? 'lab-motor' : 'lab-mio'}">
      <div class="lab-cab">${ic} <b>${esc(m.t.motor ? 'El motor' : 'El tuyo')}</b>
        <span>${m.jugaron} de ${m.n} jugaron</span></div>
      <div class="lab-pts">${n1(m.total)}</div>
      <div class="lab-proy">proyección <b>${n1(m.proyeccion)}</b></div>
      ${p ? `<div class="lab-puesto" title="${esc('Dónde quedaría en ESTA FECHA si jugara el torneo, con los puntos de ahora. No compite: es para medir.')}">
        esta fecha iría <b>${p.puesto}º</b> de ${p.total}</div>` : ''}
      ${m.t.mio ? `<div class="lab-gral">
        <label title="${esc('Tus puntos acumulados en el torneo, como los muestra el Gran DT. Se cargan a mano porque vos no sos uno de los DTs de la tabla que pegaste.')}">
          en el campeonato
          <input type="number" id="lab-mis" value="${misPts != null ? misPts : ''}" placeholder="269"></label>
        ${enGral ? `<div class="lab-gral-r">irías <b>${enGral.puesto}º</b> de ${enGral.total}
          ${enGral.dif === 0 ? '· <b>líder</b>' : `· <b>${enGral.dif > 0 ? '+' : ''}${enGral.dif}</b> vs el 1º`}</div>`
          : '<div class="lab-gral-r lab-gral-vac">cargá tus puntos y te digo en qué puesto irías</div>'}
      </div>` : ''}
    </div>`;
  };
  return tarjetaPleg('lab', 'El laboratorio',
    'Tu once y el del motor, <b>afuera</b> del torneo: están acá para medir, no para competir.',
    `<div class="lab-grid">${conOnce.map(tarjeta).join('')}</div>`, true);
}
window.ponerMisPuntos = function (v) {
  S.liga.misPuntos = (v === '' || v == null || isNaN(v)) ? null : Number(v);
  guardarLiga(); pintarPantallaLiga();
};

// ── EQUIPOS SUELTOS ────────────────────────────────────────────────────────
window.borrarEquipo = function (id) {
  const t = (S.liga.equipos || []).find(x => x.id === id); if (!t) return;
  if (!confirm('¿Borrar «' + t.nombre + '»? No se puede deshacer.')) return;
  S.liga.equipos = S.liga.equipos.filter(x => x.id !== id);
  if (S.ligaAbierto === id) S.ligaAbierto = null;
  guardarLiga(); pintarPantallaLiga();
};
window.asignarADT = function (id) {
  const t = (S.liga.equipos || []).find(x => x.id === id); if (!t) return;
  const libres = (S.liga.dts || []).filter(d => !(S.liga.equipos || []).some(z => z.dt === d.id));
  $('team-detail-title').innerHTML = 'Asignar «' + esc(t.nombre) + '» a un DT';
  $('team-detail-body').innerHTML = `
    <p class="exp-txt">Este equipo lo creaste a mano y no está atado a ningún DT del torneo. Elegí de quién es:
    se queda con el once que ya tiene y pasa a contar en el campeonato.</p>
    ${libres.length ? `<div class="dt-lista">${libres.map(d => `
      <button class="dt-fila" onclick="hacerAsignarDT('${id}','${d.id}')">
        <span class="dt-eq">${esc(d.equipo)}<small>${esc(d.persona)}</small></span></button>`).join('')}</div>`
      : '<p class="exp-txt">Todos los DTs del torneo ya tienen su once cargado. Si este equipo sobra, borralo.</p>'}
    <button class="vs-btn" onclick="borrarEquipo('${id}')">Borrar este equipo</button>`;
  abrirModal('team-detail-modal');
};
window.hacerAsignarDT = function (idEquipo, idDT) {
  const t = (S.liga.equipos || []).find(x => x.id === idEquipo);
  const d = (S.liga.dts || []).find(x => x.id === idDT);
  if (!t || !d) return;
  t.dt = idDT; t.nombre = d.equipo;
  guardarLiga(); cerrarModal($('team-detail-modal')); pintarPantallaLiga();
};

// ── CERRAR LA FECHA SOLO ───────────────────────────────────────────────────
// La pregunta era si cada fecha hay que copiar y pegar la tabla del juego. No:
// si los onces estan cargados, la app YA calcula lo que hizo cada uno con las
// fichas de Planeta —es exactamente el numero de la tabla de arriba—. Cuando la
// fecha termina, ese numero se guarda en el campeonato y listo.
//
// Lo que NO se puede saber solo es cuanto pago la cinta cuando Planeta no
// publica la ficha del capitan: por eso el boton avisa cuantos capitanes estan
// sin ficha antes de guardar, y por eso pegar la tabla del juego sigue siendo
// la verdad —cuando la pegas, pisa lo calculado—.
function fechaTerminada() {
  if (!VIVO || !D.partidos) return false;
  return (VIVO.partidos || []).length >= D.partidos.length && D.partidos.length > 0;
}
function estadoCierre(ms) {
  const f = D.fechaObjetivo;
  const C = (S.liga && S.liga.camp) || null;
  const yaGuardada = !!(C && C.fechas && C.fechas[String(f)]);
  const fuente = yaGuardada && C.fuentes ? C.fuentes[String(f)] : null;
  const conOnce = ms.filter(m => m.n > 0);
  const sinFicha = conOnce.filter(m => m.cinta.estado === 'sindato');
  return { fecha: f, terminada: fechaTerminada(), yaGuardada, fuente,
           conOnce: conOnce.length, total: ms.length, sinFicha };
}
window.cerrarFecha = function () {
  const ms = equiposTorneo().map(marcadorEquipo);
  const e = estadoCierre(ms);
  const conOnce = ms.filter(m => m.n > 0);
  if (!conOnce.length) { alert('No hay ningún once cargado: no hay nada que guardar.'); return; }
  if (e.sinFicha.length && !confirm(
      'Ojo: ' + e.sinFicha.length + ' capitán(es) sin la ficha de Clarín publicada.\n' +
      'A esos equipos les va a faltar lo que pagó la cinta.\n\n' +
      'Podés cargar la ficha a mano en cada equipo y volver, o guardar igual.\n\n¿Guardar igual?')) return;
  S.liga.camp = S.liga.camp || { general: {}, fechas: {} };
  S.liga.camp.fuentes = S.liga.camp.fuentes || {};
  const d = {};
  conOnce.forEach(m => { if (m.t.dt) d[m.t.dt] = Math.round(m.total * 10) / 10; });
  if (!Object.keys(d).length) {
    alert('Los equipos cargados no están atados a ningún DT del torneo.\n' +
          'Asignalos a un DT y volvé a intentar.'); return;
  }
  S.liga.camp.fechas[String(e.fecha)] = d;
  S.liga.camp.fuentes[String(e.fecha)] = 'app';
  // el once de cada uno queda guardado con su fecha, en silencio: no cuesta
  // nada y es lo que despues permite ver la evolucion del campeonato
  conOnce.forEach(m => {
    const t = (S.liga.equipos || []).find(z => z.id === m.t.id);
    if (t) guardarOnceDeFecha(t, e.fecha);
  });
  S.liga.camp.actualizado = new Date().toISOString();
  guardarLiga(); pintarPantallaLiga();
};
function bloqueCierre(ms) {
  const e = estadoCierre(ms);
  if (!S.liga.dts || !S.liga.dts.length) return '';
  if (e.yaGuardada) {
    return `<div class="cie cie-ok">La fecha <b>${e.fecha}</b> ya está en el campeonato
      <small>${e.fuente === 'app' ? 'la calculó la app con las fichas de Planeta' : 'la pegaste de la tabla del Gran DT'}</small>
      <button class="vs-btn vs-btn-chico" onclick="cerrarFecha()">recalcular</button></div>`;
  }
  if (!e.terminada) {
    return `<div class="cie">La fecha <b>${e.fecha}</b> todavía se está jugando
      <small>cuando termine, un botón guarda los puntos de cada uno en el campeonato — sin copiar ni pegar nada</small></div>`;
  }
  return `<div class="cie cie-listo">La fecha <b>${e.fecha}</b> terminó
    <small>${e.conOnce} de ${e.total} onces cargados${e.sinFicha.length ? ' · ' + e.sinFicha.length + ' capitán(es) sin ficha publicada' : ''}</small>
    <button class="vs-btn vs-btn-fuerte vs-btn-chico" onclick="cerrarFecha()">guardar los puntos en el campeonato</button></div>`;
}

// ── EL PODIO Y LOS TITULARES ───────────────────────────────────────────────
// Una tabla de siete filas con quince columnas es correcta y es aburrida. Lo
// que uno mira primero el domingo es quien va ganando y por cuanto; lo demas
// es para despues. Esto va arriba de la tabla y sale de los mismos numeros.
function bloquePodio(ms, ch) {
  if (ms.length < 2) return '';
  const orden = ms.map((m, i) => ({ m, i })).sort((a, b) =>
    (b.m.total - a.m.total) || (b.m.proyeccion - a.m.proyeccion));
  const podio = orden.slice(0, 3);
  const lider = podio[0].m;
  const escolta = podio[1] ? podio[1].m : null;
  const pct = i => ch ? Math.round(ch.p[i] * 100) : null;
  const puesto = ['1', '2', '3'], medalla = ['🥇', '🥈', '🥉'];
  return `<div class="pod">
    ${podio.map((o, k) => `<div class="pod-t pod-${k + 1}">
      <div class="pod-m">${medalla[k]}</div>
      <div class="pod-n">${esc(o.m.t.nombre)}</div>
      <div class="pod-p">${n1(o.m.total)}</div>
      <div class="pod-s">${k === 0
        ? (escolta ? `+${n1(lider.total - escolta.total)} sobre el 2º` : 'solo')
        : `−${n1(lider.total - o.m.total)}`}</div>
      ${ch ? `<div class="pod-ch" title="${esc('Chance de ganar la fecha, simulando lo que falta jugar.')}">${pct(o.i)}%</div>` : ''}
      <div class="pod-j">${o.m.jugaron}/${o.m.n} jugaron</div>
    </div>`).join('')}
  </div>`;
}

// Titulares: las tres o cuatro cosas que de verdad pasaron esta fecha, dichas
// en una linea. Todo sale de datos que ya estan calculados; ninguno se inventa.
function bloqueTitulares(ms, prop, ch) {
  if (ms.length < 2 || !VIVO) return '';
  const t = [];
  const orden = ms.slice().sort((a, b) => b.total - a.total);
  const lider = orden[0], segundo = orden[1];

  // el que va ganando
  if (lider && segundo) {
    const dif = lider.total - segundo.total;
    t.push({ ic: '👑', txt: dif < 0.05
      ? `<b>${esc(lider.t.nombre)}</b> y <b>${esc(segundo.t.nombre)}</b> van empatados en ${n1(lider.total)}`
      : `<b>${esc(lider.t.nombre)}</b> va arriba por <b>${n1(dif)}</b> sobre ${esc(segundo.t.nombre)}` });
  }
  // el diferencial que mas rindio
  {
    let mejor = null;
    ms.forEach(m => {
      m.det.forEach(d => {
        if (d.estado !== 'jugo' || (prop.cuenta[d.p.id] || 0) !== 1) return;
        if (!mejor || d.pts > mejor.pts) mejor = { pts: d.pts, p: d.p, eq: m.t.nombre };
      });
    });
    if (mejor && mejor.pts >= 7) t.push({ ic: '💎', txt:
      `<b>${esc(nombreCorto(mejor.p.n))}</b> hizo <b>${mejor.pts}</b> y no lo tiene nadie más que <b>${esc(mejor.eq)}</b>` });
  }
  // cintas perdidas
  {
    const perdidas = ms.filter(m => m.cinta.estado === 'perdida');
    if (perdidas.length) t.push({ ic: '💔', txt: perdidas.length === 1
      ? `<b>${esc(perdidas[0].t.nombre)}</b> perdió la cinta: ${esc(perdidas[0].cinta.quien)} no jugó`
      : `<b>${perdidas.length}</b> perdieron la cinta porque su capitán no jugó` });
  }
  // el suplente que salvo la fecha
  {
    let mejor = null;
    ms.forEach(m => m.entraron.forEach(e => {
      if (!mejor || e.pts > mejor.pts) mejor = { pts: e.pts, e, eq: m.t.nombre };
    }));
    if (mejor && mejor.pts >= 6) t.push({ ic: '🔄', txt:
      `A <b>${esc(mejor.eq)}</b> le entró <b>${esc(APELLIDO(mejor.e.entra.n))}</b> del banco y le hizo <b>${mejor.pts}</b>` });
  }
  // la remontada posible
  if (ch && !ch.cerrado) {
    const conCh = ms.map((m, i) => ({ m, p: ch.p[i] })).sort((a, b) => b.p - a.p);
    const puntero = orden[0];
    const favorito = conCh[0];
    if (favorito && favorito.m !== puntero && favorito.p > 0.4) t.push({ ic: '📈', txt:
      `<b>${esc(favorito.m.t.nombre)}</b> va ${orden.indexOf(favorito.m) + 1}º pero gana la fecha en el <b>${Math.round(favorito.p * 100)}%</b> de las simulaciones: le quedan ${favorito.m.pendientes.length} por jugar` });
  }
  if (!t.length) return '';
  return `<div class="tit">${t.slice(0, 4).map(x =>
    `<div class="tit-l"><span class="tit-ic">${x.ic}</span><span>${x.txt}</span></div>`).join('')}</div>`;
}

// ── EL ONCE DE LA FECHA ANTERIOR ───────────────────────────────────────────
// Cargar quince jugadores por seis equipos, todas las fechas, es inviable. Pero
// no hace falta: los equipos ya quedan guardados de una fecha a la otra, y
// entre fecha y fecha un DT cambia dos o tres nombres, no quince. Lo que
// faltaba era decirlo: que se vea que ese once es el de la fecha pasada y que
// haya un boton para confirmarlo cuando lo revisaste contra la foto que te
// mandaron. Asi cada fecha son dos cambios y un clic por equipo.
//
// Y de paso queda el historial: el once de cada uno fecha por fecha, que es lo
// que despues permite ver la evolucion del campeonato y medir al motor contra
// el torneo a lo largo del semestre.
function guardarOnceDeFecha(t, fecha) {
  if (!t || !t.dt || fecha == null) return;
  S.liga.onces = S.liga.onces || {};
  S.liga.onces[t.dt] = S.liga.onces[t.dt] || {};
  const kBanco = {};
  PUESTOS.forEach(pos => { const k = claveDe((t.banco || {})[pos]); if (k) kBanco[pos] = k; });
  S.liga.onces[t.dt][String(fecha)] = {
    kOnce: clavesDesdeIds(onceDe(t)), kCap: claveDe(capDe(t)), kBanco, esq: esqDe(t)
  };
}
window.confirmarOnce = function (id) {
  const t = (S.liga.equipos || []).find(x => x.id === id); if (!t) return;
  t.revisado = D.fechaObjetivo;
  guardarOnceDeFecha(t, D.fechaObjetivo);
  guardarLiga(); pintarPantallaLiga();
};
window.confirmarTodos = function () {
  const f = D.fechaObjetivo;
  equiposTorneo().forEach(x => {
    const t = (S.liga.equipos || []).find(z => z.id === x.id);
    if (t && (onceDe(t) || []).length) { t.revisado = f; guardarOnceDeFecha(t, f); }
  });
  guardarLiga(); pintarPantallaLiga();
};
// cuantos equipos siguen con el once de una fecha anterior
function sinRevisar(ms) {
  const f = D.fechaObjetivo;
  return ms.filter(m => m.n > 0 && m.t.revisado !== f);
}
function bloqueRevisar(ms) {
  const pend = sinRevisar(ms);
  if (!pend.length) return '';
  const f = D.fechaObjetivo;
  const conAnterior = pend.filter(m => m.t.revisado != null);
  return `<div class="rev">
    <div class="rev-txt">
      <b>${pend.length}</b> ${pend.length === 1 ? 'once sigue' : 'onces siguen'} como ${pend.length === 1 ? 'estaba' : 'estaban'}
      ${conAnterior.length ? `en la fecha ${Math.max(...conAnterior.map(m => m.t.revisado))}` : 'la última vez'}.
      <small>Entre fecha y fecha cambian dos o tres nombres, no quince: mirá la foto que te mandaron, cambiá lo que cambió
      y confirmá. Lo que confirmes queda guardado como el once de esa fecha.</small>
    </div>
    <div class="rev-eqs">${pend.map(m => `<button class="rev-eq" onclick="abrirEquipoLiga('${m.t.id}')">${esc(m.t.nombre)}</button>`).join('')}</div>
    <button class="vs-btn vs-btn-chico" onclick="confirmarTodos()" title="${esc('Si ninguno cambió su equipo esta fecha, los confirmás todos de una.')}">no cambió ninguno</button>
  </div>`;
}
window.abrirEquipoLiga = function (id) {
  S.ligaAbierto = id; pintarPantallaLiga();
  setTimeout(() => { const f = document.querySelector('.lg-abierta'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
};

// Copiar el once de otro equipo del torneo: varios amigos arrancan de una base
// parecida y asi se carga uno entero en un clic.
window.copiarDeOtro = function (id) {
  const t = (S.liga.equipos || []).find(x => x.id === id); if (!t) return;
  const otros = (S.liga.equipos || []).filter(x => x.id !== id && (onceDe(x) || []).length)
    .concat(equiposLab().filter(x => (onceDe(x) || []).length));
  if (!otros.length) { alert('Todavía no hay ningún otro once cargado para copiar.'); return; }
  $('team-detail-title').innerHTML = 'Copiar un once a «' + esc(t.nombre) + '»';
  $('team-detail-body').innerHTML = `
    <p class="exp-txt">Trae el once, el banco y el capitán de otro equipo. Después cambiás lo que sea distinto.
    Es lo más rápido cuando dos arrancan de una base parecida.</p>
    <div class="dt-lista">${otros.map(o => `
      <button class="dt-fila" onclick="hacerCopiarDe('${id}','${o.id}')">
        <span class="dt-eq">${esc(o.nombre || (o.motor ? 'El motor' : 'El tuyo'))}<small>${(onceDe(o) || []).length} jugadores · ${esquemaLindo(esqDe(o) || '')}</small></span>
      </button>`).join('')}</div>`;
  abrirModal('team-detail-modal');
};
window.hacerCopiarDe = function (destino, origen) {
  const t = (S.liga.equipos || []).find(x => x.id === destino);
  const o = (S.liga.equipos || []).concat(equiposLab()).find(x => x.id === origen);
  if (!t || !o) return;
  t.esq = esqDe(o); t.once = (onceDe(o) || []).slice(); t.cap = capDe(o);
  t.banco = Object.assign({}, o.banco || {});
  t.revisado = null;
  guardarLiga(); cerrarModal($('team-detail-modal')); pintarPantallaLiga();
};

// ── EL MENU DEL TORNEO ─────────────────────────────────────────────────────
// Todo lo que se toca una vez cada tanto —compartir, importar, y las
// explicaciones de como se calcula cada cosa— vivia suelto abajo de la tabla,
// en parrafos largos que uno lee una vez y despues estorban todas las semanas.
// Va adentro de los tres puntitos.
window.menuTorneo = function () {
  const ms = equiposTorneo().map(marcadorEquipo);
  const ch = chancesLiga(ms);
  const t = tablaCampeonato();
  $('team-detail-title').innerHTML = 'Torneo de amigos';
  $('team-detail-body').innerHTML = `
    <div class="mt-btns">
      <button class="vs-btn vs-btn-fuerte" onclick="cerrarModal($('team-detail-modal'));exportarLiga();">Compartir el torneo</button>
      <button class="vs-btn" onclick="cerrarModal($('team-detail-modal'));importarLiga();">Importar uno que me pasaron</button>
    </div>
    <div class="mt-sec">
      <h4>Cómo se calcula la chance de ganar la fecha</h4>
      <p>${ch && !ch.cerrado
        ? `Se simulan <b>${ch.sims.toLocaleString('es-AR')}</b> veces los <b>${ch.pendientes}</b> jugadores que todavía no jugaron.
           Cada uno se sortea <b>una sola vez</b> y ese mismo número se le suma a todos los equipos que lo tienen:
           por eso dos que comparten media formación se mueven juntos, como pasa de verdad. Los puntos de cada
           jugador salen de su historial real por puesto —2.792 fechas-jugador de la planilla de Planeta—, no de una campana.`
        : 'Ya se jugó todo: no hay nada que simular, lo que ves es el resultado.'}</p>
      <p class="mt-ojo">Lo que esta cuenta <b>no</b> tiene: que dos jugadores del mismo club suben y bajan juntos.
      Al ignorarlo, las distancias quedan un poco más cerradas de lo que son.</p>
    </div>
    <div class="mt-sec">
      <h4>De dónde sale cada número</h4>
      <p>Los puntos de la tabla de arriba <b>los calcula la app</b> con las fichas que publica Planeta mientras se
      juega la fecha. Los del campeonato son los del <b>juego</b>: se leen de la tabla que pegás.
      ${t && t.actualizado ? 'Última vez que la pegaste: ' + esc(fechaCorta(t.actualizado)) + '.' : ''}</p>
      <p>Los equipos se guardan <b>en este navegador</b>: son tuyos, nadie los puede tocar, y siguen acá la fecha
      que viene. Para que tus amigos los vean, usá <b>compartir</b>.</p>
    </div>`;
  abrirModal('team-detail-modal');
};
