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
  zona: 'todos',
  filtroTabla: 'all',
  esquema: null,
  once: [],
  capitan: null,
  ordCol: 'sc',
  ordDir: -1
};

// ── utilidades ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = v => (v == null || isNaN(v)) ? 's/d' : Number(v).toFixed(1);
const n2 = v => (v == null || isNaN(v)) ? 's/d' : Number(v).toFixed(2);
const n3 = v => (v == null || isNaN(v)) ? 's/d' : Number(v).toFixed(3);
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
  return `<span style="display:inline-block;background:${bg};color:${color};border-radius:6px;padding:2px 8px;font-weight:800;font-size:0.8rem;">P${p}</span>
          <span style="color:var(--text-muted);font-size:0.78rem;margin-left:6px;">(Top ${top}% · #${puesto}/${total})</span>`;
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
}

function eventos() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(z => z.classList.remove('active'));
    b.classList.add('active');
    const t = b.dataset.tab;
    if (t === 'LEADERS') {
      $('view-rankings').style.display = 'none';
      $('view-leaders').style.display = '';
    } else {
      $('view-rankings').style.display = '';
      $('view-leaders').style.display = 'none';
      S.pos = t; S.ordCol = 'sc'; S.ordDir = -1;
      pintarRankings();
    }
  });
  const q = $('search-input'); if (q) q.oninput = () => { S.busqueda = q.value.toLowerCase().trim(); pintarRankings(); };
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
  const st = $('lbl-status-fecha');
  if (st) {
    st.textContent = `Fecha ${D.fechaObjetivo || ''} · ${c.pendientes != null ? `${c.pendientes} de ${D.partidos.length} partidos por jugarse` : `${D.partidos.length} partidos`}`;
    st.style.color = c.vencidas ? 'var(--danger)' : '';
    if (c.vencidas) st.textContent = `Fecha ${D.fechaObjetivo} YA JUGADA — hay que actualizar las cuotas`;
  }
  const df = $('lbl-datos-fecha'); if (df) df.textContent = String(D.ultimaFechaJugada || 5);
  const gs = $('lbl-global-stats');
  if (gs) gs.innerHTML = `<span class="badge-icon">👥</span> ${totJug} jugadores · <span>${conTiros}</span> con tiros medidos`;
  const v = D.validacion || {};
  const hp = $('lbl-health-pct');
  if (hp) hp.textContent = `${(v.total || 0) - (v.fuera || 0)}/${v.total || 0}`;
  const hb = $('lbl-health-badge');
  if (hb) {
    hb.title = `${(v.total || 0) - (v.fuera || 0)} de ${v.total || 0} fichas reconstruidas caen dentro del 1-10 de Clarín. Tocá para ver los ${v.fuera || 0} casos que no.`;
    hb.classList.toggle('chip-ok', (v.pctFuera || 0) <= 8);
    hb.classList.toggle('chip-alerta', (v.pctFuera || 0) > 8);
  }
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
    lista.forEach(m => {
      const div = document.createElement('div');
      div.className = 'fixture-match-card';
      const centro = m.terminado
        ? `<span class="fixture-score">${m.golesLocal} - ${m.golesVisitante}</span>`
        : `<span class="fixture-score" style="font-size:0.7rem;color:var(--text-muted);">${fechaCorta(m.fecha).split(' ')[0]}</span>`;
      const zona = m.zona === 'INT' ? ' · interzonal' : (m.zona ? ' · zona ' + m.zona : '');
      div.innerHTML = `<div class="fixture-match-main">
        <span class="fixture-team home">${esc(NOM(m.local))}</span>
        ${centro}
        <span class="fixture-team away">${esc(NOM(m.visitante))}</span></div>
        <div style="font-size:0.68rem;color:var(--text-muted);text-align:center;margin-top:2px;">${fechaCorta(m.fecha)}${zona}</div>`;
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
  const lado = (nombre, pGol, pVI, rot, alinear) => `
    <div class="fx-side ${alinear}">
      <div class="fx-name">${esc(NOM(nombre))}</div>
      <div class="fx-nums">
        <span title="Probabilidad de que convierta al menos un gol. CALCULADO por nosotros resolviendo un Poisson contra el 1X2 y el Over/Under sin margen — no es una cuota de casa.">⚽ ${pc0(pGol)}</span>
        <span title="Probabilidad de valla invicta. CALCULADO igual que la anterior.">🛡️ ${pc0(pVI)}</span>
        ${rot > 0 ? `<span class="fx-rot" title="${rot >= 0.6 ? 'Muy probable que ponga suplentes' : 'Puede rotar'} — indice de rotacion ${rot}">COPA</span>` : ''}
      </div>
    </div>`;

  D.partidos.forEach(m => {
    const div = document.createElement('div');
    div.className = 'fx-card' + (m.yaJugado ? ' fx-pasado' : '');
    const d = new Date(m.cuando);
    const dia = d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(/-/g, '/');
    const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    div.innerHTML = `
      <div class="fx-when">${m.yaJugado ? '<span class="fx-jugado" title="Este partido ya se jugó">JUGADO</span> ' : ''}${esc(dia)} · ${esc(hora)}${m.lineaTotales != null ? `<span class="fx-ou" title="Linea de goles del mercado">O/U ${m.lineaTotales}</span>` : ''}</div>
      <div class="fx-teams">
        ${lado(m.local, m.pGolLocal, m.pVallaLocal, m.rotacionLocal, 'izq')}
        <div class="fx-vs">vs</div>
        ${lado(m.visitante, m.pGolVisitante, m.pVallaVisitante, m.rotacionVisitante, 'der')}
      </div>
      ${barra(m)}
      <div class="fx-odds">
        <span title="Cuota de victoria local (promedio de casas)">1 <b>${n2(m.cuotaLocal)}</b></span>
        <span title="Cuota de empate">X <b>${n2(m.cuotaEmpate)}</b></span>
        <span title="Cuota de victoria visitante">2 <b>${n2(m.cuotaVisitante)}</b></span>
      </div>`;
    cont.appendChild(div);
  });
  cont.insertAdjacentHTML('beforeend',
    `<div class="fx-nota">Las cuotas <b>1 / X / 2</b> y la línea O/U son de mercado, promediadas entre casas y con el margen descontado.
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
  body.innerHTML = filas.map((t, i) => `
    <tr style="cursor:pointer;" onclick="verEquipo('${esc(t.equipo)}')" title="${esc(NOM(t.equipo))}: ${t.pg}G ${t.pe}E ${t.pp}P · ${t.gf}:${t.gc}">
      <td class="text-center text-muted">${i + 1}</td>
      <td><span class="team-badge-pill">${esc(NOM(t.equipo))}</span></td>
      <td class="text-center">${t.pj}</td>
      <td class="text-center" style="font-weight:800;">${t.pts}</td>
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
  ARQ: [['#', ''], ['Arquero', 'n'], ['Valla invicta', 'pvi'], ['Goles que le hacen', 'lamc'], ['Ficha', 'fi'], ['Juega', 'pj_'], ['Cotización', 'pr'], ['Pts esperados', 'ep']],
  DEF: [['#', ''], ['Defensor', 'n'], ['Perfil', 'perf'], ['Valla', 'pvi'], ['Tiros/p', 'tiros'], ['xG/p', 'xg'], ['Ficha', 'fi'], ['Juega', 'pj_'], ['Cotización', 'pr'], ['Pts esperados', 'ep']],
  VOL: [['#', ''], ['Volante', 'n'], ['Tiros/p', 'tiros'], ['xG/p', 'xg'], ['Piso', 'piso'], ['Techo', 'techo'], ['Ficha', 'fi'], ['Juega', 'pj_'], ['Cotización', 'pr'], ['Pts esperados', 'ep']],
  DEL: [['#', ''], ['Delantero', 'n'], ['Tiros/p', 'tiros'], ['xG/p', 'xg'], ['Piso', 'piso'], ['Techo', 'techo'], ['Ficha', 'fi'], ['Juega', 'pj_'], ['Cotización', 'pr'], ['Pts esperados', 'ep']]
};
const valorCol = (x, k) =>
  k === 'tiros' ? (x.ind ? x.ind.tirosPorPartido : null) :
  k === 'xg' ? (x.ind ? x.ind.xgPorPartido : null) :
  k === 'lamc' ? -x.lam.c :
  k === '' ? x.sc :
  k === 'n' ? x.n : x[k];

function celda(x, k, i) {
  switch (k) {
    case '': return `<span class="text-muted">${i + 1}</span>`;
    case 'n': return `<div class="player-info"><div class="player-name">${esc(nombreCorto(x.n))} ${pintarAvisos(x)}</div>
      <div class="player-sub">${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'Local' : 'Visitante'} vs ${esc(NOM(x.riv))}
      ${x.rot > 0 ? '<span style="color:#f59e0b;font-weight:700;"> · COPA</span>' : ''}
      ${x.rotr > 0 ? '<span style="color:#10b981;font-weight:700;"> · rival de copa</span>' : ''}</div></div>`;
    case 'perf': {
      const c = x.perf.startsWith('SÓLIDO +') ? '#10b981' : x.perf === 'SÓLIDO' ? '#3b82f6' : x.perf === 'RIESGO GOLEADOR' ? '#f59e0b' : '#94a3b8';
      return `<span class="badge-profile" style="color:${c};border-color:${c}55;">${esc(x.perf)}</span>`;
    }
    case 'pvi': return pc0(x.pvi);
    case 'pj_': return pc0(x.pj_);
    case 'pr': return `<span style="color:#f59e0b;font-weight:700;">${plata(x.pr)}</span>`;
    case 'lamc': return n2(x.lam.c);
    case 'tiros': return x.ind ? n1(x.ind.tirosPorPartido) : 's/d';
    case 'xg': return x.ind ? n3(x.ind.xgPorPartido) : 's/d';
    case 'fi': return n2(x.fi);
    case 'ep': return `<span class="score-badge">${n2(x.ep)}</span>`;
    default: return n2(x[k]);
  }
}
function pintarRankings() {
  const thead = $('rankings-thead'), body = $('players-body');
  if (!thead || !body) return;
  const cols = COLS[S.pos];
  thead.innerHTML = '<tr>' + cols.map(c =>
    `<th class="${c[1] === 'n' || c[1] === 'perf' ? '' : 'text-center'}" data-k="${c[1]}" style="cursor:pointer;">${c[0]}</th>`).join('') + '</tr>';
  thead.querySelectorAll('th').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if (S.ordCol === k) S.ordDir *= -1; else { S.ordCol = k; S.ordDir = -1; }
    pintarRankings();
  });
  let lista = D.rankings[S.pos].filter(x =>
    !S.busqueda || x.n.toLowerCase().includes(S.busqueda) || x.eq.toLowerCase().includes(S.busqueda));
  lista = lista.slice().sort((a, b) => {
    const va = valorCol(a, S.ordCol), vb = valorCol(b, S.ordCol);
    if (typeof va === 'string') return -S.ordDir * String(va).localeCompare(String(vb));
    return S.ordDir * ((va ?? -1e9) - (vb ?? -1e9));
  });
  body.innerHTML = lista.slice(0, 120).map((x, i) =>
    `<tr style="cursor:pointer;" onclick="auditar('${x.id}')">` +
    cols.map(c => `<td class="${c[1] === 'n' || c[1] === 'perf' ? '' : 'text-center'}">${celda(x, c[1], i)}</td>`).join('') +
    '</tr>').join('');
}

