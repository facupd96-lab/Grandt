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
    if (d.suspendido) {
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
      a.push([e.toUpperCase(), copa ? '#f59e0b' : '#64748b',
        copa ? `El Gran DT lo marca como "${e}": jugó o juega por copa esta semana, así que puede ser rotado en la liga. No cambia el puntaje esperado — la decisión es tuya.`
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
  pintarAvisoDatos();
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
function armarBanco() {
  const b = {};
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => {
    const cand = (D.rankings[p] || [])
      .filter(x => !S.once.includes(x.id))
      .sort((a, c) => (c.ep ?? -1) - (a.ep ?? -1));
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
  else if (p.pj_ != null && p.pj_ < 0.6) avisos.push([pc0(p.pj_), '#f59e0b', 'Chance de llegar a los 20 minutos']);
  return `<div class="ficha11${cap ? ' es-capitan' : ''}${distinto ? ' es-distinto' : ''}${o.banco ? ' es-suplente' : ''}${S_ONCE.cambiando === p.id ? ' cambiando' : ''}"
       data-id="${p.id}">
    <div class="f11-top">
      <button class="f11-swap" title="Ver alternativas para este puesto">⇅</button>
      ${cap ? '<span class="f11-cap" title="Capitán: se le duplica la ficha">C</span>' : ''}
    </div>
    <div class="f11-jersey">${jersey(p.pos)}</div>
    <div class="f11-nombre">${esc(nombreCorto(p.n))}</div>
    <div class="f11-eq">${esc(NOM(p.eq))} · ${p.cond === 'L' ? 'L' : 'V'} ${esc(NOM(p.riv))}</div>
    <div class="f11-pts">${n2(cap ? p.ep + p.fi : p.ep)}<span> pts</span></div>
    <div class="f11-pie" title="${p.mtit && p.mtit.length ? 'Cuando fue titular jugó: ' + p.mtit.join(', ') + ' minutos' : 'Sin partidos de titular para leerlo'}">${plata(p.pr)} · ${p.msj != null ? p.msj + "'" : '—'}</div>
    ${avisos.length ? `<div class="f11-avisos">${avisos.map(([t, c, ay]) =>
      `<span style="color:${c};border-color:${c}66;" title="${esc(ay)}">${t}</span>`).join('')}</div>` : ''}
  </div>`;
}

function pintarPantallaOnce() {
  const cont = $('pantalla-once'); if (!cont || !D) return;
  recalcCapitan();
  if (!S_ONCE.banco) S_ONCE.banco = armarBanco();

  const porPos = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  S.once.forEach(id => { const p = TODOS[id]; if (p) porPos[p.pos].push(p); });
  Object.values(porPos).forEach(a => a.sort((x, y) => y.ep - x.ep));

  const t = totalOnce(), { c, sd } = costoOnce();
  const esR = S.esquema === '__riesgo';
  const cap = TODOS[S.capitan];
  const esquemaTxt = esR ? esquemaLindo(D.arriesgado ? D.arriesgado.esquema : '') : esquemaLindo(S.esquema);

  const opciones = D.esquema.todos.map(e => {
    const v = e.e || e.esquema;
    return `<option value="${v}"${!esR && S.esquema === v ? ' selected' : ''}>${esquemaLindo(v)}</option>`;
  }).join('');

  // ── el panel de alternativas ──
  let panel = '';
  if (S_ONCE.cambiando) {
    const p = TODOS[S_ONCE.cambiando];
    if (p) {
      const enBanco = Object.values(S_ONCE.banco).includes(p.id);
      const cand = (D.rankings[p.pos] || [])
        .filter(x => x.id === p.id || (!S.once.includes(x.id) && !Object.values(S_ONCE.banco).includes(x.id)))
        .slice(0, 12);
      panel = `<div class="panel-cambio">
        <div class="pc-cab">
          <div><b>Alternativas para ${esc(nombreCorto(p.n))}</b>
            <span class="text-muted">· ${NOMBRE_POS_L[p.pos].toLowerCase()} ${enBanco ? 'del banco' : 'del once'}</span></div>
          <button class="pc-cerrar" id="pc-cerrar">Cerrar</button>
        </div>
        <div class="pc-lista">${cand.map(x => {
          const dif = (x.ep ?? 0) - (p.ep ?? 0);
          const esEl = x.id === p.id;
          return `<button class="pc-item${esEl ? ' pc-actual' : ''}" data-poner="${x.id}"${esEl ? ' disabled' : ''}>
            <span class="pc-n">${esc(nombreCorto(x.n))}<small>${esc(NOM(x.eq))} · ${x.cond === 'L' ? 'L' : 'V'} ${esc(NOM(x.riv))}</small></span>
            <span class="pc-d">${x.mesp != null ? x.mesp + "'" : '—'}<small>minutos</small></span>
            <span class="pc-d">${plata(x.pr)}<small>cotización</small></span>
            <span class="pc-p">${n2(x.ep)}<small>${esEl ? 'ahora' : (dif >= 0 ? '+' : '') + n2(dif)}</small></span>
          </button>`;
        }).join('')}</div>
        <div class="pc-pie">Ordenado por puntos descontando la chance de que no juegue. La columna de la derecha muestra cuánto
        cambia el once si lo ponés.</div>
      </div>`;
    }
  }

  cont.innerHTML = `
    <div class="once-hero">
      <div>
        <div class="fecha-eyebrow">Fecha ${D.fechaObjetivo ?? '–'}</div>
        <h1>Mejor 11</h1>
        <p>${esR
          ? `Otra apuesta, no la misma con dos retoques: comparte <b>${D.arriesgado && D.arriesgado.comunes != null ? D.arriesgado.comunes : '—'} nombres</b> con el sólido y nada más. Busca la fecha que se gana, no el promedio.`
          : 'El once que maximiza los <b>puntos esperados</b> de la fecha. Tocá el ⇅ de cualquier jugador para ver alternativas de su puesto.'}</p>
      </div>
      <div class="once-marcador">
        <div class="om-pts">${n1(t)}</div>
        <div class="om-lbl">puntos esperados</div>
        <div class="om-sub">${c ? '$' + (c / 1e6).toFixed(1) + 'M' : 's/d'} de $65M${sd ? ` · ${sd} sin cotización` : ''}</div>
      </div>
    </div>

    <div class="once-barra">
      <div class="main-tabs">
        <button class="tab-btn${!esR ? ' active' : ''}" data-modo="solido">🛡️ Sólido</button>
        <button class="tab-btn${esR ? ' active' : ''}" data-modo="riesgo"${D.arriesgado ? '' : ' disabled'}>🚀 Arriesgado</button>
      </div>
      <label class="orden-check">Formación
        <select id="once-esquema" class="select-equipo" style="max-width:150px;"${esR ? ' disabled' : ''}>${opciones}</select>
      </label>
      <div class="once-capitan" title="El capitán duplica SOLO la ficha Clarín, no las incidencias.">
        <span class="oc-lbl">Capitán</span>
        <b>${cap ? esc(nombreCorto(cap.n)) : '—'}</b>
        <span class="text-muted">${cap ? `ficha ${n2(cap.fi)} → ${n2(cap.fi * 2)}` : ''}</span>
      </div>
      <div class="once-esq">${esquemaTxt}</div>
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
    S_ONCE.cambiando = null; S_ONCE.banco = armarBanco(); pintarPantallaOnce();
  });
  const se = $('once-esquema');
  if (se) se.onchange = () => { cambiarEsquema(se.value); S_ONCE.cambiando = null; S_ONCE.banco = armarBanco(); pintarPantallaOnce(); };
  cont.querySelectorAll('.f11-swap').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const id = b.closest('.ficha11').dataset.id;
    S_ONCE.cambiando = (S_ONCE.cambiando === id) ? null : id;
    pintarPantallaOnce();
    const pc = cont.querySelector('.panel-cambio'); if (pc) pc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  cont.querySelectorAll('.ficha11[data-id]').forEach(f => f.onclick = () => auditar(f.dataset.id));
  const cc = $('pc-cerrar'); if (cc) cc.onclick = () => { S_ONCE.cambiando = null; pintarPantallaOnce(); };
  cont.querySelectorAll('[data-poner]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const viejo = S_ONCE.cambiando, nuevo = b.dataset.poner;
    const i = S.once.indexOf(viejo);
    if (i >= 0) S.once[i] = nuevo;
    else { const pos = TODOS[viejo].pos; if (S_ONCE.banco[pos] === viejo) S_ONCE.banco[pos] = nuevo; }
    S_ONCE.cambiando = null;
    pintarPantallaOnce();
  });
}

// ── navegacion por secciones ────────────────────────────────────────────────
// Cada pantalla a lo ancho, en vez de todo apretado a la vez.
function mostrarSeccion(sec) {
  document.querySelectorAll('.seccion').forEach(el => { el.hidden = (el.id !== 'sec-' + sec); });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (sec === 'jugadores') pintarRankings();
  if (sec === 'fecha') pintarPantallaFecha();
  if (sec === 'oportunidades') pintarOportunidades();
  if (sec === 'once') pintarPantallaOnce();
  if (sec === 'datos') pintarDatos();
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
    return `<tbody>${filas.slice(0, n).join('')}</tbody>
      <tbody id="${id}" hidden>${filas.slice(n).join('')}</tbody>
      <tbody><tr class="fila-vermas"><td colspan="9"><button class="chip-jug chip-mas"
        onclick="const e=document.getElementById('${id}');e.hidden=!e.hidden;this.textContent=e.hidden?'ver los ${falta} restantes':'ver menos';">ver los ${falta} restantes</button></td></tr></tbody>`;
  };
  const fila = c => `<tr>${c.join('')}</tr>`;
  const bloque = (titulo, bajada, cuerpo, nota, ancho) => `
    <div class="card dato-card${ancho ? ' dato-ancho' : ''}">
      <div class="dato-head"><h2>${titulo}</h2><p>${bajada}</p></div>
      ${cuerpo}
      ${nota ? `<div class="tabla-referencia">${nota}</div>` : ''}
    </div>`;
  const chip = x => `<div class="player-info"><div class="player-name">${esc(nombreCorto(x.nombre))}</div>
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
    </table>` : vacio('Nadie con dos goles o más en sus últimos cinco partidos.');

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

  // ── DONDE SACAN LOS PUNTOS ───────────────────────────────────────────────
  const cp = C.casaYPatio || [];
  const tablaCasa = cp.length ? `
    <table class="data-table tb-datos tb-casa">
      <thead><tr><th>Equipo</th><th class="text-center">Local</th><th class="text-center">Visitante</th>
      <th title="Qué parte de sus puntos sacó jugando en casa.">Reparto</th></tr></thead>
      ${cuerpo(cp.map(t => {
        const pc = t.pctCasa;
        const color = pc == null ? 'var(--text-muted)' : (pc >= 70 ? 'var(--success)' : pc <= 30 ? 'var(--danger)' : 'var(--text-main)');
        return fila([
          `<td><b>${esc(t.equipo)}</b><div class="player-sub">${t.pts} puntos</div></td>`,
          `<td class="text-center"><b>${t.ptsLocal}</b><div class="op-cuenta">${t.pjLocal} PJ · ${t.gfLocal}:${t.gcLocal}</div></td>`,
          `<td class="text-center"><b>${t.ptsVisita}</b><div class="op-cuenta">${t.pjVisita} PJ · ${t.gfVisita}:${t.gcVisita}</div></td>`,
          `<td><div class="reparto"><div class="reparto-barra">
              <span class="rep-l" style="width:${pc == null ? 50 : pc}%;"></span>
              <span class="rep-v" style="width:${pc == null ? 50 : 100 - pc}%;"></span>
            </div><span class="reparto-num" style="color:${color};">${pc == null ? '—' : pc + '%'}</span></div></td>`
        ]);
      }))}
    </table>` : vacio('Todavía no hay puntos para repartir.');

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
    </div>` : vacio('Todavía no hay una fecha jugada con puntajes cargados.');

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

  // ── EN DUDA ──────────────────────────────────────────────────────────────
  const duda = C.enDuda || [];
  // Los 97 enteros, no una selección: en una tabla de tres columnas serían seis
  // pantallas, así que van en lista compacta ordenados por lo que se pierde uno
  // si al final no juegan. Los diez primeros con su puntaje esperado a la vista.
  const tablaDuda = duda.length ? `
    <table class="data-table tb-datos">
      <thead><tr><th>Jugador</th><th class="text-center">Minutos</th><th class="text-center">Espera</th></tr></thead>
      ${cuerpo(duda.map(x => fila([
        `<td style="cursor:pointer;" onclick="auditar('${x.id}')">${chip(x)}</td>`,
        `<td class="text-center">${x.minutos}'<div class="op-cuenta">${x.mesp}' esperados</div></td>`,
        `<td class="text-center"><b>${n2(x.EP)}</b></td>`
      ])))}
    </table>
    ` : vacio('Ningún jugador quedó en duda.');

  // ── CAMBIARON DE CLUB ────────────────────────────────────────────────────
  const trf = C.transferidos || [];
  const tablaTrf = trf.length ? `
    <table class="data-table tb-datos">
      <thead><tr><th>Jugador</th><th>Venía de</th><th class="text-center">Minutos de allá</th><th class="text-center">Espera</th></tr></thead>
      ${cuerpo(trf.map(x => fila([
        `<td style="cursor:pointer;" onclick="auditar('${x.id}')">${chip(x)}</td>`,
        `<td><b class="dato-ex">${esc(x.desde)}</b></td>`,
        `<td class="text-center">${x.min}'</td>`,
        `<td class="text-center">${n2(x.EP)}</td>`
      ])))}
    </table>` : vacio('Nadie cambió de club a mitad de torneo.');

  // ── AL FILO Y BAJAS ──────────────────────────────────────────────────────
  const filo = C.alFilo || [], bajas = C.bajas || [];
  const tablaFilo = filo.length ? `
    <table class="data-table tb-datos">
      <thead><tr><th>Jugador</th><th class="text-center">Amarillas</th><th class="text-center">Chance de verla</th><th class="text-center">Espera</th></tr></thead>
      ${cuerpo(filo.map(x => fila([
        `<td style="cursor:pointer;" onclick="auditar('${x.id}')">${chip(x)}</td>`,
        `<td class="text-center"><b>${x.amarillas}</b></td>`,
        `<td class="text-center">${pc0(x.tasaTA)}</td>`,
        `<td class="text-center">${n2(x.EP)}</td>`
      ])))}
    </table>` : vacio('Nadie llega al partido a una amarilla de la suspensión.');
  const ORDEN_BAJA = ['Lesionado', 'Expulsado', 'Suspendido', 'No juega'];
  const porMotivo = {};
  bajas.forEach(x => { const k = x.motivo || 'Sin dato'; (porMotivo[k] = porMotivo[k] || []).push(x); });
  const clavesBaja = Object.keys(porMotivo).sort((a, b) => {
    const ia = ORDEN_BAJA.indexOf(a), ib = ORDEN_BAJA.indexOf(b);
    return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib) || porMotivo[b].length - porMotivo[a].length;
  });
  const tablaBajas = bajas.length ? `
    <div class="bajas-grupos">${clavesBaja.map(k => `
      <div class="baja-grupo">
        <div class="baja-tit"><span class="pill-alerta pill-mal">${esc(k)}</span> <b>${porMotivo[k].length}</b></div>
        ${(() => {
          const lista = porMotivo[k].sort((a, b) => (a.equipo || '').localeCompare(b.equipo || ''));
          const item = x => `<div class="baja-item"><b>${esc(nombreCorto(x.nombre))}</b><span>${esc(x.equipo)} · ${x.pos}</span></div>`;
          if (lista.length <= 8) return `<div class="baja-lista">${lista.map(item).join('')}</div>`;
          const id = 'bj' + (++_nMas); const resto = lista.slice(8);
          return `<div class="baja-lista">${lista.slice(0, 8).map(item).join('')}</div>
            <div id="${id}" hidden class="baja-lista">${resto.map(item).join('')}</div>
            <button class="chip-jug chip-mas" style="margin-top:6px;" onclick="const e=document.getElementById('${id}');e.hidden=!e.hidden;this.textContent=e.hidden?'ver los ${resto.length} restantes':'ver menos';">ver los ${resto.length} restantes</button>`;
        })()}
      </div>`).join('')}</div>` : vacio('Nadie marcado como baja para esta fecha.');

  cont.innerHTML = `
    <div class="op-hero">
      <div>
        <div class="fecha-eyebrow">Fecha ${D.fechaObjetivo ?? '–'}</div>
        <h1>Datos</h1>
        <p>Las cosas que no entran en el puntaje pero se miran igual antes de cerrar el equipo.
        Todo sale de los mismos datos que usa el modelo: no hay nada estimado a ojo.</p>
      </div>
    </div>
    <div class="datos-col">
      ${bloque('⚔️ Ley del ex', 'Juega contra un club donde ya jugó.', tablaLey,
        'Un ex se detecta de dos formas, las dos con partidos reales atrás: que haya jugado en ese club <b>el torneo pasado</b> ' +
        '(sale del historial de 365Scores) o que se haya ido de ahí <b>en este mismo torneo</b> (lo detectamos al cruzar la planilla ' +
        'de Gran DT con 365Scores). Todavía no llegamos más atrás que eso, así que la lista es corta y segura: el que aparece, jugó ahí. ' +
        'Y que sea el ex no cambia el puntaje esperado — <b>no hay evidencia de que la ley del ex exista</b>; está acá porque es lindo saberlo.', true)}
      ${bloque(`🏆 El once ideal de la fecha ${oi ? oi.fecha : '–'}`, 'Los que más pagaron la fecha pasada, armados en un equipo válido.', tablaOnce,
        'Sale de los puntajes fecha por fecha de la planilla de Gran DT. Se prueban los diez esquemas válidos y queda el que más suma. ' +
        'Es lo que <b>efectivamente pagó</b>, no una recomendación para la próxima. ' +
        'El Gran DT muestra un total algo mayor porque le suma la cinta de capitán, que duplica la ficha del elegido; ' +
        'la planilla no separa la ficha del resto de los puntos, así que acá va el puntaje limpio.')}
      ${bloque('⭐ Figuras', 'Cuántas veces fue la figura de su equipo.', tablaFig,
        'VF de la planilla de Gran DT: la figura del partido suma 4 puntos. Al lado, la chance que le da el modelo de serlo hoy.')}
      ${bloque('🔥 En racha', 'Quién viene metiendo goles.', tablaRacha,
        'Los <b>últimos 5 partidos que jugó</b> cada uno, del más viejo al más nuevo — los partidos que se perdió no cuentan. ' +
        'La <b>racha</b> son fechas seguidas convirtiendo hasta el último que jugó. Sale del log partido por partido de 365Scores. ' +
        'Que venga metiendo no cambia el puntaje esperado: el modelo mira el xG y los tiros, no la última semana.')}
      ${bloque('🎯 Le deben goles', 'Genera más de lo que convierte.', tablaDeb,
        'xG sin penales menos goles de jugada, mínimo 250 minutos. No es una promesa de gol: es que la pelota le está llegando.')}
      ${bloque('🏠 Dónde sacan los puntos', 'Los 30, de más local a más visitante.', tablaCasa,
        'Puntos de la tabla real del torneo. <b>Esto no entra en el puntaje</b>: medimos que el corte local/visitante de un equipo ' +
        'no se traslada de un torneo al otro. Lo que sí usa el modelo es la ventaja de local de toda la liga.')}
      ${bloque('📈 Rachas de equipo', 'Los 30, con lo que viene arrastrando cada uno.', tablaRq,
        'Resultados seguidos hasta el último partido jugado, de la tabla de posiciones.')}
      ${bloque('❓ En duda', 'El Gran DT no los da ni dentro ni fuera.', tablaDuda,
        'Estado <b>En duda</b> del Ayudante de campo. <b>No toca el puntaje esperado</b>: todavía no medimos cuánto pesa, ' +
        'y no se inventan números. Está acá para que lo mires vos antes de cerrar el equipo.')}
      ${bloque('⇄ Cambiaron de club', 'Sus minutos y su xG son del club anterior.', tablaTrf,
        'Los detectamos cruzando la planilla de Gran DT con 365Scores: la planilla ya los pone en el club nuevo y 365Scores ' +
        'los sigue listando en el viejo. Los minutos son reales, pero son de allá. Quedan marcados también en los rankings.')}
      ${bloque('🟨 Al filo', 'Una amarilla más y se pierden la que viene.', tablaFilo,
        'Amarillas de la planilla de Gran DT (las de copa no cuentan) y la frecuencia con la que ve amarilla por partido.')}
      ${bloque('🚫 No están', 'Lesionados, suspendidos y expulsados de esta fecha.',
        (C.tarjetero && C.tarjetero.viejo
          ? `<div class="dato-alerta">El tarjetero cargado es de la <b>fecha ${C.tarjetero.fecha}</b> y ya no alcanza a la ${D.fechaObjetivo}.
             Estas bajas pueden estar cumplidas: hay que cargar el tarjetero nuevo de Planeta en <code>suspendidos.json</code>.</div>` : '')
        + tablaBajas,
        'Sale del <b>Ayudante de campo del Gran DT oficial</b>, que publica el estado de cada jugador antes de la fecha. ' +
        'Es la única fuente que tiene los lesionados. Estos jugadores <b>no entran al once recomendado</b>, pero siguen ' +
        'apareciendo en los rankings y en Oportunidades con su cartel: nadie desaparece.')}
    </div>`;
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
  // En Gran DT los cambios abren recien cuando termina el ULTIMO partido de la
  // fecha en curso. Mientras quede uno por jugarse, el equipo sigue cerrado
  // aunque la proxima fecha esté a tres días.
  const enCurso = D.fechaEnCurso;
  // El propio Gran DT publica el instante exacto de la veda. Le gana a
  // cualquier cuenta nuestra: antes deduciamos el cierre del horario del primer
  // partido y no siempre coincide.
  const veda = D.curiosidades && D.curiosidades.veda ? new Date(D.curiosidades.veda) : null;
  if (veda && veda > new Date()) {
    const faltan = veda - new Date();
    const h = Math.floor(faltan / 3600000), m = Math.floor((faltan % 3600000) / 60000);
    cierre = `<div class="fecha-cierre">
      <div class="fecha-cierre-lbl">Cierran los cambios en</div>
      <div class="fecha-cierre-val">${h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + 'h ' + m + 'min'}</div>
      <div class="fecha-cierre-sub">${esc(fmtDia(veda))} a las ${esc(fmtHora(veda))}. Es el horario de veda que publica el Gran DT, no una cuenta nuestra.</div>
    </div>`;
  } else if (enCurso && new Date(enCurso.ultimo) > new Date()) {
    const u = new Date(enCurso.ultimo);
    cierre = `<div class="fecha-cierre cerrado">
      <div class="fecha-cierre-lbl">Todavía no se pueden hacer cambios</div>
      <div class="fecha-cierre-val">fecha ${enCurso.numero} en curso</div>
      <div class="fecha-cierre-sub">Faltan ${enCurso.faltan} de ${enCurso.total} partidos. Los cambios abren cuando termine el último,
        el ${esc(fmtDia(u))} a las ${esc(fmtHora(u))}.</div>
    </div>`;
  } else if (primero) {
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
  // Los suspendidos se buscan sobre TODOS, no sobre los que el modelo cree que
  // juegan: justamente son los que no van a jugar, y varios quedan debajo del
  // corte de probabilidad.
  const susp = todos.filter(x => x.disp && x.disp.suspendido);
  const alBorde = juegan.filter(x => x.disp && !x.disp.suspendido && x.disp.aUnaDeSuspension);
  const transf = juegan.filter(x => x.tr);
  const confirmados = juegan.filter(x => x.fmin === 'confirmado').length;

  // Una lista de 38 nombres no es un aviso, es una tabla. Se muestran los que
  // de verdad valen —los mejores del ranking dentro de ese grupo— y el resto
  // se despliega tocando el boton, en vez del "y 33 mas" que no se podia abrir.
  const listaCorta = (arr, n) => {
    const orden = arr.slice().sort((a, b) => (b.epsj ?? -1) - (a.epsj ?? -1));
    const chip = x => `<button class="chip-jug" onclick="auditar('${x.id}')">${esc(nombreCorto(x.n))} <span>${esc(NOM(x.eq))}</span></button>`;
    if (orden.length <= n) return orden.map(chip).join('');
    const id = 'mas' + Math.random().toString(36).slice(2, 8);
    return orden.slice(0, n).map(chip).join('')
      + `<span id="${id}" hidden>${orden.slice(n).map(chip).join('')}</span>`
      + `<button class="chip-jug chip-mas" onclick="const e=document.getElementById('${id}');e.hidden=!e.hidden;this.textContent=e.hidden?'+ ${orden.length - n} más':'ver menos';">+ ${orden.length - n} más</button>`;
  };

  const avisos = [];
  // Lo que de verdad decide: quien NO juega. Va primero y ocupa el lugar que
  // antes tenia la lista de amonestados.
  const noJuegan = juegan.filter(x => x.fmin === 'al banco (once confirmado)');
  const delTarjetero = susp.filter(x => x.disp && x.disp.tarjetero && x.disp.tarjetero.cumpleAca);
  const fuenteT = delTarjetero.length ? delTarjetero[0].disp.tarjetero.fuente : null;
  // El desglose por motivo sale del Ayudante de campo del Gran DT oficial, que
  // es el unico que publica los lesionados. Antes esto decia "el resto son
  // rojas de la fecha pasada" y era lo unico que sabiamos.
  const porQue = {};
  susp.forEach(x => { const k = (x.disp && x.disp.estado) || 'suspendido'; porQue[k] = (porQue[k] || 0) + 1; });
  const detalle = Object.entries(porQue).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<b>${v}</b> ${esc(k.toLowerCase())}`).join(' · ');
  if (susp.length) avisos.push(['🟥', 'No juegan esta fecha',
    `${susp.length} jugador${susp.length > 1 ? 'es' : ''}: ${detalle}. ` +
    `Lo publica el <b>Ayudante de campo</b> del Gran DT oficial. No entran al once recomendado.`,
    listaCorta(susp, 10), 'peligro']);
  else avisos.push(['🟥', 'Bajas', 'Ninguna. Si hace más de un día que no corrés <code>SYNC_GRANDT.bat</code>, conviene correrlo: los lesionados cambian hasta una hora antes del partido.', '', 'peligro']);
  if (noJuegan.length) avisos.push(['🪑', 'Al banco', `Su equipo ya confirmó el once y no están. Si entran, cobran ficha igual.`, listaCorta(noJuegan, 8), 'atencion']);
  // LA PORTADA ES PARA DECIDIR, NO PARA MOSTRAR TODO (02/09).
  // "Cambiaron de club" y "a una amarilla de la suspensión" no cambian nada de
  // esta fecha: se fueron enteros a la pestaña Datos, donde ademas se ven
  // completos y no cortados en seis. Acá quedan los que sí deciden: quién no
  // juega, a quién el propio juego pone en duda, y la ley del ex.
  const enDuda = todos.filter(x => x.disp && x.disp.enDuda && !x.disp.suspendido);
  const conEx = todos.filter(x => x.disp && x.disp.exClub && !x.disp.suspendido);
  if (enDuda.length) avisos.push(['❓', `${enDuda.length} en duda`,
    `El Gran DT no los da ni dentro ni fuera. <b>No les toca el puntaje</b>: la decisión es tuya. Los de más puntaje:`,
    listaCorta(enDuda, 8), 'atencion']);
  if (conEx.length) avisos.push(['⚔️', `Ley del ex: ${conEx.length}`,
    `Enfrentan a un club donde jugaron. No cambia el puntaje esperado, pero está bueno saberlo:`,
    listaCorta(conEx, 8), 'info']);
  if (confirmados) avisos.push(['✅', 'Formaciones confirmadas', `${confirmados} jugadores con el once ya publicado: para ellos los minutos no son estimación`, '', 'ok']);
  avisos.push(['📊', 'Todo lo demás está en Datos',
    `Los que cambiaron de club, los que están a una amarilla, el once ideal de la fecha pasada, las figuras, quién viene metiendo goles y de dónde saca los puntos cada equipo.`,
    `<button class="chip-jug chip-mas" onclick="mostrarSeccion('datos')">Ir a Datos →</button>`, 'suave']);

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
    lv.innerHTML = `<b style="color:${D.version ? '#10b981' : '#ef4444'};">motor ${esc(v)}</b> · app v45`;
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
const COLS = {
  ARQ: [['#', ''], ['Arquero', 'n'], ['Valla invicta', 'pvi'], ['Goles que le hacen', 'lamc'], ['Ficha', 'fi'], ['Si juega', 'msj'], ['PUNTOS', 'epsj']],
  DEF: [['#', ''], ['Defensor', 'n'], ['Perfil', 'perf'], ['Valla', 'pvi'], ['Tiros/90', 'tiros'], ['xG/90', 'xg'], ['Ficha', 'fi'], ['Si juega', 'msj'], ['PUNTOS', 'epsj']],
  VOL: [['#', ''], ['Volante', 'n'], ['Tiros/90', 'tiros'], ['xG/90', 'xg'], ['Gol del equipo', 'lamf'], ['Su gol', 'lg'], ['Del gol', 'delgol'], ['Ficha', 'fi'], ['Si juega', 'msj'], ['PUNTOS', 'epsj']],
  DEL: [['#', ''], ['Delantero', 'n'], ['Tiros/90', 'tiros'], ['xG/90', 'xg'], ['Gol del equipo', 'lamf'], ['Su gol', 'lg'], ['Del gol', 'delgol'], ['Ficha', 'fi'], ['Si juega', 'msj'], ['PUNTOS', 'epsj']]
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
const valorCol = (x, k) =>
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
    case 'lg': return `<span title="Goles esperados del jugador en este partido: su parte del ataque del equipo, por los minutos que se espera que juegue">${String(+Number(x.lg).toFixed(2))}</span>`;
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
function tiraMinutos(mins) {
  if (!mins || !mins.length) return '';
  const clase = m => m >= 88 ? 'tm-full' : m >= 75 ? 'tm-largo' : m >= 60 ? 'tm-medio' : 'tm-corto';
  return `<span class="tira-min">${mins.map(m => `<span class="tm ${clase(m)}">${m}</span>`).join('')}</span>`;
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
    ${q ? tiraMinutos(q.ultimos) : ''}</span>`;
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
  if (delMotor != null && Math.abs(delMotor - crudo) > 0.05)
    partes.push(`el modelo lo achica a ${fmt(delMotor)} por 90`);
  return `<span class="${flojo ? 'ritmo-flojo' : ''}${x.dpar ? ' dato-parcial' : ''}" title="${esc(partes.join('. ') + '.')}">${fmt(crudo)}${x.dpar ? `<sup class="falta-mark">−${i.partidosSinDato}</sup>` : ''}</span>`;
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
  delgol: 'Qué parte de sus puntos sale del GOL y no de la ficha. Es el término del gol dividido por el puntaje si juega. Alto (26% o más) = explosivo: saca poco casi siempre y mucho cuando la mete. Bajo (15% o menos) = parejo, suma por nota. Para el promedio da igual de dónde vengan los puntos; para buscar una fecha grande no: la ficha tiene techo 10 y se mueve de a décimas, el gol es un salto de 5 a 7 puntos. Medido sobre el torneo: entre delanteros, elegir por gol rinde apenas mejor que elegir por lo que venían sumando (8.32 contra 8.09 puntos después); entre volantes es al revés (7.47 la ficha contra 7.09 el gol)',
  lg:   'Goles esperados de ESTE jugador en ESTE partido = su parte del ataque × los goles que se espera que meta su equipo × la fracción del partido que juega. 0.50 quiere decir que se espera medio gol suyo, o sea que mete uno una de cada dos fechas. NO ordena la tabla, y con razón: medido sobre el torneo, el promedio de puntos previo anticipa mejor los puntos que vienen de un delantero (0.22) que su ritmo de gol (0.14)',
  lamf: 'Goles esperados de su equipo en este partido, salidos de las cuotas de hoy. El rival ya está adentro del número',
  fi:   'La nota del 1 al 10 que viene sacando, limpia de bonificaciones: se le restan los goles, la figura, la valla y las tarjetas, así que NO cuenta dos veces lo que ya suma aparte. Es el término más grande del puntaje y el que más separa a un jugador de otro en los cuatro puestos (entre 32% y 37%)',
  pvi:  'Chance de que su equipo termine el partido sin recibir goles',
  mesp: 'Minutos esperados = chance de jugar × minutos que juega cuando entra',
  msj:  'Arriba, los minutos que juega CUANDO ARRANCA de titular. Abajo, los últimos tres que arrancó con el número real: verde completó, ámbar salió sobre el final, gris lo sacaron en el último cuarto. Los ratos de suplente no cuentan',
  pj:   'Chance de llegar a los 20 minutos que exige la ficha. Es información: no ordena el ranking ni descuenta puntos',
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
     <label class="orden-check" title="Por defecto se ocultan los que arrancaron menos de dos veces y jugaron menos de 270 minutos. Rinden bien por minuto, pero no son candidatos.">
       <input type="checkbox" id="chk-ver-todos"${S.verTodos ? ' checked' : ''}>
       <span>ver también los suplentes${S.filtrados ? ` (${S.filtrados})` : ''}</span>
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
const MOTOR_NECESARIO = 29;
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
  // EL FILTRO TAMBIEN SE VE (03/09). Antes escondia por "chance de jugar", un
  // numero nuestro que ya no se muestra: filtrar por algo invisible es lo peor
  // de los dos mundos. Ahora la regla es de futbol y se puede comprobar mirando
  // la columna: se ocultan los que NUNCA arrancaron y encima jugaron poco.
  // Con "arrancó alguna vez" alcanzaba para que se colara el arquero suplente
  // que jugó un partido. La regla es: arrancó al menos DOS veces, o jugó tres
  // partidos enteros. Los dos números se pueden comprobar en la columna.
  if (!S.verTodos && !S.busqueda) lista = lista.filter(x => {
    const q = x.pmin, min = (x.ind && x.ind.minutos) || 0;
    if (!q) return true;
    return q.arranques >= 2 || min >= 270;
  });
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
      ${S.filtrados ? `Hay ${S.filtrados} que arrancaron menos de dos veces: marcá «ver también los suplentes».` : ''}</td></tr>`;
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
function recalcCapitan() {
  let mejor = null;
  S.once.forEach(id => { const p = TODOS[id]; if (p && (!mejor || p.fi > mejor.fi)) mejor = p; });
  S.capitan = mejor ? mejor.id : null;
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
function cambiarEsquema(e) {
  // El once arriesgado no es un esquema mas: es otro problema de optimizacion.
  // Maximiza la chance de hacer una fecha enorme en vez del promedio.
  if (e === '__riesgo' && D.arriesgado) {
    S.esquema = '__riesgo'; S.once = D.arriesgado.ids.slice();
    S_ONCE.banco = null; S_ONCE.cambiando = null;
    pintarOnce(); pintarPantallaOnce(); return;
  }
  const b = D.esquema.todos.find(x => x.e === e || x.esquema === e);
  if (!b) return;
  S.esquema = e; S.once = (b.ids || b.once.map(z => z.id)).slice();
  S_ONCE.banco = null; S_ONCE.cambiando = null;
  pintarOnce(); pintarPantallaOnce();
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
