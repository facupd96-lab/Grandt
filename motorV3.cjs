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
  // PENALES PATEADOS, no solo convertidos (arreglado 28/08).
  // El xG de 365Scores le suma ~0.79 a CADA penal que el jugador patea, entre
  // el gol y el palo. Aca se descontaba solo por los CONVERTIDOS, asi que a los
  // que erraron uno les quedaba 0.79 de xG fantasma. En la fecha 7 eran 8
  // jugadores: a Barbona (Defensa y Justicia) su xG bajaba de 1.97 a 1.18 —un
  // 40% menos— y a Marcelo Torres de 0.79 a CERO, o sea que todo su xG era un
  // penal errado. Justo el caso del que patea uno de casualidad y no es el
  // pateador del equipo.
  // Planeta trae las dos columnas: gp = convertidos, pe = errados.
  const penesConv = num(p.goalsPenalty);
  const penesPateados = penesConv + num(p.penaltiesMissed);
  const xg = Math.max(0, num(p.xg365) - 0.79 * penesPateados);
  const tiros = num(p.shots365);
  const golJugada = Math.max(0, num(p.goals) - penesConv);
  // Por 90 MINUTOS, no por partido. Y con piso de 180' en el divisor: el que
  // entro 3 veces 12 minutos y clavo uno no proyecta 1 gol por partido.
  // Ese piso es el que shrinkea solo a los de poca muestra, sin umbrales.
  //
  // OJO (arreglado 27/08): si el jugador NO cruza con 365Scores, minutes365 es
  // 0 y el divisor cae al piso de 180', o sea 2 partidos. Pero sus GOLES salen
  // de Planeta, que puede tener 6 fechas. Resultado: goles de 6 partidos
  // divididos por 2 = el triple de tasa real. Asi Rick de Talleres, que ni
  // siquiera habia cruzado, terminaba con el 64% del ataque de su equipo y
  // primero en el ranking de delanteros con CERO tiros.
  // Si Planeta lo califico en N partidos, jugo por lo menos 20 minutos en cada
  // uno y en general bastante mas; 0.8 noventas por partido calificado es un
  // piso conservador para el divisor.
  const min365 = num(p.minutes365);
  const nov = Math.max(180 / 90, min365 / 90, 0.8 * pjPgt);
  const xg90 = xg / nov, tiros90 = tiros / nov, gol90 = golJugada / nov;
  // "CERO TIROS" NO ES LO MISMO QUE "NO SABEMOS" (03/09).
  // Esta bandera decide si se usa la tasa medida o el prior del puesto, y estaba
  // escrita como "tiene algun tiro o algun xG". Eso mete en la misma bolsa dos
  // cosas opuestas: al que no cruzo con 365Scores (no tenemos NADA) y al que
  // cruzo y pateo CERO veces en 483 minutos, que es una medicion durisima.
  // Sergio Ojeda caia en la segunda: 6 partidos con 0 tiros, pero como la
  // bandera decia "no hay dato", el motor le daba el prior de defensor mas su
  // unico gol y lo dejaba con el 22.9% del ataque de su equipo y segundo entre
  // los defensores. Un defensor que en 483 minutos no pateo una sola vez no se
  // lleva un cuarto del ataque de nadie.
  // La pregunta correcta es si TENEMOS datos, y eso son los minutos cruzados.
  // El comentario de arriba ya decia esto ("si el jugador NO cruza con
  // 365Scores, minutes365 es 0"); el codigo no lo implementaba.
  const hayXg = min365 > 0;
  // Continuo y monótono en tiros y xG. Sin umbrales, sin cubetas: 5 tiros da
  // más que 4 y menos que 8, siempre.
  //
  // PESOS: SE PROBO CAMBIARLOS Y NO SE PUDO DEMOSTRAR QUE CONVENGA (26/08).
  // Sobre el torneo anterior (9015 filas jugador-partido) se compararon mezclas
  // por validacion cruzada de 5 pliegues, midiendo verosimilitud fuera de
  // muestra sobre los goles del partido siguiente:
  //     solo tiros -0.417 | solo xG -0.426 | solo goles -0.443
  //     xG+goles+tiros -0.403  <-- las tres juntas ganan, que es lo que ya hay
  // Subirle el peso al gol convertido (0.15 -> 0.50) mejoraba la punta del
  // ranking en un corte de la muestra y la empeoraba en otro: el resultado se
  // daba vuelta segun si se exigian 6 partidos previos o 180 minutos previos.
  // Eso es ruido de seleccion, no señal. Se dejan los pesos como estaban hasta
  // tener otro torneo de datos. Queda anotado para no volver a probarlo a ciegas.
  const bruto = hayXg
    ? (0.62 * xg90) + (0.023 * tiros90) + (0.15 * gol90)
    : (0.55 * gol90) + PRIOR_SHARE[p.position] * 0.45;
  // Confianza MEDIDA, no inventada. Sobre el torneo anterior (6248 filas) se
  // regresaron los goles del partido siguiente contra esta misma tasa, cortando
  // por minutos ya jugados. La pendiente —cuanto de la tasa medida se cumple
  // de verdad— dio, con los datos YA LIMPIOS (27/08, despues de reparar las 46
  // filas con goles imposibles del historico):
  //      90-270'  b=0.30      900-1400'  b=0.60
  //     270-540'  b=0.32         1400+'   b=0.73
  //     540-900'  b=0.57
  // Dos lecturas: (1) ni con un torneo entero encima la tasa se cumple del todo,
  // por eso el techo 0.70; (2) el piso NO es cero — aun con 2 partidos se cumple
  // el 30%, por eso el piso 0.28 y no min/900 a secas, que daba 0.10 a los 90
  // minutos y borraba del mapa a cualquier refuerzo recien llegado.
  // LA CONFIANZA SE MIDE EN REMATES, NO EN MINUTOS (03/09).
  //
  // Sergio Ojeda tenia UN tiro en 573 minutos, de 0.9 de xG (un cabezazo solo
  // adentro del area, que metio). Eso son 0.14 de xG/90, un ritmo altisimo para
  // un defensor, y el modelo le creia el 64% porque la confianza salia de los
  // minutos. Le daba el 26.5% del ataque de su equipo — la mayor cuota de gol
  // de TODOS los defensores de la liga — construida sobre un solo remate.
  //
  // El error conceptual: el xG no es un conteo, es una suma de valores por
  // remate con muchisima varianza. Un tiro de 0.9 es un caso extremo. El tamaño
  // de muestra que corresponde no son los minutos: son los REMATES.
  //
  // Medido sobre 3959 cortes reales de los dos torneos (estimar con los primeros
  // partidos, medir los goles de los que vienen). "b" es cuanto del xG/90 medido
  // se cumple despues:
  //     tiros vistos    b        minutos jugados    b
  //       0-1        0.174          90-270       0.461
  //       2-3        0.452         271-540       0.653
  //       4-6        0.448         541-900       0.645
  //       7-11       0.564         901-1400      0.402
  //      12-19       0.609
  //       20+        0.566
  // Los remates ordenan, los minutos no ordenan nada (hasta baja al final).
  //
  // El caso Ojeda, aislado: 51 jugadores con 0 o 1 tiro visto y xG/90 mayor a
  // 0.10 mostraban 0.227 de xG/90 y despues hicieron 0.074 goles/90 — POR DEBAJO
  // del promedio de la liga (0.088). Con 7 tiros o mas y el mismo xG/90 alto:
  // mostraban 0.285 e hicieron 0.209, casi el triple. Un ritmo alto armado con
  // un solo remate vale menos que no saber nada.
  //
  // PERO EL CERO MEDIDO ES OTRA COSA. 274 casos con CERO tiros y 450 minutos o
  // mas despues hicieron 0.004 goles/90: practicamente ninguno. Ahi la muestra
  // SI es informativa, y son los minutos los que la miden. Si la confianza
  // saliera solo de los remates, el que no patea nunca volveria al prior del
  // puesto, o sea que le subiriamos la cuota por no patear.
  //
  // Por eso es asimetrica, y se elige afuera (en sharesDeEquipo) segun si el
  // jugador esta por ENCIMA o por DEBAJO del prior de su puesto:
  //   arriba del prior -> hay que probarlo con remates
  //   abajo del prior  -> alcanza con haber jugado para creerle
  // Medido, la asimetrica gana en las dos puntas: la mejor 5% del ranking hace
  // 0.307 goles/90 (contra 0.283 con minutos) y la peor 10% hace 0.014 (contra
  // 0.026 si la confianza fuera solo de remates).
  const confTiros = 0.65 * tiros / (tiros + 1.6);   // ajustado a la tabla de arriba
  const confMin   = clamp(min365 / 900, 0.28, 0.70);
  const conf = hayXg ? confMin : Math.min(0.55, pjPgt / 4);   // compatibilidad
  return { bruto: Math.max(0, bruto), conf, confTiros, confMin, hayXg, xg90, tiros90, gol90,
           tirosTorneo: tiros, xgTorneo: round2(xg) };
}

