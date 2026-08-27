/* ============================================================================
 * motorV3.js — Motor de Puntaje Esperado (EP) para Gran DT · v3.1
 * ----------------------------------------------------------------------------
 * PRINCIPIO: todo se mide en PUNTOS GRAN DT. Ningún término entra si no sale
 * del reglamento o de un dato medido. Cero generalizaciones por categoría:
 * cada jugador tiene su propio número, continuo, sin cubetas ni umbrales.
 *
 * v3.1 — reglamento confirmado por el usuario + calibración empírica sobre
 * 776 jugadores del torneo pasado y 60 partidos del actual.
 * ==========================================================================*/

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGLAMENTO (confirmado por el usuario, 19/08/2026)
// ─────────────────────────────────────────────────────────────────────────────
const RG = {
  golPorPosicion:    { ARQ: 12, DEF: 9, VOL: 6, DEL: 4 },
  bonusGolVisitante:  2,
  golDePenal:         3,   // fijo, reemplaza al valor por posición (5 de visitante)
  vallaInvicta:      { ARQ: 3, DEF: 2, VOL: 0, DEL: 0 },
  golRecibidoARQ:    -1,   // solo el arquero resta por gol concedido
  figura:             4,
  amarilla:          -2,
  roja:              -4,
  // El capitán duplica SOLO la calificación Clarín (ficha), no el puntaje total.
  capitanDuplica:    'ficha',
  minutosParaCalificar: 20,
  // No confirmados por el usuario — solo se usan para reconstruir la nota
  // histórica, donde son marginales. Poner en 0 si no existen.
  bonusGolDeOro:      5,
  penalAtajado:       4,
  penalErrado:       -4,
  golEnContra:       -2
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. CALIBRACIÓN EMPÍRICA — medida, no supuesta
//    Fuentes: 776 jugadores del torneo pasado (Planeta Gran DT) y los 60
//    partidos jugados del Clausura 2026. Recalculable con recalibrar().
// ─────────────────────────────────────────────────────────────────────────────
let CAL = {
  // Partidos (Clausura 2026, fechas 1-4)
  golesLocal: 1.133, golesVisitante: 0.917, golesPartido: 2.050,
  viLocal: 0.433, viVisitante: 0.283, viGlobal: 0.358,

  // Figura: P(figura) = base + porGol · (goles esperados del jugador)
  // Regresión ponderada por partidos sobre el torneo pasado.
  // El volante que mete gol es figura el 44% de las veces: MUCHO más que el
  // delantero (24%). Por eso el gol de volante vale más de lo que dice la tabla.
  figura: {
    ARQ: { base: 0.070, porGol: 0.00 },
    DEF: { base: 0.0104, porGol: 0.211 },
    VOL: { base: 0.0181, porGol: 0.442 },
    DEL: { base: 0.0108, porGol: 0.237 }
  },

  // Tasa de gol por posición (goles por partido-jugador, torneo pasado)
  golPorPartido: { ARQ: 0.000, DEF: 0.0392, VOL: 0.0629, DEL: 0.1696 },

  // Puntaje promedio por posición y dispersión (torneo pasado, >=8 PJ).
  // El volante es la posición de menor mediana y mayor techo: todo o nada.
  puntaje: {
    ARQ: { media: 6.03, sd: 0.81, techo: 7.56 },
    DEF: { media: 5.99, sd: 0.99, techo: 9.00 },
    VOL: { media: 5.56, sd: 1.20, techo: 10.69 },
    DEL: { media: 5.92, sd: 1.21, techo: 10.17 }
  },

  notaMedia: 5.60,   // media de la nota Clarín reconstruida (se recalcula sola)
  partidos: 60
};

/** Valor EFECTIVO de un gol: el del reglamento + lo que arrastra de figura. */
function valorEfectivoGol(pos, esVisitante) {
  const base = (RG.golPorPosicion[pos] || 0) + (esVisitante ? RG.bonusGolVisitante : 0);
  return base + CAL.figura[pos].porGol * RG.figura;
}

function recalibrarPartidos(fixture) {
  const j = (fixture || []).filter(m => m &&
    (m.state === 'post' || m.status === 'STATUS_FULL_TIME') &&
    typeof m.homeScore === 'number' && typeof m.awayScore === 'number');
  if (j.length < 20) return CAL;
  let gh = 0, ga = 0, csH = 0, csA = 0;
  j.forEach(m => { gh += m.homeScore; ga += m.awayScore;
    if (m.awayScore === 0) csH++; if (m.homeScore === 0) csA++; });
  const n = j.length;
  Object.assign(CAL, {
    golesLocal: gh / n, golesVisitante: ga / n, golesPartido: (gh + ga) / n,
    viLocal: csH / n, viVisitante: csA / n, viGlobal: (csH + csA) / (2 * n), partidos: n
  });
  return CAL;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FICHA CLARÍN LIMPIA — reconstruida exacta, no adivinada
//      ficha = (AcT − bonos_conocidos) / CT
//    El PrT de la planilla es el promedio de PUNTOS (nota + bonos), no la nota.
// ─────────────────────────────────────────────────────────────────────────────
function bonosAcumulados(p) {
  const pos = p.position;
  const GT = num(p.goals ?? p.GT), GP = num(p.goalsPenalty ?? p.GP);
  const GV = num(p.goalsAway ?? p.GV), GO = num(p.goalsGolden ?? p.GO);
  const golesJugada = Math.max(0, GT - GP);
  let b = 0;
  b += golesJugada * (RG.golPorPosicion[pos] || 0);
  b += GP * RG.golDePenal;
  b += GV * RG.bonusGolVisitante;
  b += GO * RG.bonusGolDeOro;
  b += num(p.figuras ?? p.VF) * RG.figura;
  b += num(p.cleanSheets ?? p.VI) * (RG.vallaInvicta[pos] || 0);
  b += num(p.penaltiesSaved ?? p.PA) * RG.penalAtajado;
  b += num(p.goalsConceded ?? p.goalsReceived ?? p.GR) * RG.golRecibidoARQ;
  b += num(p.ownGoals ?? p.GE) * RG.golEnContra;
  b += num(p.yellowCards ?? p.TA) * RG.amarilla;
  b += num(p.redCards ?? p.TR) * RG.roja;
  b += num(p.penaltiesMissed ?? p.PE) * RG.penalErrado;
  return b;
}

function fichaLimpia(p) {
  const CT = num(p.matchesRated ?? p.CT);
  const AcT = num(p.totalPoints ?? p.AcT);
  if (CT < 1 || !AcT) return { ficha: CAL.notaMedia, cruda: null, ct: CT, ok: false };
  const cruda = (AcT - bonosAcumulados(p)) / CT;
  const K = 3; // prior de 3 partidos: con 1-2 fechas la ficha individual es ruido
  const shrunk = (cruda * CT + CAL.notaMedia * K) / (CT + K);
  return { ficha: clamp(shrunk, 1, 10), cruda, ct: CT, ok: cruda >= 1 && cruda <= 10 };
}

/** Si más del 8% queda fuera de 1-10, alguna constante del reglamento está mal. */
function validarFichas(players) {
  const notas = [], malos = [];
  (players || []).forEach(p => {
    const f = fichaLimpia(p);
    if (f.cruda === null) return;
    notas.push(f.cruda);
    if (!f.ok) {
      // Por que falla: casi siempre porque los bonos que trae la planilla no
      // corresponden a los partidos en los que el jugador SI fue calificado.
      // Un suplente que entra a los 80' no recibe ficha (hace falta jugar 20
      // minutos) pero igual se lleva la valla invicta o la amarilla. La formula
      // resta esos bonos y divide por los partidos calificados, que son menos.
      const razones = [];
      if (num(p.cleanSheets) > num(p.matchesRated)) razones.push(`${num(p.cleanSheets)} vallas invictas con solo ${num(p.matchesRated)} partido(s) calificado(s)`);
      if (num(p.redCards) > 0) razones.push(`${num(p.redCards)} roja(s)`);
      if (num(p.goalsGolden) > 0) razones.push(`${num(p.goalsGolden)} gol(es) de oro`);
      if (num(p.yellowCards) > num(p.matchesRated)) razones.push(`${num(p.yellowCards)} amarillas con ${num(p.matchesRated)} partido(s) calificado(s)`);
      malos.push({ nombre: p.name, pos: p.position, equipo: p.team, ct: f.ct, cruda: round2(f.cruda),
                   pts: num(p.totalPoints), vi: num(p.cleanSheets), ta: num(p.yellowCards),
                   tr: num(p.redCards), goles: num(p.goals),
                   razon: razones.length ? razones.join(' + ') : 'los bonos de la planilla no cierran con los puntos totales' });
    }
  });
  const dentro = notas.filter(x => x >= 1 && x <= 10);
  if (dentro.length > 50) CAL.notaMedia = round2(prom(dentro));
  return {
    total: notas.length, fuera: malos.length,
    pctFuera: notas.length ? round2(100 * malos.length / notas.length) : 0,
    media: notas.length ? round2(prom(notas)) : 0,
    ejemplos: malos.slice(0, 15),
    veredicto: (notas.length && 100 * malos.length / notas.length <= 8) ? 'OK' : 'REVISAR CONSTANTES'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GOLES ESPERADOS DEL PARTIDO (λ) — mercado + xG + goles reales
// ─────────────────────────────────────────────────────────────────────────────
function devig(odds) {
  const inv = odds.map(o => (o && o > 1) ? 1 / o : 0);
  const s = inv.reduce((a, b) => a + b, 0);
  return s > 0 ? inv.map(x => x / s) : odds.map(() => 1 / odds.length);
}
function poisson(k, lam) {
  let lp = -lam + k * Math.log(Math.max(1e-9, lam));
  for (let i = 2; i <= k; i++) lp -= Math.log(i);
  return Math.exp(lp);
}
function probsDesdeLambdas(lh, la, line) {
  const MAX = 9, ph = [], pa = [];
  for (let k = 0; k <= MAX; k++) { ph.push(poisson(k, lh)); pa.push(poisson(k, la)); }
  let H = 0, D = 0, A = 0, over = 0;
  for (let i = 0; i <= MAX; i++) for (let j = 0; j <= MAX; j++) {
    const p = ph[i] * pa[j];
    if (i > j) H += p; else if (i === j) D += p; else A += p;
    if (line != null && i + j > line) over += p;
  }
  return { H, D, A, over };
}
/** Resuelve λL y λV para que el Poisson reproduzca el mercado SIN margen. */
function lambdasDesdeMercado(odds) {
  if (!odds || !odds.homeWin || !odds.awayWin || !odds.draw) return null;
  const [pH, pD, pA] = devig([odds.homeWin, odds.draw, odds.awayWin]);
  const line = odds.overUnderLine ?? 2.5;
  let pOver = null;
  if (odds.overOdds && odds.underOdds) pOver = devig([odds.overOdds, odds.underOdds])[0];
  // El empate es justo donde el Poisson independiente falla: subestima los
  // empates ~3 puntos porque asume que los goles de los dos equipos son
  // independientes, y en la cancha no lo son (0-0 y 1-1 pasan de mas).
  // Como lo que queremos extraer del mercado son GOLES, no el resultado,
  // ajustamos contra ganar/perder y el Over/Under, y le damos poco peso al
  // empate en vez de dejar que arrastre las dos lambdas.
  const err = (lh, la) => {
    const q = probsDesdeLambdas(lh, la, pOver != null ? line : null);
    let e = (q.H - pH) ** 2 + (q.A - pA) ** 2 + 0.15 * (q.D - pD) ** 2;
    if (pOver != null) e += 1.5 * (q.over - pOver) ** 2;
    return e;
  };
  let best = { lh: 1.15, la: 0.95, e: Infinity };
  for (let lh = 0.20; lh <= 3.40; lh += 0.05)
    for (let la = 0.15; la <= 3.00; la += 0.05) {
      const e = err(lh, la); if (e < best.e) best = { lh, la, e };
    }
  for (let lh = best.lh - .05; lh <= best.lh + .05; lh += .01)
    for (let la = best.la - .05; la <= best.la + .05; la += .01) {
      const e = err(lh, la); if (e < best.e) best = { lh, la, e };
    }
  return { lamHome: best.lh, lamAway: best.la, pHome: pH, pDraw: pD, pAway: pA,
           residuo: round3(Math.sqrt(best.e)) };
}

function lambdasPartido(ctx) {
  const mkt = ctx.odds ? lambdasDesdeMercado(ctx.odds) : null;
  const esL = ctx.esLocal;
  const baseF = esL ? CAL.golesLocal : CAL.golesVisitante;
  const baseC = esL ? CAL.golesVisitante : CAL.golesLocal;
  const K = 4;

  // xG del equipo
  let xgF = null, xgC = null;
  if (ctx.miXg && ctx.rivalXg) {
    const f = esL ? (CAL.golesLocal / (CAL.golesPartido / 2)) : (CAL.golesVisitante / (CAL.golesPartido / 2));
    xgF = 0.5 * (num(ctx.miXg.xgPerMatch) + num(ctx.rivalXg.xgConcededPerMatch)) * f;
    xgC = 0.5 * (num(ctx.rivalXg.xgPerMatch) + num(ctx.miXg.xgConcededPerMatch)) / Math.max(0.6, f);
  }
  // goles reales por condición, con shrinkage
  const miS = esL ? ctx.misStandings?.home : ctx.misStandings?.away;
  const rvS = esL ? ctx.rivalStandings?.away : ctx.rivalStandings?.home;
  const sh = (s, k, base) => { const pj = num(s?.pj); const v = pj > 0 ? num(s?.[k]) / pj : base;
                               return (v * pj + base * K) / (pj + K); };
  const golF = 0.5 * (sh(miS, 'gf', baseF) + sh(rvS, 'gc', baseF));
  const golC = 0.5 * (sh(miS, 'gc', baseC) + sh(rvS, 'gf', baseC));

  // ── Rotación por copa ──────────────────────────────────────────────────
  // Un equipo que juega Libertadores el miércoles y viaja a Brasil pone
  // suplentes el domingo: ataca menos y le hacen más. Y el rival, que enfrenta
  // a los suplentes, ataca más y recibe menos.
  // OJO: estas magnitudes son un SUPUESTO, no una medición. Están acá, en un
  // solo lugar, para poder calibrarlas cuando haya fechas suficientes.
  const ROT_ATAQUE = 0.10;   // cuánto baja el ataque del equipo rotado
  const ROT_DEFENSA = 0.10;  // cuánto sube lo que le hacen al equipo rotado
  const rotYo = clamp(num(ctx.rotacion), 0, 1);
  const rotEl = clamp(num(ctx.rotacionRival), 0, 1);
  const factorAtaque  = (1 - ROT_ATAQUE * rotYo) * (1 + ROT_DEFENSA * rotEl);
  const factorRecibir = (1 + ROT_DEFENSA * rotYo) * (1 - ROT_ATAQUE * rotEl);

  // ── De donde salen las lambdas ─────────────────────────────────────────
  // El precio de la casa YA incorpora xG, forma, lesiones, alineaciones y la
  // plata que entro. Promediarlo con el xG de temporada es contar dos veces la
  // misma informacion, y ademas rompe la coherencia de la app: las lambdas
  // mezcladas implicaban un 1X2 que contradecia las cuotas mostradas al lado
  // (en Atletico Tucuman vs Instituto llegaba a invertir el favorito).
  // Entonces: si hay mercado, manda el mercado. xG y goles reales quedan con
  // peso 0 pero se siguen calculando y mostrando como segunda opinion, y pasan
  // a mandar solo cuando NO hay cuotas para ese partido.
  const comps = [];
  if (mkt) comps.push({ w: 1.00, f: esL ? mkt.lamHome : mkt.lamAway, c: esL ? mkt.lamAway : mkt.lamHome, src: 'mercado' });
  if (xgF != null) comps.push({ w: mkt ? 0 : 0.65, f: xgF, c: xgC, src: 'xG' });
  comps.push({ w: mkt ? 0 : 0.35, f: golF, c: golC, src: 'goles reales' });
  const W = comps.reduce((a, b) => a + b.w, 0);
  const lamFor = (comps.reduce((a, b) => a + b.w * b.f, 0) / W) * factorAtaque;
  const lamAgainst = (comps.reduce((a, b) => a + b.w * b.c, 0) / W) * factorRecibir;

  let pWin, pDraw;
  if (mkt) { pWin = esL ? mkt.pHome : mkt.pAway; pDraw = mkt.pDraw; }
  else { const q = probsDesdeLambdas(esL ? lamFor : lamAgainst, esL ? lamAgainst : lamFor, null);
         pWin = esL ? q.H : q.A; pDraw = q.D; }

  return {
    lamFor: round3(lamFor), lamAgainst: round3(lamAgainst),
    pVI: round3(Math.exp(-Math.max(0.05, lamAgainst))),
    pWin: round3(pWin), pDraw: round3(pDraw),
    fuentes: comps.map(c => ({ fuente: c.src, peso: c.w, aFavor: round3(c.f), enContra: round3(c.c) })),
    rotacion: round2(rotYo), rotacionRival: round2(rotEl),
    ajusteRotacion: round3(factorAtaque),
    tieneMercado: !!mkt, residuoMercado: mkt ? mkt.residuo : null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. REPARTO INDIVIDUAL DEL ATAQUE
//    λ_jugador = cuota del jugador × goles esperados del equipo.
//    Las cuotas suman 1 dentro del equipo → la suma de los 11 da exactamente
//    los goles esperados del equipo. Eso es lo que hace que dos defensores del
//    mismo equipo compartan la valla invicta y difieran solo en el techo de gol.
// ─────────────────────────────────────────────────────────────────────────────
const PRIOR_SHARE = { ARQ: 0.002, DEF: 0.030, VOL: 0.075, DEL: 0.150 };

function amenazaIndividual(p) {
  const pj365 = Math.max(1, num(p.matches365) || num(p.matchesRated) || 1);
  const pjPgt = Math.max(1, num(p.matchesRated) || 1);
  const pens = num(p.goalsPenalty);
  const xg = Math.max(0, num(p.xg365) - 0.79 * pens);
  const tiros = num(p.shots365);
  const golJugada = Math.max(0, num(p.goals) - pens);
  const xg90 = xg / pj365, tiros90 = tiros / pj365, gol90 = golJugada / pjPgt;
  const hayXg = xg > 0 || tiros > 0;
  // Continuo y monótono en tiros y xG. Sin umbrales, sin cubetas: 5 tiros da
  // más que 4 y menos que 8, siempre.
  const bruto = hayXg
    ? (0.62 * xg90) + (0.023 * tiros90) + (0.15 * gol90)
    : (0.55 * gol90) + PRIOR_SHARE[p.position] * 0.45;
  const conf = hayXg ? Math.min(1, pj365 / 3) : Math.min(0.55, pjPgt / 4);
  return { bruto: Math.max(0, bruto), conf, hayXg, xg90, tiros90, gol90,
           tirosTorneo: tiros, xgTorneo: round2(xg) };
}

function sharesDeEquipo(jugadores) {
  const info = jugadores.map(p => ({ p, a: amenazaIndividual(p) }));
  const sPrior = info.reduce((s, x) => s + PRIOR_SHARE[x.p.position], 0) || 1;
  const sBruto = info.reduce((s, x) => s + x.a.bruto * x.a.conf, 0);
  const out = {};
  info.forEach(x => {
    const prior = PRIOR_SHARE[x.p.position] / sPrior;
    const medido = sBruto > 0 ? (x.a.bruto * x.a.conf) / sBruto : prior;
    out[key(x.p)] = { share: x.a.conf * medido + (1 - x.a.conf) * prior, amenaza: x.a };
  });
  const tot = Object.values(out).reduce((s, v) => s + v.share, 0) || 1;
  Object.values(out).forEach(v => { v.share /= tot; });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. FIGURA — fórmula empírica + restricción dura de 1 figura por partido
// ─────────────────────────────────────────────────────────────────────────────
function figurasDeEquipo(jugadores, lam, shares) {
  const qEquipo = clamp(lam.pWin + 0.5 * lam.pDraw, 0.05, 0.95);
  const crudo = {};
  jugadores.forEach(p => {
    const c = CAL.figura[p.position] || CAL.figura.VOL;
    const lamGol = (shares[key(p)]?.share || 0) * lam.lamFor;
    crudo[key(p)] = Math.max(0.001, c.base + c.porGol * lamGol);
  });
  // Reescalar para que la suma del equipo sea exactamente q (1 figura por partido)
  const s = Object.values(crudo).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  Object.entries(crudo).forEach(([k, v]) => { out[k] = clamp(v * qEquipo / s, 0.001, 0.50); });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6bis. ¿VA A JUGAR? — el filtro que faltaba
//   Recomendar al mejor defensor de un equipo no sirve si va al banco. Se estima
//   con los minutos reales de 365Scores: qué fracción de los minutos posibles
//   jugó, y en cuántos partidos pasó de 60 minutos.
// ─────────────────────────────────────────────────────────────────────────────
function probJuega(p, partidosDelEquipo, rotacion) {
  const pjEq = Math.max(1, partidosDelEquipo || 5);
  const min = num(p.minutes365);
  const pj = num(p.matches365);
  let base;
  if (!pj && !min) { base = 0.45; }
  else {
    const shareMin = Math.min(1, min / (pjEq * 90));
    const titular = p.titularidad != null ? num(p.titularidad) : (pj ? Math.min(1, min / (pj * 75)) : 0);
    const bruto = 0.65 * shareMin + 0.35 * titular;
    const k = 1.2;
    base = (bruto * pjEq + 0.45 * k) / (pjEq + k);
  }
  // La rotación no elimina jugadores: reparte minutos. Achata a todo el plantel
  // hacia el medio — el titular baja, el suplente sube.
  // Además, en Gran DT si tu titular no juega entra tu suplente del banco, así
  // que el costo real de la rotación es menor de lo que parece. Por eso 0.45 y
  // no 1.0. Es un supuesto, pendiente de calibrar con fechas reales.
  const rot = clamp(num(rotacion), 0, 1);
  const ajustada = base + rot * 0.45 * (0.5 - base);
  return clamp(ajustada, 0.03, 0.97);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. PUNTAJE ESPERADO POR JUGADOR
// ─────────────────────────────────────────────────────────────────────────────
function evaluar(p, ctx, eq) {
  const pos = p.position, pj = Math.max(1, num(p.matchesRated) || 1);
  const { lam, shares, figuras } = eq;
  const f = fichaLimpia(p);
  const share = shares[key(p)]?.share ?? PRIOR_SHARE[pos];
  const amen = shares[key(p)]?.amenaza || {};

  // Gol: se usa λ (goles esperados), no P(gol). Los puntos son LINEALES en
  // goles: el que puede meter dos vale el doble. Con P(gol) se aplanan.
  const lamGol = share * lam.lamFor;
  const esPen = num(p.goalsPenalty) > 0;
  const tasaPen = esPen ? Math.min(0.45, num(p.goalsPenalty) / pj) : 0;
  const valJugada = (RG.golPorPosicion[pos] || 0) + (ctx.esLocal ? 0 : RG.bonusGolVisitante);
  const valPenal = RG.golDePenal + (ctx.esLocal ? 0 : RG.bonusGolVisitante);
  const lamPen = Math.min(lamGol * 0.55, tasaPen * 0.78);
  const lamJug = Math.max(0, lamGol - lamPen);
  const EP_gol = lamJug * valJugada + lamPen * valPenal;

  const EP_vi = (RG.vallaInvicta[pos] || 0) * lam.pVI;
  const EP_gc = pos === 'ARQ' ? RG.golRecibidoARQ * lam.lamAgainst : 0;

  const pFig = figuras[key(p)] ?? 0.02;
  const EP_fig = RG.figura * pFig;

  // Tarjetas con shrinkage: 1 amarilla en 4 partidos NO es "25% de tasa".
  const prTA = { ARQ: .10, DEF: .28, VOL: .26, DEL: .18 }[pos] ?? .22;
  const prTR = { ARQ: .008, DEF: .020, VOL: .014, DEL: .010 }[pos] ?? .014;
  const tasaTA = (num(p.yellowCards) + prTA * 4) / (pj + 4);
  const tasaTR = (num(p.redCards) + prTR * 4) / (pj + 4);
  const EP_tarj = RG.amarilla * tasaTA + RG.roja * tasaTR;

  const EP = f.ficha + EP_gol + EP_vi + EP_gc + EP_fig + EP_tarj;
  // La chance de jugar es INFORMACION, no una penalizacion: en Gran DT si tu
  // titular no juega entra tu suplente del banco. Se muestra, no descuenta.
  const pj_ = probJuega(p, eq.partidosEquipo, ctx.rotacion);
  const EPreal = EP;

  return {
    id: key(p), nombre: p.name, pos, equipo: p.team, rival: ctx.rival,
    condicion: ctx.esLocal ? 'Local' : 'Visitante',
    EP: round2(EP),
    pJuega: round2(pj_),
    rotacion: round2(num(ctx.rotacion)),
    rotacionRival: round2(num(ctx.rotacionRival)),
    notaRotacion: ctx.notaRotacion || '',
    EPreal: round2(EPreal),
    // Piso: lo que hace si no pasa nada (ficha + valla − tarjetas).
    // Techo: lo que hace si mete gol (y arrastra la figura).
    piso: round2(f.ficha + EP_vi + EP_gc + EP_tarj),
    techo: round2(f.ficha + EP_vi + EP_gc + EP_tarj + valJugada + RG.figura * 0.5),
    conCinta: round2(EP + f.ficha),   // el capitán duplica SOLO la ficha
    ficha: round2(f.ficha), fichaCruda: f.cruda === null ? null : round2(f.cruda), fichaOk: f.ok,
    pVI: lam.pVI, lamGol: round3(lamGol), pFigura: round3(pFig),
    tasaTA: round3(tasaTA), share: round3(share),
    tirosTorneo: amen.tirosTorneo ?? 0, xgTorneo: amen.xgTorneo ?? 0,
    tieneDato365: !!amen.hayXg,
    lam,
    desglose: [
      ['Ficha Clarín limpia',  round2(f.ficha), `${f.ct} PJ · cruda ${f.cruda === null ? 's/d' : round2(f.cruda)}`],
      ['Valla invicta',        round2(EP_vi),   `${(lam.pVI * 100).toFixed(1)}% × ${RG.vallaInvicta[pos] || 0} pts`],
      ['Goles recibidos',      round2(EP_gc),   pos === 'ARQ' ? `${lam.lamAgainst} esperados × -1` : '—'],
      ['Gol propio',           round2(EP_gol),  `${round3(lamGol)} goles esperados (${(share * 100).toFixed(1)}% del ataque) × ${valJugada}`],
      ['Figura',               round2(EP_fig),  `${(pFig * 100).toFixed(1)}% × 4`],
      ['Tarjetas',             round2(EP_tarj), `${(tasaTA * 100).toFixed(0)}% amarilla`]
    ].filter(r => r[1] !== 0 || r[0].startsWith('Ficha'))
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SCORE 0-100 POR POSICIÓN — cada puesto se puntúa como se juega
// ─────────────────────────────────────────────────────────────────────────────
function pctRank(valores) {                 // percentil continuo, sin empates
  const idx = valores.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(valores.length);
  idx.forEach((x, r) => { out[x[1]] = valores.length > 1 ? r / (valores.length - 1) : 0.5; });
  return out;
}

/**
 * ARQUEROS — solo valla invicta. Un gol recibido convierte un 8 en un 4.
 * La figura NO entra al ranking: medido sobre el torneo pasado, la correlación
 * entre tasa de figura y tasa de valla invicta del arquero es -0.003, o sea
 * son independientes. Ignorarla no cuesta nada y perseguirla no ayuda.
 * (Sigue sumando dentro del EP, porque son puntos reales: ~0.3 por fecha.)
 */
function scoreARQ(lista) {
  const pv = pctRank(lista.map(x => x.pVI));
  const pe = pctRank(lista.map(x => x.EPreal));
  lista.forEach((x, i) => {
    x.pctVI = round3(pv[i]);
    // Antes el score era 94% percentil de valla + 6% de ficha "para desempatar",
    // y ese 6% daba vuelta el orden: Morales (49% de valla) le pasaba a Galindez
    // (56%) solo por tener mejor ficha. Un desempate que invierte el criterio
    // principal no es un desempate. Ahora el orden sale de los puntos esperados,
    // igual que en los otros tres puestos, y como para un arquero la valla
    // invicta ES casi todo el EP, el ranking queda mandado por la valla sin
    // ninguna ponderacion inventada. El percentil de valla queda como columna.
    x.score = round1(20 + 79 * pe[i]);
  });
  return lista.sort((a, b) => b.EPreal - a.EPreal);
}

/**
 * DEFENSORES — piso de equipo + techo individual.
 * El piso depende SOLO del partido, así que TODOS los defensores de un equipo
 * con valla casi asegurada arrancan alto. La capa individual reparte el
 * espacio que queda hasta 100 según amenaza de gol, ficha y figura, y las
 * tarjetas descuentan aparte. Todo continuo: 8 tiros siempre valen más que 5.
 */
function scoreDEF(lista) {
  const porEquipo = {};
  lista.forEach(x => { porEquipo[x.equipo] = x.pVI; });
  const equipos = Object.keys(porEquipo);
  const pvEq = pctRank(equipos.map(e => porEquipo[e]));
  const pisoEq = {};
  equipos.forEach((e, i) => { pisoEq[e] = 30 + 40 * pvEq[i]; });   // 30 (peor) a 70 (mejor)

  const pAmen = pctRank(lista.map(x => x.lamGol));
  const pFich = pctRank(lista.map(x => x.ficha));
  const pFig  = pctRank(lista.map(x => x.pFigura));
  const pTarj = pctRank(lista.map(x => x.tasaTA));

  // Dos carriles, como se juega de verdad:
  //  - piso del equipo (30 a 70): idéntico para todos los defensores del equipo.
  //    Garantiza que si la valla está casi asegurada, NINGUNO queda mal puntuado.
  //  - aporte individual (hasta 45): habilita el carril de riesgo. Un defensor
  //    con amenaza de gol máxima en un equipo con valla improbable llega a ~75:
  //    recomendable, porque un gol vale 9 u 11, o sea casi 5 vallas invictas.
  const pEP = pctRank(lista.map(x => x.EPreal));
  lista.forEach((x, i) => {
    const piso = pisoEq[x.equipo];
    const indiv = 0.65 * pAmen[i] + 0.25 * pFich[i] + 0.10 * pFig[i];
    x.pisoEquipo = round1(piso);          // informativo: idéntico para todo el equipo
    x.aporteIndividual = round1(45 * indiv);
    x.castigoTarjetas = round1(6 * pTarj[i]);
    x.pctVIequipo = round3(pvEq[equipos.indexOf(x.equipo)]);
    x.pctAmenaza = round3(pAmen[i]);
    // Etiqueta de lectura rápida
    const solido = pvEq[equipos.indexOf(x.equipo)] >= 0.70;
    const goleador = pAmen[i] >= 0.80;
    x.perfil = solido && goleador ? 'SÓLIDO + GOLEADOR'
             : solido ? 'SÓLIDO'
             : goleador ? 'RIESGO GOLEADOR'
             : 'COMÚN';
    // El score sale del percentil de puntos esperados reales: nunca satura y no
    // hay empates arriba. El piso del equipo queda como columna aparte para ver
    // de un vistazo si lo sostiene la valla invicta o el gol.
    x.score = round1(20 + 79 * pEP[i]);
  });
  return lista.sort((a, b) => b.EPreal - a.EPreal);
}

/** VOL y DEL — percentil de EP + ancla absoluta en puntos (mitad y mitad). */
function scoreOfensivo(lista) {
  const pe = pctRank(lista.map(x => x.EPreal));
  lista.forEach((x, i) => { x.score = round1(20 + 79 * pe[i]); });
  return lista.sort((a, b) => b.EPreal - a.EPreal);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8bis. TRAMPA DE VALLA INVICTA — el equipo que recibe menos goles de los que
//       merece. Sale de comparar goles concedidos reales contra xG concedido.
//       Un equipo con 3 goles en contra y 8.7 de xGC no está defendiendo bien:
//       está teniendo suerte, y la suerte no se repite. El que mira solo la
//       tabla de goles recibidos cae en la trampa todas las fechas.
// ─────────────────────────────────────────────────────────────────────────────
function suerteDefensiva(xgTeam) {
  if (!xgTeam || !xgTeam.games) return null;
  const gcReal = num(xgTeam.goalsConceded) / xgTeam.games;
  const xgc = num(xgTeam.xgConcededPerMatch) || (num(xgTeam.xgConceded) / xgTeam.games);
  const delta = xgc - gcReal;   // >0 = recibió menos de lo esperable (suerte)
  return {
    gcReal: round2(gcReal), xgcPorPartido: round2(xgc), delta: round2(delta),
    etiqueta: delta > 0.55 ? 'TRAMPA (viene con suerte, va a regresar)'
            : delta < -0.45 ? 'OPORTUNIDAD (defiende mejor de lo que dice la tabla)'
            : 'coherente'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. ESQUEMA ÓPTIMO Y CAPITÁN
//    Diferencia entre el mejor y el peor esquema del torneo pasado: ~2.8 pts
//    sobre 104. El esquema importa poco; sale solo de elegir los 11 mejores.
// ─────────────────────────────────────────────────────────────────────────────
const ESQUEMAS = [
  [1,4,4,2],[1,4,3,3],[1,3,4,3],[1,4,5,1],[1,3,5,2],
  [1,5,3,2],[1,3,3,4],[1,4,2,4],[1,5,2,3],[1,5,4,1]
];

function mejorEsquema(rankings) {
  const res = ESQUEMAS.map(f => {
    const arq = rankings.ARQ.slice(0, f[0]);
    const def = rankings.DEF.slice(0, f[1]);
    // No poner delanteros/volantes contra tu propio arquero o defensa
    const rivalesDefensivos = new Set([...arq, ...def].map(x => x.rival));
    const sinChoque = l => [...l.filter(x => !rivalesDefensivos.has(x.equipo)),
                            ...l.filter(x => rivalesDefensivos.has(x.equipo)).map(x => ({ ...x, choque: true }))];
    const vol = sinChoque(rankings.VOL).slice(0, f[2]);
    const del = sinChoque(rankings.DEL).slice(0, f[3]);
    const once = [...arq, ...def, ...vol, ...del];
    const total = once.reduce((s, x) => s + (x.choque ? x.EP * 0.92 : x.EP), 0);
    // El capitán duplica SOLO la ficha → se elige al de mayor ficha esperada,
    // no al de mayor EP. Es un error clásico elegirlo por puntaje total.
    const cap = [...once].sort((a, b) => b.ficha - a.ficha)[0];
    return { esquema: f.join('-'), total: round2(total + (cap ? cap.ficha : 0)),
             sinCapitan: round2(total), capitan: cap, once };
  }).sort((a, b) => b.total - a.total);
  return { optimo: res[0], todos: res };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. ORQUESTADOR
// ─────────────────────────────────────────────────────────────────────────────
function correrMotor(players, getCtx, fixture) {
  recalibrarPartidos(fixture);
  const validacion = validarFichas(players);

  const porEquipo = {};
  players.forEach(p => { (porEquipo[p.team] = porEquipo[p.team] || []).push(p); });

  const eqs = {};
  Object.entries(porEquipo).forEach(([equipo, js]) => {
    const ctx = getCtx(equipo);
    if (!ctx) return;
    const lam = lambdasPartido(ctx);
    const shares = sharesDeEquipo(js);
    const figuras = figurasDeEquipo(js, lam, shares);
    const partidosEquipo = Math.max(1, ...js.map(x => num(x.matches365) || num(x.matchesRated) || 1));
    eqs[equipo] = { ctx, lam, shares, figuras, partidosEquipo };
  });

  const R = { ARQ: [], DEF: [], VOL: [], DEL: [] };
  players.forEach(p => {
    const eq = eqs[p.team]; if (!eq || !R[p.position]) return;
    R[p.position].push(evaluar(p, eq.ctx, eq));
  });

  scoreARQ(R.ARQ); scoreDEF(R.DEF); scoreOfensivo(R.VOL); scoreOfensivo(R.DEL);
  return { rankings: R, esquema: mejorEsquema(R), calibracion: CAL, validacion };
}

// utils
function key(p) { return p.id || p.name; }
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function prom(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RG, CAL, valorEfectivoGol, recalibrarPartidos, fichaLimpia,
    bonosAcumulados, validarFichas, devig, lambdasDesdeMercado, lambdasPartido,
    amenazaIndividual, sharesDeEquipo, figurasDeEquipo, evaluar,
    scoreARQ, scoreDEF, scoreOfensivo, mejorEsquema, correrMotor, ESQUEMAS, probJuega,
    suerteDefensiva };
}
