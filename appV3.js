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
  filtrados: 0
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
const TODOS = {};
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
  if (x.jug) a.push(['YA SE JUGÓ', '#94a3b8', 'Este partido de la fecha ya terminó: la recomendación es de referencia, no accionable']);
  if (x.sf) a.push(['SIN FICHA', '#8b5cf6', 'Jugó, pero la planilla de Planeta no le registra ningún partido calificado. Su ficha no es un dato suyo: es el promedio de la liga']);
  const d = x.disp;
  if (d) {
    if (d.suspendido) a.push(['SUSPENDIDO', '#ef4444', `Roja en la fecha ${d.fechaUltimaRoja}: no juega la próxima`]);
    else if (d.aUnaDeSuspension) a.push([`${d.amarillas}ª AMARILLA`, '#f59e0b', `Lleva ${d.amarillas} amarillas. A la quinta son una fecha de suspensión`]);
  }
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
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => (D.rankings[p] || []).forEach(x => { TODOS[x.id] = x; }));
  S.esquema = D.esquema.optimo.esquema;
  S.once = D.esquema.optimo.once.map(x => x.id);

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
  pintarLideres();
  pintarPantallaFecha();
}

// ── navegacion por secciones ────────────────────────────────────────────────
// Cada pantalla a lo ancho, en vez de todo apretado a la vez.
function mostrarSeccion(sec) {
  document.querySelectorAll('.seccion').forEach(el => { el.hidden = (el.id !== 'sec-' + sec); });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (sec === 'jugadores') pintarRankings();
  if (sec === 'fecha') pintarPantallaFecha();
}

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
  let cierre = '';
  if (primero) {
    const faltan = primero - new Date();
    if (faltan > 0) {
      const h = Math.floor(faltan / 3600000), m = Math.floor((faltan % 3600000) / 60000);
      cierre = `<div class="fecha-cierre">
        <div class="fecha-cierre-lbl">Cierran los cambios en</div>
        <div class="fecha-cierre-val">${h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + 'h ' + m + 'min'}</div>
        <div class="fecha-cierre-sub">${esc(fmtDia(primero))} · ${esc(fmtHora(primero))}, cuando arranca ${esc(NOM(partidos[0].local))} – ${esc(NOM(partidos[0].visitante))}</div>
      </div>`;
    } else {
      cierre = `<div class="fecha-cierre cerrado">
        <div class="fecha-cierre-lbl">La fecha ya arrancó</div>
        <div class="fecha-cierre-val">cerrada</div>
        <div class="fecha-cierre-sub">Lo que ves es de referencia: los cambios de esta fecha ya no se pueden hacer</div>
      </div>`;
    }
  }

  // Lo que cambió y hay que mirar antes de cerrar el equipo.
  const todos = ['ARQ', 'DEF', 'VOL', 'DEL'].flatMap(p => (D.rankings[p] || []).map(x => ({ ...x, _pos: p })));
  const juegan = todos.filter(x => x.pj_ == null || x.pj_ >= 0.5);
  const susp = juegan.filter(x => x.disp && x.disp.suspendido);
  const alBorde = juegan.filter(x => x.disp && !x.disp.suspendido && x.disp.aUnaDeSuspension);
  const transf = juegan.filter(x => x.tr);
  const confirmados = juegan.filter(x => x.fmin === 'confirmado').length;

  const listaCorta = arr => arr.slice(0, 6).map(x =>
    `<button class="chip-jug" onclick="auditar('${x.id}')">${esc(nombreCorto(x.n))} <span>${esc(NOM(x.eq))}</span></button>`).join('')
    + (arr.length > 6 ? `<span class="text-muted" style="font-size:0.75rem;">y ${arr.length - 6} más</span>` : '');

  const avisos = [];
  if (susp.length) avisos.push(['🟥', 'Suspendidos', `${susp.length} jugador${susp.length > 1 ? 'es' : ''} con roja que no juega${susp.length > 1 ? 'n' : ''} esta fecha`, listaCorta(susp), 'peligro']);
  if (alBorde.length) avisos.push(['🟨', 'A una amarilla de la suspensión', `Si ven otra, se pierden la fecha que viene`, listaCorta(alBorde), 'atencion']);
  if (transf.length) avisos.push(['⇄', 'Cambiaron de club', `Sus minutos y su xG son del club anterior`, listaCorta(transf), 'info']);
  if (confirmados) avisos.push(['✅', 'Formaciones confirmadas', `${confirmados} jugadores con el once ya publicado: para ellos los minutos no son estimación`, '', 'ok']);

  // Los tres mejores de cada puesto, que es con lo que uno arranca a armar.
  const NOMBRE_POS = { ARQ: 'Arqueros', DEF: 'Defensores', VOL: 'Volantes', DEL: 'Delanteros' };
  const columnas = ['ARQ', 'DEF', 'VOL', 'DEL'].map(pos => {
    const top = (D.rankings[pos] || [])
      .filter(x => x.pj_ == null || x.pj_ >= 0.5)
      .slice().sort((a, b) => (b.epsj ?? -1) - (a.epsj ?? -1)).slice(0, 3);
    return `<div class="col-puesto pos-${pos.toLowerCase()}">
      <h3>${NOMBRE_POS[pos]}</h3>
      ${top.map((x, i) => `<button class="tarjeta-jug" onclick="auditar('${x.id}')">
          <span class="tj-puesto">${i + 1}</span>
          <span class="tj-datos">
            <span class="tj-nombre">${esc(nombreCorto(x.n))}</span>
            <span class="tj-sub">${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'L' : 'V'} vs ${esc(NOM(x.riv))} · ${x.mesp}'</span>
          </span>
          <span class="tj-pts">${n1(x.epsj)}</span>
        </button>`).join('')}
      <button class="ver-todos-puesto" data-ir-puesto="${pos}">Ver los ${(D.rankings[pos] || []).length} ${NOMBRE_POS[pos].toLowerCase()}</button>
    </div>`;
  }).join('');

  cont.innerHTML = `
    <div class="fecha-hero">
      <div class="fecha-hero-txt">
        <div class="fecha-eyebrow">Torneo Clausura</div>
        <h1>Fecha ${D.fechaObjetivo ?? '–'}</h1>
        <p>${partidos.length} partidos${primero && ultimo ? ` · del ${esc(fmtDia(primero))} al ${esc(fmtDia(ultimo))}` : ''}</p>
      </div>
      ${cierre}
    </div>

    ${avisos.length ? `<div class="tarjetas-aviso">${avisos.map(([ic, tit, txt, lista, tipo]) => `
      <div class="aviso-card aviso-${tipo}">
        <div class="aviso-top"><span class="aviso-ic">${ic}</span><b>${tit}</b></div>
        <p>${txt}</p>
        ${lista ? `<div class="aviso-lista">${lista}</div>` : ''}
      </div>`).join('')}</div>` : ''}

    <div class="fecha-acciones">
      <button class="link-ctx" id="btn-ctx-desde-fecha">Ver el contexto de los ${partidos.length} partidos de la fecha →</button>
    </div>

    <div class="grilla-puestos">${columnas}</div>`;

  const bc = $('btn-ctx-desde-fecha'); if (bc) bc.onclick = () => { const o = $('btn-open-tablero'); if (o) o.click(); };
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
    menuMas.querySelectorAll('.menu-item').forEach(b => b.addEventListener('click', () => { menuMas.hidden = true; btnMas.classList.remove('abierto'); }));
  }
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
  const bm = $('btn-mejor-11'); if (bm) bm.onclick = abrirOnce;
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
  if (!document.querySelector('.modal.active')) { document.body.style.overflow = ''; zModal = 9999; }
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
    lv.innerHTML = `<b style="color:${D.version ? '#10b981' : '#ef4444'};">motor ${esc(v)}</b> · app v20`;
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
      Lo de <b>⚽</b> y <b>🛡️</b> es cálculo nuestro: la cuota de "gol de tal equipo" no existe en el plan gratis de la API.</div>`);
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
    <tr style="cursor:pointer;" onclick="verEquipo('${esc(t.equipo)}')" title="Ver el detalle de ${esc(NOM(t.equipo))}">
      <td class="text-center"><span class="pos-badge${i < 4 ? ' pos-arriba' : ''}">${i + 1}</span></td>
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
const COLS = {
  ARQ: [['#', ''], ['Arquero', 'n'], ['Valla invicta', 'pvi'], ['Goles que le hacen', 'lamc'], ['Ficha', 'fi'], ['Min. esp.', 'mesp'], ['Cotización', 'pr'], ['Descontado', 'ep'], ['PUNTOS', 'epsj']],
  DEF: [['#', ''], ['Defensor', 'n'], ['Perfil', 'perf'], ['Valla', 'pvi'], ['Tiros/90', 'tiros'], ['xG/90', 'xg'], ['Ficha', 'fi'], ['Min. esp.', 'mesp'], ['Cotización', 'pr'], ['Descontado', 'ep'], ['PUNTOS', 'epsj']],
  VOL: [['#', ''], ['Volante', 'n'], ['Tiros/90', 'tiros'], ['xG/90', 'xg'], ['Gol del equipo', 'lamf'], ['Su gol', 'lg'], ['Ficha', 'fi'], ['Min. esp.', 'mesp'], ['Cotización', 'pr'], ['Descontado', 'ep'], ['PUNTOS', 'epsj']],
  DEL: [['#', ''], ['Delantero', 'n'], ['Tiros/90', 'tiros'], ['xG/90', 'xg'], ['Gol del equipo', 'lamf'], ['Su gol', 'lg'], ['Ficha', 'fi'], ['Min. esp.', 'mesp'], ['Cotización', 'pr'], ['Descontado', 'ep'], ['PUNTOS', 'epsj']]
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
const sinTildes = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const valorCol = (x, k) =>
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
      if (x.tr) etq.push(`<span class="pill-alerta pill-transfer" title="Pasó de ${esc(x.tr.desde)} a ${esc(x.tr.hacia)}. Los ${x.tr.min} minutos, los tiros y el xG que ves los hizo en ${esc(x.tr.desde)}: todavía no hay datos suyos en el club nuevo.">⇄ TRANSFERIDO</span>`);
      if (x.mrot) etq.push(pillRotacion(x.mrot));
      else if (x.rot > 0) etq.push(`<span class="pill-alerta pill-copa">ROTA</span>`);
      if (x.mrotr) etq.push(`<span class="pill-alerta pill-copa-rival" title="Al rival le pasa esto: ${x.mrotr.tipo === 'guarda' ? 'juega copa en ' + x.mrotr.dias + ' días' : 'viene de jugar hace ' + x.mrotr.dias + ' días'}">RIVAL ${x.mrotr.tipo === 'guarda' ? 'CON COPA' : 'CANSADO'}</span>`);
      const avisos = pintarAvisos(x);
      return `<div class="player-info">
        <div class="player-name">${esc(nombreCorto(x.n))}</div>
        <div class="player-sub">${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'L' : 'V'} vs ${esc(NOM(x.riv))}</div>
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
    case 'lg': return `<span title="Goles esperados del jugador en este partido: su parte del ataque del equipo, por los minutos que se espera que juegue">${nCorto(x.lg)}</span>`;
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
  const partes = [];
  partes.push(campo === 'tiros'
    ? `${total} tiros en ${min} minutos`
    : `${total} de xG en ${min} minutos`);
  if (campo === 'xg' && x.pen > 0 && x.xgT != null && i.xg != null)
    partes.push(`ya sin los ${x.pen} penal${x.pen > 1 ? 'es' : ''} que pateó (${i.xg} crudo − ${(i.xg - x.xgT).toFixed(2)})`);
  if (flojo) partes.push('menos de 180 minutos: con tan poca cancha el ritmo por 90 es poco confiable, por eso va en gris');
  if (delMotor != null && Math.abs(delMotor - crudo) > 0.05)
    partes.push(`el modelo lo achica a ${fmt(delMotor)} por 90`);
  return `<span class="${flojo ? 'ritmo-flojo' : ''}" title="${esc(partes.join('. ') + '.')}">${fmt(crudo)}</span>`;
}