// ── LA LUPITA: auditoría completa del jugador ───────────────────────────────
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
        <div class="text-muted" style="font-size:0.76rem;">puntos esperados si juega</div>
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
      filaP('xG por partido', n3(ind.xgPorPartido), percentil(ind.xgPorPartido, col('xg')), `· ${n2(ind.xg)} acumulado`),
      filaP('Goles esperados esta fecha', n3(x.lg), percentil(x.lg, pool.map(y => y.lg))),
      fila('Goles / figuras / vallas', `${ind.goles || 0} / ${ind.figuras || 0} / ${ind.vallas || 0}`),
      filaP('Amarillas', String(ind.amarillas || 0), percentil(x.ta, pool.map(y => y.ta), false), `· ${pc0(x.ta)} por partido`),
      fila('Minutos', `${ind.minutos || 0} <span class="text-muted">(${ind.minutosPorPartido || 0}/p)</span>`),
      fila('Titularidad', ind.titularidad != null ? pc0(ind.titularidad) : 's/d', 'partidos con 60+ min'),
      fila('Chance de jugar', pc0(x.pj_), 'dato, no descuenta puntos')
    ].join(''))}

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
      fila('Fuente de los goles esperados', x.lam.mk
        ? '55% mercado + 30% xG + 15% goles reales'
        : '65% xG + 35% goles reales <span class="text-muted">(sin cuotas)</span>')
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
      sel.innerHTML = D.esquema.todos.map(e => `<option value="${e.e || e.esquema}">${e.e || e.esquema}</option>`).join('');
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
      const card = document.createElement('div');
      card.className = 'gdt-card-badge' + (cap ? ' captain' : '');
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

  const t = totalOnce(), { c, sd } = costoOnce();
  const el = $('best11-total-score');
  if (el) el.innerHTML = `${n1(t)} pts <span style="font-size:0.8rem;color:var(--text-muted);font-weight:500;">· ${c ? '$' + (c / 1e6).toFixed(1) + 'M' : 's/d'} de $65M${sd ? ` (${sd} sin cotización)` : ''}</span>`;
  const lf = $('lbl-rec-formation'); if (lf) lf.textContent = S.esquema;
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
      <td class="text-center">${pc0(x.pj_)}</td>
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
  body.innerHTML = `
    <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;line-height:1.5;">
      Todo medido sobre los partidos jugados, 365Scores. El promedio de la liga es
      <strong>${n1(liga.locTiros)} tiros de local</strong> y <strong>${n1(liga.visTiros)} de visitante</strong>.
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
          <td><span class="team-badge-pill">${esc(NOM(e.equipo))}</span>${e.rotacion > 0 ? '<span style="color:#f59e0b;font-size:0.68rem;font-weight:800;"> COPA</span>' : ''}</td>
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
  modalTexto('Ficha reconstruida — qué es y por qué no da 100%', `
    <div class="md-seccion">
      <h4>Qué mide</h4>
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
  const nivel = v => {
    // 1.00 = promedio de la liga. Arriba de 1 en defensa = concede mas = peor.
    const pct = Math.round(100 * (v - 1));
    return `<span style="color:${pct > 8 ? '#ef4444' : pct < -8 ? '#10b981' : 'var(--text-muted)'};font-weight:700;">${pct >= 0 ? '+' : ''}${pct}%</span>`;
  };

  const filaDef = t => `
    <tr class="${t.yaJugado ? 'tb-jugado' : ''}">
      <td><b>${esc(t.equipo)}</b> <span class="text-muted">${t.condicion === 'L' ? 'local' : 'visita'}</span>${t.yaJugado ? ' <span class="fx-jugado">JUGADO</span>' : ''}</td>
      <td class="text-muted">vs ${esc(t.rival)}</td>
      <td class="text-center"><b>${pc0(t.pValla)}</b>${barra(t.pValla, 0.6, '#10b981')}</td>
      <td class="text-center">${n2(t.lamContra)}</td>
      <td class="text-center">${nivel(t.miDefensa)}</td>
      <td class="text-center">${t.rotacion > 0 ? '<span class="fx-rot">COPA</span>' : ''}</td>
    </tr>`;
  const filaAtq = t => `
    <tr class="${t.yaJugado ? 'tb-jugado' : ''}">
      <td><b>${esc(t.equipo)}</b> <span class="text-muted">${t.condicion === 'L' ? 'local' : 'visita'}</span>${t.yaJugado ? ' <span class="fx-jugado">JUGADO</span>' : ''}</td>
      <td class="text-muted">vs ${esc(t.rival)}</td>
      <td class="text-center"><b>${n2(t.lamFavor)}</b>${barra(t.lamFavor, 2.2, '#eb6834')}</td>
      <td class="text-center">${nivel(t.suDefensa)}</td>
      <td class="text-center">${nivel(t.miAtaque)}</td>
      <td class="text-center">${t.rotacionRival > 0 ? '<span class="fx-rot">rival de copa</span>' : ''}</td>
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
      'Ordenado por probabilidad de valla invicta. La columna “su nivel” compara la defensa del equipo contra el promedio de la liga sobre todos sus partidos: en verde concede menos, en rojo más.',
      [['Equipo'], ['Partido'], ['Valla invicta', 1, 'Probabilidad de no recibir gol, calculada desde las cuotas'], ['Goles que recibe', 1, 'Goles esperados en contra'], ['Su nivel', 1, 'Defensa vs promedio de la liga'], ['', 1]],
      filaDef, porDefensa)}
    ${tabla('Dónde poner delanteros y volantes',
      'Ordenado por goles esperados del equipo. “Defensa rival” en rojo es una defensa vulnerable: ahí es donde se convierte.',
      [['Equipo'], ['Partido'], ['Goles esperados', 1, 'Goles esperados a favor, calculados desde las cuotas'], ['Defensa rival', 1, 'Qué tan vulnerable es la defensa que enfrenta, vs el promedio de la liga'], ['Su ataque', 1, 'Ataque del equipo vs el promedio de la liga'], ['', 1]],
      filaAtq, porAtaque)}
    <p class="md-p suave">El nivel de cada equipo sale de todos los partidos disponibles (torneo actual + anterior), no solo de esta condición: medimos que el corte local/visitante por equipo no se traslada de un torneo al otro, pero el nivel general sí, y la ventaja de local de la liga también.</p>`);
}

function avisoPendiente() {
  alert('Todavía no hay nada que mostrar acá, y prefiero decírtelo antes que inventarlo.\n\n' +
    'El backtesting y el registro de aciertos necesitan comparar lo que recomendó el algoritmo\n' +
    'contra los puntajes reales. Eso recién se puede hacer cuando termine una fecha con el\n' +
    'motor nuevo andando, o cuando corras SYNC_365_HISTORICO.bat para traer el torneo anterior.');
}
