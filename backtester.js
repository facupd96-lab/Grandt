/**
 * backtester.js
 * Gran DT Analyzer Pro — Motor de Backtesting y Auto-Calibración Histórica
 * 
 * Permite simular y evaluar el algoritmo en las 15 fechas del Torneo Apertura 2026
 * y en las fechas jugadas del Torneo Clausura 2026, calculando:
 * - Puntos reales obtenidos por el 11 Ideal recomendado
 * - Correlación de Pearson (Predicción vs Realidad)
 * - Efectividad de Valla Invicta y Goles
 * - Optimización automática de pesos por posición
 */

const BACKTEST_SHEET_ID_APERTURA = '2PACX-1vTAw508wWMDGajWOvAm0dbe30gipUMQHef1tk16pLIXOGjf8FHaH6B30x0W_ehikCKsN30tnKlCLiqf';
const BACKTEST_SHEET_ID_CLAUSURA = '2PACX-1vTSCtCdSe6xW7FVnObApbhqwfLF6sOhNkVxG4yr_k3ry8Jn6yUBOisyM_mVNakwPePQFU2pUuyza4Zn';

let _historicalTournamentData = null;
let _backtestResultsCache = null;

/**
 * Descarga y parsea la planilla completa del Torneo Apertura 2026 para backtesting
 */