// AYUDAS DE CADA COLUMNA. Antes habia una barra "ORDENAR POR" con cinco
// botones (Puntos si juega / Descontado / Amenaza de gol / Ficha / Contexto) y
// resulta que CUATRO de esos cinco ya son columnas de la tabla, y los titulos
// de la tabla ya ordenan al tocarlos. Era la misma funcion dos veces, una al
// lado de la otra. Se va la barra; el orden se toca en el titulo, con la
// flecha marcando por cual esta ordenado y la explicacion en el globito.
const AYUDA_COL = {
  epsj: 'Los puntos que hace si entra a la cancha, ya considerando cuántos minutos va a jugar. Es el orden por defecto: si no va a jugar, no lo ponés y listo',
  ep:   'Lo mismo, multiplicado por la chance de llegar a los 20 minutos que exige la ficha',
  lg:   'Goles esperados de ESTE jugador en ESTE partido',
  lamf: 'Goles esperados de su equipo en este partido',
  fi:   'La nota del 1 al 10 que viene sacando, limpia de bonificaciones',
  pvi:  'Chance de que su equipo termine el partido sin recibir goles',
  mesp: 'Minutos esperados = chance de jugar × minutos que juega cuando entra',
  tiros: 'Tiros por cada 90 minutos EN LA CANCHA, no por partido',
  xg:   'Goles esperados por cada 90 minutos EN LA CANCHA, no por partido',
  pr:   'Lo que cuesta en el Gran DT',
  gc:   'Goles que se espera que le hagan a su equipo',
};
function pintarSelectorOrden() {
  const cont = $('orden-ranking'); if (!cont) return;
  const hayEpsj = !!((D.rankings.VOL || [])[0] || {}).epsj;
  if (!hayEpsj && S.ordCol === 'epsj') S.ordCol = 'ep';
  cont.innerHTML =
    `<span class="orden-lbl">Tocá el título de una columna para ordenar por esa</span>
     <label class="orden-check" title="Por defecto se ocultan los que tienen menos del 50% de chance de llegar a los 20 minutos que exige la ficha. Rinden bien por minuto, pero no juegan.">
       <input type="checkbox" id="chk-ver-todos"${S.verTodos ? ' checked' : ''}>
       <span>ver también los que casi no juegan${S.filtrados ? ` (${S.filtrados})` : ''}</span>
     </label>`;
  const chk = $('chk-ver-todos');
  if (chk) chk.onchange = () => { S.verTodos = chk.checked; pintarRankings(); };
}

