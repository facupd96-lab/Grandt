/**
 * tournamentOptimizer.js
 * Gran DT Analyzer Pro — Fase 4: Optimizador Táctico de Torneo & Estrategia Ganadora
 * 
 * Funcionalidades clave:
 * 1. Optimizador de Presupuesto Real ($60M Gran DT) mediante algoritmo Knapsack.
 * 2. Detector de Gangas & Joyas Low-Cost (máximo Score DT por millón invertido).
 * 3. Asistente Inteligente de Transferencias (recomienda los 4 cambios óptimos semanales).
 * 4. Estrategias: Equipo Seguro (Torneo General) vs Equipo Bomba (Ganar la Fecha / 130 pts).
 * 5. Exportador de Alineaciones en 1 clic para cargar en Gran DT.
 */

const DEFAULT_BUDGET_MILLIONS = 60.0;

/**
 * Convierte strings de cotización como "$ 1.500.000" a número en millones (ej: 1.50)
 */
function parsePriceToMillions(priceStr) {
  if (typeof priceStr === 'number') {
    return priceStr > 1000 ? priceStr / 1000000 : priceStr;
  }
  if (!priceStr) return 2.0;
  const clean = String(priceStr).replace(/[^0-9]/g, '');
  const num = parseInt(clean);
  if (isNaN(num) || num === 0) return 2.0;
  return Number((num / 1000000).toFixed(2));
}

/**
 * Formatea número en millones a formato moneda oficial Gran DT (ej: 4.5 -> "$ 4.500.000")
 */