function sharesDeEquipo(jugadores, partidosEquipo, rotacion) {
  const info = jugadores.map(p => ({ p, a: amenazaIndividual(p),
                                     mp: perfilMinutos(p, partidosEquipo, rotacion) }));
  const sPrior = info.reduce((s, x) => s + PRIOR_SHARE[x.p.position], 0) || 1;

  // CONFIANZA ASIMETRICA (03/09). Ver la explicacion larga en amenazaIndividual.
  // Primero se mira, sin ninguna confianza de por medio, si el jugador pinta por
  // encima o por debajo del prior de su puesto. El que pinta ARRIBA tiene que
  // probarlo con remates; al que pinta ABAJO le alcanza con haber jugado.
  const sBrutoCrudo = info.reduce((s, x) => s + x.a.bruto, 0);
  info.forEach(x => {
    if (!x.a.hayXg) { x.conf = x.a.conf; return; }        // sin datos de 365: como antes
    const priorRel = PRIOR_SHARE[x.p.position] / sPrior;
    const crudoRel = sBrutoCrudo > 0 ? x.a.bruto / sBrutoCrudo : priorRel;
    x.conf = crudoRel > priorRel ? x.a.confTiros : x.a.confMin;
    x.a.confUsada = x.conf;
    x.a.porQueConf = crudoRel > priorRel
      ? `pinta arriba del promedio de su puesto: la confianza sale de sus ${x.a.tirosTorneo} remates`
      : `pinta abajo del promedio de su puesto: la confianza sale de sus minutos`;
  });

  const sBruto = info.reduce((s, x) => s + x.a.bruto * x.conf, 0);
  const out = {};
  info.forEach(x => {
    const prior = PRIOR_SHARE[x.p.position] / sPrior;
    const medido = sBruto > 0 ? (x.a.bruto * x.conf) / sBruto : prior;
    out[key(x.p)] = { share: x.conf * medido + (1 - x.conf) * prior,
                      amenaza: x.a, mp: x.mp };
  });
  // CONSERVACION DE GOLES (arreglado 26/08).
  // Antes las cuotas se normalizaban sobre el PLANTEL ENTERO: 26 tipos en
  // Gimnasia (M), de los cuales 15 no juegan nunca. Como despues hacemos
  // lamGol = cuota x goles esperados del equipo, la suma de los goles de los
  // que realmente pisan la cancha daba el 49% de los goles del equipo (mediana
  // de los 30 equipos; entre 36% y 59%): al titular se le descontaban goles que
  // se llevaban los del banco.
  // Ahora se normaliza contra la suma ponderada por MINUTOS ESPERADOS, de modo
  // que sum(cuota_i x minutosEsperados_i / 90) = 1. Es decir: los goles del
  // equipo se reparten entre los minutos que se van a jugar, que es lo unico
  // que tiene sentido. La cuota queda expresada por 90 minutos en cancha.
  const tot = Object.values(out).reduce((s, v) =>
    s + v.share * Math.max(0.02, v.mp.minEsperados / 90), 0) || 1;
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
// 6bis. ¿CUÁNTOS MINUTOS VA A JUGAR?
//   No alcanza con "juega o no juega". Un 9 al que le sacan a los 65' regala
//   25 minutos de chance de gol, y eso se puede medir: sobre 6 fechas cruzadas
//   con Planeta, los goles por cada 90 minutos EN CANCHA de un delantero son
//   planos —0.281 si jugó 20-59', 0.213 si jugó 60-79', 0.223 si jugó 80-90'—
//   o sea que la chance de gol es LINEAL en los minutos. Y los puntos de un
//   delantero por fecha suben 0.026 → 0.094 → 0.125 → 0.185 → 0.256 goles
//   según cuántos minutos venía jugando.
//
//   Estimador de minutos: promedio ponderado por recencia sobre las fechas del
//   torneo (contando 0 las que no jugó) más un shrink chico. Los parámetros
//   salen de una búsqueda de grilla sobre el torneo anterior, 10.703 filas
//   jugador-fecha, minimizando el error cuadrático medio contra los minutos
//   que realmente jugó después:
//       decaimiento 0.60, k 0.5, objetivo 20'  →  RMSE 28.5'
//   (promedio simple 31.0', último partido 33.7'). La grilla es plana cerca del
//   óptimo: 0.7/1/30' da 28.7'. 28 minutos de error es mucho, y es la verdad:
//   los minutos son difíciles de predecir. Por eso el resto del EP se pondera
//   por probabilidad, no se decide con un umbral.
// ─────────────────────────────────────────────────────────────────────────────
const MIN_DECAY = 0.60, MIN_K = 0.5, MIN_TGT = 20;

function minutosEstimados(p, partidosDelEquipo) {
  const log = Array.isArray(p.minutosLog) ? p.minutosLog : null;
  if (log && log.length) {
    let n = 0, d = 0;
    for (let i = 0; i < log.length; i++) {
      const w = Math.pow(MIN_DECAY, log.length - 1 - i);
      n += w * (num(log[i]) || 0); d += w;
    }
    return (n + MIN_K * MIN_TGT) / (d + MIN_K);
  }
  // Sin log fecha por fecha: se cae al total de minutos sobre partidos del equipo.
  const pjEq = Math.max(1, partidosDelEquipo || 5);
  return clamp(num(p.minutes365) / pjEq, 0, 90);
}

// P(juega los 20' que hacen falta para tener ficha). Logística ajustada sobre
// las mismas 10.703 filas. Reproduce la tabla observada: 30'→0.39 (medido 0.36
// y 0.51 en los tramos vecinos), 50'→0.67 (medido 0.72), 70'→0.87 (medido 0.87).
function probFicha(minEst) {
  return clamp(1 / (1 + Math.exp(-(-2.226 + 0.0589 * minEst))), 0.02, 0.97);
}

// Minutos que juega DADO que entra. Medido: el que viene promediando 10' juega
// 56' cuando entra; el que promedia 72' juega 83'. Recta ajustada a esos puntos.
function minutosSiJuega(minEst) {
  return clamp(51.7 + 0.432 * minEst, 25, 90);
}

// MINUTOS CUANDO EFECTIVAMENTE JUEGA, LEIDOS DE SU LOG (03/09).
// La recta de arriba estima los minutos "si entra" a partir del promedio que
// INCLUYE las fechas que se perdio, y por eso achataba a los titulares fijos:
// Franco Vazquez tiene log [0,0,90,90,90,0,90] —cuando juega, juega los 90 —
// y le daba 76. La pregunta que importa no es "cuanto juega en promedio" sino
// "si hoy es titular, cuanto aguanta", y eso esta en los partidos que jugo.
// Se usa la mediana de los partidos con minutos, con mas peso a los ultimos.
// Si jugo menos de dos partidos no hay de donde leerlo y se cae a la recta.
// SOLO LOS PARTIDOS EN LOS QUE ARRANCO (03/09).
// La pregunta que importa no es "cuanto juega en promedio" sino "si hoy es
// titular, cuanto aguanta". Mezclar los ratos de suplente arruina la cuenta:
// un titular fijo al que un domingo le dieron 15 minutos entrando queda con
// menos minutos de los que juega de verdad. Asi que los partidos de suplente
// NO entran. 365Scores dice quien arranco (status 1 = Starting) y eso viene en
// el log como `tit`; si todavia no esta —hay que correr SYNC_365 una vez para
// que aparezca— se usa el criterio viejo de 60 minutos, que le pega casi
// siempre. Si nunca fue titular, ahi si se mira lo que jugo entrando.
// PESO DE LA MEMORIA PARA ESTA CUENTA (03/09, medido).
// MIN_DECAY vale 0.60 y esta calibrado para OTRA pregunta: cuantos minutos
// promedia un jugador contando las fechas que se perdio. Para "cuanto aguanta
// cuando arranca" ese olvido es demasiado rapido: el ultimo partido pesa 1 y el
// anterior 0.6, asi que la mediana salta a lo que haya pasado el domingo. Con
// eso Miljevic, que arrancó 82, 73, 72 y 90, daba 90 — un solo partido mandaba.
// Medido sobre las 2993 veces que alguien arrancó en el torneo anterior,
// prediciendo el partido siguiente con lo que se sabia antes:
//     mediana 0.85 ... 4.50 minutos de error   <-- este
//     mediana 0.90 ... 4.50
//     mediana 0.80 ... 4.53
//     mediana 0.60 ... 4.69   (el que teniamos)
//     siempre 90 ..... 4.87
//     el ultimo ...... 5.14   (el peor de todos)
//
// SEGUNDA MEDICION (03/09, con el dato REAL de quien arranco).
// SYNC_365 ahora guarda el flag "tit" de 365Scores, asi que ya no hay que
// adivinar quien fue titular por haber jugado 60 minutos o mas. Con eso se
// rehizo la medicion sobre 5615 predicciones reales (6673 arranques de los dos
// torneos), prediciendo cada arranque con los anteriores del mismo jugador:
//
//   regla                                  error   1 previo  2 previos  3  4+
//   HIBRIDO (el de abajo) ................ 7.86     10.17     9.06    8.10  6.58
//   mediana pond. sin arranques <25' ..... 7.99     10.17     9.87    8.10  6.58
//   mediana pond. 0.85 ................... 8.02     10.17    10.07    8.10  6.58
//   media simple ......................... 8.31     10.17     9.20    8.40  7.33
//   mediana simple ....................... 8.36     10.17    11.58    8.10  6.77
//   siempre 90 ........................... 8.81     11.30    10.26    9.44  7.28
//   el ultimo arranque ................... 9.00     10.17    10.07    9.55  8.10
//
// Dos cosas que la primera medicion no podia ver:
//
// 1) CON DOS ARRANQUES LA MEDIANA PONDERADA ES UNA TRAMPA. Con dos valores y
//    decay 0.85 el ultimo se lleva el 54% del peso, o sea que la mediana ES el
//    ultimo partido — el criterio que mide PEOR de todos. Ahi conviene el
//    promedio de los dos (9.06 contra 10.07). De tres arranques en adelante la
//    mediana vuelve a ganar y por lejos (6.58 contra 7.33 con 4 o mas).
//
// 2) UN ARRANQUE CORTADO A LOS 16' NO ES EL PLAN DEL DT, ES UNA LESION O UNA
//    ROJA. Tomarlo como "esto es lo que juega" es leer mal el partido. Sacando
//    los arranques de menos de 25 minutos el error baja parejo.
//
// El decay en si casi no mueve la aguja (0.85, 0.90 y 0.95 dan lo mismo a dos
// decimales): lo que importaba era el caso de dos arranques y los cortados.
const DECAY_TITULAR = 0.85;
const ARRANQUE_CORTADO = 25;   // menos que esto: lesion o roja, no plan del DT

function minutosCuandoJuega(p, minEst) {
  const log = Array.isArray(p.minutosLog) ? p.minutosLog : null;
  if (!log || !log.length) return minutosSiJuega(minEst);
  const det = Array.isArray(p.logDetalle) ? p.logDetalle : null;
  const hayFlag = det && det.some(e => e && e.tit != null);
  const arranco = (i) => {
    const m = num(log[i]) || 0;
    if (m <= 0) return false;
    if (hayFlag && det[i] && det[i].tit != null) return !!det[i].tit;
    return m >= 60;   // sin el dato: el que juega 60 o mas casi seguro arranco
  };
  const comoTitular = [], jugados = [];
  for (let i = 0; i < log.length; i++) {
    const m = num(log[i]) || 0;
    if (m <= 0) continue;
    const w = Math.pow(DECAY_TITULAR, log.length - 1 - i);
    jugados.push({ m, w });
    if (arranco(i)) comoTitular.push({ m, w });
  }
  // QUE MUESTRA SE USA.
  // Si arrancó alguna vez, se miran SOLO sus arranques: los ratos de suplente
  // no contestan "cuanto juega cuando arranca". Antes, con un solo partido de
  // titular se caia a la mediana de TODOS sus partidos y mandaban las entradas
  // cortas: Lucas Alario arrancó una vez y jugó los 90, y el numero salia 20
  // porque tenia entradas de 15 y 22 minutos.
  // Si nunca arrancó, lo unico que hay son sus entradas desde el banco, y eso
  // SI contesta la pregunta para el: cuanto juega cuando entra.
  const esTitular = comoTitular.length >= 1;
  let usar = esTitular ? comoTitular : jugados;
  if (usar.length === 0) return minutosSiJuega(minEst);

  // ARRANQUES CORTADOS. Un titular que sale a los 16' se lesionó o lo echaron;
  // no es lo que el DT tenia pensado. Se sacan del calculo, salvo que sean
  // todos los que hay. A los suplentes no se les aplica: entrar 15 minutos es
  // exactamente su trabajo, no un accidente.
  if (esTitular) {
    const enteros = usar.filter(x => x.m >= ARRANQUE_CORTADO);
    if (enteros.length) usar = enteros;
  }

  if (usar.length === 1) return clamp(usar[0].m, 20, 90);
  // CON DOS, EL PROMEDIO. La mediana ponderada de dos valores es el ultimo, y
  // el ultimo es el peor predictor que hay (medido). Ver la tabla de arriba.
  if (usar.length === 2) return clamp(Math.round((usar[0].m + usar[1].m) / 2), 20, 90);
  // CON TRES O MAS, LA MEDIANA PONDERADA: aguanta un partido suelto raro sin
  // mover el numero, y le gana al promedio con margen.
  const orden = usar.slice().sort((a, b) => a.m - b.m);
  const total = orden.reduce((s, x) => s + x.w, 0);
  let acum = 0, mediana = orden[orden.length - 1].m;
  for (const x of orden) { acum += x.w; if (acum >= total / 2) { mediana = x.m; break; } }
  return clamp(mediana, 20, 90);
}

// EL PERFIL DE MINUTOS (03/09).
// Un solo numero no contesta la pregunta que uno se hace al poner un delantero:
// "este tipo termina los partidos o lo sacan a los 65?". Dos jugadores con
// mediana 75 pueden ser cosas distintas: uno que juega 90-90-45 y otro que
// juega 75-75-75. Asi que se guarda el reparto completo y los ultimos que jugo,
// y la app muestra los numeros de verdad en vez de un promedio.
//   completa  = 88 o mas (termino el partido)
//   largo     = 75 a 87  (lo sacan sobre el final)
//   medio     = 60 a 74  (lo sacan en el ultimo cuarto: pierde media hora de gol)
//   corto     = menos de 60
function perfilDeMinutos(p) {
  const mins = partidosDeTitular(p);
  const log = Array.isArray(p.minutosLog) ? p.minutosLog : [];
  const entrando = [];
  const det = Array.isArray(p.logDetalle) ? p.logDetalle : null;
  const hayFlag = det && det.some(e => e && e.tit != null);
  for (let i = 0; i < log.length; i++) {
    const m = num(log[i]) || 0; if (m <= 0) continue;
    const tit = (hayFlag && det[i] && det[i].tit != null) ? !!det[i].tit : m >= 60;
    if (!tit) entrando.push(m);
  }
  const cuenta = (lo, hi) => mins.filter(m => m >= lo && m <= hi).length;
  return {
    arranques: mins.length,
    completa: cuenta(88, 90), largo: cuenta(75, 87), medio: cuenta(60, 74), corto: cuenta(0, 59),
    // los ultimos tres que arranco, del mas viejo al mas nuevo
    ultimos: mins.slice(-3),
    todos: mins,
    entrando: entrando,
    // arranques que se cortaron muy temprano (lesion o roja). NO entran en el
    // numero de "si arranca, juega X" pero se muestran igual, para que no
    // parezca que el numero ignora un partido que esta a la vista.
    cortados: mins.filter(m => m < ARRANQUE_CORTADO),
    pctCompleta: mins.length ? +(cuenta(88, 90) / mins.length).toFixed(2) : null,
    fuente: hayFlag ? '365Scores dice quien arranco' : 'sin el dato de titular: se toma jugo 60 o mas'
  };
}

// Cuantas veces arranco y cuanto jugo esas veces: es lo que se muestra al lado
// del numero para que se pueda ver de donde sale.
function partidosDeTitular(p) {
  const log = Array.isArray(p.minutosLog) ? p.minutosLog : [];
  const det = Array.isArray(p.logDetalle) ? p.logDetalle : null;
  const hayFlag = det && det.some(e => e && e.tit != null);
  const out = [];
  for (let i = 0; i < log.length; i++) {
    const m = num(log[i]) || 0;
    if (m <= 0) continue;
    const tit = (hayFlag && det[i] && det[i].tit != null) ? !!det[i].tit : m >= 60;
    if (tit) out.push(m);
  }
  return out;
}

// La rotación por copas no elimina a nadie: reparte minutos. Achata al plantel
// hacia el medio —el titular baja, el suplente sube—. El 0.45 sigue siendo un
// supuesto sin calibrar; queda anotado.
function ajustarPorRotacion(minEst, rotacion) {
  const rot = clamp(num(rotacion), 0, 1);
  return clamp(minEst + rot * 0.45 * (45 - minEst), 0, 90);
}

// Devuelve todo junto para no recalcular.
function perfilMinutos(p, partidosDelEquipo, rotacion) {
  const crudo = minutosEstimados(p, partidosDelEquipo);
  const minEst = ajustarPorRotacion(crudo, rotacion);

  // FORMACION CONFIRMADA. Si 365Scores ya publico el once (una hora antes del
  // partido), no hay nada que estimar: se sabe si arranca o no. El estimador
  // tiene 28 minutos de error cuadratico medio; esto lo lleva a cero.
  //   confirmado === true  -> es titular. Empieza el partido. Lo unico que
  //                           puede pasar es que lo saquen, y para eso sirve su
  //                           historial de minutos: si viene jugando 90, juega
  //                           90; si lo sacan siempre a los 65, sale a los 65.
  //   confirmado === false -> su equipo confirmo y NO esta. Va al banco. Puede
  //                           entrar igual, y si entra 20 minutos cobra ficha
  //                           igual: por eso 0.30 y no 0. Medido sobre las 6
  //                           fechas: el que entra desde el banco juega 30
  //                           minutos en promedio.
  //   confirmado === null  -> todavia no publicaron nada. Se estima como siempre.
  if (p.confirmado === true) {
    const siJuega = clamp(Math.max(minutosCuandoJuega(p, minEst), 0.85 * Math.max(minEst, 60)), 55, 90);
    return { minEst: minEst, pFicha: 0.97, minSiJuega: siJuega,
             minEsperados: 0.97 * siJuega, fuente: 'once confirmado' };
  }
  if (p.confirmado === false) {
    return { minEst: minEst, pFicha: 0.30, minSiJuega: 30,
             minEsperados: 0.30 * 30, fuente: 'al banco (once confirmado)' };
  }

  const pFicha = probFicha(minEst);
  const siJuega = minutosCuandoJuega(p, minEst);
  return { minEst: minEst, pFicha: pFicha, minSiJuega: siJuega,
           minEsperados: pFicha * siJuega, fuente: 'estimado' };
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

  // MINUTOS. Todo lo que depende de estar en la cancha se escala por acá.
  const mp = shares[key(p)]?.mp || perfilMinutos(p, eq.partidosEquipo, ctx.rotacion);
  const fracMin = mp.minSiJuega / 90;   // dado que entra, que parte del partido juega

  // Gol: se usa λ (goles esperados), no P(gol). Los puntos son LINEALES en
  // goles: el que puede meter dos vale el doble. Con P(gol) se aplanan.
  // La cuota esta expresada por 90 minutos en cancha, asi que se multiplica por
  // la fraccion del partido que se espera que juegue. Medido: los goles por 90
  // minutos en cancha no dependen de cuanto juega (0.28 / 0.21 / 0.22 segun
  // haya jugado 20-59', 60-79' u 80-90'), o sea que la chance es lineal en los
  // minutos. Sacar al 9 a los 65' le borra 25/90 de su chance de gol.
  const lamGol = share * lam.lamFor * fracMin;
  // Quien patea los penales del equipo. Tambien va por PATEADOS, no por
  // convertidos: Barbona pateo uno y lo erro, y sigue siendo el que los patea.
  const penesPateadosJ = num(p.goalsPenalty) + num(p.penaltiesMissed);
  const esPen = penesPateadosJ > 0;
  const tasaPen = esPen ? Math.min(0.45, penesPateadosJ / pj) : 0;
  const valJugada = (RG.golPorPosicion[pos] || 0) + (ctx.esLocal ? 0 : RG.bonusGolVisitante);
  const valPenal = RG.golDePenal + (ctx.esLocal ? 0 : RG.bonusGolVisitante);
  const lamPen = Math.min(lamGol * 0.55, tasaPen * 0.78);
  const lamJug = Math.max(0, lamGol - lamPen);
  const EP_gol = lamJug * valJugada + lamPen * valPenal;

  // VALLA INVICTA. Vuelve a ser la chance de que el EQUIPO termine el partido
  // sin recibir (04/09).
  //
  // El 03/09 lo cambie por exp(-golesEnContra x minutos/90), siguiendo la regla
  // tal como me la explicaron: cobra la valla el que jugo 20 minutos o mas y no
  // recibio gol MIENTRAS ESTUVO EN LA CANCHA. La formula se sigue de ahi, pero
  // el resultado era un disparate y lo agarro facu antes que yo:
  //
  //   minutos que juega    valla que le dabamos    valla de su equipo
  //     menos de 41              76%                     36%
  //     41 a 60                  59%                     41%
  //     61 a 79                  43%                     35%
  //     88 a 90                  36%                     36%
  //
  // O sea que al que entra 20 minutos le daba MAS DEL DOBLE de valla que a su
  // propio equipo, y mas que a un titular que juega los 90. Premiaba jugar poco.
  // Movio 194 jugadores 8 puestos o mas, y ninguno de esos movimientos era real.
  //
  // La parte cierta de la regla —que al titular que sale a los 60 con el 0 a 0
  // no hay que castigarlo— sigue en pie y hay que implementarla bien, pero no
  // asi: hace falta medir cuantas vallas paga Gran DT de verdad a los que entran
  // desde el banco antes de tocar esto de nuevo. Queda anotado.
  const EP_vi = (RG.vallaInvicta[pos] || 0) * lam.pVI;

  const EP_gc = pos === 'ARQ' ? RG.golRecibidoARQ * lam.lamAgainst : 0;

  const pFig = figuras[key(p)] ?? 0.02;
  const EP_fig = RG.figura * pFig;

  // TARJETAS. Con shrinkage, porque 1 amarilla en 4 partidos NO es "25% de tasa".
  //
  // EL PSEUDO-CONTEO ERA 4 Y ESTABA MAL (03/09, medido).
  // Sobre 5525 cortes reales de los dos torneos (estimar la tasa con los
  // primeros partidos, medir las amarillas de los que vienen):
  //     k=0 (creerle todo) .......... 0.2512 de error
  //     k=4  (el que teniamos) ...... 0.2015
  //     k=8 ......................... 0.1940
  //     k=10 (este) ................. ~0.193
  //     k=12 ........................ 0.1918   <- el fondo de la curva
  //     k=20 ........................ 0.1907
  //     solo el prior, sin mirar al jugador .. 0.1934
  //
  // Lo importante de esa tabla no es cual gana: es que IGNORAR AL JUGADOR
  // (0.1934) le ganaba a lo que teniamos (0.2015). O sea que con k=4 el
  // historial de amarillas metia mas ruido que señal, y las tarjetas explican
  // el 17-21% de lo que separa a un jugador de otro en el ranking. Un quinto
  // del orden salia de ahi.
  //
  // Señal hay, pero mucha menos de la que suponiamos: con la tasa bien encogida,
  // el 20% mas tarjetero saca despues 0.210 amarillas por partido y el 20% menos
  // tarjetero 0.115, contra un promedio de 0.168. Es una diferencia real de
  // medio punto de Gran DT por partido entre los extremos, no de dos.
  //
  // Se toma 10, en la parte plana de la curva y del lado conservador: entre 8 y
  // 20 el error casi no se mueve, asi que no vale la pena afinar mas con 7
  // fechas de torneo encima.
  const K_TARJ = 10;
  const prTA = { ARQ: .10, DEF: .28, VOL: .26, DEL: .18 }[pos] ?? .22;
  const prTR = { ARQ: .008, DEF: .020, VOL: .014, DEL: .010 }[pos] ?? .014;
  const tasaTA = (num(p.yellowCards) + prTA * K_TARJ) / (pj + K_TARJ);
  const tasaTR = (num(p.redCards) + prTR * K_TARJ) / (pj + K_TARJ);
  // NO se escala por minutos, a proposito: la tasa ya sale de SUS partidos, y
  // si el tipo suele salir a los 65 eso ya esta adentro de su propio historial.
  // Multiplicarla otra vez por los minutos seria contar dos veces lo mismo.
  const EP_tarj = RG.amarilla * tasaTA + RG.roja * tasaTR;

  // EP SI ENTRA. La valla NO se escala por minutos (ver arriba por que se probo
  // y se volvio atras). La ficha tampoco: medido, un delantero que entra 30' saca 5.35 de
  // ficha-mas-incidencias y uno que juega 85' saca 6.86 — la diferencia esta en
  // el gol, no en la nota. Lo que SI escala por minutos es el gol (directo, via
  // lamGol) y la figura (indirecto: sale de lamGol). Las tarjetas NO — el
  // comentario decia que si y era falso (03/09): ver la razon donde se calculan.
  const EPsiJuega = f.ficha + EP_gol + EP_vi + EP_gc + EP_fig + EP_tarj;

  // EP DE LA FECHA. Pondera por la chance de llegar a los 20' que exige la
  // ficha — NO por los minutos completos. Backtest de las fechas 2 a 6 armando
  // el once ideal con cada criterio, con banco que reemplaza al que no juega:
  //   sin mirar nada de esto ............................. 69.2 pts/fecha
  //   x probabilidad binaria de jugar (puntajes Planeta) .. 74.6
  //   x probabilidad de tener ficha (modelo de minutos) ... 77.0  <-- esta
  //   x minutos esperados sobre 90 (todo el EP escalado) .. 74.0
  // Escalar TODO el EP por minutos castiga de mas: medido, un delantero que
  // entra 30' saca 5.35 puntos y uno que juega 85' saca 6.86 — la diferencia
  // esta casi entera en el gol, no en la nota ni en la valla. Por eso los
  // minutos multiplican solo el gol, la figura y las tarjetas.
  const EP = mp.pFicha * EPsiJuega;
  const pj_ = mp.pFicha;
  const EPreal = EP;

  return {
    id: key(p), nombre: p.name, pos, equipo: p.team, rival: ctx.rival,
    condicion: ctx.esLocal ? 'Local' : 'Visitante',
    EP: round2(EP),
    EPsiJuega: round2(EPsiJuega),
    minEsperados: Math.round(mp.minEsperados),
    minSiJuega: Math.round(mp.minSiJuega),
    minEstimados: Math.round(mp.minEst),
    fuenteMinutos: mp.fuente || 'estimado',
    minutosLog: Array.isArray(p.minutosLog) ? p.minutosLog.slice() : null,
    // los minutos de los partidos en los que ARRANCO, que es lo que se muestra
    minutosDeTitular: partidosDeTitular(p),
    perfilMin: perfilDeMinutos(p),
    pJuega: round2(pj_),
    rotacion: round2(num(ctx.rotacion)),
    rotacionRival: round2(num(ctx.rotacionRival)),
    notaRotacion: ctx.notaRotacion || '',
    motivoRotacion: ctx.motivoRotacion || null,
    motivoRotacionRival: ctx.motivoRotacionRival || null,
    EPreal: round2(EPreal),
    // Piso: lo que hace si no pasa nada (ficha + valla − tarjetas).
    // Techo: lo que hace si mete gol (y arrastra la figura).
    piso: round2(f.ficha + EP_vi + EP_gc + EP_tarj),   // si entra y no pasa nada
    techo: round2(f.ficha + EP_vi + EP_gc + EP_tarj + valJugada + RG.figura * 0.5),
    conCinta: round2(EP + mp.pFicha * f.ficha),   // el capitán duplica SOLO la ficha
    ficha: round2(f.ficha), fichaCruda: f.cruda === null ? null : round2(f.cruda), fichaOk: f.ok,
    pVI: lam.pVI, lamGol: round3(lamGol), pFigura: round3(pFig),
    lamPen: round3(lamPen),
    transferido: p.transferido || null,
    penalesPateados: penesPateadosJ, penalesConvertidos: num(p.goalsPenalty),
    penalesErrados: num(p.penaltiesMissed),
    tasaTA: round3(tasaTA), share: round3(share),
    tirosTorneo: amen.tirosTorneo ?? 0, xgTorneo: amen.xgTorneo ?? 0,
    // Los mismos ritmos por 90 que usa el modelo, para que la tabla muestre
    // EXACTAMENTE el numero con el que se calcula y no otro parecido.
    tiros90: round2(amen.tiros90 ?? 0), xg90: round3(amen.xg90 ?? 0),
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
    const partidosEquipo = Math.max(1, ...js.map(x => num(x.matches365) || num(x.matchesRated) || 1));
    const shares = sharesDeEquipo(js, partidosEquipo, ctx.rotacion);
    const figuras = figurasDeEquipo(js, lam, shares);
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
    scoreARQ, scoreDEF, scoreOfensivo, mejorEsquema, correrMotor, ESQUEMAS, probFicha, perfilMinutos, minutosEstimados, minutosCuandoJuega, partidosDeTitular, perfilDeMinutos,
    suerteDefensiva };
}