// Chequeo de que datos.js este al dia. Cuando falta un campo la pagina no se
// rompe —muestra un guion y sigue— y eso es peor que romperse: parece que el
// cambio no se hubiera aplicado. Antes de callarse, avisa.
// La pagina sabe con que version del motor fue hecha. Si datos.js viene de una
// anterior, lo dice. Antes el sello no servia para esto: cuando arregle el
// cruce de nombres (Rick) no le subi la version al motor, asi que el viejo y el
// nuevo decian los dos "v5" y no habia forma de distinguirlos mirando la app.
const MOTOR_NECESARIO = 10;
function versionMotor() {
  const m = String(D.version || '').match(/v(\d+)/);
  return m ? +m[1] : 0;
}
function faltanCampos() {
  const uno = (D.rankings && D.rankings.VOL && D.rankings.VOL[0]) || null;
  if (!uno) return [];
  const falta = [];
  if (versionMotor() < MOTOR_NECESARIO)
    falta.push(`el motor es <b>${D.version || 'sin sello'}</b> y esta página necesita <b>v${MOTOR_NECESARIO}</b>`);
  if (uno.epsj == null) falta.push('los puntos "si entra a la cancha"');
  if (uno.mesp == null) falta.push('los minutos esperados');
  if (!D.arriesgado)    falta.push('el once arriesgado');
  return falta;
}
function pintarAvisoDatos() {
  const falta = faltanCampos();
  const prev = $('aviso-datos-viejos'); if (prev) prev.remove();
  if (!falta.length) return;
  const cont = $('orden-ranking'); if (!cont || !cont.parentNode) return;
  const div = document.createElement('div');
  div.id = 'aviso-datos-viejos';
  div.style.cssText = 'margin:10px 14px;padding:10px 14px;border-radius:8px;background:rgba(239,68,68,0.12);' +
    'border:1px solid rgba(239,68,68,0.4);color:#fca5a5;font-size:0.82rem;line-height:1.5;';
  div.innerHTML = `<b>datos.js está viejo:</b> ${falta.join(' · ')}.
    La página es nueva pero los datos no. Copiá <code>armar.cjs</code> y <code>motorV3.cjs</code>
    a la carpeta Grandt, corré <b>ACTUALIZAR_TODO.bat</b> y recargá con Ctrl+F5.`;
  cont.parentNode.insertBefore(div, cont);
}

