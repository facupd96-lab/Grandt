/**
 * algorithmEngine.js
 * Gran DT Algorithm v2 Core Engine
 * Handles modular weights per position, 9 official Gran DT formations,
 * volatility, captain scoring, and formation optimization.
 */

const OFFICIAL_FORMATIONS = [
  { id: '1-4-4-2', name: '1-4-4-2', arq: 1, def: 4, vol: 4, del: 2 },
  { id: '1-4-3-3', name: '1-4-3-3', arq: 1, def: 4, vol: 3, del: 3 },
  { id: '1-3-4-3', name: '1-3-4-3', arq: 1, def: 3, vol: 4, del: 3 },
  { id: '1-4-5-1', name: '1-4-5-1', arq: 1, def: 4, vol: 5, del: 1 },
  { id: '1-3-5-2', name: '1-3-5-2', arq: 1, def: 3, vol: 5, del: 2 },
  { id: '1-5-3-2', name: '1-5-3-2', arq: 1, def: 5, vol: 3, del: 2 },
  { id: '1-3-3-4', name: '1-3-3-4', arq: 1, def: 3, vol: 3, del: 4 },
  { id: '1-4-2-4', name: '1-4-2-4', arq: 1, def: 4, vol: 2, del: 4 },
  { id: '1-5-2-3', name: '1-5-2-3', arq: 1, def: 5, vol: 2, del: 3 }
];

const DEFAULT_POSITION_WEIGHTS = {
  ARQ: {
    cleanSheet: 40,  // Valla invicta probabilidad
    avgRating: 30,   // Ficha Clarín promedio
    teamDefense: 20, // Solidez defensiva del equipo
    recentForm: 10   // Racha/Forma reciente
  },
  DEF: {
    cleanSheet: 30,  // Valla invicta probabilidad
    goals: 25,       // Capacidad de gol (histórica + PGT)
    xgShots: 20,     // xG real + Tiros reales (365Scores)
    avgRating: 15,   // Ficha Clarín promedio
    setPiece: 10     // Amenaza pelota parada (cabezazos/corners)
  },
  VOL: {
    avgRating: 35,   // Ficha Clarín (solidez para capitán)
    goals: 25,       // Goles promedio
    xgShots: 25,     // xG real + Tiros (365Scores)
    golOro: 10,      // Bonus gol de oro (minutos + partidos parejos)
    setPiece: 5      // Asistencias / centros / pelota parada
  },
  DEL: {
    goals: 35,       // Goles acumulados + gpm
    xgShots: 35,     // xG real + Tiros (365Scores)
    avgRating: 15,   // Ficha Clarín
    golOro: 10,      // Bonus gol de oro (80+ min)
    setPiece: 5      // Amenaza área
  }
};

/**
 * Calculate standard deviation for player ratings (volatility metric)
 */
function calculateVolatility(ratings) {
  if (!ratings || !Array.isArray(ratings) || ratings.length === 0) {
    return { stdDev: 0, volatilityScore: 0, label: 'ESTABLE' };
  }
  const valid = ratings.filter(r => typeof r === 'number' && r > 0);
  if (valid.length <= 1) {
    return { stdDev: 0, volatilityScore: 0, label: 'ESTABLE' };
  }

  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / valid.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0; // Coefficient of Variation

  let label = 'ESTABLE';
  if (cv > 0.45) label = 'EXPLOSIVO';
  else if (cv > 0.25) label = 'NORMAL';

  return {
    stdDev: Math.round(stdDev * 100) / 100,
    volatilityScore: Math.round(cv * 100) / 100,
    label
  };
}

/**
 * Calculate Captain Score for a player
 */
