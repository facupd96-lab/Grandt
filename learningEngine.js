/**
 * learningEngine.js
 * Gran DT Analyzer Pro — Sistema de Aprendizaje Continuo y Auto-Calibración en Vivo
 * 
 * Permite que el algoritmo aprenda de sus propios aciertos y errores fecha a fecha:
 * 1. Toma snapshots automáticos de las predicciones antes de cada fecha.
 * 2. Cruza las predicciones con los puntajes oficiales reales cuando termina la fecha.
 * 3. Mide el error (MAE), la tasa de acierto en Vallas Invictas y Goles, y la efectividad del Capitán.
 * 4. Aplica micro-ajustes inteligentes (nudges) a las ponderaciones de cada posición.
 * 5. Mantiene un historial longitudinal de rendimiento durante todo el torneo.
 */

const LEARNING_SNAPSHOTS_KEY = 'gdt_learning_snapshots_v1';
const LEARNING_HISTORY_KEY = 'gdt_learning_history_v1';
const LEARNING_SETTINGS_KEY = 'gdt_learning_settings_v1';

/**
 * Obtiene la configuración de aprendizaje continuo
 */
function getLearningSettings() {
  try {
    const raw = localStorage.getItem(LEARNING_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    autoLearningEnabled: true,
    nudgeRate: 0.05, // 5% de ajuste máximo por fecha
    learningMode: 'balanced' // 'conservative', 'balanced', 'aggressive'
  };
}

/**
 * Guarda la configuración de aprendizaje continuo
 */
function saveLearningSettings(settings) {
  try {
    localStorage.setItem(LEARNING_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {}
}

/**
 * Guarda un snapshot completo de las predicciones de una fecha
 */
function saveRoundPredictionSnapshot(roundNumber, rankingsByPos, optimalEvaluation, captain) {
  if (!roundNumber || !rankingsByPos) return null;

  try {
    const raw = localStorage.getItem(LEARNING_SNAPSHOTS_KEY);
    const snapshots = raw ? JSON.parse(raw) : {};

    const simplifiedRankings = {};
    ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => {
      const pool = rankingsByPos[pos] || [];
      simplifiedRankings[pos] = pool.slice(0, 25).map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        position: p.position,
        finalScore: p.finalScore || 50,
        rawEP: p.rawEP || 5.0,
        pVi: p._defAudit?.P_VI_combinada || p._arqAudit?.P_VI_combinada || p.ctx?.cleanSheetProb || 0.30,
        pGol: p._defAudit?.P_gol_individual || p._volAudit?.P_gol_individual || p._delAudit?.P_gol_individual || 0.10,
        cleanNotaClarin: p._defAudit?.cleanNotaClarin || p._arqAudit?.cleanNotaClarin || p._volAudit?.cleanNotaClarin || p._delAudit?.cleanNotaClarin || 5.5
      }));
    });

    const starters = [];
    if (optimalEvaluation && optimalEvaluation.optimal && optimalEvaluation.optimal.players) {
      const { arq = [], def = [], vol = [], del = [] } = optimalEvaluation.optimal.players;
      [...arq, ...def, ...vol, ...del].forEach(p => {
        starters.push({
          id: p.id,
          name: p.name,
          pos: p.position,
          team: p.team,
          finalScore: p.finalScore
        });
      });
    }

    const snapshot = {
      roundNumber,
      timestamp: new Date().toISOString(),
      formation: optimalEvaluation?.optimal?.formation?.name || '1-4-4-2',
      captain: captain ? { name: captain.name, team: captain.team, pos: captain.position, score: captain.finalScore } : null,
      starters,
      rankings: simplifiedRankings
    };

    snapshots[roundNumber] = snapshot;
    localStorage.setItem(LEARNING_SNAPSHOTS_KEY, JSON.stringify(snapshots));
    console.log(`📸 [LEARNING ENGINE] Snapshot de predicciones guardado para Fecha ${roundNumber}.`);
    return snapshot;
  } catch (err) {
    console.warn('⚠️ [LEARNING ENGINE] Error guardando snapshot:', err);
    return null;
  }
}

/**
 * Evalúa el desempeño real de las predicciones de una fecha recién terminada
 */