function pintarRankings() {
  const thead = $('rankings-thead'), body = $('players-body');
  if (!thead || !body) return;
  pintarAvisoDatos();
  const cols = COLS[S.pos];
  thead.innerHTML = '<tr>' + cols.map(c => {
    const act = S.ordCol === c[1];
    const flecha = act ? `<span class="orden-flecha">${S.ordDir === -1 ? '▼' : '▲'}</span>` : '';
    return `<th class="${c[1] === 'n' || c[1] === 'perf' ? '' : 'text-center'}${act ? ' col-ordenada' : ''}${c[1] ? ' col-ordenable' : ''}"
      data-k="${c[1]}" title="${esc(AYUDA_COL[c[1]] || 'Tocá para ordenar por esta columna')}"
      style="cursor:pointer;">${c[0]}${flecha}</th>`;
  }).join('') + '</tr>';
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
  let lista = D.rankings[S.pos].filter(x =>
    (!S.equipo || x.eq === S.equipo) &&
    (!S.busqueda || sinTildes(x.n).includes(S.busqueda) || sinTildes(x.eq).includes(S.busqueda)));
  const total = lista.length;
  if (!S.verTodos && !S.busqueda) lista = lista.filter(x => x.pj_ == null || x.pj_ >= 0.5);
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
  const universo = (!S.verTodos)
    ? D.rankings[S.pos].filter(x => x.pj_ == null || x.pj_ >= 0.5)
    : D.rankings[S.pos];
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
      No hay ${S.pos === 'ARQ' ? 'arqueros' : S.pos === 'DEF' ? 'defensores' : S.pos === 'VOL' ? 'volantes' : 'delanteros'} de ${esc(quien)} que entren en el corte.
      ${S.filtrados ? `Hay ${S.filtrados} que quedaron afuera por chance de jugar: marcá «ver también los que casi no juegan».` : ''}</td></tr>`;
  } else
  body.innerHTML = lista.slice(0, 120).map((x, i) =>
    `<tr class="${(S.puestoDe[x.id] || 99) <= 10 ? 'fila-top' : ''}" style="cursor:pointer;" onclick="auditar('${x.id}')">` +
    cols.map(c => `<td class="${c[1] === 'n' || c[1] === 'perf' ? '' : 'text-center'}">${celda(x, c[1], i)}</td>`).join('') +
    '</tr>').join('');
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

  $('audit-title').innerHTML = `📋 AUDITORÍA DEL ALGORITMO [${x.pos}]: ${esc(x.n)}`;

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

  $('audit-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
      <div>
        <div style="font-size:1.15rem;font-weight:800;">${esc(x.n)}</div>
        <div class="text-muted" style="font-size:0.85rem;">${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'Local' : 'Visitante'} vs ${esc(NOM(x.riv))} · ${plata(x.pr)}</div>
        ${(() => {
          const av = avisosJugador(x); const d = x.disp;
          const linea = d ? `<span class="text-muted" style="font-size:0.78rem;">Tarjetas en el torneo: ${d.amarillas} amarilla(s)${d.rojas ? ` · ${d.rojas} roja(s)` : ''}</span>` : '';
          if (!av.length && !linea) return '';
          return `<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${pintarAvisos(x)}${linea}</div>`;
        })()}
        ${x.nrot ? `<div style="font-size:0.78rem;color:#f59e0b;margin-top:3px;">⚑ ${esc(x.nrot)}</div>` : ''}
      </div>
      <div style="text-align:right;">
        <div style="font-size:2rem;font-weight:800;color:#38bdf8;line-height:1;">${n2(x.ep)}</div>
        <div class="text-muted" style="font-size:0.76rem;">puntos esperados en la fecha</div>
        <div class="text-muted" style="font-size:0.72rem;">${x.epsj != null ? n2(x.epsj) + ' si entra a la cancha' : ''}</div>
        <div style="font-size:0.8rem;margin-top:4px;">${badgePct(percentil(x.ep, col('ep')))}</div>
      </div>
    </div>

    <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:6px;">
      De dónde salen esos puntos</div>
    <table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,0.02);border-radius:10px;overflow:hidden;">
      <thead><tr style="background:rgba(255,255,255,0.05);">
        <th style="padding:10px 14px;text-align:left;font-size:0.76rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);">Término del reglamento</th>
        <th style="padding:10px 14px;text-align:center;font-size:0.76rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);">Puntos</th>
        <th style="padding:10px 14px;text-align:left;font-size:0.76rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);">Cómo se calcula</th>
        <th style="padding:10px 14px;text-align:left;font-size:0.76rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);">Percentil / puesto</th>
      </tr></thead>
      <tbody>${filasEP}
        <tr style="background:rgba(56,189,248,0.08);">
          <td style="padding:11px 14px;font-weight:800;">TOTAL</td>
          <td style="padding:11px 14px;text-align:center;font-weight:800;color:#38bdf8;font-size:1.05rem;">${n2(x.ep)}</td>
          <td style="padding:11px 14px;" class="text-muted">Suma exacta de los términos de arriba</td>
          <td style="padding:11px 14px;">${badgePct(percentil(x.ep, col('ep')))}</td></tr>
      </tbody></table>

    ${bloque('El jugador', [
      filaP('Ficha Clarín limpia', n2(x.fi), percentil(x.fi, col('fi')), `· ${ind.pj || 0} PJ`),
      filaP('Tiros por partido', n1(ind.tirosPorPartido), percentil(ind.tirosPorPartido, col('tiros')), `· ${ind.tiros || 0} en total`),
      filaP('xG por partido', nCorto(ind.xgPorPartido), percentil(ind.xgPorPartido, col('xg')), `· ${n2(ind.xg)} acumulado`),
      filaP('Goles esperados esta fecha', nCorto(x.lg), percentil(x.lg, pool.map(y => y.lg))),
      fila('Goles / figuras / vallas', `${ind.goles || 0} / ${ind.figuras || 0} / ${ind.vallas || 0}`),
      (x.pen > 0
        ? fila('Penales pateados', `${x.pen}`,
            `${x.penC} convertido${x.penC === 1 ? '' : 's'}${x.penE ? ' · ' + x.penE + ' errado' + (x.penE === 1 ? '' : 's') : ''} — es el pateador del equipo`)
        : ''),
      filaP('Amarillas', String(ind.amarillas || 0), percentil(x.ta, pool.map(y => y.ta), false), `· ${pc0(x.ta)} por partido`),
      fila('Minutos', `${ind.minutos || 0} <span class="text-muted">(${ind.minutosPorPartido || 0}/p)</span>`),
      fila('Titularidad', ind.titularidad != null ? pc0(ind.titularidad) : 's/d', 'partidos con 60+ min'),
      fila('Minutos esperados', (x.mesp != null ? x.mesp + "'" : '—'),
           x.fmin === 'once confirmado'
             ? `ES TITULAR — formación confirmada por 365Scores. Se espera que juegue ${x.msj}'`
             : x.fmin === 'al banco (once confirmado)'
             ? `AL BANCO — su equipo confirmó el once y no está. Si entra, ~30' y cobra ficha igual`
             : `${pc0(x.pj_)} de llegar a los 20' que exige la ficha; si entra, ${x.msj || '?'}' en cancha`)
    ].join(''))}

    ${bloqueMinutos(x)}

    ${bloque(`Su equipo ${cond} — ${esc(NOM(x.eq))}`, [
      fila('Tiros generados', n1(me.tiros), `· total ${n1(met.tiros)}`),
      fila('Tiros concedidos', n1(me.tirosConcedidos), `· total ${n1(met.tirosConcedidos)}`),
      fila('xG generado', n2(me.xg), `· total ${n2(met.xg)}`),
      fila('xG concedido', n2(me.xgConcedido), `· total ${n2(met.xgConcedido)}`),
      fila('Partidos en esa condición', String(me.pj ?? 's/d'), me.pj != null && me.pj < 4 ? '⚠ muestra chica' : ''),
      fila('Depende de la localía', x.an ? `${x.an.ataque > 0 ? '+' : ''}${n2(x.an.ataque)} xG` : 's/d', 'vs el promedio de la liga')
    ].join(''))}

    ${bloque(`El rival ${condR} — ${esc(NOM(x.riv))}`, [
      fila('Tiros generados', n1(er.tiros), `· total ${n1(ert.tiros)}`),
      fila('Tiros concedidos', n1(er.tirosConcedidos), `· total ${n1(ert.tirosConcedidos)}`),
      fila('xG generado', n2(er.xg), `· total ${n2(ert.xg)}`),
      fila('xG concedido', n2(er.xgConcedido), `· total ${n2(ert.xgConcedido)}`),
      fila('Partidos en esa condición', String(er.pj ?? 's/d'), er.pj != null && er.pj < 4 ? '⚠ muestra chica' : ''),
      fila('Depende de la localía', x.anr ? `${x.anr.ataque > 0 ? '+' : ''}${n2(x.anr.ataque)} xG` : 's/d', 'vs el promedio de la liga')
    ].join(''))}

    ${bloque('El partido', [
      fila('Goles esperados de su equipo', n2(x.lam.f)),
      fila('Goles esperados del rival', n2(x.lam.c)),
      filaP('Probabilidad de valla invicta', pc(x.pvi), percentil(x.pvi, col('pvi'))),
      fila('Gana / empata', `${pc0(x.lam.w)} / ${pc0(x.lam.d)}`),
      // Este texto se quedo viejo: decia "55% mercado + 30% xG + 15% goles" de
      // cuando se promediaban las tres fuentes. Se saco ese promedio hace
      // semanas —el precio de la casa ya incorpora el xG, la forma y las
      // lesiones, promediarlo era contar lo mismo dos veces— y desde entonces
      // el mercado va solo, con peso 1.00.
      fila('Fuente de los goles esperados', x.lam.mk
        ? 'Cuotas del mercado, con el margen de la casa descontado'
        : 'Nivel del equipo por xG <span class="text-muted">(este partido no tiene cuotas)</span>')
    ].join(''))}

    <div style="margin-top:18px;padding:11px 14px;background:rgba(255,255,255,0.03);border-radius:10px;font-size:0.78rem;color:var(--text-muted);line-height:1.55;">
      Todo lo de arriba es dato medido o cálculo declarado. La ficha se despeja de la planilla oficial
      (<code>puntaje acumulado − bonos conocidos ÷ partidos</code>), los tiros y el xG salen de 365Scores partido por partido,
      las cuotas son promedio de casas con el margen descontado. No hay ningún peso configurado a mano:
      el puntaje es la suma de los términos del reglamento.
    </div>`;
  abrirModal('audit-modal');
};

// ── el once ─────────────────────────────────────────────────────────────────
function cuentaPos(e) { const [a, d, v, l] = e.split('-').map(Number); return { ARQ: a, DEF: d, VOL: v, DEL: l }; }
function recalcCapitan() {
  let mejor = null;
  S.once.forEach(id => { const p = TODOS[id]; if (p && (!mejor || p.fi > mejor.fi)) mejor = p; });
  S.capitan = mejor ? mejor.id : null;
}
function totalOnce() {
  let t = 0; S.once.forEach(id => { const p = TODOS[id]; if (p) t += p.ep; });
  const c = TODOS[S.capitan]; if (c) t += c.fi;
  return t;
}
function costoOnce() {
  let c = 0, sd = 0;
  S.once.forEach(id => { const p = TODOS[id]; if (!p) return; if (p.pr == null) sd++; else c += p.pr; });
  return { c, sd };
}
function cambiarEsquema(e) {
  // El once arriesgado no es un esquema mas: es otro problema de optimizacion.
  // Maximiza la chance de hacer una fecha enorme en vez del promedio.
  if (e === '__riesgo' && D.arriesgado) {
    S.esquema = '__riesgo'; S.once = D.arriesgado.ids.slice(); pintarOnce(); return;
  }
  const b = D.esquema.todos.find(x => x.e === e || x.esquema === e);
  if (!b) return;
  S.esquema = e; S.once = (b.ids || b.once.map(z => z.id)).slice();
  pintarOnce();
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
      const ops = D.esquema.todos.map(e => `<option value="${e.e || e.esquema}">${esquemaLindo(e.e || e.esquema)}</option>`);
      if (D.arriesgado) ops.unshift(`<option value="__riesgo">🚀 ARRIESGADO (${esquemaLindo(D.arriesgado.esquema)})</option>`);
      sel.innerHTML = ops.join('');
      sel.dataset.listo = '1';
    }
    sel.value = S.esquema;
  }
  const porPos = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  S.once.forEach(id => { const p = TODOS[id]; if (p) porPos[p.pos].push(p); });
  Object.values(porPos).forEach(a => a.sort((x, y) => y.ep - x.ep));

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
  const cand = D.rankings[p.pos].filter(x => !S.once.includes(x.id) || x.id === id).slice(0, 60);
  const body = $('team-detail-body');
  $('team-detail-title').innerHTML = `⇅ Cambiar a ${esc(nombreCorto(p.n))} — ordenado por puntos esperados`;
  body.innerHTML = `<table class="data-table"><tbody>${cand.map(x => `
    <tr style="cursor:pointer;" onclick="hacerCambio('${id}','${x.id}')">
      <td><div class="player-name">${esc(nombreCorto(x.n))}</div>
          <div class="player-sub">${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'L' : 'V'} vs ${esc(NOM(x.riv))}</div></td>
      <td class="text-center text-muted">${plata(x.pr)}</td>
      <td class="text-center">${x.mesp != null ? x.mesp + "'" : '—'}</td>
      <td class="text-center"><span class="score-badge">${n2(x.ep)}</span></td>
    </tr>`).join('')}</tbody></table>`;
  abrirModal('team-detail-modal');
};
window.hacerCambio = function (viejo, nuevo) {
  const i = S.once.indexOf(viejo); if (i >= 0) S.once[i] = nuevo;
  $('team-detail-modal').classList.remove('active');
  pintarOnce();
};

// ── líderes ─────────────────────────────────────────────────────────────────
function pintarLideres() {
  const body = $('leaders-body'); if (!body) return;
  const cat = ($('leaders-cat-select') || {}).value || 'xgPerMatch_noPen';
  const posSel = ($('leaders-pos-select') || {}).value || 'ALL';

  // [titulo, como se saca, como se muestra, esPromedio]
  // Las metricas POR PARTIDO piden un minimo de partidos: con 2 partidos
  // cualquiera encabeza un ranking de promedios y eso no dice nada.
  const MAP = {
    xgPerMatch_noPen: ['xG por partido', x => x.ind ? x.ind.xgPorPartido : null, n3, true],
    shotsPerMatch:    ['Tiros por partido', x => x.ind ? x.ind.tirosPorPartido : null, n1, true],
    goalsPerMatch:    ['Goles en el torneo', x => x.ind ? x.ind.goles : null, v => String(v ?? 's/d'), false],
    avgRating:        ['Ficha Clarín limpia', x => x.fi, n2, true],
    cleanSheets:      ['Vallas invictas', x => x.ind ? x.ind.vallas : null, v => String(v ?? 's/d'), false],
    yellowCards:      ['Amarillas', x => x.ind ? x.ind.amarillas : null, v => String(v ?? 's/d'), false]
  };
  const [titulo, get, fmt, esPromedio] = MAP[cat] || MAP.xgPerMatch_noPen;
  const h = $('lbl-leader-metric-header'); if (h) h.textContent = titulo;

  const MIN_PJ = 3;
  const pjDe = x => (x.ind && (x.ind.pj365 || x.ind.pj)) || 0;

  let lista = Object.values(TODOS)
    .filter(x => posSel === 'ALL' || x.pos === posSel)
    .filter(x => get(x) != null);
  const antes = lista.length;
  if (esPromedio) lista = lista.filter(x => pjDe(x) >= MIN_PJ);
  const filtrados = antes - lista.length;

  const valores = lista.map(get);
  lista = lista.sort((a, b) => get(b) - get(a)).slice(0, 40);

  const nota = $('leaders-nota');
  if (nota) {
    nota.innerHTML = esPromedio
      ? `Promedio por partido — se piden <b>${MIN_PJ} partidos como mínimo</b> para entrar (${filtrados} jugadores quedaron afuera por poca muestra).`
      : 'Acumulado en el torneo, sin mínimo de partidos.';
  }

  body.innerHTML = lista.map((x, i) => {
    const p = percentil(get(x), valores, true);
    return `
    <tr style="cursor:pointer;" onclick="auditar('${x.id}')">
      <td class="text-center text-muted">${i + 1}</td>
      <td><div class="player-name">${esc(nombreCorto(x.n))} ${pintarAvisos(x)}</div></td>
      <td class="text-muted">${esc(NOM(x.eq))}</td>
      <td class="text-center"><span class="badge-pos">${x.pos}</span></td>
      <td class="text-center">${pjDe(x) || '–'}</td>
      <td class="text-center" style="font-weight:800;color:#38bdf8;">${fmt(get(x))}</td>
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