function calculateCaptainScore(player, metrics, audit) {
  const avg = metrics.avgRatingCur || 6.0;
  const pj = metrics.pjCur || 1;
  const min365 = player.minutes365 || (pj * 90);
  const minPerMatch = pj > 0 ? min365 / pj : 90;
  const prob90 = Math.min(1.0, minPerMatch / 90);

  // Captain Score prioritizes high rating floor + full minutes + team win prob
  const ratingBase = Math.min(100, (avg / 10) * 100);
  const minutesFactor = prob90;
  const winFactor = audit.winProb || 0.40;
  const xgFactor = Math.min(1.0, (player.xgPerMatch || 0) / 0.5);

  const captainScore = (ratingBase * 0.45) + (minutesFactor * 25) + (winFactor * 20) + (xgFactor * 10);
  return Math.round(captainScore * 10) / 10;
}

/**
 * Evaluate all 9 official Gran DT formations and return the optimal one
 */
function evaluateBestFormations(rankingsByPos, activeWeights, mode = 'solid') {
  const arqList = rankingsByPos.ARQ || [];
  const defList = rankingsByPos.DEF || [];
  const volList = rankingsByPos.VOL || [];
  const delList = rankingsByPos.DEL || [];

  const sortFn = mode === 'risky'
    ? (a, b) => (b.riskyScore || b.finalScore || 0) - (a.riskyScore || a.finalScore || 0)
    : (a, b) => (b.finalScore || 0) - (a.finalScore || 0);

  const sortedArq = [...arqList].sort(sortFn);
  const sortedDef = [...defList].sort(sortFn);
  const sortedVol = [...volList].sort(sortFn);
  const sortedDel = [...delList].sort(sortFn);

  function getCanon(t) {
    if (!t) return '';
    return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
  }

  const results = OFFICIAL_FORMATIONS.map(fmt => {
    const selectedArq = sortedArq.slice(0, fmt.arq);
    const selectedDef = sortedDef.slice(0, fmt.def);

    const defensiveRivals = new Set();
    [...selectedArq, ...selectedDef].forEach(p => {
      if (p.ctx && p.ctx.rival) {
        defensiveRivals.add(getCanon(p.ctx.rival));
      }
    });

    function selectHarmonicAttackers(pool, count) {
      const selected = [];
      const nonConflicting = pool.filter(p => !defensiveRivals.has(getCanon(p.team)));
      const conflicting = pool.filter(p => defensiveRivals.has(getCanon(p.team)));

      for (let p of nonConflicting) {
        if (selected.length < count) selected.push(p);
      }
      for (let p of conflicting) {
        if (selected.length < count) selected.push({ ...p, isConflictPick: true });
      }
      return selected;
    }

    const selectedVol = selectHarmonicAttackers(sortedVol, fmt.vol);
    const selectedDel = selectHarmonicAttackers(sortedDel, fmt.del);

    const allSelected = [...selectedArq, ...selectedDef, ...selectedVol, ...selectedDel];
    const hasRivalConflict = selectedVol.some(p => p.isConflictPick) || selectedDel.some(p => p.isConflictPick);

    const scoreProp = mode === 'risky' ? 'riskyScore' : 'finalScore';
    const totalScore = allSelected.reduce((sum, p) => sum + (p.isConflictPick ? ((p[scoreProp] || p.finalScore || 0) * 0.85) : (p[scoreProp] || p.finalScore || 0)), 0);
    const avgScore = allSelected.length > 0 ? totalScore / allSelected.length : 0;

    return {
      formation: fmt,
      totalScore: Math.round(totalScore * 10) / 10,
      avgScore: Math.round(avgScore * 10) / 10,
      hasRivalConflict,
      players: {
        arq: selectedArq,
        def: selectedDef,
        vol: selectedVol,
        del: selectedDel
      }
    };
  });

  results.sort((a, b) => b.totalScore - a.totalScore);
  return {
    optimal: results[0],
    allFormations: results
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OFFICIAL_FORMATIONS,
    DEFAULT_POSITION_WEIGHTS,
    calculateVolatility,
    calculateCaptainScore,
    evaluateBestFormations
  };
}