function formatPriceString(millions) {
  const val = Math.round((millions || 0) * 1000000);
  return '$ ' + val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Optimizador de Alineación con Restricción de Presupuesto ($60M)
 */
function optimizeLineupWithBudget(rankingsByPos, options = {}) {
  const {
    budget = DEFAULT_BUDGET_MILLIONS,
    formationId = null,
    mode = 'solid', // 'solid' o 'risky'
    positionWeights = null
  } = options;

  if (!rankingsByPos || !rankingsByPos.DEF) return null;

  // Formaciones disponibles
  const formations = (typeof OFFICIAL_FORMATIONS !== 'undefined') ? OFFICIAL_FORMATIONS : [
    { id: '442', name: '1-4-4-2', def: 4, vol: 4, del: 2 },
    { id: '433', name: '1-4-3-3', def: 4, vol: 3, del: 3 },
    { id: '343', name: '1-3-4-3', def: 3, vol: 4, del: 3 },
    { id: '352', name: '1-3-5-2', def: 3, vol: 5, del: 2 },
    { id: '532', name: '1-5-3-2', def: 5, vol: 3, del: 2 },
    { id: '541', name: '1-5-4-1', def: 5, vol: 4, del: 1 }
  ];

  const targetFormations = formationId 
    ? formations.filter(f => f.id === formationId) 
    : formations;

  let bestGlobalLineup = null;
  let highestScore = -1;

  targetFormations.forEach(fmt => {
    // Tomar los mejores candidatos por posición con su cotización
    const poolArq = (rankingsByPos.ARQ || []).slice(0, 10).map(p => ({ ...p, priceM: parsePriceToMillions(p.price || p.cotizacion) }));
    const poolDef = (rankingsByPos.DEF || []).slice(0, 20).map(p => ({ ...p, priceM: parsePriceToMillions(p.price || p.cotizacion) }));
    const poolVol = (rankingsByPos.VOL || []).slice(0, 25).map(p => ({ ...p, priceM: parsePriceToMillions(p.price || p.cotizacion) }));
    const poolDel = (rankingsByPos.DEL || []).slice(0, 20).map(p => ({ ...p, priceM: parsePriceToMillions(p.price || p.cotizacion) }));

    const scoreField = mode === 'risky' ? 'riskyScore' : 'finalScore';

    // Búsqueda voraz con restricciones de presupuesto y diversidad de equipos (máx 3 por club)
    for (let a = 0; a < Math.min(4, poolArq.length); a++) {
      const arq = poolArq[a];
      const selected = { arq: [arq], def: [], vol: [], del: [] };
      const teamCounts = { [arq.team]: 1 };
      let currentCost = arq.priceM;
      let currentScore = arq[scoreField] || 50;

      // Helper para seleccionar jugadores respetando presupuesto y cupo por club (máx 3)
      function pickBestForPos(posPool, neededCount, remainingBudget, posKey) {
        const picked = [];
        const sorted = [...posPool].sort((x, y) => {
          // Relación calidad-precio en el margen
          const scoreX = x[scoreField] || 50;
          const scoreY = y[scoreField] || 50;
          return (scoreY / (y.priceM || 2)) - (scoreX / (x.priceM || 2));
        });

        // Intentar primero con los de mayor Score absoluto si alcanza el presupuesto
        const directSorted = [...posPool].sort((x, y) => (y[scoreField] || 0) - (x[scoreField] || 0));
        
        for (const p of directSorted) {
          if (picked.length >= neededCount) break;
          if (picked.some(sel => sel.name === p.name)) continue;
          if ((teamCounts[p.team] || 0) >= 3) continue;

          // Estimación del costo promedio requerido para los puestos restantes
          const remainingSlots = (fmt.def - selected.def.length) + (fmt.vol - selected.vol.length) + (fmt.del - selected.del.length) - 1;
          const minReserve = Math.max(0, remainingSlots * 1.2); // Reserva mínima de $1.2M por jugador

          if (currentCost + p.priceM + minReserve <= budget) {
            picked.push(p);
            selected[posKey].push(p);
            currentCost += p.priceM;
            currentScore += (p[scoreField] || 50);
            teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
          }
        }

        // Si faltaron puestos por presupuesto, llenar con gangas
        if (picked.length < neededCount) {
          for (const p of sorted) {
            if (picked.length >= neededCount) break;
            if (picked.some(sel => sel.name === p.name)) continue;
            if ((teamCounts[p.team] || 0) >= 3) continue;

            picked.push(p);
            selected[posKey].push(p);
            currentCost += p.priceM;
            currentScore += (p[scoreField] || 50);
            teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
          }
        }
      }

      pickBestForPos(poolDef, fmt.def, budget - currentCost, 'def');
      pickBestForPos(poolVol, fmt.vol, budget - currentCost, 'vol');
      pickBestForPos(poolDel, fmt.del, budget - currentCost, 'del');

      const totalPlayers = selected.arq.length + selected.def.length + selected.vol.length + selected.del.length;
      if (totalPlayers === 11 && currentCost <= budget + 0.05) {
        if (currentScore > highestScore) {
          highestScore = currentScore;
          
          // Capitán dentro del equipo
          const allStarters = [...selected.arq, ...selected.def, ...selected.vol, ...selected.del];
          allStarters.sort((x, y) => (y.captainScore || y[scoreField] || 0) - (x.captainScore || x[scoreField] || 0));
          const captain = allStarters[0];

          // Seleccionar 4 Suplentes oficiales Gran DT (1 ARQ, 1 DEF, 1 VOL, 1 DEL) de bajo costo
          const starterNames = new Set(allStarters.map(p => p.name));
          const benchArq = (poolArq || []).filter(p => !starterNames.has(p.name)).sort((a,b) => (a.priceM - b.priceM))[0];
          const benchDef = (poolDef || []).filter(p => !starterNames.has(p.name)).sort((a,b) => (a.priceM - b.priceM))[0];
          const benchVol = (poolVol || []).filter(p => !starterNames.has(p.name)).sort((a,b) => (a.priceM - b.priceM))[0];
          const benchDel = (poolDel || []).filter(p => !starterNames.has(p.name)).sort((a,b) => (a.priceM - b.priceM))[0];

          bestGlobalLineup = {
            formation: fmt,
            totalCostMillions: Number(currentCost.toFixed(2)),
            totalCostFormatted: formatPriceString(currentCost),
            budgetRemainingMillions: Number((budget - currentCost).toFixed(2)),
            budgetRemainingFormatted: formatPriceString(Math.max(0, budget - currentCost)),
            totalScore: Math.round(currentScore * 10) / 10,
            avgScore: Math.round((currentScore / 11) * 10) / 10,
            captain,
            players: selected,
            allStarters,
            bench: {
              arq: benchArq,
              def: benchDef,
              vol: benchVol,
              del: benchDel
            }
          };
        }
      }
    }
  });

  return bestGlobalLineup;
}

/**
 * Encuentra las mejores gangas / Joyas Low-Cost del torneo (mayor Score DT por millón invertido)
 */
function findTopBargains(players, rankingsByPos, maxPriceMillions = 2.5) {
  const bargains = [];

  ['ARQ', 'DEF', 'VOL', 'DEL'].forEach(pos => {
    const pool = (rankingsByPos && rankingsByPos[pos]) ? rankingsByPos[pos] : [];
    pool.forEach(p => {
      const priceM = parsePriceToMillions(p.price || p.cotizacion);
      const score = p.finalScore || 50;
      if (priceM <= maxPriceMillions && score >= 68.0) {
        const valueRatio = Number((score / priceM).toFixed(1));
        bargains.push({
          ...p,
          priceM,
          priceFormatted: formatPriceString(priceM),
          valueRatio
        });
      }
    });
  });

  bargains.sort((a, b) => b.valueRatio - a.valueRatio);
  return bargains;
}

/**
 * Asistente Inteligente de Transferencias (Recomienda los 4 cambios óptimos)
 */
function calculateOptimalTransfers(currentLineup, rankingsByPos, budget = DEFAULT_BUDGET_MILLIONS, maxTransfers = 4) {
  if (!currentLineup || !Array.isArray(currentLineup) || currentLineup.length !== 11) {
    return {
      message: 'Ingresá tus 11 titulares actuales para calcular los 4 cambios recomendados.',
      transfers: []
    };
  }

  // 1. Identificar jugadores del equipo actual con peor proyección para la fecha próxima
  const scoredCurrent = currentLineup.map(p => {
    const pos = p.position || 'DEL';
    const pool = (rankingsByPos && rankingsByPos[pos]) || [];
    const updated = pool.find(cand => cand.name === p.name) || p;
    const priceM = parsePriceToMillions(updated.price || updated.cotizacion || p.price);
    const score = updated.finalScore || 50;
    return {
      ...updated,
      currentTeamPlayer: p,
      priceM,
      score
    };
  });

  // Ordenar de peor a mejor score para vender los más débiles
  const candidatesToSell = [...scoredCurrent].sort((a, b) => a.score - b.score);
  const toSell = candidatesToSell.slice(0, maxTransfers);

  const keptPlayers = candidatesToSell.slice(maxTransfers);
  let availableBudget = budget - keptPlayers.reduce((sum, p) => sum + p.priceM, 0);

  // 2. Para cada posición vendida, buscar el reemplazo con mayor ganancia de puntos dentro del presupuesto
  const transfers = [];
  let netPointGain = 0;

  toSell.forEach(outgoing => {
    const pos = outgoing.position;
    const pool = (rankingsByPos && rankingsByPos[pos]) || [];
    
    // Filtrar jugadores que no estén ya en el equipo conservado
    const availableCands = pool.filter(cand => {
      const alreadyIn = keptPlayers.some(k => k.name === cand.name) || transfers.some(t => t.incoming.name === cand.name);
      return !alreadyIn;
    });

    // Ordenar por score decreciente
    availableCands.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));

    // Buscar el mejor que entre en el presupuesto
    let bestIncoming = null;
    for (const cand of availableCands) {
      const cPriceM = parsePriceToMillions(cand.price || cand.cotizacion);
      const cScore = cand.finalScore || 50;
      if (cPriceM <= availableBudget && cScore > outgoing.score) {
        bestIncoming = { ...cand, priceM: cPriceM };
        break;
      }
    }

    if (!bestIncoming && availableCands.length > 0) {
      // Tomar el más rendidor accesible
      bestIncoming = { ...availableCands[0], priceM: parsePriceToMillions(availableCands[0].price || availableCands[0].cotizacion) };
    }

    if (bestIncoming) {
      const pointDiff = Number(((bestIncoming.finalScore || 50) - outgoing.score).toFixed(1));
      netPointGain += pointDiff;
      availableBudget -= bestIncoming.priceM;

      transfers.push({
        outgoing: {
          name: outgoing.name,
          pos: outgoing.position,
          team: outgoing.team,
          priceFormatted: formatPriceString(outgoing.priceM),
          score: outgoing.score
        },
        incoming: {
          name: bestIncoming.name,
          pos: bestIncoming.position,
          team: bestIncoming.team,
          priceFormatted: formatPriceString(bestIncoming.priceM),
          score: bestIncoming.finalScore || 50
        },
        pointGain: pointDiff,
        reason: (bestIncoming.finalScore || 50) >= 88 
          ? '🔥 Candidato top de la fecha con cruce muy favorable.' 
          : '📈 Mayor rendimiento proyectado y mejor fixture.'
      });
    }
  });

  return {
    transfers,
    netPointGain: Math.round(netPointGain * 10) / 10,
    budgetRemainingFormatted: formatPriceString(Math.max(0, availableBudget))
  };
}