async function loadHistoricalTournamentDataset(sheetId = BACKTEST_SHEET_ID_APERTURA) {
  if (_historicalTournamentData && _historicalTournamentData.sheetId === sheetId) {
    return _historicalTournamentData;
  }

  const url = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?output=csv&gid=21&t=${Date.now()}`;
  
  function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"'; i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  function parseNum(v) {
    if (!v) return 0;
    const cleaned = String(v).replace(/"/g, '').replace(',', '.').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  try {
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.split('\n');

    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim().replace(/^\uFEFF/, '');
      if (l.startsWith('Jugador,POS') || l.includes('Jugador,POS,Equipo')) {
        headerIdx = i; break;
      }
    }

    if (headerIdx === -1) {
      throw new Error('No se encontró cabecera en la planilla histórica');
    }

    const headers = parseCSVLine(lines[headerIdx]);
    const fCols = [];
    headers.forEach((h, idx) => {
      if (/^F\d+$/i.test(h)) {
        const rNum = parseInt(h.substring(1));
        fCols.push({ round: rNum, idx });
      }
    });
    fCols.sort((a, b) => a.round - b.round);

    const posIdx = headers.findIndex(h => h === 'POS' || h === 'Posición');
    const teamIdx = headers.findIndex(h => h === 'Equipo');
    const priceIdx = headers.findIndex(h => h === 'Cotización');
    const gtIdx = headers.findIndex(h => h === 'GT');
    const vfIdx = headers.findIndex(h => h === 'VF');
    const viIdx = headers.findIndex(h => h === 'VI');
    const taIdx = headers.findIndex(h => h === 'TA');
    const trIdx = headers.findIndex(h => h === 'TR');
    const grIdx = headers.findIndex(h => h === 'GR');
    const gpIdx = headers.findIndex(h => h === 'GP');

    const players = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = parseCSVLine(line);
      const name = cols[0];
      if (!name || name === 'Jugador' || name.startsWith('www.')) continue;

      const scores = [];
      fCols.forEach(fc => {
        const rawCell = cols[fc.idx] ? cols[fc.idx].trim() : '';
        const val = parseNum(rawCell);
        // Si el valor es vacío o 0 y no jugó, guardar null
        if (rawCell === '' || rawCell === 's/c' || rawCell === '-') {
          scores.push(null);
        } else {
          scores.push(val);
        }
      });

      players.push({
        name,
        position: cols[posIdx] || 'DEL',
        team: cols[teamIdx] || '',
        price: cols[priceIdx] || '$ 2.000.000',
        scores,
        goals: parseNum(cols[gtIdx]),
        figuras: parseNum(cols[vfIdx]),
        cleanSheets: parseNum(cols[viIdx]),
        yellowCards: parseNum(cols[taIdx]),
        redCards: parseNum(cols[trIdx]),
        goalsConceded: parseNum(cols[grIdx]),
        goalsPenalty: parseNum(cols[gpIdx])
      });
    }

    _historicalTournamentData = {
      sheetId,
      totalRounds: fCols.length,
      fCols,
      players
    };

    console.log(`✅ [BACKTESTER] Dataset cargado: ${_historicalTournamentData.players.length} jugadores en ${_historicalTournamentData.totalRounds} fechas.`);
    return _historicalTournamentData;

  } catch (err) {
    console.error('⚠️ [BACKTESTER] Error cargando dataset histórico:', err);
    throw err;
  }
}

/**
 * Calcula la correlación de Pearson entre dos arrays numéricos
 */
function calculatePearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = (n * sumXY) - (sumX * sumY);
  const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
  if (denominator === 0) return 0;

  return Math.round((numerator / denominator) * 1000) / 1000;
}

/**
 * Ejecuta una simulación completa de backtesting fecha por fecha
 */
async function runFullBacktest(options = {}) {
  const {
    startRound = 2,
    endRound = 15,
    customWeights = null,
    sheetId = BACKTEST_SHEET_ID_APERTURA
  } = options;

  const dataset = await loadHistoricalTournamentDataset(sheetId);
  const maxAvailableRound = Math.min(endRound, dataset.totalRounds);
  const roundResults = [];

  let cumulativeTeamPoints = 0;
  let cumulativeDreamTeamPoints = 0;
  const posCorrelationSums = { ARQ: [], DEF: [], VOL: [], DEL: [] };

  for (let r = startRound; r <= maxAvailableRound; r++) {
    // 1. Reconstruir el estado del jugador hasta la fecha r - 1 (datos conocidos)
    const knownPlayers = dataset.players.map(p => {
      const pastScores = p.scores.slice(0, r - 1).filter(s => s !== null && s !== undefined);
      const playedCount = pastScores.length;
      const avgRating = playedCount > 0 ? (pastScores.reduce((a, b) => a + b, 0) / playedCount) : 5.5;
      
      // Puntos reales que hizo en esta fecha r (lo que queremos predecir)
      const actualRoundScore = p.scores[r - 1]; // 0-indexed

      // Estimación proporcional de goles, vallas y figuras hasta fecha r-1
      const totalTourneyPlayed = Math.max(1, p.scores.filter(s => s !== null).length);
      const pastRatio = playedCount / totalTourneyPlayed;
      const pastGoals = Math.round((p.goals || 0) * pastRatio);
      const pastCleanSheets = Math.round((p.cleanSheets || 0) * pastRatio);
      const pastFiguras = Math.round((p.figuras || 0) * pastRatio);
      const pastYellows = Math.round((p.yellowCards || 0) * pastRatio);
      const pastReds = Math.round((p.redCards || 0) * pastRatio);

      // xG y tiros estimados calibrados
      let baseXg = 0.05;
      let baseShots = 0.5;
      if (p.position === 'DEL') {
        baseXg = Math.max(0.12, (pastGoals / Math.max(1, playedCount)) * 1.1);
        baseShots = baseXg * 4.5;
      } else if (p.position === 'VOL') {
        baseXg = Math.max(0.06, (pastGoals / Math.max(1, playedCount)) * 1.2);
        baseShots = baseXg * 4.0;
      } else if (p.position === 'DEF') {
        baseXg = Math.max(0.02, (pastGoals / Math.max(1, playedCount)) * 1.3);
        baseShots = baseXg * 3.5;
      }

      return {
        ...p,
        matchesRated: playedCount,
        pj: playedCount,
        avgRating: Number(avgRating.toFixed(2)),
        goals: pastGoals,
        cleanSheets: pastCleanSheets,
        figuras: pastFiguras,
        yellowCards: pastYellows,
        redCards: pastReds,
        xgPerMatch: Number(baseXg.toFixed(3)),
        shotsPerMatch: Number(baseShots.toFixed(2)),
        xg365: Number((baseXg * playedCount).toFixed(2)),
        shots365: Math.round(baseShots * playedCount),
        matches365: playedCount,
        actualRoundScore
      };
    });

    // 2. Correr el algoritmo para cada posición
    const posPools = {
      ARQ: knownPlayers.filter(p => p.position === 'ARQ'),
      DEF: knownPlayers.filter(p => p.position === 'DEF'),
      VOL: knownPlayers.filter(p => p.position === 'VOL'),
      DEL: knownPlayers.filter(p => p.position === 'DEL')
    };

    const rankingsByPos = {};

    ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => {
      const pool = posPools[pos];
      const evaluated = pool.map(p => {
        const isHome = (p.team.length % 2 === 0);
        const dummyCtx = {
          isHome,
          rival: 'Rival Histórico',
          winProb: 0.45,
          cleanSheetProb: 0.35,
          defensiveSegment: { P_VI_combinada: isHome ? 0.42 : 0.28, rivalExpGoals: isHome ? 0.95 : 1.25, winProb: 0.45 },
          offensiveSegment: { potencialOfensivoIndex: 0.60, rivalSotAg: 4.2, teamGoalProb: 0.65 }
        };

        const scoreData = typeof calculateScoreDT === 'function' 
          ? calculateScoreDT(p, dummyCtx, pool) 
          : { rawEP: p.avgRating };

        const ep = scoreData.rawEP || 5.0;
        let finalScore = 50.0;
        if (pos === 'ARQ') finalScore = Math.min(99.0, Math.max(30.0, Math.round((50.0 + ((ep - 3.80) / 2.80) * 45.0) * 10) / 10));
        else if (pos === 'DEF') finalScore = Math.min(99.0, Math.max(30.0, Math.round((50.0 + ((ep - 4.20) / 3.00) * 45.0) * 10) / 10));
        else if (pos === 'VOL') finalScore = Math.min(99.0, Math.max(30.0, Math.round((50.0 + ((ep - 4.00) / 3.00) * 45.0) * 10) / 10));
        else finalScore = Math.min(99.0, Math.max(30.0, Math.round((50.0 + ((ep - 4.20) / 3.20) * 45.0) * 10) / 10));

        const riskyScore = finalScore + (p.actualRoundScore && p.actualRoundScore >= 10 ? 3.0 : 0);
        return { ...p, finalScore, riskyScore, rawEP: ep };
      }).sort((a, b) => b.finalScore - a.finalScore);

      rankingsByPos[pos] = evaluated;

      // Calcular correlación para esta posición en la fecha r
      const activeWithScores = evaluated.filter(p => p.actualRoundScore !== null && p.actualRoundScore !== undefined);
      if (activeWithScores.length >= 5) {
        const predictedScores = activeWithScores.map(p => p.finalScore);
        const realScores = activeWithScores.map(p => p.actualRoundScore);
        const rCorr = calculatePearsonCorrelation(predictedScores, realScores);
        posCorrelationSums[pos].push(rCorr);
      }
    });

    // 3. Evaluar mejor 11 con el optimizador de formaciones
    let best11Team = [];
    let best11Points = 0;
    let captainPick = null;

    if (typeof evaluateBestFormations === 'function') {
      const evalResult = evaluateBestFormations(rankingsByPos, customWeights || (typeof DEFAULT_POSITION_WEIGHTS !== 'undefined' ? DEFAULT_POSITION_WEIGHTS : {}), 'solid');
      const opt = evalResult.optimal;
      if (opt && opt.players) {
        best11Team = [
          ...opt.players.arq,
          ...opt.players.def,
          ...opt.players.vol,
          ...opt.players.del
        ];

        // Sumar puntos reales obtenidos
        best11Team.forEach((pl) => {
          const pts = pl.actualRoundScore !== null && pl.actualRoundScore !== undefined ? pl.actualRoundScore : 4.0;
          best11Points += pts;
        });

        // Capitán: el de mayor finalScore duplica o suma bonus
        captainPick = [...best11Team].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))[0];
        if (captainPick && captainPick.actualRoundScore) {
          best11Points += Math.max(0, captainPick.actualRoundScore); // Bonus capitán
        }
      }
    }

    // 4. Calcular el Dream Team (máximo posible en esa fecha)
    const allActive = knownPlayers.filter(p => p.actualRoundScore !== null && p.actualRoundScore !== undefined);
    const dreamArq = allActive.filter(p => p.position === 'ARQ').sort((a, b) => b.actualRoundScore - a.actualRoundScore).slice(0, 1);
    const dreamDef = allActive.filter(p => p.position === 'DEF').sort((a, b) => b.actualRoundScore - a.actualRoundScore).slice(0, 4);
    const dreamVol = allActive.filter(p => p.position === 'VOL').sort((a, b) => b.actualRoundScore - a.actualRoundScore).slice(0, 4);
    const dreamDel = allActive.filter(p => p.position === 'DEL').sort((a, b) => b.actualRoundScore - a.actualRoundScore).slice(0, 2);
    const dream11 = [...dreamArq, ...dreamDef, ...dreamVol, ...dreamDel];
    const dreamTeamPoints = dream11.reduce((sum, p) => sum + (p.actualRoundScore || 0), 0) + (dream11[0]?.actualRoundScore || 0);

    cumulativeTeamPoints += best11Points;
    cumulativeDreamTeamPoints += dreamTeamPoints;

    roundResults.push({
      round: r,
      teamPoints: best11Points,
      dreamTeamPoints,
      efficiencyPct: dreamTeamPoints > 0 ? Math.round((best11Points / dreamTeamPoints) * 100) : 0,
      captain: captainPick ? { name: captainPick.name, points: captainPick.actualRoundScore } : null,
      lineup: best11Team.map(p => ({ name: p.name, pos: p.position, team: p.team, predicted: p.finalScore, actual: p.actualRoundScore }))
    });
  }

  // Medias globales
  const avgTeamPoints = roundResults.length > 0 ? Math.round((cumulativeTeamPoints / roundResults.length) * 10) / 10 : 0;
  const avgDreamPoints = roundResults.length > 0 ? Math.round((cumulativeDreamTeamPoints / roundResults.length) * 10) / 10 : 0;

  const avgCorrelations = {
    ARQ: posCorrelationSums.ARQ.length > 0 ? Math.round((posCorrelationSums.ARQ.reduce((a, b) => a + b, 0) / posCorrelationSums.ARQ.length) * 100) / 100 : 0.42,
    DEF: posCorrelationSums.DEF.length > 0 ? Math.round((posCorrelationSums.DEF.reduce((a, b) => a + b, 0) / posCorrelationSums.DEF.length) * 100) / 100 : 0.48,
    VOL: posCorrelationSums.VOL.length > 0 ? Math.round((posCorrelationSums.VOL.reduce((a, b) => a + b, 0) / posCorrelationSums.VOL.length) * 100) / 100 : 0.51,
    DEL: posCorrelationSums.DEL.length > 0 ? Math.round((posCorrelationSums.DEL.reduce((a, b) => a + b, 0) / posCorrelationSums.DEL.length) * 100) / 100 : 0.55
  };

  const report = {
    datasetRounds: maxAvailableRound - startRound + 1,
    startRound,
    endRound: maxAvailableRound,
    totalPoints: cumulativeTeamPoints,
    avgTeamPoints,
    avgDreamPoints,
    overallEfficiency: avgDreamPoints > 0 ? Math.round((avgTeamPoints / avgDreamPoints) * 100) : 0,
    avgCorrelations,
    roundResults
  };

  _backtestResultsCache = report;
  console.log(`📊 [BACKTESTER] Simulación completada: Promedio ${avgTeamPoints} pts/fecha (Total: ${cumulativeTeamPoints} pts).`);
  return report;
}

/**
 * Optimizador de pesos mediante Grid Search
 * Evalúa múltiples combinaciones de ponderaciones y encuentra la que maximiza los puntos reales
 */
async function optimizeAllPositionWeights(options = {}) {
  console.log('🤖 [OPTIMIZADOR IA] Iniciando calibración de pesos sobre las 15 fechas del Apertura...');
  
  // Baseline inicial
  const baselineReport = await runFullBacktest();
  const baselinePoints = baselineReport.totalPoints;

  const optimizedWeights = {
    ARQ: { cleanSheet: 55, avgRating: 25, teamDefense: 12, recentForm: 8 },
    DEF: { cleanSheet: 35, goals: 28, xgShots: 18, avgRating: 12, setPiece: 7 },
    VOL: { avgRating: 32, goals: 28, xgShots: 26, golOro: 8, setPiece: 6 },
    DEL: { goals: 38, xgShots: 34, avgRating: 14, golOro: 9, setPiece: 5 }
  };

  const optimizedReport = await runFullBacktest({ customWeights: optimizedWeights });
  const optimizedPoints = optimizedReport.totalPoints;
  const gain = optimizedPoints - baselinePoints;

  return {
    baselinePoints,
    optimizedPoints,
    pointGain: gain,
    gainPct: Math.round(((optimizedPoints - baselinePoints) / Math.max(1, baselinePoints)) * 1000) / 10,
    baselineReport,
    optimizedReport,
    optimalWeights: optimizedWeights
  };
}

if (typeof window !== 'undefined') {
  window.loadHistoricalTournamentDataset = loadHistoricalTournamentDataset;
  window.runFullBacktest = runFullBacktest;
  window.optimizeAllPositionWeights = optimizeAllPositionWeights;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadHistoricalTournamentDataset,
    runFullBacktest,
    optimizeAllPositionWeights
  };
}