function evaluateRoundPerformance(roundNumber, playersData) {
  if (!roundNumber || !playersData || !Array.isArray(playersData)) return null;

  try {
    const raw = localStorage.getItem(LEARNING_SNAPSHOTS_KEY);
    if (!raw) return null;
    const snapshots = JSON.parse(raw);
    const snapshot = snapshots[roundNumber];
    if (!snapshot) return null;

    // Mapa de puntajes reales de la fecha
    const playersMap = {};
    playersData.forEach(p => {
      // El puntaje de la fecha roundNumber se busca en scores[roundNumber - 1] o ratings[roundNumber - 1]
      let realScore = null;
      if (p.scores && p.scores.length >= roundNumber) {
        realScore = p.scores[roundNumber - 1];
      } else if (p.ratings && p.ratings.length >= roundNumber) {
        realScore = p.ratings[roundNumber - 1];
      }
      playersMap[p.name] = { ...p, actualScore: realScore };
    });

    // 1. Evaluación del 11 Ideal recomendado
    let startersTotalPoints = 0;
    let startersEvaluatedCount = 0;
    const startersEvaluation = (snapshot.starters || []).map(st => {
      const real = playersMap[st.name];
      const actualScore = (real && real.actualScore !== null && real.actualScore !== undefined) ? real.actualScore : 0;
      if (real && real.actualScore !== null) startersEvaluatedCount++;
      startersTotalPoints += actualScore;
      return {
        ...st,
        actualScore,
        diff: Number((actualScore - (st.finalScore / 10)).toFixed(2))
      };
    });

    // Capitán
    let captainBonus = 0;
    if (snapshot.captain) {
      const capReal = playersMap[snapshot.captain.name];
      if (capReal && capReal.actualScore !== null && capReal.actualScore > 0) {
        captainBonus = capReal.actualScore; // Suma doble
        startersTotalPoints += captainBonus;
      }
    }

    // 2. Cálculo de Error por Posición (MAE y Sesgo)
    const positionErrors = { ARQ: [], DEF: [], VOL: [], DEL: [] };
    const positionHits = { ARQ: { csHit: 0, total: 0 }, DEF: { csHit: 0, goalHit: 0, total: 0 }, VOL: { goalHit: 0, total: 0 }, DEL: { goalHit: 0, total: 0 } };

    ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => {
      const pool = (snapshot.rankings && snapshot.rankings[pos]) || [];
      pool.forEach(pred => {
        const real = playersMap[pred.name];
        if (real && real.actualScore !== null && real.actualScore !== undefined) {
          const actual = real.actualScore;
          // Normalizar predicción a escala de puntos esperados (3 a 12)
          const expectedPts = (pred.rawEP || (pred.finalScore / 10));
          const absErr = Math.abs(actual - expectedPts);
          positionErrors[pos].push({ name: pred.name, predicted: expectedPts, actual, absErr });

          // Verificaciones tácticas
          if (pos === 'ARQ' || pos === 'DEF') {
            if (pred.pVi >= 0.40) {
              positionHits[pos].total++;
              if (actual >= 8) positionHits[pos].csHit++; // Mantuvo valla invicta
            }
          }
          if (pos === 'DEF' || pos === 'VOL' || pos === 'DEL') {
            if (pred.pGol >= 0.15) {
              positionHits[pos].total++;
              if (actual >= 10) positionHits[pos].goalHit++; // Hizo gol
            }
          }
        }
      });
    });

    const posMae = {};
    ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => {
      const errs = positionErrors[pos];
      posMae[pos] = errs.length > 0 ? Number((errs.reduce((a, b) => a + b.absErr, 0) / errs.length).toFixed(2)) : 0;
    });

    const evaluationReport = {
      roundNumber,
      timestamp: new Date().toISOString(),
      formation: snapshot.formation,
      startersTotalPoints,
      captainBonus,
      startersEvaluation,
      posMae,
      positionHits,
      overallMae: Number(((posMae.ARQ + posMae.DEF + posMae.VOL + posMae.DEL) / 4).toFixed(2))
    };

    // Guardar en historial longitudinal
    saveEvaluationToHistory(evaluationReport);
    console.log(`📈 [LEARNING ENGINE] Evaluación de Fecha ${roundNumber} completada: 11 Ideal sumó ${startersTotalPoints} pts (MAE: ${evaluationReport.overallMae}).`);
    return evaluationReport;

  } catch (err) {
    console.error('⚠️ [LEARNING ENGINE] Error evaluando fecha:', err);
    return null;
  }
}

/**
 * Guarda el informe de evaluación en el historial longitudinal
 */