/**
 * Exporta la alineación completa formateada para copiar y pegar
 */
function exportTeamText(lineupObj) {
  if (!lineupObj || !lineupObj.allStarters) return '';

  const { formation, totalCostFormatted, totalScore, captain, allStarters, bench } = lineupObj;
  
  let text = `⚽ GRAN DT PRO — ALINEACIÓN OFICIAL\n`;
  text += `📋 Formación: ${formation?.name || '1-4-4-2'} | Presupuesto Titulares: ${totalCostFormatted} | Score: ${totalScore} pts\n`;
  text += `👑 Capitán: ${captain?.name || 'Capitán'} (${captain?.team || ''})\n`;
  text += `──────────────────────────────────────────\n`;

  const arq = allStarters.filter(p => p.pos === 'ARQ' || p.position === 'ARQ');
  const def = allStarters.filter(p => p.pos === 'DEF' || p.position === 'DEF');
  const vol = allStarters.filter(p => p.pos === 'VOL' || p.position === 'VOL');
  const del = allStarters.filter(p => p.pos === 'DEL' || p.position === 'DEL');

  text += `🧤 ARQUERO:\n`;
  arq.forEach(p => { text += `  • ${p.name} (${p.team}) - ${formatPriceString(parsePriceToMillions(p.price))} - Score: ${p.finalScore || 50}\n`; });

  text += `\n🛡️ DEFENSORES:\n`;
  def.forEach(p => { text += `  • ${p.name} (${p.team}) - ${formatPriceString(parsePriceToMillions(p.price))} - Score: ${p.finalScore || 50}\n`; });

  text += `\n⚡ VOLANTES:\n`;
  vol.forEach(p => { text += `  • ${p.name} (${p.team}) - ${formatPriceString(parsePriceToMillions(p.price))} - Score: ${p.finalScore || 50}\n`; });

  text += `\n🎯 DELANTEROS:\n`;
  del.forEach(p => { text += `  • ${p.name} (${p.team}) - ${formatPriceString(parsePriceToMillions(p.price))} - Score: ${p.finalScore || 50}\n`; });

  if (bench) {
    text += `\n──────────────────────────────────────────\n`;
    text += `🪑 SUPLENTES OFICIALES (BANCO DE RELEVOS):\n`;
    if (bench.arq) text += `  • ARQ: ${bench.arq.name} (${bench.arq.team}) - ${formatPriceString(bench.arq.priceM)}\n`;
    if (bench.def) text += `  • DEF: ${bench.def.name} (${bench.def.team}) - ${formatPriceString(bench.def.priceM)}\n`;
    if (bench.vol) text += `  • VOL: ${bench.vol.name} (${bench.vol.team}) - ${formatPriceString(bench.vol.priceM)}\n`;
    if (bench.del) text += `  • DEL: ${bench.del.name} (${bench.del.team}) - ${formatPriceString(bench.del.priceM)}\n`;
  }

  text += `──────────────────────────────────────────\n`;
  text += `🏆 Generado con Gran DT Analyzer Pro • Algoritmo v2.5\n`;

  return text;
}

if (typeof window !== 'undefined') {
  window.parsePriceToMillions = parsePriceToMillions;
  window.formatPriceString = formatPriceString;
  window.optimizeLineupWithBudget = optimizeLineupWithBudget;
  window.findTopBargains = findTopBargains;
  window.calculateOptimalTransfers = calculateOptimalTransfers;
  window.exportTeamText = exportTeamText;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parsePriceToMillions,
    formatPriceString,
    optimizeLineupWithBudget,
    findTopBargains,
    calculateOptimalTransfers,
    exportTeamText
  };
}