function saveEvaluationToHistory(report) {
  try {
    const raw = localStorage.getItem(LEARNING_HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    const idx = history.findIndex(h => h.roundNumber === report.roundNumber);
    if (idx >= 0) {
      history[idx] = report;
    } else {
      history.push(report);
    }
    history.sort((a, b) => a.roundNumber - b.roundNumber);
    localStorage.setItem(LEARNING_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {}
}

/**
 * Obtiene todo el historial longitudinal de evaluaciones
 */
function getLearningHistory() {
  try {
    const raw = localStorage.getItem(LEARNING_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Calcula micro-ajustes inteligentes (nudges) para las ponderaciones activas
 */
function computeAdaptiveWeightNudges(evaluationReport, currentWeights) {
  if (!evaluationReport || !currentWeights) return currentWeights;

  const weights = JSON.parse(JSON.stringify(currentWeights));
  const { posMae, positionHits } = evaluationReport;
  const changes = [];

  // 1. ARQ: Si la valla invicta fue muy precisa, potenciar cleanSheet; si falló, potenciar avgRating
  if (positionHits.ARQ && positionHits.ARQ.total >= 2) {
    const arqCsRate = positionHits.ARQ.csHit / positionHits.ARQ.total;
    if (arqCsRate >= 0.60) {
      weights.ARQ.cleanSheet = Math.min(65, (weights.ARQ.cleanSheet || 50) + 3);
      weights.ARQ.avgRating = Math.max(15, (weights.ARQ.avgRating || 25) - 3);
      changes.push('🧤 ARQ: +3% Valla Invicta (alta efectividad observada)');
    } else if (arqCsRate <= 0.30) {
      weights.ARQ.cleanSheet = Math.max(35, (weights.ARQ.cleanSheet || 50) - 3);
      weights.ARQ.avgRating = Math.min(35, (weights.ARQ.avgRating || 25) + 3);
      changes.push('🧤 ARQ: +3% Nota Clarín (vallas invictas más impredecibles)');
    }
  }

  // 2. DEF: Si los defensores con gol rindieron fuerte, potenciar goals/xgShots
  if (positionHits.DEF && positionHits.DEF.total >= 3) {
    const defGoalRate = positionHits.DEF.goalHit / positionHits.DEF.total;
    if (defGoalRate >= 0.25) {
      weights.DEF.goals = Math.min(35, (weights.DEF.goals || 25) + 3);
      weights.DEF.xgShots = Math.min(30, (weights.DEF.xgShots || 20) + 2);
      weights.DEF.avgRating = Math.max(10, (weights.DEF.avgRating || 15) - 5);
      changes.push('🛡️ DEF: +5% Gol y xG (gran impacto de defensores goleadores)');
    }
  }

  // 3. VOL: Si el error es alto en atacantes, equilibrar con avgRating de juego
  if (posMae.VOL > 2.8) {
    weights.VOL.avgRating = Math.min(45, (weights.VOL.avgRating || 35) + 4);
    weights.VOL.goals = Math.max(18, (weights.VOL.goals || 25) - 2);
    weights.VOL.xgShots = Math.max(18, (weights.VOL.xgShots || 25) - 2);
    changes.push('⚡ VOL: +4% Ficha Base Clarín (mayor piso de regularidad)');
  }

  // 4. DEL: Si los delanteros acertaron goles, subir peso goleador
  if (positionHits.DEL && positionHits.DEL.total >= 3) {
    const delGoalRate = positionHits.DEL.goalHit / positionHits.DEL.total;
    if (delGoalRate >= 0.40) {
      weights.DEL.goals = Math.min(45, (weights.DEL.goals || 35) + 3);
      weights.DEL.avgRating = Math.max(10, (weights.DEL.avgRating || 15) - 3);
      changes.push('🎯 DEL: +3% Goles (alta conversión de atacantes titulares)');
    }
  }

  // Normalizar para que cada posición sume exactamente 100%
  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => {
    const wObj = weights[pos];
    if (wObj) {
      const keys = Object.keys(wObj);
      const total = keys.reduce((sum, k) => sum + (wObj[k] || 0), 0);
      if (total !== 100 && total > 0) {
        const factor = 100 / total;
        let runningSum = 0;
        keys.forEach((k, i) => {
          if (i === keys.length - 1) {
            wObj[k] = 100 - runningSum;
          } else {
            wObj[k] = Math.round(wObj[k] * factor);
            runningSum += wObj[k];
          }
        });
      }
    }
  });

  return {
    nudgedWeights: weights,
    changes
  };
}

/**
 * Procesa automáticamente la evaluación post-sincronización si hay nueva fecha finalizada
 */
function autoProcessPostSync(appData, currentWeights) {
  if (!appData || !appData.players) return null;

  const settings = getLearningSettings();
  const currentRound = appData.currentRound || 1;

  // Evaluar las fechas finalizadas (1 hasta currentRound - 1)
  const history = getLearningHistory();
  const evaluatedRounds = new Set(history.map(h => h.roundNumber));

  let lastEvaluation = null;
  let weightsAdjustment = null;

  for (let r = 1; r <= currentRound; r++) {
    // Si la fecha r tiene datos de puntajes cargados pero no ha sido evaluada
    const hasScores = appData.players.some(p => (p.scores && p.scores[r - 1] !== null && p.scores[r - 1] !== undefined) || (p.ratings && p.ratings[r - 1] > 0));
    if (hasScores && !evaluatedRounds.has(r)) {
      const evalReport = evaluateRoundPerformance(r, appData.players);
      if (evalReport) {
        lastEvaluation = evalReport;
        evaluatedRounds.add(r);

        if (settings.autoLearningEnabled && currentWeights) {
          weightsAdjustment = computeAdaptiveWeightNudges(evalReport, currentWeights);
        }
      }
    }
  }

  return {
    lastEvaluation,
    weightsAdjustment
  };
}

if (typeof window !== 'undefined') {
  window.saveRoundPredictionSnapshot = saveRoundPredictionSnapshot;
  window.evaluateRoundPerformance = evaluateRoundPerformance;
  window.computeAdaptiveWeightNudges = computeAdaptiveWeightNudges;
  window.getLearningHistory = getLearningHistory;
  window.getLearningSettings = getLearningSettings;
  window.saveLearningSettings = saveLearningSettings;
  window.autoProcessPostSync = autoProcessPostSync;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    saveRoundPredictionSnapshot,
    evaluateRoundPerformance,
    computeAdaptiveWeightNudges,
    getLearningHistory,
    getLearningSettings,
    saveLearningSettings,
    autoProcessPostSync
  };
}
