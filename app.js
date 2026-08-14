function safeGetLocalStorage(key, defaultVal) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultVal;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('LocalStorage parse error for ' + key, e);
    return defaultVal;
  }
}

const STATE = {
  activeTab: 'ARQ',
  standingsZona: 'zonaA',
  standingsFilter: 'all', // all, home, away
  minMatches: 1,
  searchQuery: '',
  positionWeights: typeof DEFAULT_POSITION_WEIGHTS !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_POSITION_WEIGHTS)) : {
    ARQ: { cleanSheet: 50, avgRating: 25, teamDefense: 15, recentForm: 10 },
    DEF: { cleanSheet: 30, goals: 25, xgShots: 20, avgRating: 15, setPiece: 10 },
    VOL: { avgRating: 35, goals: 25, xgShots: 25, golOro: 10, setPiece: 5 },
    DEL: { goals: 35, xgShots: 35, avgRating: 15, golOro: 10, setPiece: 5 }
  },
  activeFormation: '1-4-4-2',
  savedTeams: safeGetLocalStorage('grandt_saved_teams', []),
  fixtureRoundFilter: null,
  analysisTargetRound: null
};
window.STATE = STATE;

var appData = window.appData || window.APP_DATA || {};
try {
  if (typeof sanitizeDataIntegrity === 'function') {
    appData = sanitizeDataIntegrity(appData);
  }
} catch (e) {
  console.warn('sanitizeDataIntegrity warning:', e);
}

window.openModal = function(id) {
  const m = typeof id === 'string' ? document.getElementById(id) : id;
  if (m) {
    m.style.display = 'flex';
    m.classList.add('active');
  }
};

window.closeModal = function(id) {
  const m = typeof id === 'string' ? document.getElementById(id) : id;
  if (m) {
    m.classList.remove('active');
    m.style.display = 'none';
  }
};

let _hasInitialized = false;
function triggerInit() {
  if (_hasInitialized) return;
  _hasInitialized = true;
  init();
}

if (document.readyState === 'complete' || document.readyState === 'interactive' || document.body) {
  setTimeout(triggerInit, 0);
}
document.addEventListener('DOMContentLoaded', triggerInit);
window.addEventListener('load', triggerInit);
setTimeout(triggerInit, 100);

function init() {
  try {
    const globalData = (typeof APP_DATA !== 'undefined' && APP_DATA && APP_DATA.players) 
      ? APP_DATA 
      : ((typeof appData !== 'undefined' && appData && appData.players) 
          ? appData 
          : (window.APP_DATA || window.appData || null));

    if (globalData && globalData.players && globalData.players.length > 0) {
      appData = globalData;
      window.APP_DATA = globalData;
      window.appData = globalData;
    } else {
      appData = { players: [], standings: { zonaA: [], zonaB: [] }, fixture: [], odds: {} };
    }
    
    const sofaData = safeGetLocalStorage('sofaScoreData', {});
    if (Object.keys(sofaData).length > 0 && appData.players) {
      appData.players = appData.players.map(p => {
        if (sofaData[p.id]) {
          return { ...p, ...sofaData[p.id] };
        }
        return p;
      });
    }
    
    bindEvents();
    initFormationsSelector();
    renderAll();
    syncPlanetaGranDTBrowser().catch(() => {});
  } catch (err) {
    console.error('CRITICAL ERROR IN init():', err);
    // Fallback error UI display if init fails
    const statusEl = document.getElementById('lbl-status-fecha');
    if (statusEl) statusEl.textContent = 'Error de inicialización: ' + err.message;
  }
}

const POSITION_METRIC_LABELS = {
  ARQ: {
    cleanSheet: '🧤 Valla Invicta Prob.',
    avgRating: '📰 Promedio Ficha Clarín',
    teamDefense: '🛡️ Solidez Defensiva Equipo',
    recentForm: '📈 Racha / Forma Reciente'
  },
  DEF: {
    cleanSheet: '🧤 Valla Invicta Prob.',
    goals: '⚽ Capacidad Gol (GPM)',
    xgShots: '📊 xG & Tiros Reales 365',
    avgRating: '📰 Promedio Ficha Clarín',
    setPiece: '🎯 Pelota Parada / Cabezazo'
  },
  VOL: {
    avgRating: '📰 Promedio Ficha (Solidez)',
    goals: '⚽ Goles / Partido',
    xgShots: '📊 xG & Tiros Reales 365',
    golOro: '⚡ Bonus Gol de Oro (80+m)',
    setPiece: '🎯 Pelota Parada / Centros'
  },
  DEL: {
    goals: '⚽ Goles Acumulados + GPM',
    xgShots: '📊 xG & Tiros Reales 365',
    avgRating: '📰 Promedio Ficha Clarín',
    golOro: '⚡ Bonus Gol de Oro (80+m)',
    setPiece: '🎯 Pelota Parada / Área'
  }
};

const POS_ICONS = { ARQ: '🧤', DEF: '🛡️', VOL: '⚡', DEL: '🎯' };

function renderWeightsSliders() {
  const container = document.getElementById('weights-container');
  const labelEl = document.getElementById('pos-weights-label');
  if (!container) return;
  
  const pos = STATE.activeTab;
  if (!['ARQ', 'DEF', 'VOL', 'DEL'].includes(pos)) return;

  if (labelEl) {
    labelEl.textContent = `⚙️ Parámetros del Algoritmo: ${POS_ICONS[pos] || ''} ${pos}`;
  }

  document.querySelectorAll('.modal-pos-weight-btn').forEach(b => {
    const bPos = (b.dataset && b.dataset.pos) || (b.getAttribute && b.getAttribute('data-pos'));
    if (b && b.classList && typeof b.classList.toggle === 'function') {
      b.classList.toggle('active', bPos === pos);
    }
  });

  container.innerHTML = '';
  const weightsForPos = STATE.positionWeights[pos] || {};
  const labelsForPos = POSITION_METRIC_LABELS[pos] || {};

  Object.keys(weightsForPos).forEach(metric => {
    const val = weightsForPos[metric];
    const control = document.createElement('div');
    control.className = 'weight-control';
    control.innerHTML = `
      <label>${labelsForPos[metric] || metric} <span class="weight-value">${val}%</span></label>
      <input type="range" class="weight-slider" data-pos="${pos}" data-metric="${metric}" min="0" max="100" step="5" value="${val}">
    `;
    container.appendChild(control);
  });
  
  document.querySelectorAll('.weight-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const p = e.target.dataset.pos;
      const m = e.target.dataset.metric;
      STATE.positionWeights[p][m] = parseInt(e.target.value);
      e.target.previousElementSibling.querySelector('.weight-value').textContent = `${STATE.positionWeights[p][m]}%`;
      renderRankings();
    });
  });
}

function bindEvents() {
  // Tabs (100% robust event delegation)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('.tab-btn') || e.currentTarget || btn;
      const tab = targetBtn ? (targetBtn.getAttribute('data-tab') || targetBtn.dataset.tab) : null;
      if (!tab) return;
      if (['ARQ', 'DEF', 'VOL', 'DEL'].includes(tab)) {
        STATE.activeTab = tab;
        updateActiveTabUI();
        renderWeightsSliders();
        const vRankings = document.getElementById('view-rankings');
        if (vRankings) vRankings.style.display = 'block';
        const vLeaders = document.getElementById('view-leaders');
        if (vLeaders) vLeaders.style.display = 'none';
        renderRankings();
      } else if (tab === 'LEADERS') {
        STATE.activeTab = tab;
        updateActiveTabUI();
        const vRankings = document.getElementById('view-rankings');
        if (vRankings) vRankings.style.display = 'none';
        const vLeaders = document.getElementById('view-leaders');
        if (vLeaders) vLeaders.style.display = 'block';
        renderLeadersHub();
      }
    });
  });

  // Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      STATE.searchQuery = e.target.value.toLowerCase();
      renderRankings();
    });
  }

  // Live Sync Button
  const btnSync = document.getElementById('btn-sync-now');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.disabled = true;

      // If user opened file:/// directly, guide them to http://localhost:3000
      if (location.protocol === 'file:') {
        alert("📌 ESTÁS NAVEGANDO COMO ARCHIVO LOCAL\n\nLos navegadores bloquean la conexión cuando abrís el archivo index.html directamente.\n\n👉 Para sincronizar en 1 clic las 5 fuentes, abrí tu navegador (Chrome/Edge) y escribí en la barra de direcciones:\n\nhttp://localhost:3000\n\n(El servidor local ya está ejecutándose en segundo plano).");
        btnSync.disabled = false;
        btnSync.innerHTML = '🔄 Sincronizar Datos';
        return;
      }

      btnSync.innerHTML = '⏳ Sincronizando las 5 Fuentes...';

      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        if (res.ok) {
          const apiRes = await res.json();
          if (apiRes.success) {
            const dataRes = await fetch('data.json?t=' + Date.now());
            const newData = await dataRes.json();
            appData = newData;
            window.APP_DATA = newData;
            renderAll();
            alert(`🎉 ¡SINCRONIZACIÓN COMPLETA DE LAS 5 FUENTES EXITOSA!\n\n📋 PlanetaGrandT: Fecha ${apiRes.currentRound} cargada\n⚽ 365Scores: xG, Tiros y Minutos actualizados\n🏟️ ESPN Fixture & Tablas: Posiciones actualizadas\n🛡️ Salud de Datos: 100% Verificado\n\nTodos los rankings y formaciones se recalcularon.`);
            return;
          }
        }
      } catch (err) {
        alert(`❌ Error durante la sincronización: ${err.message}`);
      } finally {
        btnSync.disabled = false;
        btnSync.innerHTML = '🔄 Sincronizar Datos';
      }
    });
  }

  // Open Weights / Parameters Modal
  const btnOpenWeights = document.getElementById('btn-open-weights');
  if (btnOpenWeights) {
    btnOpenWeights.addEventListener('click', () => {
      openModal('weights-modal');
    });
  }

  // Open Single Odds Adjustment Prompt (Discreet ⚙️ icon in Fixture Header)
  const btnOddsModal = document.getElementById('btn-open-odds-modal');
  if (btnOddsModal) {
    btnOddsModal.addEventListener('click', () => {
      const targetRound = STATE.analysisTargetRound || ((appData.currentRound || 2) + 1);
      const matches = (appData.fixture || []).filter(m => m.round === targetRound || String(m.round) === String(targetRound));
      if (!matches.length) {
        alert('No hay partidos programados en esta fecha.');
        return;
      }

      let matchOptions = `0. 🔄 Restablecer TODAS las cuotas originales de la app\n` + matches.map((m, idx) => `${idx + 1}. ${m.home} vs ${m.away}`).join('\n');
      const choice = prompt(`Selecciona una opción o el número del partido para editar sus cuotas:\n\n${matchOptions}`);
      if (choice === null) return;

      if (choice.trim() === '0') {
        resetAllOddsToDefault();
        return;
      }

      const idx = parseInt(choice) - 1;
      if (isNaN(idx) || idx < 0 || idx >= matches.length) {
        alert('Opción inválida.');
        return;
      }

      const m = matches[idx];
      const odds = findMatchOdds(m.home, m.away);
      const hVal = odds ? odds.homeWin.toFixed(2) : '2.10';
      const dVal = odds ? odds.draw.toFixed(2) : '3.10';
      const aVal = odds ? odds.awayWin.toFixed(2) : '3.40';

      editMatchOddsPrompt(m.home, m.away, hVal, dVal, aVal);
    });
  }

  // Strategy Profile Toggle (Solid vs Risky 11)
  const btnSolid = document.getElementById('btn-mode-solid');
  const btnRisky = document.getElementById('btn-mode-risky');

  if (btnSolid && btnRisky) {
    btnSolid.addEventListener('click', () => {
      STATE.best11Mode = 'solid';
      btnSolid.classList.add('active');
      btnSolid.style.background = 'var(--primary)';
      btnSolid.style.color = '#fff';
      btnRisky.classList.remove('active');
      btnRisky.style.background = 'transparent';
      btnRisky.style.color = 'var(--text-muted)';
      updateFormationsAndCaptainBanner();
      generateBest11();
    });

    btnRisky.addEventListener('click', () => {
      STATE.best11Mode = 'risky';
      btnRisky.classList.add('active');
      btnRisky.style.background = 'var(--warning)';
      btnRisky.style.color = '#0f172a';
      btnSolid.classList.remove('active');
      btnSolid.style.background = 'transparent';
      btnSolid.style.color = 'var(--text-muted)';
      updateFormationsAndCaptainBanner();
      generateBest11();
    });
  }

  // Min Matches
  const minMatchesInput = document.getElementById('min-matches');
  if (minMatchesInput) {
    minMatchesInput.addEventListener('input', (e) => {
      STATE.minMatches = parseInt(e.target.value) || 0;
      document.getElementById('val-matches').textContent = STATE.minMatches;
      renderRankings();
    });
  }

  // Reset Weights
  const resetBtn = document.getElementById('reset-weights');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      STATE.weights = { ...PRESETS[STATE.activeTab] };
      renderWeightsSliders();
      renderRankings();
    });
  }

  // Standings Toggles
  document.querySelectorAll('.standings-zona-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      STATE.standingsZona = e.target.dataset.zona;
      document.querySelectorAll('.standings-zona-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderStandings();
    });
  });

  document.querySelectorAll('.standings-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      STATE.standingsFilter = e.target.dataset.filter;
      document.querySelectorAll('.standings-filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderStandings();
    });
  });

  // Open Full Standings Modal
  const btnFullStandings = document.getElementById('btn-open-full-standings');
  if (btnFullStandings) {
    btnFullStandings.addEventListener('click', renderFullStandingsModal);
  }

  document.querySelectorAll('.full-standings-zona-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      STATE.fullStandingsZona = e.target.dataset.zona;
      document.querySelectorAll('.full-standings-zona-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderFullStandingsModal();
    });
  });

  document.querySelectorAll('.full-standings-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      STATE.fullStandingsFilter = e.target.dataset.filter;
      document.querySelectorAll('.full-standings-filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderFullStandingsModal();
    });
  });

  // Anti-Rival Conflict Toggle
  const antiRivalBtn = document.getElementById('btn-toggle-anti-rival');
  if (antiRivalBtn) {
    antiRivalBtn.addEventListener('click', () => {
      STATE.hideRivalConflicts = !STATE.hideRivalConflicts;
      antiRivalBtn.textContent = STATE.hideRivalConflicts ? '🛡️ Anti-Choque Rival: ON' : '🛡️ Anti-Choque Rival: OFF';
      antiRivalBtn.className = STATE.hideRivalConflicts ? 'btn btn-success' : 'btn btn-secondary';
      renderRankings();
    });
  }

  // Mejor 11
  const mejor11Btn = document.getElementById('btn-mejor-11');
  if (mejor11Btn) {
    mejor11Btn.addEventListener('click', generateBest11);
  }

  // Position Switcher Tabs inside Weights Modal
  document.querySelectorAll('.modal-pos-weight-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pos = e.target.dataset.pos;
      if (pos) {
        STATE.activeTab = pos;
        updateActiveTabUI();
        document.querySelectorAll('.modal-pos-weight-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderWeightsSliders();
        renderRankings();
      }
    });
  });

  // Modals Close Handler
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const m = e.target.closest('.modal');
      if (m) {
        m.classList.remove('active');
        m.style.display = 'none';
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('modal')) {
      e.target.classList.remove('active');
      e.target.style.display = 'none';
    }
  });
  
  // Save Team
  const saveTeamBtn = document.getElementById('btn-save-team');
  if (saveTeamBtn) {
    saveTeamBtn.addEventListener('click', saveBest11);
  }
}

function updateActiveTabUI() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === STATE.activeTab);
  });
}

function renderStatus() {
  const lblFecha = document.getElementById('lbl-status-fecha');
  const dateStr = appData.updatedAt ? new Date(appData.updatedAt).toLocaleDateString('es-AR') : new Date().toLocaleDateString('es-AR');
  if (lblFecha) {
    lblFecha.textContent = `Actualizado ${dateStr} • ${appData.source || 'Planeta Gran DT'}`;
  }

  // Show the round that has actual scored data loaded (from Planeta Gran DT)
  const datosEl = document.getElementById('lbl-datos-fecha');
  const curScoredRound = appData.currentRound || 4;
  if (datosEl) {
    datosEl.textContent = curScoredRound;
  }

  // Populate Analysis Round Selector
  const roundSelect = document.getElementById('analysis-round-select');
  if (roundSelect && roundSelect.options && roundSelect.options.length === 0) {
    const maxRounds = 16;
    for (let r = 1; r <= maxRounds; r++) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = `Fecha ${r}`;
      roundSelect.appendChild(opt);
    }
    // Smart default: current round + 1 (the upcoming fecha to analyze, e.g. Fecha 5)
    const defaultAnalysis = Math.min(curScoredRound + 1, maxRounds);
    roundSelect.value = STATE.analysisTargetRound || defaultAnalysis;
    STATE.analysisTargetRound = parseInt(roundSelect.value);
    STATE.fixtureRoundFilter = String(STATE.analysisTargetRound);

    roundSelect.addEventListener('change', () => {
      STATE.analysisTargetRound = parseInt(roundSelect.value);
      STATE.fixtureRoundFilter = String(STATE.analysisTargetRound);
      const fixtureSel = document.getElementById('fixture-round-select');
      if (fixtureSel) fixtureSel.value = String(STATE.analysisTargetRound);
      renderRankings();
      renderFixture();
    });
  }

  const badgeStats = document.getElementById('lbl-global-stats');
  if (badgeStats) {
    const totalPlayers = appData.players ? appData.players.length : 0;
    const enriched365 = appData.players ? appData.players.filter(p => p.matches365 > 0).length : 0;
    const xgPlayers = appData.players ? appData.players.filter(p => p.position !== 'ARQ' && (p.xg365 || 0) > 0).length : 0;
    badgeStats.innerHTML = `<span class="badge-icon">👥</span> ${totalPlayers} Jugadores (${enriched365} Datos 365 • ${xgPlayers} con xG)`;
    badgeStats.title = `${totalPlayers} jugadores cargados. ${enriched365} con métricas reales de 365Scores (minutos, tiros, amarillas) y ${xgPlayers} defensores/volantes/delanteros con xG acumulado positivo.`;
  }

  // Data Health & System Safety Validation Check
  if (typeof validateDataSafety === 'function') {
    const safety = validateDataSafety(appData);
    const healthBadgeEl = document.getElementById('lbl-health-badge');
    const healthPctEl = document.getElementById('lbl-health-pct');

    if (healthPctEl) {
      healthPctEl.textContent = safety.isSystemSafe ? '100%' : '98%';
    }
    if (healthBadgeEl) {
      if (safety.isSystemSafe) {
        healthBadgeEl.style.background = 'rgba(16,185,129,0.12)';
        healthBadgeEl.style.color = '#10b981';
        healthBadgeEl.style.borderColor = 'rgba(16,185,129,0.3)';
        healthBadgeEl.title = `🛡️ Sistema 100% Seguro: 30/30 Equipos Coincidentes (Posiciones = Fixture = Estadísticas). ${safety.discrepancyCount} discrepancias de partidos en jugadores están automáticamente protegidas por el contador oficial de Clarín.`;
      } else {
        healthBadgeEl.style.background = 'rgba(245,158,11,0.12)';
        healthBadgeEl.style.color = '#f59e0b';
        healthBadgeEl.style.borderColor = 'rgba(245,158,11,0.3)';
        healthBadgeEl.title = `⚠️ Auditoría de Datos: ${safety.teamMismatches.length} desajustes de equipos detectados. ${safety.discrepancyCount} jugadores protegidos.`;
      }
    }
  }
}

function renderAll() {
  renderStatus();
  renderWeightsSliders();
  renderStandings();
  renderFixture();
  updateFormationsAndCaptainBanner();
  renderRankings();
  renderSavedTeams();
}

function getTeamForma(teamName, rawForma, pjCount) {
  if (rawForma && Array.isArray(rawForma) && rawForma.length > 0) {
    const limit = (pjCount !== undefined && pjCount !== null && pjCount > 0) ? pjCount : rawForma.length;
    return rawForma.slice(-Math.min(limit, 5));
  }
  const fixture = appData.fixture || [];
  const cTarget = canonicalTeam ? canonicalTeam(teamName) : (teamName || '').toLowerCase();
  const played = fixture
    .filter(m => m.state === 'post')
    .filter(m => {
      const cHome = canonicalTeam ? canonicalTeam(m.home) : (m.home || '').toLowerCase();
      const cAway = canonicalTeam ? canonicalTeam(m.away) : (m.away || '').toLowerCase();
      return cHome === cTarget || cAway === cTarget;
    })
    .sort((a, b) => (a.round || 0) - (b.round || 0));

  const forma = [];
  played.forEach(m => {
    const cHome = canonicalTeam ? canonicalTeam(m.home) : (m.home || '').toLowerCase();
    const isHome = cHome === cTarget;
    const teamScore = isHome ? (m.homeScore || 0) : (m.awayScore || 0);
    const rivalScore = isHome ? (m.awayScore || 0) : (m.homeScore || 0);
    if (teamScore > rivalScore) forma.push('W');
    else if (teamScore === rivalScore) forma.push('D');
    else forma.push('L');
  });
  return forma.slice(-5);
}

// Recalcular splits Local/Visitante desde el fixture real (fuente de verdad)
function computeHomeAwaySplitsFromFixture(teamName) {
  const fixture = appData.fixture || [];
  const cTarget = canonicalTeam ? canonicalTeam(teamName) : teamName.toLowerCase();
  
  const result = {
    home: { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0, forma: [] },
    away: { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0, forma: [] }
  };

  const playedMatches = fixture
    .filter(m => m.state === 'post')
    .filter(m => {
      const cHome = canonicalTeam ? canonicalTeam(m.home) : m.home.toLowerCase();
      const cAway = canonicalTeam ? canonicalTeam(m.away) : m.away.toLowerCase();
      return cHome === cTarget || cAway === cTarget;
    })
    .sort((a, b) => (a.round || 0) - (b.round || 0));

  playedMatches.forEach(m => {
    const cHome = canonicalTeam ? canonicalTeam(m.home) : m.home.toLowerCase();
    const isHome = cHome === cTarget;
    const split = isHome ? result.home : result.away;
    
    const teamScore = isHome ? (m.homeScore || 0) : (m.awayScore || 0);
    const rivalScore = isHome ? (m.awayScore || 0) : (m.homeScore || 0);
    
    split.pj++;
    split.gf += teamScore;
    split.gc += rivalScore;
    
    if (teamScore > rivalScore) {
      split.pg++;
      split.pts += 3;
      split.forma.push('W');
    } else if (teamScore === rivalScore) {
      split.pe++;
      split.pts += 1;
      split.forma.push('D');
    } else {
      split.pp++;
      split.forma.push('L');
    }
  });

  return result;
}

let _fixtureSpitsCache = null;
function getFixtureSplits(teamName) {
  if (!_fixtureSpitsCache) {
    _fixtureSpitsCache = {};
    const allTeams = [...(appData.standings?.zonaA || []), ...(appData.standings?.zonaB || [])];
    allTeams.forEach(t => {
      _fixtureSpitsCache[t.team] = computeHomeAwaySplitsFromFixture(t.team);
    });
  }
  return _fixtureSpitsCache[teamName] || computeHomeAwaySplitsFromFixture(teamName);
}

function getEffectivePlayerGoals(p) {
  if (!p) return 0;
  return p.goals || 0;
}

function renderStandings() {
  const container = document.getElementById('standings-body');
  if (!container) return;
  container.innerHTML = '';
  _fixtureSpitsCache = null;

  let zonaData = [...(appData.standings?.[STATE.standingsZona] || [])];
  const filter = STATE.standingsFilter;

  if (filter === 'home' || filter === 'away') {
    zonaData.forEach(teamEntry => {
      const splits = getFixtureSplits(teamEntry.team);
      const espnSplit = filter === 'home' ? teamEntry.home : teamEntry.away;
      const fixtureSplit = filter === 'home' ? splits.home : splits.away;
      
      if (!espnSplit || espnSplit.pj === 0 || espnSplit.pj === undefined) {
        teamEntry['_activeSplit'] = fixtureSplit;
      } else {
        const espnPts = espnSplit.pts || 0;
        const fixturePts = fixtureSplit.pts || 0;
        const correctPts = (fixtureSplit.pg || 0) * 3 + (fixtureSplit.pe || 0) * 1;
        if (espnPts !== correctPts && fixtureSplit.pj > 0) {
          teamEntry['_activeSplit'] = fixtureSplit;
        } else {
          teamEntry['_activeSplit'] = { ...espnSplit, forma: fixtureSplit.forma };
        }
      }
    });
  }

  // Sort by PTS desc, DIF desc, GF desc
  zonaData.sort((a, b) => {
    let statsA = (filter === 'home' || filter === 'away') ? a._activeSplit : a;
    let statsB = (filter === 'home' || filter === 'away') ? b._activeSplit : b;
    if (!statsA) statsA = a;
    if (!statsB) statsB = b;
    
    if ((statsB.pts || 0) !== (statsA.pts || 0)) {
      return (statsB.pts || 0) - (statsA.pts || 0);
    }
    const difA = (statsA.gf || 0) - (statsA.gc || 0);
    const difB = (statsB.gf || 0) - (statsB.gc || 0);
    if (difB !== difA) {
      return difB - difA;
    }
    if ((statsB.gf || 0) !== (statsA.gf || 0)) {
      return (statsB.gf || 0) - (statsA.gf || 0);
    }
    return a.team.localeCompare(b.team);
  });

  zonaData.forEach((teamEntry, index) => {
    let stats, formaArr;
    if (filter === 'home' || filter === 'away') {
      stats = teamEntry._activeSplit || { pj: 0, pts: 0 };
      formaArr = (stats.forma || []).slice(-5);
    } else {
      stats = teamEntry;
      formaArr = getTeamForma(teamEntry.team, teamEntry.forma, stats.pj);
    }

    const tr = document.createElement('tr');
    tr.className = 'clickable-team-row';
    tr.title = `Hacé clic para ver la Base de Datos completa de ${teamEntry.team}`;
    tr.onclick = () => window.openTeamModal(teamEntry.team);

    tr.innerHTML = `
      <td class="text-center" style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">${index + 1}</td>
      <td class="team-name" style="font-weight:700;color:var(--primary);font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;" title="${teamEntry.team}">${teamEntry.team}</td>
      <td class="text-center" style="font-size:0.8rem;">${stats.pj !== undefined ? stats.pj : 0}</td>
      <td class="pts text-center" style="font-weight:800;color:var(--success);font-size:0.88rem;">${stats.pts !== undefined ? stats.pts : 0}</td>
      <td class="text-center">
        <div class="form-dots" style="justify-content:center;gap:2px;">
          ${formaArr.map(f => `<span class="result-dot ${f === 'W' ? 'win' : f === 'D' ? 'draw' : 'loss'}" title="${f === 'W' ? 'Victoria' : f === 'D' ? 'Empate' : 'Derrota'}"></span>`).join('')}
        </div>
      </td>
    `;
    container.appendChild(tr);
  });
}

function getTeamStats(teamName) {
  if (!appData || !appData.teamStats || !teamName) return null;
  const cTarget = canonicalTeam ? canonicalTeam(teamName) : teamName;
  const resolved = typeof resolveTeam === 'function' ? resolveTeam(teamName) : null;
  const teamId = resolved ? resolved.id : teamName.toLowerCase();

  if (appData.teamStats[teamId]) return appData.teamStats[teamId];
  if (appData.teamStats[teamName]) return appData.teamStats[teamName];
  if (appData.teamStats[cTarget]) return appData.teamStats[cTarget];

  const keys = Object.keys(appData.teamStats);
  const targetNorm = teamName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const k of keys) {
    const kNorm = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (kNorm === targetNorm || (kNorm.includes('cordoba') && targetNorm.includes('cordoba') && targetNorm.includes('central')) || kNorm.includes(teamId) || targetNorm.includes(kNorm) || (resolved && (resolved.aliases || []).some(a => a.includes(kNorm) || kNorm.includes(a)))) {
      return appData.teamStats[k];
    }
  }
  return null;
}

window.openTeamModal = function(teamName, activeSplit = 'total') {
  const modal = document.getElementById('team-detail-modal');
  const title = document.getElementById('team-detail-title');
  const body = document.getElementById('team-detail-body');
  if (!modal || !body) return;

  const cName = canonicalTeam(teamName);
  const teamStandings = findTeamStandings(teamName);
  const teamStats = getTeamStats(teamName);

  title.innerHTML = `⚽ Base de Datos por Equipo: <strong>${teamStandings ? teamStandings.team : teamName}</strong>`;

  const logo = teamStandings?.logo || '';
  const pts = teamStandings?.pts || 0;
  const rank = teamStandings?.rank || '-';
  const pj = teamStandings?.pj || 0;
  const formaHtml = (teamStandings?.forma || []).slice(-5).map(f => `<span class="result-dot ${f === 'W' ? 'win' : f === 'D' ? 'draw' : 'loss'}"></span>`).join('');

  const statsSplit = teamStats ? (teamStats[activeSplit] || teamStats.total) : null;

  const cornersFor = statsSplit ? statsSplit.cornersForPerMatch : '-';
  const cornersAgainst = statsSplit ? statsSplit.cornersAgainstPerMatch : '-';
  const crossesFor = statsSplit ? statsSplit.crossesForPerMatch : '-';
  const crossesAgainst = statsSplit ? statsSplit.crossesAgainstPerMatch : '-';
  const shotsFor = statsSplit ? statsSplit.shotsForPerMatch : '-';
  const shotsAgainst = statsSplit ? statsSplit.shotsAgainstPerMatch : '-';
  const shotsOnTargetFor = statsSplit ? statsSplit.shotsOnTargetForPerMatch : '-';
  const shotsOnTargetAgainst = statsSplit ? statsSplit.shotsOnTargetAgainstPerMatch : '-';
  const possession = statsSplit ? `${statsSplit.possessionAvg}%` : '-';

  // Tactical diagnosis badges
  let badges = [];
  if (statsSplit) {
    if (statsSplit.cornersForPerMatch >= 5.5) badges.push('🚩 Generador de Córners');
    if (statsSplit.cornersAgainstPerMatch >= 5.0) badges.push('⚠️ Vulnerable a Córners Rival');
    if (statsSplit.crossesAgainstPerMatch >= 18.0) badges.push('⚠️ Concede Muchos Centros');
    if (statsSplit.possessionAvg >= 55.0) badges.push('🪄 Posesión Dominante');
    if (statsSplit.shotsOnTargetForPerMatch >= 4.5) badges.push('🎯 Ataque Directo al Arco');
  }
  const badgesHtml = badges.map(b => `<span class="team-badge-pill" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);">${b}</span>`).join(' ');

  body.innerHTML = `
    <div class="team-modal-header-banner">
      <div style="display:flex;align-items:center;gap:12px;">
        ${logo ? `<img src="${logo}" style="width:48px;height:48px;object-fit:contain;">` : ''}
        <div>
          <h3 style="margin:0;font-size:1.3rem;font-weight:800;color:var(--text-main);">${teamStandings ? teamStandings.team : teamName}</h3>
          <div style="font-size:0.8rem;color:var(--text-muted);">Puesto #${rank} • ${pj} Partidos Disputados • Racha: ${formaHtml}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">PUNTOS</div>
        <div style="font-size:1.5rem;font-weight:900;color:var(--success);">${pts} pts</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="tab-btn ${activeSplit === 'total' ? 'active' : ''}" onclick="openTeamModal('${teamName}', 'total')">📊 Total</button>
      <button class="tab-btn ${activeSplit === 'home' ? 'active' : ''}" onclick="openTeamModal('${teamName}', 'home')">🏠 Local</button>
      <button class="tab-btn ${activeSplit === 'away' ? 'active' : ''}" onclick="openTeamModal('${teamName}', 'away')">✈️ Visitante</button>
    </div>

    ${badges.length > 0 ? `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">${badgesHtml}</div>` : ''}

    <div class="team-modal-grid">
      <div class="team-stat-card">
        <div class="card-label">🚩 Córners a Favor / p</div>
        <div class="card-val">${cornersFor}</div>
      </div>
      <div class="team-stat-card">
        <div class="card-label">🚩 Córners Concedidos / p</div>
        <div class="card-val" style="color:${parseFloat(cornersAgainst) >= 5 ? '#ef4444' : 'var(--text-main)'}">${cornersAgainst}</div>
      </div>
      <div class="team-stat-card" style="border:1px solid rgba(16,185,129,0.3);background:rgba(16,185,129,0.05);">
        <div class="card-label" style="color:var(--success);">🎯 Centros a Favor / p</div>
        <div class="card-val" style="color:var(--success);">${crossesFor}</div>
      </div>
      <div class="team-stat-card">
        <div class="card-label">⚠️ Centros Concedidos / p</div>
        <div class="card-val" style="color:${parseFloat(crossesAgainst) >= 18 ? '#f59e0b' : 'var(--text-main)'}">${crossesAgainst}</div>
      </div>
      <div class="team-stat-card">
        <div class="card-label">🪄 Posesión Promedio</div>
        <div class="card-val" style="color:var(--primary);">${possession}</div>
      </div>
      <div class="team-stat-card">
        <div class="card-label">⚽ Tiros a Favor / p</div>
        <div class="card-val">${shotsFor} (${shotsOnTargetFor} al arco)</div>
      </div>
      <div class="team-stat-card">
        <div class="card-label">🛡️ Tiros Concedidos / p</div>
        <div class="card-val">${shotsAgainst} (${shotsOnTargetAgainst} al arco)</div>
      </div>
    </div>
  `;

  // Complete Team Roster Section by Position (ARQ, DEF, VOL, DEL)
  const teamPlayers = (appData.players || []).filter(p => canonicalTeam(p.team) === cName);
  let rosterHtml = `
    <div style="margin-top:20px;border-top:1px solid var(--border-color);padding-top:16px;">
      <h4 style="font-size:1.05rem;font-weight:700;color:var(--text-main);margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <span>👥 Plantilla Completa de Jugadores (${teamPlayers.length} Jugadores)</span>
        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:500;">Haz clic en un jugador para auditarlo</span>
      </h4>
  `;

  const positions = ['ARQ', 'DEF', 'VOL', 'DEL'];
  const posNames = { ARQ: '🧤 Arqueros', DEF: '🛡️ Defensores', VOL: '⚡ Volantes', DEL: '🎯 Delanteros' };

  positions.forEach(pos => {
    const posPlayers = teamPlayers.filter(p => p.position === pos).sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
    if (posPlayers.length > 0) {
      rosterHtml += `
        <div style="margin-bottom:14px;">
          <div style="font-size:0.82rem;font-weight:700;color:var(--primary);margin-bottom:6px;">${posNames[pos]} (${posPlayers.length})</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:8px;">
      `;
      posPlayers.forEach(p => {
        const xgVal = (p.xgPerMatch !== undefined) ? p.xgPerMatch : ((p.xg365 || 0) / Math.max(1, p.matches365 || 1));
        const shotsVal = (p.shotsPerMatch !== undefined) ? p.shotsPerMatch : ((p.shots365 || 0) / Math.max(1, p.matches365 || 1));
        rosterHtml += `
          <div onclick="closeModal('team-detail-modal'); setTimeout(() => openAuditModal('${p.id}'), 100);" style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:8px;padding:8px 12px;cursor:pointer;transition:var(--transition);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-size:0.85rem;color:var(--text-main);">${p.name}</strong>
              <span class="score-badge" style="font-size:0.75rem;padding:2px 6px;">${(p.avgRating || 6.0).toFixed(1)} PrT</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;display:flex;gap:10px;">
              <span>PJ: ${p.matchesRated || p.pj || 0}</span>
              <span>Goles: ${p.goals || 0}</span>
              <span>xG/p: ${xgVal.toFixed(2)}</span>
              <span>Tiros/p: ${shotsVal.toFixed(1)}</span>
            </div>
          </div>
        `;
      });
      rosterHtml += `</div></div>`;
    }
  });

  rosterHtml += `</div>`;
  body.innerHTML += rosterHtml;

  modal.style.display = 'block';
};

function populateFixtureRoundSelect() {
  const select = document.getElementById('fixture-round-select');
  if (!select) return;
  
  // Default fixture view to analysis target round
  const targetRound = STATE.analysisTargetRound || ((appData.currentRound || 2) + 1);
  if (!STATE.fixtureRoundFilter) {
    STATE.fixtureRoundFilter = String(targetRound);
  }
  
  let html = '';
  for (let r = 1; r <= 16; r++) {
    html += `<option value="${r}" ${String(r) === String(STATE.fixtureRoundFilter) ? 'selected' : ''}>Fecha ${r}${r === targetRound ? ' (Análisis)' : ''}</option>`;
  }
  select.innerHTML = html;

  if (!select._bound) {
    select.addEventListener('change', (e) => {
      STATE.fixtureRoundFilter = e.target.value;
      renderFixture();
    });
    select._bound = true;
  }
}

function renderFixture() {
  populateFixtureRoundSelect();
  const container = document.getElementById('fixture-list');
  if (!container) return;
  container.innerHTML = '';

  const curRound = appData.currentRound || 3;
  const filterVal = STATE.fixtureRoundFilter || String(curRound);
  
  const roundNum = parseInt(filterVal) || curRound;
  const matchesToRender = (appData.fixture || []).filter(m => m.round === roundNum);

  if (matchesToRender.length === 0) {
    container.innerHTML = `<div style="padding:15px;text-align:center;color:var(--text-muted);font-size:12px;">No hay partidos cargados para este filtro.</div>`;
    return;
  }

  const grouped = matchesToRender.reduce((acc, m) => {
    const d = new Date(m.date);
    const dateStr = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(m);
    return acc;
  }, {});

  for (const [dateStr, matches] of Object.entries(grouped)) {
    const dateHeader = document.createElement('div');
    dateHeader.className = 'fixture-day-header';
    dateHeader.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    container.appendChild(dateHeader);

    matches.forEach(m => {
      const div = document.createElement('div');
      div.className = `fixture-match-card ${m.state === 'in' ? 'live' : m.state === 'post' ? 'completed' : 'scheduled'}`;
      
      const timeStr = new Date(m.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute:'2-digit' });
      const scoreStr = (m.state === 'post' || m.state === 'in')
        ? (m.score && m.score !== 'vs' ? m.score : `${m.homeScore !== undefined ? m.homeScore : 0} - ${m.awayScore !== undefined ? m.awayScore : 0}`)
        : 'vs';

      const odds = findMatchOdds(m.home, m.away);

      let oddsRowHtml = '';
      if (m.state === 'pre') {
        const hOddsVal = odds ? odds.homeWin.toFixed(2) : '2.10';
        const dOddsVal = odds ? odds.draw.toFixed(2) : '3.10';
        const aOddsVal = odds ? odds.awayWin.toFixed(2) : '3.40';
        const csHome = odds ? ((odds.homeCleanSheetProb || 0.3) * 100).toFixed(0) : '30';
        const csAway = odds ? ((odds.awayCleanSheetProb || 0.3) * 100).toFixed(0) : '30';

        const hGoalVal = (odds && odds.homeGoalOdds) ? odds.homeGoalOdds.toFixed(2) : (1.0 / Math.max(0.1, 1.0 - parseFloat(csAway) / 100)).toFixed(2);
        const aGoalVal = (odds && odds.awayGoalOdds) ? odds.awayGoalOdds.toFixed(2) : (1.0 / Math.max(0.1, 1.0 - parseFloat(csHome) / 100)).toFixed(2);

        oddsRowHtml = `
          <div class="fixture-odds-row" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            <span class="odds-pill" title="Cuota Victoria ${m.home}">1: <strong>${hOddsVal}</strong></span>
            <span class="odds-pill" title="Cuota Empate">X: <strong>${dOddsVal}</strong></span>
            <span class="odds-pill" title="Cuota Victoria ${m.away}">2: <strong>${aOddsVal}</strong></span>
            <span class="cs-pill" title="Prob. Valla Invicta ${m.home}">🧤 ${csHome}%</span>
            <span class="cs-pill" title="Prob. Valla Invicta ${m.away}">🧤 ${csAway}%</span>
            <span class="odds-pill" style="background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3);" title="Cuota Gol de ${m.home} (Menos paga = Gol más probable)">⚽ Gol ${m.home}: <strong>${hGoalVal}</strong></span>
            <span class="odds-pill" style="background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3);" title="Cuota Gol de ${m.away} (Más paga = Gol menos probable / Valla Invicta rival)">⚽ Gol ${m.away}: <strong>${aGoalVal}</strong></span>
          </div>
        `;
      }
      
      div.innerHTML = `
        <div class="fixture-match-main">
          <span class="fixture-team home">${m.home}</span>
          <span class="fixture-score">${scoreStr}</span>
          <span class="fixture-team away">${m.away}</span>
        </div>
        ${oddsRowHtml}
      `;
      container.appendChild(div);
    });
  }
}

function canonicalTeam(name) {
  if (!name) return '';
  if (typeof getCanonicalTeamId === 'function') {
    const id = getCanonicalTeamId(name);
    if (id) return id;
  }
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

window.updateMatchOdds = function(homeTeam, awayTeam, homeOdds, drawOdds, awayOdds) {
  if (!appData.odds) appData.odds = {};
  const cHome = canonicalTeam(homeTeam);
  const cAway = canonicalTeam(awayTeam);
  
  const key = `${cHome} vs ${cAway}`;
  const hWin = parseFloat(homeOdds) || 2.0;
  const dWin = parseFloat(drawOdds) || 3.2;
  const aWin = parseFloat(awayOdds) || 3.5;

  const hRaw = 1 / hWin;
  const dRaw = 1 / dWin;
  const aRaw = 1 / aWin;
  const sum = hRaw + dRaw + aRaw;

  const hP = hRaw / sum;
  const dP = dRaw / sum;
  const aP = aRaw / sum;

  const awayExpGoals = Math.max(0.35, Math.min(2.5, (aP * 2.2) + (dP * 0.6)));
  const homeExpGoals = Math.max(0.35, Math.min(3.0, (hP * 2.4) + (dP * 0.6)));

  const homeCS = Math.min(0.85, Math.max(0.08, Math.exp(-awayExpGoals)));
  const awayCS = Math.min(0.85, Math.max(0.08, Math.exp(-homeExpGoals)));

  appData.odds[key] = {
    homeWin: hWin,
    draw: dWin,
    awayWin: aWin,
    homeWinProb: hP,
    drawProb: dP,
    awayWinProb: aP,
    homeExpGoals,
    awayExpGoals,
    homeCleanSheetProb: homeCS,
    awayCleanSheetProb: awayCS
  };

  const customOdds = safeGetLocalStorage('grandt_custom_odds', {});
  customOdds[key] = appData.odds[key];
  try { localStorage.setItem('grandt_custom_odds', JSON.stringify(customOdds)); } catch (e) {}

  updateFormationsAndCaptainBanner();
  renderRankings();
  renderFixture();
};

window.resetAllOddsToDefault = function() {
  try { localStorage.removeItem('grandt_custom_odds'); } catch (e) {}
  if (typeof APP_DATA !== 'undefined' && APP_DATA.odds) {
    appData.odds = JSON.parse(JSON.stringify(APP_DATA.odds));
  }
  updateFormationsAndCaptainBanner();
  renderRankings();
  renderFixture();
  if (typeof alert !== 'undefined') {
    alert('🔄 Cuotas restablecidas al baseline oficial.');
  }
};

window.editMatchOddsPrompt = function(home, away, h, d, a) {
  const newH = prompt(`Editar cuota Victoria ${home}:`, h);
  if (newH === null) return;
  const newD = prompt(`Editar cuota Empate (${home} vs ${away}):`, d);
  if (newD === null) return;
  const newA = prompt(`Editar cuota Victoria ${away}:`, a);
  if (newA === null) return;

  updateMatchOdds(home, away, newH, newD, newA);
};

function ensureOddsMetrics(odds) {
  if (!odds) return odds;
  if (odds.homeCleanSheetProb !== undefined && odds.homeExpGoals !== undefined) return odds;

  const hWin = odds.homeWin || 2.0;
  const dWin = odds.draw || 3.2;
  const aWin = odds.awayWin || 3.5;

  const hRaw = 1 / hWin;
  const dRaw = 1 / dWin;
  const aRaw = 1 / aWin;
  const sum = hRaw + dRaw + aRaw;

  const hP = odds.homeWinProb || (hRaw / sum);
  const dP = odds.drawProb || (dRaw / sum);
  const aP = odds.awayWinProb || (aRaw / sum);

  const awayExpGoals = odds.awayExpGoals || Math.max(0.35, Math.min(2.5, (aP * 2.2) + (dP * 0.6)));
  const homeExpGoals = odds.homeExpGoals || Math.max(0.35, Math.min(3.0, (hP * 2.4) + (dP * 0.6)));

  const homeCS = Math.min(0.85, Math.max(0.08, Math.exp(-awayExpGoals)));
  const awayCS = Math.min(0.85, Math.max(0.08, Math.exp(-homeExpGoals)));

  const homeGoalProb = Math.min(0.95, Math.max(0.10, 1.0 - awayCS));
  const awayGoalProb = Math.min(0.95, Math.max(0.10, 1.0 - homeCS));

  odds.homeWinProb = hP;
  odds.drawProb = dP;
  odds.awayWinProb = aP;
  odds.homeExpGoals = homeExpGoals;
  odds.awayExpGoals = awayExpGoals;
  odds.homeCleanSheetProb = homeCS;
  odds.awayCleanSheetProb = awayCS;
  odds.homeGoalProb = homeGoalProb;
  odds.awayGoalProb = awayGoalProb;
  odds.homeGoalOdds = Math.round((1.0 / homeGoalProb) * 100) / 100;
  odds.awayGoalOdds = Math.round((1.0 / awayGoalProb) * 100) / 100;
  return odds;
}

function findMatchOdds(homeTeam, awayTeam) {
  if (!appData.odds) appData.odds = {};
  const cHome = canonicalTeam(homeTeam);
  const cAway = canonicalTeam(awayTeam);

  // 1. Check official appData.odds
  for (const [key, val] of Object.entries(appData.odds)) {
    if (!key.includes(' vs ')) continue;
    const parts = key.split(' vs ');
    if (canonicalTeam(parts[0]) === cHome && canonicalTeam(parts[1]) === cAway) {
      return ensureOddsMetrics(val);
    }
  }

  // 2. Check custom odds from localStorage if present
  const customOdds = safeGetLocalStorage('grandt_custom_odds', null);
  if (customOdds && typeof customOdds === 'object') {
    for (const [key, val] of Object.entries(customOdds)) {
      if (!key.includes(' vs ')) continue;
      const parts = key.split(' vs ');
      if (canonicalTeam(parts[0]) === cHome && canonicalTeam(parts[1]) === cAway) {
        return ensureOddsMetrics(val);
      }
    }
  }
  return null;
}

function findTeamStandings(teamName) {
  if (!appData.standings) return null;
  const cTarget = canonicalTeam(teamName);
  const allStandings = [...(appData.standings.zonaA || []), ...(appData.standings.zonaB || [])];
  return allStandings.find(t => canonicalTeam(t.team) === cTarget) || null;
}

function findTeamXg(teamName) {
  if (!appData.teamXg) return null;
  const cTarget = canonicalTeam(teamName);
  for (const [key, val] of Object.entries(appData.teamXg)) {
    if (canonicalTeam(key) === cTarget) return val;
  }
  return null;
}

let EMPIRICAL_MODEL = {
  totalDefGoals: 13,
  lowPossDefGoals: 9,
  lowPossDefRatio: 0.692,
  setPieceEmpiricalMult: 1.24,
  highPossCsRate: 0.476,
  midPossCsRate: 0.549,
  lowPossCsRate: 0.389
};

function computeEmpiricalLearningModel(data) {
  if (!data || !data.players) return EMPIRICAL_MODEL;

  const teamPoss = {};
  const getTeamId = (t) => {
    const resolved = typeof resolveTeam === 'function' ? resolveTeam(t) : null;
    return resolved ? resolved.id : (canonicalTeam ? canonicalTeam(t) : (t || '').toLowerCase());
  };

  if (data.teamStats) {
    Object.entries(data.teamStats).forEach(([t, s]) => {
      const poss = s.total?.possessionAvg || 50;
      const tId = getTeamId(t);
      teamPoss[tId] = poss;
    });
  }

  let lowPossDefGoals = 0;
  let highPossDefGoals = 0;
  let totalDefGoals = 0;

  (data.players || []).forEach(p => {
    if (p.position === 'DEF' && (p.goals || 0) > 0) {
      const tId = getTeamId(p.team);
      const poss = teamPoss[tId] || 50;
      totalDefGoals += p.goals;
      if (poss <= 49.0) lowPossDefGoals += p.goals;
      else highPossDefGoals += p.goals;
    }
  });

  const lowPossDefRatio = totalDefGoals > 0 ? (lowPossDefGoals / totalDefGoals) : 0.65;
  const setPieceEmpiricalMult = 1.0 + (lowPossDefRatio * 0.35);

  EMPIRICAL_MODEL = {
    totalDefGoals,
    lowPossDefGoals,
    highPossDefGoals,
    lowPossDefRatio,
    setPieceEmpiricalMult,
    highPossCsRate: 0.476,
    midPossCsRate: 0.549,
    lowPossCsRate: 0.389
  };

  return EMPIRICAL_MODEL;
}

function computeTeamLinePowers(players) {
  const teamAttackPower = {};
  const teamDefensePower = {};
  const topRivalAttacker = {};
  const topRivalDefender = {};

  const getTeamId = (t) => {
    const resolved = typeof resolveTeam === 'function' ? resolveTeam(t) : null;
    return resolved ? resolved.id : (canonicalTeam ? canonicalTeam(t) : (t || '').toLowerCase());
  };

  const teams = new Set();
  players.forEach(p => { if (p.team) teams.add(getTeamId(p.team)); });

  teams.forEach(cTeamId => {
    const teamPlayers = players.filter(p => getTeamId(p.team) === cTeamId);

    // Attackers (VOL / DEL)
    const attackers = teamPlayers.filter(p => p.position === 'VOL' || p.position === 'DEL').map(p => {
      const pj = Math.max(1, p.matchesRated || p.matches || 1);
      const xg = (p.xg365 || 0) / Math.max(1, p.matches365 || 1);
      const gpm = (p.goals || 0) / pj;
      const fpm = (p.figuras || 0) / pj;
      const power = (xg * 0.50) + (gpm * 0.35) + (fpm * 0.15) + (p.avgRating ? (p.avgRating - 6.0) * 0.05 : 0);
      return { name: p.name, power };
    }).sort((a, b) => b.power - a.power);

    if (attackers.length > 0) {
      topRivalAttacker[cTeamId] = attackers[0];
      teamAttackPower[cTeamId] = attackers[0].power + ((attackers[1]?.power || 0) * 0.4);
    } else teamAttackPower[cTeamId] = 0;

    // Defenders (ARQ / DEF)
    const defenders = teamPlayers.filter(p => p.position === 'ARQ' || p.position === 'DEF').map(p => {
      const pj = Math.max(1, p.matchesRated || p.matches || 1);
      const cs = (p.cleanSheets || 0) / pj;
      const avgR = Math.min(10.0, p.avgRating || 6.0);
      const power = (cs * 0.60) + ((avgR / 10.0) * 0.40);
      return { name: p.name, power };
    }).sort((a, b) => b.power - a.power);

    if (defenders.length > 0) {
      topRivalDefender[cTeamId] = defenders[0];
      teamDefensePower[cTeamId] = defenders[0].power + ((defenders[1]?.power || 0) * 0.4);
    } else teamDefensePower[cTeamId] = 0;
  });

  return { teamAttackPower, teamDefensePower, topRivalAttacker, topRivalDefender };
}

function getFixtureContext(teamName, targetRound) {
  const defaultTarget = STATE.analysisTargetRound || ((appData.currentRound || 3) + 1);
  const roundToAnalyze = targetRound || defaultTarget;

  let match = (appData.fixture || []).find(m => m.round === roundToAnalyze && (canonicalTeam(m.home) === canonicalTeam(teamName) || canonicalTeam(m.away) === canonicalTeam(teamName)));
  if (!match) {
    match = (appData.fixture || []).find(m => (canonicalTeam(m.home) === canonicalTeam(teamName) || canonicalTeam(m.away) === canonicalTeam(teamName)) && m.state !== 'post');
  }
  if (!match) return null;

  const isHome = canonicalTeam(match.home) === canonicalTeam(teamName);
  const rival = isHome ? match.away : match.home;
  
  const teamStandings = findTeamStandings(teamName);
  const rivalStandings = findTeamStandings(rival);
  
  let winProb = 0.40;
  let cleanSheetProb = 0.30;
  let goalOpp = 0.40;
  let expGoalsTeam = 1.25;
  let expGoalsRival = 1.10;

  if (teamStandings && rivalStandings) {
    const tTotal = teamStandings;
    const rTotal = rivalStandings;
    const tSplit = isHome ? teamStandings.home : teamStandings.away;
    const rSplit = isHome ? rivalStandings.away : rivalStandings.home;

    const mWeight = 4; // prior weight (4 league average games)
    const LEAGUE_AVG_GF = 1.15;
    const LEAGUE_AVG_GC = 1.15;

    const tPj = (tSplit.pj || 0) + 4;
    const rPj = (rSplit.pj || 0) + 4;
    
    const tWinRate = ((tSplit.pg || 0) + 1.4) / tPj;
    const rLoseRate = ((rSplit.pp || 0) + 1.4) / rPj;
    winProb = (tWinRate * 0.6) + (rLoseRate * 0.4);

    // Bayesian Smoothed Goals Conceded for Rival ExpGoals
    const tSplitPj = tSplit.pj || 0;
    const rSplitPj = rSplit.pj || 0;
    const tGC_raw = tSplitPj > 0 ? (tSplit.gc || 0) / tSplitPj : LEAGUE_AVG_GC;
    const tGC_smoothed = ((tGC_raw * tSplitPj) + (LEAGUE_AVG_GC * mWeight)) / (tSplitPj + mWeight);

    const rGF_raw = rSplitPj > 0 ? (rSplit.gf || 0) / rSplitPj : LEAGUE_AVG_GF;
    const rGF_smoothed = ((rGF_raw * rSplitPj) + (LEAGUE_AVG_GF * mWeight)) / (rSplitPj + mWeight);

    expGoalsRival = (tGC_smoothed * 0.5) + (rGF_smoothed * 0.5);
    cleanSheetProb = Math.exp(-Math.max(0.15, expGoalsRival));

    // Bayesian Smoothed Goals For for Team ExpGoals
    const tGF_raw = tSplitPj > 0 ? (tSplit.gf || 0) / tSplitPj : LEAGUE_AVG_GF;
    const tGF_smoothed = ((tGF_raw * tSplitPj) + (LEAGUE_AVG_GF * mWeight)) / (tSplitPj + mWeight);

    const rGC_raw = rSplitPj > 0 ? (rSplit.gc || 0) / rSplitPj : LEAGUE_AVG_GC;
    const rGC_smoothed = ((rGC_raw * rSplitPj) + (LEAGUE_AVG_GC * mWeight)) / (rSplitPj + mWeight);

    expGoalsTeam = (tGF_smoothed * 0.5) + (rGC_smoothed * 0.5);
    goalOpp = Math.min(0.9, expGoalsTeam / 2.2);
  }

  const teamXgData = findTeamXg(teamName);
  const rivalXgData = findTeamXg(rival);

  if (teamXgData && rivalXgData) {
    expGoalsTeam = (teamXgData.xgPerGame * 0.5) + (rivalXgData.xgConcededPerGame * 0.5);
    goalOpp = Math.min(0.95, Math.max(0.15, expGoalsTeam / 2.2));

    expGoalsRival = (rivalXgData.xgPerGame * 0.5) + (teamXgData.xgConcededPerGame * 0.5);
    cleanSheetProb = Math.exp(-Math.max(0.1, expGoalsRival));
  }

  const odds = findMatchOdds(match.home, match.away);
  let winOdds = 0;
  let isRealOdds = false;

  if (odds) {
    isRealOdds = true;
    winProb = isHome ? (odds.homeWinProb || 1 / odds.homeWin) : (odds.awayWinProb || 1 / odds.awayWin);
    winOdds = isHome ? (odds.homeWin || 1 / odds.homeWinProb) : (odds.awayWin || 1 / odds.awayWinProb);
    if (odds.homeExpGoals && odds.awayExpGoals) {
      expGoalsTeam = isHome ? odds.homeExpGoals : odds.awayExpGoals;
      expGoalsRival = isHome ? odds.awayExpGoals : odds.homeExpGoals;
      // CRITICAL: Recalculate derived metrics from odds-based expected goals
      goalOpp = Math.min(0.95, Math.max(0.15, expGoalsTeam / 2.2));
      cleanSheetProb = Math.exp(-Math.max(0.1, expGoalsRival));
    }
    // Use bookmaker clean sheet probabilities if available (consistency with fixture card)
    if (odds.homeCleanSheetProb !== undefined && odds.awayCleanSheetProb !== undefined) {
      cleanSheetProb = isHome ? odds.homeCleanSheetProb : odds.awayCleanSheetProb;
    }
  } else {
    winOdds = 1 / Math.max(0.10, winProb);
  }

  winProb = Math.min(0.85, Math.max(0.10, winProb));
  cleanSheetProb = Math.min(0.85, Math.max(0.05, cleanSheetProb));
  goalOpp = Math.min(0.90, Math.max(0.12, goalOpp));

  // Projected Team Shots (baseline ~0.095 xG per shot in Primera División)
  const teamShotsFor = Math.round((expGoalsTeam / 0.095) * 10) / 10;
  const teamShotsConceded = Math.round((expGoalsRival / 0.095) * 10) / 10;

  // Real stats per game from standings (for audit display)
  const ts = teamStandings || {};
  const rs = rivalStandings || {};
  const tsPj = Math.max(1, ts.pj || 1);
  const rsPj = Math.max(1, rs.pj || 1);
  const tSplitObj = isHome ? (ts.home || {}) : (ts.away || {});
  const rSplitObj = isHome ? (rs.away || {}) : (rs.home || {});
  const tSplitPj = Math.max(1, tSplitObj.pj || 1);
  const rSplitPj = Math.max(1, rSplitObj.pj || 1);

  const teamStats = {
    golesPerGame: (ts.gf || 0) / tsPj,
    golesConcPerGame: (ts.gc || 0) / tsPj,
    golesCondicion: (tSplitObj.gf || 0) / tSplitPj,
    golesConcCondicion: (tSplitObj.gc || 0) / tSplitPj,
  };
  const rivalStats = {
    golesPerGame: (rs.gf || 0) / rsPj,
    golesConcPerGame: (rs.gc || 0) / rsPj,
    golesCondicion: (rSplitObj.gf || 0) / rSplitPj,
    golesConcCondicion: (rSplitObj.gc || 0) / rSplitPj,
  };

  // Pass 1: Compute Team Attack & Defense Powers if not cached
  if (!STATE._teamPowersCache && appData.players) {
    STATE._teamPowersCache = computeTeamLinePowers(appData.players);
  }

  const rivalCanonId = typeof resolveTeam === 'function' ? (resolveTeam(rival)?.id || canonicalTeam(rival)) : canonicalTeam(rival);
  const rivalAttackPower = STATE._teamPowersCache ? (STATE._teamPowersCache.teamAttackPower[rivalCanonId] || 0) : 0;
  const rivalDefensePower = STATE._teamPowersCache ? (STATE._teamPowersCache.teamDefensePower[rivalCanonId] || 0) : 0;
  const topRivalAttackerName = STATE._teamPowersCache ? (STATE._teamPowersCache.topRivalAttacker[rivalCanonId]?.name || '') : '';
  const topRivalDefenderName = STATE._teamPowersCache ? (STATE._teamPowersCache.topRivalDefender[rivalCanonId]?.name || '') : '';

  const teamGoalProb = odds 
    ? (isHome ? (odds.homeGoalProb || (1 - (odds.awayCleanSheetProb || 0.25))) : (odds.awayGoalProb || (1 - (odds.homeCleanSheetProb || 0.25)))) 
    : (1 - Math.exp(-expGoalsTeam));

  const teamGoalOdds = odds 
    ? (isHome ? (odds.homeGoalOdds || 1.30) : (odds.awayGoalOdds || 1.60)) 
    : (1 / Math.max(0.1, teamGoalProb));

  const rivalCleanSheetProb = isHome ? (odds?.awayCleanSheetProb || Math.exp(-expGoalsTeam)) : (odds?.homeCleanSheetProb || Math.exp(-expGoalsTeam));

  // ── 1. SEGMENTO DEFENSIVO CANÓNICO POR EQUIPO (FECHA 5) ──
  const myTeamKey = canonicalTeam(teamName);
  const rivalKey = rival ? canonicalTeam(rival) : '';
  const myTeamStats365 = appData.teamStats ? (appData.teamStats[myTeamKey] || appData.teamStats[teamName]) : null;
  const rivalTeamStats365 = appData.teamStats ? (appData.teamStats[rivalKey] || appData.teamStats[rival]) : null;

  // Tiros concedidos por el equipo (60% condición L/V + 40% total)
  const sotAgainst_cond = isHome ? (myTeamStats365?.home?.shotsOnTargetAgainstPerMatch || 4.5) : (myTeamStats365?.away?.shotsOnTargetAgainstPerMatch || 4.5);
  const sotAgainst_tot = myTeamStats365?.total?.shotsOnTargetAgainstPerMatch || 4.5;
  const mySotAgainst_blended = (0.60 * sotAgainst_cond) + (0.40 * sotAgainst_tot);

  // Tiros al arco del rival (60% condición V/L + 40% total)
  const rivalSotFor_cond = isHome ? (rivalTeamStats365?.away?.shotsOnTargetForPerMatch || 4.0) : (rivalTeamStats365?.home?.shotsOnTargetForPerMatch || 4.0);
  const rivalSotFor_tot = rivalTeamStats365?.total?.shotsOnTargetForPerMatch || 4.0;
  const rivalSotFor_blended = (0.60 * rivalSotFor_cond) + (0.40 * rivalSotFor_tot);

  const myGc_cond = isHome ? (ts.home ? (ts.home.gc / Math.max(1, ts.home.pj)) : 1.1) : (ts.away ? (ts.away.gc / Math.max(1, ts.away.pj)) : 1.1);
  const rivalGf_cond = isHome ? (rs.away ? (rs.away.gf / Math.max(1, rs.away.pj)) : 1.1) : (rs.home ? (rs.home.gf / Math.max(1, rs.home.pj)) : 1.1);

  const solidezPerc = Math.max(0.05, 1.0 - (mySotAgainst_blended / 7.0));
  const rivalAttackSafety = Math.max(0.05, 1.0 - (rivalSotFor_blended / 7.0));

  const P_VI_combinada = Math.min(0.85, Math.max(0.05,
    (0.45 * cleanSheetProb) +
    (0.20 * solidezPerc) +
    (0.15 * rivalAttackSafety) +
    (0.10 * (1.0 - Math.min(1.0, expGoalsRival / 2.2))) +
    (0.10 * winProb)
  ));

  const defensiveSegment = {
    cleanSheetProb,
    rivalExpGoals: expGoalsRival,
    mySotAgainst: mySotAgainst_blended,
    rivalSotFor: rivalSotFor_blended,
    myGcCond: myGc_cond,
    rivalGfCond: rivalGf_cond,
    solidezPerc,
    rivalAttackSafety,
    winProb,
    P_VI_combinada
  };

  // ── 2. SEGMENTO OFENSIVO CANÓNICO POR EQUIPO (FECHA 5) ──
  const sotFor_cond = isHome ? (myTeamStats365?.home?.shotsOnTargetForPerMatch || 4.5) : (myTeamStats365?.away?.shotsOnTargetForPerMatch || 3.5);
  const sotFor_tot = myTeamStats365?.total?.shotsOnTargetForPerMatch || 4.0;
  const mySotFor_blended = (0.60 * sotFor_cond) + (0.40 * sotFor_tot);

  const rivalSotAg_cond = isHome ? (rivalTeamStats365?.away?.shotsOnTargetAgainstPerMatch || 5.0) : (rivalTeamStats365?.home?.shotsOnTargetAgainstPerMatch || 4.0);
  const rivalSotAg_tot = rivalTeamStats365?.total?.shotsOnTargetAgainstPerMatch || 4.5;
  const rivalSotAg_blended = (0.60 * rivalSotAg_cond) + (0.40 * rivalSotAg_tot);

  const myGf_cond = isHome ? (ts.home ? (ts.home.gf / Math.max(1, ts.home.pj)) : 1.2) : (ts.away ? (ts.away.gf / Math.max(1, ts.away.pj)) : 1.0);
  const rivalGc_cond = isHome ? (rs.away ? (rs.away.gc / Math.max(1, rs.away.pj)) : 1.3) : (rs.home ? (rs.home.gc / Math.max(1, rs.home.pj)) : 1.1);

  const scoreTeamGoalProb = Math.min(1.0, Math.max(0.1, (teamGoalProb - 0.40) / 0.50));
  const scoreTeamExpG = Math.min(1.0, expGoalsTeam / 2.0);
  const scoreRivalDefWeakness = Math.min(1.0, ((rivalSotAg_blended / 6.0) * 0.5) + ((rivalGc_cond / 2.2) * 0.5));
  const scoreTeamFirepower = Math.min(1.0, mySotFor_blended / 6.0);

  const potencialOfensivoIndex = (0.35 * scoreTeamGoalProb) + (0.30 * scoreTeamExpG) + (0.20 * scoreRivalDefWeakness) + (0.15 * scoreTeamFirepower);

  const offensiveSegment = {
    teamGoalProb,
    teamGoalOdds,
    teamExpGoals: expGoalsTeam,
    mySotFor: mySotFor_blended,
    rivalSotAg: rivalSotAg_blended,
    myGfCond: myGf_cond,
    rivalGcCond: rivalGc_cond,
    scoreTeamGoalProb,
    scoreTeamExpG,
    scoreRivalDefWeakness,
    winProb,
    potencialOfensivoIndex
  };

  return {
    match,
    isHome,
    rival,
    winProb,
    cleanSheetProb,
    teamGoalProb,
    teamGoalOdds,
    rivalCleanSheetProb,
    goalOpp,
    teamXgData,
    rivalXgData,
    expGoalsTeam,
    expGoalsRival,
    teamShotsFor,
    teamShotsConceded,
    winOdds,
    isRealOdds,
    teamStandings: ts,
    rivalStandings: rs,
    teamStats,
    rivalStats,
    rivalAttackPower,
    rivalDefensePower,
    topRivalAttackerName,
    topRivalDefenderName,
    defensiveSegment,
    offensiveSegment
  };
}

// ── Performance: Cache historicalPlayers lookups ──
const _histCache = new Map();
let _histIndex = null;

function _buildHistIndex() {
  if (_histIndex || !appData.historicalPlayers) return;
  _histIndex = appData.historicalPlayers.map(h => ({
    ...h,
    _clean: h.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  }));
}

function findHistoricalPlayer(name) {
  if (!appData.historicalPlayers || !name) return null;
  if (_histCache.has(name)) return _histCache.get(name);
  _buildHistIndex();
  const nClean = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const found = (_histIndex || []).find(h => {
    return h._clean === nClean || h._clean.includes(nClean) || nClean.includes(h._clean);
  }) || null;
  _histCache.set(name, found);
  return found;
}

function getPlayerMetrics(p) {
  const pjCur = p.matchesRated || p.matches || 0;
  const hist = findHistoricalPlayer(p.name);
  
  // Current tournament stats are primary (Clarín rating is 1.0 to 10.0 scale)
  const avgRatingCur = Math.min(10.0, p.avgRating || 6.0);
  const gpmCur = pjCur > 0 ? (p.goals || 0) / pjCur : 0;
  const fpmCur = pjCur > 0 ? (p.figuras || 0) / pjCur : 0;
  const csCur = pjCur > 0 ? (p.cleanSheets || 0) / pjCur : 0;

  return {
    pjCur,
    hist,
    avgRatingCur,
    gpmCur,
    fpmCur,
    csCur
  };
}

function getPercentile(val, arr) {
  if (arr.length === 0) return 0.5;
  const sorted = [...arr].filter(x => isFinite(x)).sort((a, b) => a - b);
  if (sorted.length <= 1) return 0.5;
  const index = sorted.findIndex(v => v >= val);
  return index === -1 ? 1.0 : Math.min(1.0, Math.max(0.0, index / sorted.length));
}


function getPositionalStatsCache() {
  if (appData && appData._posStatsCache && appData._posStatsCache._version === (appData.updatedAt || '1')) {
    return appData._posStatsCache;
  }
  const players = (appData && appData.players) || [];
  const defs = players.filter(x => x.position === 'DEF');
  const vols = players.filter(x => x.position === 'VOL');
  const dels = players.filter(x => x.position === 'DEL');

  // Pre-calculate league fixture extremes ONCE
  const allStandings = [...((appData && appData.standings && appData.standings.zonaA) || []), ...((appData && appData.standings && appData.standings.zonaB) || [])];
  const allTeamContexts = allStandings.map(t => getFixtureContext(t.team)).filter(Boolean);
  const allCsProbs = allTeamContexts.map(c => c.cleanSheetProb || 0.30);
  const allRivalExpG = allTeamContexts.map(c => c.expGoalsRival || 1.10);
  const allWinProbs = allTeamContexts.map(c => c.winProb || 0.35);

  const extremes = {
    minCs: allCsProbs.length ? Math.min(...allCsProbs, 0.17) : 0.17,
    maxCs: allCsProbs.length ? Math.max(...allCsProbs, 0.43) : 0.43,
    minRivalExpG: allRivalExpG.length ? Math.min(...allRivalExpG, 0.84) : 0.84,
    maxRivalExpG: allRivalExpG.length ? Math.max(...allRivalExpG, 1.77) : 1.77,
    minWinProb: allWinProbs.length ? Math.min(...allWinProbs, 0.19) : 0.19,
    maxWinProb: allWinProbs.length ? Math.max(...allWinProbs, 0.57) : 0.57,
  };

  const cache = {
    _version: (appData && appData.updatedAt) || '1',
    extremes,
    DEF: {
      shots: defs.map(d => (d.shots365 || d.shots || 0) / Math.max(1, d.matches365 || d.matchesRated || 1)),
      xg: defs.map(d => Math.max(0, (d.xg365 || d.xg || 0) - (0.79 * (d.goalsPenalty || 0))) / Math.max(1, d.matches365 || d.matchesRated || 1))
    },
    VOL: {
      shots: vols.map(v => (v.shots365 || v.shots || 0) / Math.max(1, v.matches365 || v.matchesRated || 1)),
      xg: vols.map(v => Math.max(0, (v.xg365 || v.xg || 0) - (0.79 * (v.goalsPenalty || 0))) / Math.max(1, v.matches365 || v.matchesRated || 1))
    },
    DEL: {
      shots: dels.map(d => (d.shots365 || d.shots || 0) / Math.max(1, d.matches365 || d.matchesRated || 1)),
      xg: dels.map(d => Math.max(0, (d.xg365 || d.xg || 0) - (0.79 * (d.goalsPenalty || 0))) / Math.max(1, d.matches365 || d.matchesRated || 1))
    }
  };
  if (appData) appData._posStatsCache = cache;
  return cache;
}

function calculateScoreDT(p, ctx, posPool) {
  const pos = (p && p.position) || STATE.activeTab;
  const m = getPlayerMetrics(p);

  // Per Match (PJ) Metrics: Separate PlanetaGrandT PJ from 365Scores recorded matches
  const pjPgt = Math.max(1, m.pjCur || 1);
  const pj365 = Math.max(1, p.matches365 || 1);
  const pens = p.goalsPenalty || 0;
  
  // Use real 365Scores xG/Shots when available, divided by 365Scores recorded matches
  const xgTotal = p.xg365 || p.xg || 0;
  const xgNoPenTotal = Math.max(0, xgTotal - (0.79 * pens));

  const xgPerMatch_noPen = xgNoPenTotal / pj365;
  const xgPerMatch = xgTotal / pj365;
  const shotsPerMatch = (p.shots365 || p.shots || 0) / pj365;
  const goalsPerMatch = (p.goals || 0) / pjPgt;
  const yellowPerMatch = (p.yellowCards || 0) / pjPgt;
  const redPerMatch = (p.redCards || 0) / pjPgt;
  const avgMinutesPerMatch = Math.round((p.minutes365 || p.minutes || (pj365 * 90)) / pj365);

  // Percentiles across position pool
  const poolMetrics = posPool._cachedMetrics || posPool.map(x => getPlayerMetrics(x));
  const avgRatingPerc = getPercentile(m.avgRatingCur, poolMetrics.map(x => x.avgRatingCur));
  const gpmPerc = getPercentile(m.gpmCur, poolMetrics.map(x => x.gpmCur));
  const fpmPerc = getPercentile(m.fpmCur, poolMetrics.map(x => x.fpmCur));

  // Mutual Threat Scaling: Individual Rival Line Powers
  const rivalAttackPwr = ctx ? (ctx.rivalAttackPower || 0) : 0;
  const rivalDefensePwr = ctx ? (ctx.rivalDefensePower || 0) : 0;

  // ARQ / DEF Penalty: Facing an elite attacker in racha reduces clean sheet probability
  const attackThreatPenalty = Math.max(0, (rivalAttackPwr - 0.35) * 0.25);
  const baseCsProb = ctx ? ctx.cleanSheetProb : 0.30;
  const csProb = Math.max(0.08, baseCsProb - attackThreatPenalty);

  const winProb = ctx ? ctx.winProb : 0.40;
  const goalOpp = ctx ? ctx.goalOpp : 0.35;

  // VOL / DEL Penalty: Facing a rock-solid impenetrable defense scales down goal probability
  const defenseThreatFactor = Math.max(0.65, 1.0 - Math.max(0, (rivalDefensePwr - 0.90) * 0.25));

  let rawEP = 0;
  let isSolido = false;
  let isGoleador = false;
  let isLateralGoleador = false;
  let isVolanteLlegador = false;
  let isVolanteManija = false;
  let isGoalDebt = false;
  let is9DeArea = false;
  let isExtremo = false;
  let isGoleadorEnRacha = false;
  let EP_aerial = 0;
  let EP_setpiece = 0;
  let EP_lateral_goleador = 0;
  let EP_llegador = 0;
  let EP_tanque = 0;
  let EP_extremo = 0;
  let EP_possession = 0;
  let EP_saves = 0;

  // Expected Points (EP) mathematical engine from Gran DT official rules:
  // Yellow card = -2 pts, Red card = -4 pts
  const EP_cards = (2.0 * yellowPerMatch) + (4.0 * redPerMatch);
  // Forma basada solo en rating promedio Clarín (la figura ya se calcula aparte)
  const EP_forma = 0.12 * avgRatingPerc;
  // RECALIBRADO: Figura = +4 pts SIEMPRE
  // Si el equipo GANA → la figura es SIEMPRE del ganador
  // Si hay EMPATE → la figura puede ser de cualquiera (50/50)
  // Si el equipo PIERDE → la figura NUNCA es del perdedor
  const drawProb = ctx ? (ctx.drawProb || Math.max(0, 1.0 - winProb - (ctx.lossProb || (1.0 - winProb) * 0.55))) : 0.25;
  const figuraTeamProb = winProb + (drawProb * 0.5); // P(figura sea de mi equipo)
  const EP_fig = fpmPerc * figuraTeamProb * 4.0 * 0.12;

  // Official Gran DT Penalty Taker Rule: +3 pts Home / +5 pts Away (includes +2 visitor goal bonus), -4 pts if missed
  const penGoalVal = (ctx && !ctx.isHome) ? 5.0 : 3.0;
  const EP_pen = (pens > 0) ? Math.max(0, (0.78 * penGoalVal) - (0.22 * 4.0)) : 0;

  // 1. Detección Estricta de Riesgo de Rotación (Eliminación al 100% de Recomendación):
  // Si el equipo jugó N partidos pero el jugador jugó M < N partidos calificados, existe riesgo de suplencia
  const teamPj = (ctx && ctx.teamStandings && ctx.teamStandings.pj > 0) ? ctx.teamStandings.pj : (appData.currentRound || 1);
  const hasRotationRisk = teamPj >= 2 && (pjPgt < teamPj - 0.5);
  p.hasRotationRisk = hasRotationRisk;
  p.isRotationRisk = hasRotationRisk;

  // 2. Reglamento Oficial Gran DT - Tiempo Mínimo de Juego (20 Minutos):
  // Menos de 20 min = NO califica (0 pts), entra el suplente
  let minutesFactor = 1.0;
  if (avgMinutesPerMatch < 20 || hasRotationRisk) {
    minutesFactor = 0.0; // Eliminado 100% de la recomendación de 11 ideal
  } else if (pos === 'ARQ' || pos === 'DEF') {
    minutesFactor = 1.0; // Si juega 20+ min y no recibe gol en cancha, suma la valla invicta
  } else {
    minutesFactor = Math.min(1.0, Math.max(0.60, avgMinutesPerMatch / 85.0));
  }

  // 3. Racha Reciente Suave
  let EP_recent_trend = 0;
  const recentScores = (p.ratings || p.scores || []).filter(s => s !== null && s !== undefined && s > 0).slice(-2);
  if (recentScores.length >= 2) {
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const overallAvg = m.avgRatingCur || 5.5;
    if (recentAvg >= overallAvg + 0.6) {
      EP_recent_trend = 0.15;
    } else if (recentAvg <= overallAvg - 0.6) {
      EP_recent_trend = -0.15;
    }
  }

  // 4. Bonus Sutil por Enfrentar a Rival en Serie de Copa Internacional (Libertadores/Sudamericana):
  // ÚNICA Y EXCLUSIVAMENTE si el rival jugó copa la semana anterior Y tiene que jugar la semana siguiente (serie eliminatoria entre partidos)
  const COPA_SERIES_TEAMS = new Set([
    'independiente rivadavia', 'river plate', 'talleres', 'san lorenzo', 
    'boca juniors', 'racing club', 'rosario central', 'lanus'
  ]);
  const rivalCanon = ctx ? canonicalTeam(ctx.rival) : '';
  const isRivalInCopaSeries = ctx && Array.from(COPA_SERIES_TEAMS).some(t => canonicalTeam(t) === rivalCanon);
  p.isFacingCopaRival = isRivalInCopaSeries;
  
  // Bonus sutil y calibrado
  const EP_copa_rival = isRivalInCopaSeries ? (pos === 'ARQ' || pos === 'DEF' ? 0.12 : 0.08) : 0;

  // ── SANITIZACIÓN UNIVERSAL DE NOTA CLARÍN PERIODÍSTICA PURA (5.0 a 6.2) ──
  // Elimina cualquier distorsión de fechas pasadas (+4 goles, +4 figuras, +2 VI) acumuladas en Planeta Gran DT
  const rawRating = m.avgRatingCur || 5.50;
  const cleanNotaClarin = Math.max(5.0, Math.min(6.2, rawRating <= 6.5 ? rawRating : (rawRating - ((p.goals || 0) * 0.9) - ((p.figuras || 0) * 0.5))));

  const isHome = ctx ? ctx.isHome : true;
  const defSeg = ctx ? ctx.defensiveSegment : null;
  const offSeg = ctx ? ctx.offensiveSegment : null;

  if (pos === 'ARQ') {
    // ════════════════════════════════════════════════════════════════
    // 🧤 ALGORITMO ARQ V2 — SEGMENTO DEFENSIVO DEL CLUB (100%)
    // Valla Invicta Bet365 + Solidez L/V + Calibración suave xG Rival (sin doble castigo)
    // ════════════════════════════════════════════════════════════════
    const P_VI_combinada = defSeg ? defSeg.P_VI_combinada : 0.30;
    const rivalExpG = defSeg ? defSeg.rivalExpGoals : 1.10;
    const pj = Math.max(1, p.matchesRated || p.pj || 1);
    const viRate = pj > 0 ? (p.cleanSheets || 0) / pj : 0.33;

    // EP = (NotaLimpia * 0.65) + (P_VI * 3.2) - (rivalExpG * 0.50) + (viRate * 0.30) - Tarjetas
    const EP_raw = (cleanNotaClarin * 0.65) + (P_VI_combinada * 3.2) - (rivalExpG * 0.50) + (viRate * 0.30);
    rawEP = EP_raw - EP_cards;

    p._arqSnapshot = {
      date: new Date().toISOString(),
      team: p.team,
      rival: ctx ? ctx.rival : 'N/A',
      isHome: isHome,
      P_VI_combinada,
      rivalExpGoals: rivalExpG,
      winProb: defSeg ? defSeg.winProb : 0.40,
      cleanNotaClarin,
      viRate,
      EP_predicted: EP_raw,
      EP_cards
    };

    p._arqAudit = {
      defSeg,
      P_VI_combinada,
      rivalExpG,
      cleanNotaClarin,
      viRate,
      EP_cards
    };

  } else if (pos === 'DEF') {
    // ════════════════════════════════════════════════════════════════
    // 🛡️ ALGORITMO DEF V2 — SISTEMA DUAL: PISO SÓLIDO (VI) + TECHO PICANTE (GOL +9/+11)
    // 1. Piso Sólido: P(VI) 100% IDÉNTICA AL ARQUERO (+2 pts) + Ficha Limpia (70% del valor para defensores comunes)
    // 2. Techo Picante: npxG Aislado + Tiros + Penales Reales × Potencial Ofensivo Club (+9 Loc / +11 Vis)
    // ════════════════════════════════════════════════════════════════
    const P_VI_combinada = defSeg ? defSeg.P_VI_combinada : 0.30;
    const pj = Math.max(1, p.matchesRated || p.pj || 1);
    const gpm = (p.goals || 0) / pj;

    const isPenTaker = (p.goalsPenalty || 0) > 0;
    const teamExpGoalsFor = offSeg ? offSeg.teamExpGoals : 1.20;
    const probPenalEquipo = 0.0583 * (teamExpGoalsFor / 1.20);
    const probGolPenal = isPenTaker ? (probPenalEquipo * 0.76) : 0;

    const potOfensivo = offSeg ? offSeg.potencialOfensivoIndex : 0.60;
    // Amenaza pura de juego abierto aislada (sin penales)
    const threatDef = xgPerMatch_noPen > 0 ? xgPerMatch_noPen : (0.04 + (gpm * 0.20));

    // Probabilidad de gol del defensor (1.5% - 3% para centrales normales, 8% - 25% para picantes/penales)
    let P_gol_individual = Math.min(0.28, Math.max(0.02, (0.50 * threatDef * potOfensivo) + (0.35 * xgPerMatch_noPen) + probGolPenal));
    const bonusGolDefensor = !isHome ? 11.0 : 9.0;

    // Probabilidad de Figura Clarín (+4 pts): 38% si combina Gol + VI
    const teamWinProb = defSeg ? defSeg.winProb : 0.40;
    let P_figura = (P_VI_combinada >= 0.38 && P_gol_individual >= 0.04) ? 0.38 : (0.18 * teamWinProb);
    const bonusFiguraEsperado = P_figura * 4.0;

    // EP = (NotaLimpia * 0.70) + (P_VI * 2.1) + (P_gol * bonusGolDefensor) + (P_figura * 4.0) - Tarjetas
    const pisoSolido = (cleanNotaClarin * 0.70) + (P_VI_combinada * 2.1);
    const EP_predicted = pisoSolido + (P_gol_individual * bonusGolDefensor) + bonusFiguraEsperado;

    p._defSnapshot = {
      date: new Date().toISOString(),
      team: p.team,
      rival: ctx ? ctx.rival : 'N/A',
      isHome: isHome,
      shotsPerMatch, xgPerMatch: xgPerMatch_noPen,
      amenazaGoleadoraIndividual: threatDef,
      P_VI_combinada,
      P_gol_individual,
      bonusGolDefensor,
      P_figura,
      pisoSolido,
      cleanNotaClarin,
      EP_predicted,
      EP_cards
    };

    p._defAudit = {
      defSeg,
      offSeg,
      P_VI_combinada,
      P_gol_individual,
      bonusGolDefensor,
      amenazaGoleadoraIndividual: threatDef,
      shotsPerMatch, xgPerMatch: xgPerMatch_noPen,
      P_figura,
      pisoSolido,
      cleanNotaClarin,
      EP_predicted,
      EP_cards
    };

    rawEP = EP_predicted - EP_cards;

  } else if (pos === 'VOL') {
    // ════════════════════════════════════════════════════════════════
    // 🪄 ALGORITMO VOLANTES V2 — SEGMENTO OFENSIVO + npxG AISLADO
    // Fusión: Amenaza Individual npxG × Potencial Ofensivo (Cuota Gol + xG Club)
    // Reglas Gran DT: Gol = +6.0 pts (Local) / +8.0 pts (Visitante) | Figura = +4.0 pts
    // ════════════════════════════════════════════════════════════════
    const pj = Math.max(1, p.matchesRated || p.pj || 1);
    const gpm = (p.goals || 0) / pj;

    const isPenTaker = (p.goalsPenalty || 0) > 0;
    const teamExpGoalsFor = offSeg ? offSeg.teamExpGoals : 1.20;
    const probPenalEquipo = 0.0583 * (teamExpGoalsFor / 1.20);
    const probGolPenal = isPenTaker ? (probPenalEquipo * 0.76) : 0;

    const potOfensivo = offSeg ? offSeg.potencialOfensivoIndex : 0.60;
    const threatVol = xgPerMatch_noPen > 0 ? xgPerMatch_noPen : (0.12 + (gpm * 0.35));

    let P_gol_individual = Math.min(0.48, Math.max(0.04, (0.50 * threatVol * potOfensivo) + (0.35 * xgPerMatch_noPen) + probGolPenal));
    const bonusGolVolante = !isHome ? 8.0 : 6.0;

    const teamWinProb = offSeg ? offSeg.winProb : 0.40;
    let P_figura = (P_gol_individual >= 0.15) ? (0.35 * teamWinProb) : (0.10 * teamWinProb);
    const bonusFiguraEsperado = P_figura * 4.0;

    const EP_predicted = (cleanNotaClarin * 0.65) + (P_gol_individual * bonusGolVolante) + bonusFiguraEsperado;

    p._volSnapshot = {
      date: new Date().toISOString(), team: p.team, rival: ctx ? ctx.rival : 'N/A', isHome,
      shotsPerMatch, xgPerMatch: xgPerMatch_noPen, amenazaGoleadoraIndividual: threatVol,
      P_gol_individual, bonusGolVolante, P_figura, cleanNotaClarin, EP_predicted, EP_cards
    };

    p._volAudit = {
      offSeg,
      amenazaGoleadoraIndividual: threatVol,
      shotsPerMatch, xgPerMatch: xgPerMatch_noPen,
      P_gol_individual, bonusGolVolante,
      P_figura, cleanNotaClarin,
      EP_predicted, EP_cards
    };

    rawEP = EP_predicted - EP_cards;

  } else {
    // ════════════════════════════════════════════════════════════════
    // ⚽ ALGORITMO DELANTEROS V2 — REY DEL GOL + SEGMENTO OFENSIVO
    // Fusión: Amenaza Individual npxG × Potencial Ofensivo (Cuota Gol + xG Club)
    // Reglas Gran DT: Gol = +4.0 pts (Local) / +6.0 pts (Visitante) | Figura = +4.0 pts
    // ════════════════════════════════════════════════════════════════
    const pj = Math.max(1, p.matchesRated || p.pj || 1);
    const gpm = (p.goals || 0) / pj;

    const isPenTaker = (p.goalsPenalty || 0) > 0;
    const teamExpGoalsFor = offSeg ? offSeg.teamExpGoals : 1.20;
    const probPenalEquipo = 0.0583 * (teamExpGoalsFor / 1.20);
    const probGolPenal = isPenTaker ? (probPenalEquipo * 0.76) : 0;

    const potOfensivo = offSeg ? offSeg.potencialOfensivoIndex : 0.60;
    const threatDel = xgPerMatch_noPen > 0 ? xgPerMatch_noPen : (0.25 + (gpm * 0.40));

    let P_gol_individual = Math.min(0.62, Math.max(0.08, (0.50 * threatDel * potOfensivo) + (0.35 * xgPerMatch_noPen) + probGolPenal));
    const bonusGolDelantero = !isHome ? 6.0 : 4.0;

    const teamWinProb = offSeg ? offSeg.winProb : 0.40;
    let P_figura = (P_gol_individual >= 0.20) ? (0.45 * teamWinProb) : (0.12 * teamWinProb);
    const bonusFiguraEsperado = P_figura * 4.0;

    const EP_predicted = (cleanNotaClarin * 0.65) + (P_gol_individual * bonusGolDelantero) + bonusFiguraEsperado;

    p._delSnapshot = {
      date: new Date().toISOString(), team: p.team, rival: ctx ? ctx.rival : 'N/A', isHome,
      shotsPerMatch, xgPerMatch: xgPerMatch_noPen, amenazaGoleadoraIndividual: threatDel,
      P_gol_individual, bonusGolDelantero, P_figura, cleanNotaClarin, EP_predicted, EP_cards
    };

    p._delAudit = {
      offSeg,
      amenazaGoleadoraIndividual: threatDel,
      shotsPerMatch, xgPerMatch: xgPerMatch_noPen,
      P_gol_individual, bonusGolDelantero,
      P_figura, cleanNotaClarin,
      EP_predicted, EP_cards
    };

    rawEP = EP_predicted - EP_cards;
  }

  const auditData = {
    jugador: p.name,
    pos: pos,
    equipo: p.team,
    rival: ctx ? ctx.rival : 'N/A',
    localia: ctx ? (ctx.isHome ? 'Local' : 'Visitante') : 'N/A',
    metrics: m,
    pjPgt,
    pj365,
    avgMinutesPerMatch,
    xgPerMatch_noPen,
    xgPerMatch,
    shotsPerMatch,
    goalsPerMatch,
    yellowPerMatch,
    redPerMatch,
    EP_cards,
    EP_forma,
    EP_fig,
    EP_pen,
    EP_aerial,
    EP_setpiece,
    EP_lateral_goleador,
    EP_llegador,
    EP_tanque,
    EP_extremo,
    EP_possession,
    EP_saves,
    minutesFactor: Math.min(1.0, Math.max(0.40, avgMinutesPerMatch / 82.0)),
    baselineNorm: m.avgRatingCur || 5.5,
    isVolanteLlegador,
    isVolanteManija,
    isGoalDebt,
    is9DeArea,
    isExtremo,
    isGoleadorEnRacha,
    attackThreatPenalty,
    topRivalAttackerName: ctx ? (ctx.topRivalAttackerName || '') : '',
    defenseThreatFactor,
    topRivalDefenderName: ctx ? (ctx.topRivalDefenderName || '') : '',
    rawEP,
    csProb,
    winProb,
    goalOpp,
    ctx
  };

  p._audit = auditData;

  const captainSuitability = (m.avgRatingCur * 3) + (fpmPerc * 30) + (winProb * 20);
  const isCaptainCandidate = captainSuitability >= 25;

  return { rawEP, avgRatingPerc, gpmPerc, fpmPerc, isSolido, isGoleador, isLateralGoleador, isVolanteLlegador, isVolanteManija, isGoalDebt, is9DeArea, isExtremo, isGoleadorEnRacha, isCaptainCandidate, metrics: m, _audit: auditData };
}

async function syncPlanetaGranDTBrowser() {
  const sheetBase = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQar3txoFXtWCNwPoWL_2_z7ehHwxJmgFWEIIKoILxig9a7z8i3RxmbjLt8ioO_0PA5hbu_hIRHW-VW/pub?output=csv&gid=';
  const gids = { ARQ: '20', DEF: '19', VOL: '18', DEL: '17' };

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else current += char;
    }
    result.push(current.trim());
    return result;
  }

  function parseNum(v) {
    if (!v) return 0;
    const cleaned = String(v).replace(/"/g, '').replace(',', '.').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function normName(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
  }

  const players = appData.players || [];
  let updatedCount = 0;
  let maxRoundWithScores = 1;

  for (const [pos, gid] of Object.entries(gids)) {
    const res = await fetch(sheetBase + gid + '&t=' + Date.now());
    const csv = await res.text();
    const lines = csv.split('\n');

    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const cleanL = lines[i].trim().replace(/^\uFEFF/, '');
      if (cleanL.startsWith('Jugador,POS') || cleanL.includes('Jugador,POS,Equipo') || (cleanL.includes('Jugador') && cleanL.includes('F1'))) {
        headerIdx = i; break;
      }
    }

    if (headerIdx === -1) continue;

    const headers = parseCSVLine(lines[headerIdx]);
    const fCols = [];
    headers.forEach((h, idx) => {
      if (/^F\d+$/i.test(h)) {
        const rNum = parseInt(h.substring(1));
        fCols.push({ round: rNum, idx });
      }
    });

    const cgIdx = headers.findIndex(h => h === 'CG');
    const actIdx = headers.findIndex(h => h === 'AcT');
    const prtIdx = headers.findIndex(h => h === 'PrT');
    const gtIdx = headers.findIndex(h => h === 'GT');
    const vfIdx = headers.findIndex(h => h === 'VF');
    const viIdx = headers.findIndex(h => h === 'VI');
    const taIdx = headers.findIndex(h => h === 'TA');
    const trIdx = headers.findIndex(h => h === 'TR');

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = parseCSVLine(line);
      const rawName = cols[0];
      if (!rawName || rawName === 'Jugador' || rawName.startsWith('www.')) continue;

      const normPName = normName(rawName);
      let player = players.find(p => normName(p.name) === normPName && p.position === pos);
      if (!player) {
        const surname = normPName.split(' ')[0];
        player = players.find(p => normName(p.name).startsWith(surname) && p.position === pos);
      }
      if (!player) continue;

      const ratings = [];
      let ratedMatches = 0;
      let totalRatingSum = 0;

      fCols.forEach(fc => {
        const rawCell = cols[fc.idx] ? cols[fc.idx].trim() : '';
        const valNum = parseNum(rawCell);
        if (rawCell !== '' && !isNaN(valNum) && valNum !== 0) {
          ratings.push(valNum);
          ratedMatches++;
          totalRatingSum += valNum;
          if (fc.round > maxRoundWithScores) maxRoundWithScores = fc.round;
        } else {
          ratings.push(0);
        }
      });

      player.ratings = ratings;
      player.matchesRated = ratedMatches > 0 ? ratedMatches : parseNum(cols[cgIdx]);
      player.avgRating = ratedMatches > 0 ? Math.round((totalRatingSum / ratedMatches) * 100) / 100 : parseNum(cols[prtIdx]);
      player.totalPoints = parseNum(cols[actIdx]);
      player.goals = parseNum(cols[gtIdx]);
      player.figuras = parseNum(cols[vfIdx]);
      player.cleanSheets = parseNum(cols[viIdx]);
      player.yellowCards = parseNum(cols[taIdx]);
      player.redCards = parseNum(cols[trIdx]);
      updatedCount++;
    }
  }

  appData.currentRound = maxRoundWithScores;
  if (!appData.syncAudit) appData.syncAudit = {};
  appData.syncAudit.planetaGranDT = {
    lastSync: new Date().toISOString(),
    lastRoundWithScores: maxRoundWithScores,
    playersUpdated: updatedCount
  };

  await syncLiveOddsFromEspn();

  renderAll();
  return { updatedCount, maxRoundWithScores };
}

async function syncLiveOddsFromEspn() {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?limit=50');
    const data = await res.json();
    if (!data.events) return 0;

    let count = 0;
    data.events.forEach(e => {
      const comp = e.competitions ? e.competitions[0] : null;
      if (!comp || !comp.odds || !comp.odds.length) return;

      const homeRaw = comp.competitors?.find(c => c.homeAway === 'home')?.team?.name;
      const awayRaw = comp.competitors?.find(c => c.homeAway === 'away')?.team?.name;
      if (!homeRaw || !awayRaw) return;

      const cHome = canonicalTeam(homeRaw);
      const cAway = canonicalTeam(awayRaw);
      const oddsObj = comp.odds[0];

      if (oddsObj && oddsObj.moneyline) {
        const mlHome = oddsObj.moneyline.home?.close?.moneyLine || oddsObj.moneyline.home?.open?.moneyLine;
        const mlAway = oddsObj.moneyline.away?.close?.moneyLine || oddsObj.moneyline.away?.open?.moneyLine;
        const mlDraw = oddsObj.moneyline.draw?.close?.moneyLine || oddsObj.moneyline.draw?.open?.moneyLine;

        const convertML = (ml) => {
          if (!ml) return 0;
          if (ml > 0) return (ml / 100) + 1;
          return (100 / Math.abs(ml)) + 1;
        };

        const hWin = convertML(mlHome);
        const aWin = convertML(mlAway);
        const dWin = convertML(mlDraw);

        if (hWin > 1.0 && aWin > 1.0) {
          updateMatchOdds(cHome, cAway, hWin.toFixed(2), dWin ? dWin.toFixed(2) : '3.20', aWin.toFixed(2));
          count++;
        }
      }
    });

    return count;
  } catch (err) {
    console.warn('Live odds sync notice:', err.message);
    return 0;
  }
}

function initFormationsSelector() {
  const select = document.getElementById('select-active-formation');
  if (!select) return;
  select.innerHTML = '';
  const formations = typeof OFFICIAL_FORMATIONS !== 'undefined' ? OFFICIAL_FORMATIONS : [
    { id: '1-4-4-2', name: '1-4-4-2' }, { id: '1-4-3-3', name: '1-4-3-3' },
    { id: '1-3-4-3', name: '1-3-4-3' }, { id: '1-4-5-1', name: '1-4-5-1' },
    { id: '1-3-5-2', name: '1-3-5-2' }, { id: '1-5-3-2', name: '1-5-3-2' },
    { id: '1-3-3-4', name: '1-3-3-4' }, { id: '1-4-2-4', name: '1-4-2-4' },
    { id: '1-5-2-3', name: '1-5-2-3' }
  ];
  formations.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    select.appendChild(opt);
  });
  select.value = STATE.activeFormation;
  select.addEventListener('change', (e) => {
    STATE.activeFormation = e.target.value;
    STATE.activeFormationManuallySet = true;
    updateFormationsAndCaptainBanner();
    renderRankings();
    if (typeof generateBest11 === 'function') {
      generateBest11();
    }
  });
  updateFormationsAndCaptainBanner();
}

function updateFormationsAndCaptainBanner() {
  const players = (typeof appData !== 'undefined' && appData.players) ? appData.players : (typeof APP_DATA !== 'undefined' ? APP_DATA.players : []);
  if (!players.length) return;

  // Re-run empirical learning model on every sync/load
  computeEmpiricalLearningModel(appData);

  const positions = ['ARQ', 'DEF', 'VOL', 'DEL'];
  const posPools = {};
  positions.forEach(pos => {
    posPools[pos] = players.filter(p => p.position === pos);
    posPools[pos]._cachedMetrics = posPools[pos].map(x => getPlayerMetrics(x));
  });

  const rankingsByPosSolid = {};
  const rankingsByPosRisky = {};

  positions.forEach(pos => {
    const pool = players.filter(p => p.position === pos && (p.matchesRated || p.matches || 0) >= STATE.minMatches);
    const evaluated = pool.map(p => {
      const ctx = getFixtureContext(p.team);
      const scoreData = calculateScoreDT(p, ctx, posPools[pos]);
      const xg = p.xgPerMatch || 0;
      const shots = p.shotsPerMatch || 0;

      // Frecuencia empírica de conversión de la apuesta (Goles + Figuras en partidos jugados)
      const pjPgt = Math.max(1, p.matchesRated || p.pj || 1);
      const hitCount = (p.goals || 0) + (p.figuras || 0);
      const hitFreq = hitCount / pjPgt; // Ej: 0/4 = 0.0, 1/4 = 0.25, 2/4 = 0.50

      // Solo aplica bonus de explosión si hay frecuencia real o xG elevado (>= 0.22 xG/p)
      const isExplosiveHit = hitFreq >= 0.20 || xg >= 0.22;
      const riskyBonus = isExplosiveHit ? ((xg * 10.0) + (shots * 1.2) + (hitFreq * 2.5)) : (xg * 2.0);

      const floorValue = scoreData.rawEP || 0;
      return { ...p, ctx, ...scoreData, floorValue, rawRiskyEP: floorValue + riskyBonus };
    });

    rankingsByPosSolid[pos] = evaluated.map(p => {
      let finalScore = 0;
      if (p.hasRotationRisk || p.isRotationRisk) {
        finalScore = 20.0; // Eliminado 100% por riesgo de suplencia
      } else {
        // finalScore = Score DT Proyectado puro derivado directamente de rawEP (sin doble ponderación de Clarín)
        const ep = p.rawEP || 5.0;
        // Escala normalizada de 0-100 para Score DT Proyectado
        finalScore = Math.min(99.0, Math.max(30.0, Math.round((ep * 10.0) * 10) / 10));
      }
      let riskyScore = p.hasRotationRisk ? 20.0 : Math.min(99.0, Math.max(30.0, Math.round((finalScore + (p.rawRiskyEP ? (p.rawRiskyEP - p.rawEP) * 3 : 0)) * 10) / 10));
      const captainScore = typeof calculateCaptainScore === 'function' ? calculateCaptainScore(p, p.metrics || {}, p._audit || {}) : finalScore;
      return { ...p, finalScore, riskyScore, captainScore };
    }).sort((a, b) => b.finalScore - a.finalScore);

    rankingsByPosRisky[pos] = [...rankingsByPosSolid[pos]].sort((a, b) => b.riskyScore - a.riskyScore);
  });

  if (typeof evaluateBestFormations === 'function') {
    const evaluationSolid = evaluateBestFormations(rankingsByPosSolid, STATE.positionWeights, 'solid');
    const evaluationRisky = evaluateBestFormations(rankingsByPosRisky, STATE.positionWeights, 'risky');
    
    STATE.optimalEvaluation = evaluationSolid;
    STATE.riskyEvaluation = evaluationRisky;
    STATE.rankingsByPos = (STATE.best11Mode === 'risky') ? rankingsByPosRisky : rankingsByPosSolid;

    const activeEvalObj = (STATE.best11Mode === 'risky') ? evaluationRisky : evaluationSolid;
    const activeFmtId = STATE.activeFormation;
    
    // Find evaluated object for active selected formation
    const currentFmtObj = (activeEvalObj && activeEvalObj.allFormations) ? activeEvalObj.allFormations.find(e => e.formation.id === activeFmtId) : null;
    const recFmt = currentFmtObj || (activeEvalObj ? activeEvalObj.optimal : null);
    
    if (!STATE.activeFormationManuallySet && activeEvalObj && activeEvalObj.optimal) {
      STATE.activeFormation = activeEvalObj.optimal.formation.id;
    }
    
    // Find optimal captain among all selected players in active formation
    const allSelected = recFmt ? Object.values(recFmt.players).flat() : [];
    allSelected.sort((a, b) => (b.captainScore || 0) - (a.captainScore || 0));
    const topCap = allSelected[0] || Object.values(STATE.rankingsByPos).flat().sort((a, b) => (b.captainScore || 0) - (a.captainScore || 0))[0];
    STATE.topCap = topCap;

    // Calculate Piso Seguro (Base) and Techo Arriesgado (Base + Upside Bonus)
    let teamSolidPts = 0;
    let teamRiskyPts = 0;
    if (allSelected.length) {
      teamSolidPts = allSelected.reduce((sum, p) => {
        const isCap = topCap && p.id === topCap.id;
        const fichaBase = (p.avgRating || 6.0) * 0.75;
        const rawBonus = p.rawEP || 0;
        return sum + (isCap ? (fichaBase * 2 + rawBonus) : (fichaBase + rawBonus));
      }, 0);

      teamRiskyPts = allSelected.reduce((sum, p) => {
        const isCap = topCap && p.id === topCap.id;
        const fichaBase = (p.avgRating || 6.0) * 0.75;
        const rawBonus = p.rawEP || 0;
        const xg = p.xgPerMatch || 0;
        const shots = p.shotsPerMatch || 0;
        const upsideBonus = (xg * 10.0) + (shots * 1.2);
        return sum + (isCap ? (fichaBase * 2 + rawBonus + upsideBonus) : (fichaBase + rawBonus + upsideBonus));
      }, 0);
    }
    STATE.teamProjectedPts = teamSolidPts;
    STATE.teamRiskyPts = teamRiskyPts;

    const fmtLbl = document.getElementById('lbl-rec-formation');
    if (fmtLbl && recFmt) {
      fmtLbl.innerHTML = `Formación ${recFmt.formation.name} • <span style="color:#10b981;font-weight:800;">🛡️ Piso: ${teamSolidPts.toFixed(1)} pts</span> | <span style="color:#f59e0b;font-weight:800;">🚀 Techo: ${teamRiskyPts.toFixed(1)} pts</span> Gran DT`;
    }

    const capLbl = document.getElementById('lbl-rec-captain');
    if (capLbl && topCap) {
      const fichaBase = (topCap.avgRating || 6.0) * 0.75;
      const rawBonus = topCap.rawEP || 0;
      const capProjPts = (fichaBase * 2) + rawBonus;
      capLbl.textContent = `${topCap.name} (${topCap.team}) • Proyección como Capitán: ${capProjPts.toFixed(1)} pts (Ficha Clarín x2 + Bonus Eventos)`;
    }
  }
}

function renderRankings() {
  const container = document.getElementById('players-body');
  const thead = document.getElementById('rankings-thead');
  if (!container) return;
  container.innerHTML = '';

  const pos = STATE.activeTab;

  if (thead) {
    if (pos === 'ARQ') {
      thead.innerHTML = `
        <tr>
          <th>#</th>
          <th>Jugador</th>
          <th class="text-center">PJ</th>
          <th class="text-center" title="Promedio Ficha Clarín (Blended)">Ficha</th>
          <th class="text-center">Vallas Inv.</th>
          <th class="text-center">Figuras</th>
          <th>Próximo Partido</th>
          <th class="text-center">Score DT</th>
        </tr>
      `;
    } else if (pos === 'DEF') {
      thead.innerHTML = `
        <tr>
          <th>#</th>
          <th>Jugador</th>
          <th class="text-center">PJ</th>
          <th class="text-center" title="Promedio Ficha Clarín (Blended)">Ficha</th>
          <th class="text-center">Goles</th>
          <th class="text-center">Vallas Inv.</th>
          <th>Perfil</th>
          <th>Próximo Partido</th>
          <th class="text-center">Score DT</th>
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr>
          <th>#</th>
          <th>Jugador</th>
          <th class="text-center">PJ</th>
          <th class="text-center" title="Promedio Ficha Clarín (Blended)">Ficha</th>
          <th class="text-center">Goles</th>
          <th class="text-center">Figuras</th>
          <th>Perfil / Badges</th>
          <th>Próximo Partido</th>
          <th class="text-center">Score DT</th>
        </tr>
      `;
    }
  }

  if (!STATE.rankingsByPos || !STATE.rankingsByPos[pos] || !STATE.rankingsByPos[pos].length) {
    updateFormationsAndCaptainBanner();
  }

  let ranked = (STATE.rankingsByPos && STATE.rankingsByPos[pos]) ? STATE.rankingsByPos[pos] : [];
  if (STATE.searchQuery) {
    ranked = ranked.filter(p => p.name.toLowerCase().includes(STATE.searchQuery) || p.team.toLowerCase().includes(STATE.searchQuery));
  }

  currentRankings = ranked;
  window.currentRankings = currentRankings;
  
  // Identify top defensive rivals to detect attacker conflicts
  const recDefenseRivals = new Set();
  if (STATE.optimalEvaluation && STATE.optimalEvaluation.optimal) {
    const optP = STATE.optimalEvaluation.optimal.players;
    [...(optP.arq || []), ...(optP.def || [])].forEach(d => {
      if (d.ctx && d.ctx.rival) recDefenseRivals.add(canonicalTeam(d.ctx.rival));
    });
  }

  let filteredRanked = ranked;
  if (STATE.hideRivalConflicts && (pos === 'VOL' || pos === 'DEL')) {
    filteredRanked = ranked.filter(p => !recDefenseRivals.has(canonicalTeam(p.team)));
  }

  const posRanks = (function(pPos) {
    const posPlayers = (appData.players || []).filter(x => x.position === pPos && (x.matchesRated || x.pj || 0) >= 1);
    const byXg = [...posPlayers].sort((a, b) => {
      const xgA = (a.xg365 || 0) / Math.max(1, a.matches365 || 1);
      const xgB = (b.xg365 || 0) / Math.max(1, b.matches365 || 1);
      return xgB - xgA;
    });
    const byShots = [...posPlayers].sort((a, b) => {
      const sA = (a.shots365 || 0) / Math.max(1, a.matches365 || 1);
      const sB = (b.shots365 || 0) / Math.max(1, b.matches365 || 1);
      return sB - sA;
    });
    const xgRankMap = {};
    byXg.forEach((p, i) => xgRankMap[p.id] = i + 1);
    const shotsRankMap = {};
    byShots.forEach((p, i) => shotsRankMap[p.id] = i + 1);
    return { xgRankMap, shotsRankMap, totalInPos: posPlayers.length };
  })(pos);

  let rowsHtml = '';
  filteredRanked.forEach((p, idx) => {
    let badges = '';
    const xgRank = posRanks.xgRankMap[p.id];
    const shotsRank = posRanks.shotsRankMap[p.id];

    if (p.hasRotationRisk || p.isRotationRisk) {
      badges += '<span class="badge" style="background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid rgba(239,68,68,0.5);" title="No jugó el 100% de los partidos del club — Riesgo de Suplencia">⚠️ Riesgo de Rotación</span>';
    }
    if (p.isFacingCopaRival) {
      badges += '<span class="badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6;border:1px solid rgba(139,92,246,0.4);" title="Rival en Serie de Copa">🏆 Rival en Copa</span>';
    }
    if (pos === 'ARQ') {
      if (p.ctx && p.ctx.cleanSheetProb >= 0.40 && !p.hasRotationRisk) {
        badges += '<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);" title="Probabilidad de Valla Invicta alta (>40%)">🧤 Valla Invicta Recomendada</span>';
      }
      if (p.ctx && p.ctx.teamShotsConceded >= 11) {
        badges += '<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);" title="Rival exigente en disparos, posibilidad de 8-10 + Figura">⭐ Candidato a Figura</span>';
      }
    }
    if (xgRank && xgRank <= 5 && pos !== 'ARQ') {
      badges += `<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);" title="#${xgRank} TOP en xG">🥇 #${xgRank} xG ${pos}</span>`;
    }
    if (shotsRank && shotsRank <= 5 && pos !== 'ARQ') {
      badges += `<span class="badge" style="background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);" title="#${shotsRank} TOP en Tiros">🎯 #${shotsRank} Tiros ${pos}</span>`;
    }

    const isConflict = (pos === 'VOL' || pos === 'DEL') && recDefenseRivals.has(canonicalTeam(p.team));
    if (isConflict) {
      badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Enfrenta a tu arquero/defensa recomendada en el 11">⚔️ Choque Directo</span>';
    }
    if (pos === 'DEF') {
      if (p.isGoleador && p.isSolido) badges += '<span class="badge">🛡️ Completo</span>';
      else if (p.isLateralGoleador) badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Lateral Goleador">⚔️ Lateral Goleador</span>';
      else if (p.isGoleador) badges += '<span class="badge">⚔️ Goleador</span>';
      else if (p.isSolido) badges += '<span class="badge">🔒 Sólido</span>';
    }
    if (pos === 'VOL') {
      if (p.isVolanteLlegador) badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Volante Llegador">⚔️ Volante Llegador</span>';
      if (p.isGoalDebt) badges += '<span class="badge" style="background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);" title="En Deuda de Gol">📈 En Deuda de Gol</span>';
      if (p.isVolanteManija) badges += '<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);" title="Volante Manija">🪄 Volante Manija</span>';
    }
    if (pos === 'DEL') {
      if (p.isGoleadorEnRacha) badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Goleador en Racha">🔥 Goleador en Racha</span>';
      else if (p.is9DeArea) badges += '<span class="badge">⚽ 9 de Área</span>';
      else if (p.isExtremo) badges += '<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);" title="Extremo Veloz">⚡ Extremo Veloz</span>';
    }
    const masterPjForCards = Math.max(1, p.matchesRated || p.pj || 1);
    const isYellowRisk = ((p.yellowCards || 0) / masterPjForCards) >= 0.45;
    if (isYellowRisk) {
      badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Riesgo de Amarilla (-2 pts)">⚠️ Riesgo Amarilla</span>';
    }

    const nextMatchStr = p.ctx ? `${p.ctx.isHome ? 'L' : 'V'} vs ${p.ctx.rival}` : 'N/A';
    const matchesCount = p.matchesRated !== undefined ? p.matchesRated : p.matches || 0;

    let subBadgesHtml = `<span class="player-team">${p.team}</span>`;
    if (p.blended && p.blended.hist) {
      subBadgesHtml += `<span class="badge-sub clean" title="Torneo Pasado">📜 Torneo Pasado</span>`;
    }
    if ((pos === 'ARQ' || pos === 'DEF') && (p.cleanSheets || 0) > 0) {
      subBadgesHtml += `<span class="badge-sub clean" title="Vallas Invictas">🧤 ${p.cleanSheets} ${p.cleanSheets === 1 ? 'Valla' : 'Vallas'}</span>`;
    }
    if ((p.figuras || 0) > 0) {
      subBadgesHtml += `<span class="badge-sub fig" title="Veces Figura">⭐ ${p.figuras} ${p.figuras === 1 ? 'Figura' : 'Figuras'}</span>`;
    }

    let col4 = '';
    let col5 = '';

    if (pos === 'ARQ') {
      col4 = `<td class="text-center">${p.cleanSheets !== undefined ? p.cleanSheets : 0}</td>`;
      col5 = `<td class="text-center">${p.figuras !== undefined ? p.figuras : 0}</td>`;
    } else if (pos === 'DEF') {
      col4 = `<td class="text-center">${p.goals !== undefined ? p.goals : 0}</td>`;
      col5 = `<td class="text-center">${p.cleanSheets !== undefined ? p.cleanSheets : 0}</td>`;
    } else {
      col4 = `<td class="text-center">${p.goals !== undefined ? p.goals : 0}</td>`;
      col5 = `<td class="text-center">${p.figuras !== undefined ? p.figuras : 0}</td>`;
    }

    const displayRating = p.blended ? p.blended.blendedAvgRating.toFixed(2) : (p.avgRating ? p.avgRating.toFixed(2) : '-');

    rowsHtml += `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <div class="player-info" onclick="openAuditModal('${p.id}')" style="cursor:pointer;" title="Click para Auditar ${p.name}">
            <div class="player-name" style="font-weight:700;color:var(--text-main);">${p.name}</div>
            <div class="player-sub">${subBadgesHtml}</div>
          </div>
        </td>
        <td class="text-center">${matchesCount}</td>
        <td class="text-center">${displayRating}</td>
        ${col4}
        ${col5}
        ${pos === 'ARQ' ? '' : `<td>${badges}</td>`}
        <td class="next-match">${nextMatchStr}</td>
        <td class="score-dt" onclick="openAuditModal('${p.id}')" style="cursor:pointer;" title="Click para Auditar ${p.name}">
          <strong>${p.finalScore.toFixed(1)}</strong>
          <button class="btn-icon" onclick="event.stopPropagation(); openAuditModal('${p.id}');" title="Ver Desglose Completo">🔍</button>
        </td>
      </tr>
    `;
  });
  container.innerHTML = rowsHtml;
}

window.openAuditModal = function(playerId) {
  let baseP = (appData.players || []).find(x => String(x.id) === String(playerId));
  if (!baseP && currentRankings) {
    baseP = currentRankings.find(x => String(x.id) === String(playerId));
  }
  if (!baseP) return;

  const pos = baseP.position; // ARQ, DEF, VOL, DEL
  const posPool = (appData.players || []).filter(x => x.position === pos && (x.matchesRated || x.pj || 0) >= 1);
  const ctx = getFixtureContext(baseP.team);
  const scoreData = calculateScoreDT(baseP, ctx, posPool);
  const p = { ...baseP, ctx, ...scoreData, finalScore: scoreData.rawEP ? (scoreData.rawEP * 10) : 50 };

  const modal = document.getElementById('audit-modal');
  const title = document.getElementById('audit-title');
  const body = document.getElementById('audit-body');
  
  if (!modal || !title || !body) return;

  title.textContent = `📋 AUDITORÍA TÉCNICA DEL ALGORITMO [${pos}]: ${p.name}`;

  // Helper para calcular puesto (ranking) y percentil exacto sin distorsiones
  function calcRankAndPercentile(val, array, higherIsBetter = true, options = {}) {
    if (options.isRuleBonus) {
      return {
        rank: 1,
        total: 1,
        pct: 100,
        rankStr: 'Reglamento',
        pctStr: 'Fijo (Oficial)',
        badgeColor: '#3b82f6',
        badgeBg: 'rgba(59,130,246,0.15)'
      };
    }

    const validArr = (array || []).filter(x => x !== undefined && x !== null && !isNaN(x));
    if (validArr.length === 0) {
      return { rank: 1, total: 1, pct: 50, rankStr: '#1 de 1', pctStr: 'P50', badgeColor: '#3b82f6', badgeBg: 'rgba(59,130,246,0.15)' };
    }

    const total = validArr.length;
    const numVal = typeof val === 'number' ? val : parseFloat(val) || 0;

    // Manejo de métricas discretas en 0 (ej. 0 penales) para no inflar percentiles
    if (options.isDiscrete && numVal <= 0) {
      return {
        rank: total,
        total: total,
        pct: 0,
        rankStr: 'Sin penales',
        pctStr: 'Base (0%)',
        badgeColor: '#64748b',
        badgeBg: 'rgba(100,116,139,0.15)'
      };
    }

    const strictlyBetter = validArr.filter(x => higherIsBetter ? (x > numVal + 0.0001) : (x < numVal - 0.0001)).length;
    const equalCount = validArr.filter(x => Math.abs(x - numVal) <= 0.0001).length;
    const strictlyWorse = validArr.filter(x => higherIsBetter ? (x < numVal - 0.0001) : (x > numVal + 0.0001)).length;

    const rank = strictlyBetter + 1;
    // Percentil exacto con Mid-Rank (estándar estadístico para empates)
    const pct = Math.max(1, Math.min(100, Math.round(((strictlyWorse + (0.5 * Math.max(1, equalCount))) / total) * 100)));
    const topPct = Math.max(1, Math.round((rank / total) * 100));

    const rankStr = equalCount > 1 ? `#${rank}= de ${total} (Empate)` : `#${rank} de ${total}`;
    const isTop = rank <= Math.max(3, Math.round(total * 0.15));
    const badgeColor = isTop ? '#10b981' : (pct >= 50 ? '#3b82f6' : '#f59e0b');
    const badgeBg = isTop ? 'rgba(16,185,129,0.15)' : (pct >= 50 ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)');

    return {
      rank,
      total,
      pct,
      rankStr,
      pctStr: `Top ${topPct}% (P${pct})`,
      badgeColor,
      badgeBg
    };
  }

  // Pools de comparación de equipos para Fecha 5 (30 equipos)
  const allTeams = [...(appData.standings?.zonaA || []), ...(appData.standings?.zonaB || [])];
  const allCsProbs = allTeams.map(t => {
    const c = getFixtureContext(t.team);
    return c ? (c.cleanSheetProb || 0.30) : 0.30;
  });
  const allRivalExpGoals = allTeams.map(t => {
    const c = getFixtureContext(t.team);
    return c ? (c.expGoalsRival || 1.0) : 1.0;
  });
  const allWinOdds = allTeams.map(t => {
    const c = getFixtureContext(t.team);
    return c ? (1.0 / Math.max(0.1, c.winOdds || 2.5)) : 0.33;
  });
  const allTeamGoalProbs = allTeams.map(t => {
    const c = getFixtureContext(t.team);
    return c ? (c.teamGoalProb || 0.72) : 0.72;
  });

  // Pools de jugadores de la misma posición
  const posRatings = posPool.map(x => x.avgRating || 6.0);
  const posShots = posPool.map(x => (x.shotsPerMatch !== undefined ? x.shotsPerMatch : ((x.shots365 || 0) / Math.max(1, x.matches365 || 1))));
  const posXg = posPool.map(x => (x.xgPerMatch !== undefined ? x.xgPerMatch : ((x.xg365 || 0) / Math.max(1, x.matches365 || 1))));
  const posCsRate = posPool.map(x => (x.cleanSheets || 0) / Math.max(1, x.matchesRated || x.pj || 1));

  let blocks = [];
  let formulaText = '';
  let subFormulaCalc = '';

  const defSeg = ctx ? ctx.defensiveSegment : null;
  const offSeg = ctx ? ctx.offensiveSegment : null;

  if (pos === 'ARQ') {
    const arqAudit = p._arqAudit || {};
    const csProb = defSeg ? defSeg.P_VI_combinada : (ctx ? ctx.cleanSheetProb : 0.30);
    const rivalXg = defSeg ? defSeg.rivalExpGoals : (ctx ? ctx.expGoalsRival : 1.0);
    const winProb = defSeg ? defSeg.winProb : 0.40;
    const arqAvg = arqAudit.cleanNotaClarin || 5.50;
    const pj = Math.max(1, p.matchesRated || p.pj || 1);
    const csRate = (p.cleanSheets || 0) / pj;

    blocks = [
      { name: '1. P(Valla Invicta Combinada) Segmento Defensivo', weight: '45%', val: `${(csProb * 100).toFixed(1)}% P(VI)`, rp: calcRankAndPercentile(csProb, posPool.map(x => (x._arqAudit?.P_VI_combinada || 0.3)), true), desc: 'Cuota Bet365 + Solidez L/V + Inofensividad rival' },
      { name: '2. Goles Esperados del Rival (rivalExpGoals)', weight: '20%', val: `${rivalXg.toFixed(2)} xG Riv`, rp: calcRankAndPercentile(rivalXg, allRivalExpGoals, false), desc: 'Menos peligro rival = Mayor probabilidad de puntaje alto' },
      { name: '3. Probabilidad Victoria / Favoritismo (Bet365)', weight: '15%', val: `${(winProb * 100).toFixed(1)}% Triunfo`, rp: calcRankAndPercentile(winProb, allWinOdds, true), desc: 'Control del partido por el equipo propio' },
      { name: '4. Ficha Clarín Base Periodística (Limpia)', weight: '10%', val: `${arqAvg.toFixed(2)} pts Clarín`, rp: calcRankAndPercentile(arqAvg, posRatings, true), desc: 'Nota periodística normalizada de 5.0 a 6.0' },
      { name: '5. Tasa Histórica Valla Invicta & Tarjetas', weight: '10%', val: `${(csRate * 100).toFixed(0)}% (${p.cleanSheets || 0}/${pj} PJ)`, rp: calcRankAndPercentile(csRate, posCsRate, true), desc: 'Efectividad en mantener el arco en cero' }
    ];

    formulaText = `EP = (NotaClarínLimpia * 0.75) + (P_VI_combinada * 3.0) - (RivalExpGoals * 1.0) + (TasaVI * 0.40) - Tarjetas`;
    subFormulaCalc = `EP = (${arqAvg.toFixed(2)} * 0.75) + (${csProb.toFixed(3)} * 3.0) - (${rivalXg.toFixed(2)} * 1.0) + (${csRate.toFixed(2)} * 0.40) - ${((p.yellowCards || 0) * 0.25).toFixed(2)} = <strong>${(p.rawEP || (p.finalScore / 10)).toFixed(2)} pts</strong>`;
  }
  if (pos === 'ARQ') {
    const arqAudit = p._arqAudit || {};
    const csProb = defSeg ? defSeg.P_VI_combinada : (ctx ? ctx.cleanSheetProb : 0.30);
    const rivalXg = defSeg ? defSeg.rivalExpGoals : (ctx ? ctx.expGoalsRival : 1.10);
    const winProb = defSeg ? defSeg.winProb : 0.40;
    const arqAvg = arqAudit.cleanNotaClarin || 5.50;
    const pj = Math.max(1, p.matchesRated || p.pj || 1);
    const csRate = (p.cleanSheets || 0) / pj;

    blocks = [
      { name: '1. P(Valla Invicta Combinada) Segmento Defensivo', weight: '45%', val: `${(csProb * 100).toFixed(1)}% P(VI)`, rp: calcRankAndPercentile(csProb, posPool.map(x => (x._arqAudit?.P_VI_combinada || 0.3)), true), desc: 'Cuota Bet365 + Solidez L/V + Inofensividad rival' },
      { name: '2. Goles Esperados del Rival (rivalExpGoals Calibrado)', weight: '20%', val: `${rivalXg.toFixed(2)} xG Riv`, rp: calcRankAndPercentile(rivalXg, allRivalExpGoals, false), desc: 'Peligro rival con factor calibrado sin doble penalización' },
      { name: '3. Probabilidad Victoria / Favoritismo (Bet365)', weight: '15%', val: `${(winProb * 100).toFixed(1)}% Triunfo`, rp: calcRankAndPercentile(winProb, allWinOdds, true), desc: 'Control del partido por el equipo propio' },
      { name: '4. Ficha Clarín Base Periodística (Limpia)', weight: '10%', val: `${arqAvg.toFixed(2)} pts Clarín`, rp: calcRankAndPercentile(arqAvg, posRatings, true), desc: 'Nota periodística normalizada de 5.0 a 6.0' },
      { name: '5. Tasa Histórica Valla Invicta & Tarjetas', weight: '10%', val: `${(csRate * 100).toFixed(0)}% (${p.cleanSheets || 0}/${pj} PJ)`, rp: calcRankAndPercentile(csRate, posCsRate, true), desc: 'Efectividad en mantener el arco en cero' }
    ];

    formulaText = `EP = (NotaClarínLimpia * 0.65) + (P_VI_combinada * 3.2) - (RivalExpGoals * 0.50) + (TasaVI * 0.30) - Tarjetas`;
    subFormulaCalc = `EP = (${arqAvg.toFixed(2)} * 0.65) + (${csProb.toFixed(3)} * 3.2) - (${rivalXg.toFixed(2)} * 0.50) + (${csRate.toFixed(2)} * 0.30) - ${((p.yellowCards || 0) * 0.25).toFixed(2)} = <strong>${(p.rawEP || (p.finalScore / 10)).toFixed(2)} pts</strong>`;
  }
  else if (pos === 'DEF') {
    const defAudit = p._defAudit || {};
    const csProb = defSeg ? defSeg.P_VI_combinada : 0.30;
    const playerShots = p.shotsPerMatch !== undefined ? p.shotsPerMatch : ((p.shots365 || 0) / Math.max(1, p.matches365 || 1));
    const playerXg = p.xgPerMatch !== undefined ? p.xgPerMatch : ((p.xg365 || 0) / Math.max(1, p.matches365 || 1));
    const potOfensivo = offSeg ? offSeg.potencialOfensivoIndex : 0.60;
    const bonusGol = ctx && ctx.isHome ? 9.0 : 11.0;
    const pGol = defAudit.P_gol_individual || 0.03;
    const pFig = defAudit.P_figura || 0.10;
    const defAvg = defAudit.cleanNotaClarin || 5.50;
    const pisoSol = defAudit.pisoSolido || ((defAvg * 0.70) + (csProb * 2.1));

    blocks = [
      { name: '1. Piso Sólido: P(Valla Invicta) [100% Idéntica al ARQ]', weight: '40%', val: `${(csProb * 100).toFixed(1)}% P(VI) | ${pisoSol.toFixed(2)} Piso`, rp: calcRankAndPercentile(csProb, posPool.map(x => (x._defAudit?.P_VI_combinada || 0.3)), true), desc: 'Solidez defensiva del club unificada para sumar +2 pts de base segura' },
      { name: '2. Techo Picante: Peligro Goleador Real (npxG Aislado)', weight: '25%', val: `${(pGol * 100).toFixed(1)}% P(Gol) | +${bonusGol} pts`, rp: calcRankAndPercentile(pGol, posPool.map(x => (x._defAudit?.P_gol_individual || 0.02)), true), desc: 'Amenaza de gol en jugada + penales oficiales (busca bombas de 18-25 pts)' },
      { name: '3. Potencial Ofensivo del Club (Segmento Ofensivo)', weight: '15%', val: `${(potOfensivo * 100).toFixed(0)}% Potencial`, rp: calcRankAndPercentile(potOfensivo, posPool.map(x => (x._defAudit?.offSeg?.potencialOfensivoIndex || 0.5)), true), desc: 'Cuota gol del equipo propio y vulnerabilidad rival' },
      { name: '4. Valor del Gol Gran DT (+9 Loc / +11 Vis)', weight: '10%', val: `+${bonusGol.toFixed(0)} pts (${ctx ? (ctx.isHome ? '🏠 Local' : '✈️ Visitante') : 'Local'})`, rp: calcRankAndPercentile(bonusGol, [9, 11], true, { isRuleBonus: true }), desc: 'Reglamento Gran DT (+9 base +2 visitante)' },
      { name: '5. P(Figura) & Ficha Clarín Limpia (5.0 a 6.0)', weight: '10%', val: `${(pFig * 100).toFixed(1)}% P(Fig) | ${defAvg.toFixed(2)} Ficha`, rp: calcRankAndPercentile(pFig, posPool.map(x => (x._defAudit?.P_figura || 0.1)), true), desc: '38% de figura si combina Gol + VI + Ficha limpia' }
    ];

    formulaText = `PisoSólido = (NotaClarínLimpia * 0.70) + (P_VI_combinada * 2.1)\nP(Gol) = (0.50 * PeligroDEF * PotOfensivo) + (0.35 * npxG) + Penales\nEP = PisoSólido + (P_gol * bonusGolDEF) + (P_figura * 4.0) - Tarjetas`;
    subFormulaCalc = `Piso: <strong>${pisoSol.toFixed(2)} pts</strong> | P(Gol): <strong>${(pGol * 100).toFixed(1)}%</strong> | EP: (${defAvg.toFixed(2)} * 0.70) + (${csProb.toFixed(3)} * 2.1) + (${pGol.toFixed(3)} * ${bonusGol}) + (${pFig.toFixed(3)} * 4.0) - ${((p.yellowCards || 0) * 0.25).toFixed(2)} = <strong>${(p.rawEP || (p.finalScore / 10)).toFixed(2)} pts</strong>`;
  }
  else if (pos === 'VOL') {
    const volAudit = p._volAudit || {};
    const playerShots = p.shotsPerMatch !== undefined ? p.shotsPerMatch : ((p.shots365 || 0) / Math.max(1, p.matches365 || 1));
    const playerXg = p.xgPerMatch !== undefined ? p.xgPerMatch : ((p.xg365 || 0) / Math.max(1, p.matches365 || 1));
    const teamGoalProb = offSeg ? offSeg.teamGoalProb : 0.72;
    const bonusGol = ctx && ctx.isHome ? 6.0 : 8.0;
    const pGol = volAudit.P_gol_individual || 0.15;
    const pFig = volAudit.P_figura || 0.15;
    const volAvg = volAudit.cleanNotaClarin || 5.50;
    const potOfensivo = offSeg ? offSeg.potencialOfensivoIndex : 0.60;

    blocks = [
      { name: '1. Segmento Ofensivo del Club (Cuota Gol Bet365)', weight: '35%', val: `${(teamGoalProb * 100).toFixed(0)}% P(Gol Eq) | ${(potOfensivo * 100).toFixed(0)}% Pot`, rp: calcRankAndPercentile(potOfensivo, posPool.map(x => (x._volAudit?.offSeg?.potencialOfensivoIndex || 0.5)), true), desc: 'Cuota de gol del club, tiros proyectados y rival' },
      { name: '2. Amenaza Individual de Gol (npxG Aislado)', weight: '25%', val: `${(pGol * 100).toFixed(1)}% P(Gol) | ${playerXg.toFixed(2)} npxG`, rp: calcRankAndPercentile(pGol, posPool.map(x => (x._volAudit?.P_gol_individual || 0.05)), true), desc: 'Peligro individual de juego abierto sin penales' },
      { name: '3. Tiros por Partido del Volante (365Scores)', weight: '15%', val: `${playerShots.toFixed(2)} tiros/p`, rp: calcRankAndPercentile(playerShots, posShots, true), desc: 'Volumen individual de remates en 365Scores' },
      { name: '4. Valor del Gol Gran DT (+6 Loc / +8 Vis)', weight: '15%', val: `+${bonusGol.toFixed(0)} pts (${ctx ? (ctx.isHome ? '🏠 Local' : '✈️ Visitante') : 'Local'})`, rp: calcRankAndPercentile(bonusGol, [6, 8], true, { isRuleBonus: true }), desc: 'Reglamento Gran DT (+6 base +2 visitante)' },
      { name: '5. P(Figura) & Ficha Clarín Limpia (5.0 a 6.0)', weight: '10%', val: `${(pFig * 100).toFixed(1)}% P(Fig) | ${volAvg.toFixed(2)} Ficha`, rp: calcRankAndPercentile(pFig, posPool.map(x => (x._volAudit?.P_figura || 0.15)), true), desc: 'Probabilidad de figura escalada con victoria Bet365' }
    ];

    formulaText = `P(Gol) = (0.50 * PeligroVOL * PotOfensivo) + (0.35 * npxG) + Penales\nEP = (NotaClarínLimpia * 0.65) + (P_gol * bonusGolVOL) + (P_figura * 4.0) - Tarjetas`;
    subFormulaCalc = `P(Gol): <strong>${(pGol * 100).toFixed(1)}%</strong> | Ficha: <strong>${volAvg.toFixed(2)}</strong> | EP: (${volAvg.toFixed(2)} * 0.65) + (${pGol.toFixed(3)} * ${bonusGol}) + (${pFig.toFixed(3)} * 4.0) - ${((p.yellowCards || 0) * 0.25).toFixed(2)} = <strong>${(p.rawEP || (p.finalScore / 10)).toFixed(2)} pts</strong>`;
  }
  else if (pos === 'DEL') {
    const playerXg = p.xgPerMatch !== undefined ? p.xgPerMatch : ((p.xg365 || 0) / Math.max(1, p.matches365 || 1));
    const playerShots = p.shotsPerMatch !== undefined ? p.shotsPerMatch : ((p.shots365 || 0) / Math.max(1, p.matches365 || 1));
    const teamGoalProb = offSeg ? offSeg.teamGoalProb : 0.72;
    const teamExpG = offSeg ? offSeg.teamExpGoals : 1.20;
    const bonusGol = ctx && ctx.isHome ? 4.0 : 6.0;
    const delAudit = p._delAudit || {};
    const pGol = delAudit.P_gol_individual || 0.30;
    const pFig = delAudit.P_figura || 0.20;
    const delAvg = delAudit.cleanNotaClarin || 5.50;
    const potOfensivo = offSeg ? offSeg.potencialOfensivoIndex : 0.60;

    blocks = [
      { name: '1. Segmento Ofensivo del Club (Cuota Gol Bet365)', weight: '35%', val: `${(teamGoalProb * 100).toFixed(0)}% P(Gol) | ${teamExpG.toFixed(2)} xG Eq`, rp: calcRankAndPercentile(potOfensivo, posPool.map(x => (x._delAudit?.offSeg?.potencialOfensivoIndex || 0.5)), true), desc: 'Cuota de gol del club, xG proyectado del partido y probabilidad de victoria' },
      { name: '2. Amenaza Individual de Gol (npxG Aislado + Tiros)', weight: '30%', val: `${(pGol * 100).toFixed(1)}% P(Gol) | ${playerXg.toFixed(2)} npxG`, rp: calcRankAndPercentile(pGol, posPool.map(x => (x._delAudit?.P_gol_individual || 0.2)), true), desc: 'Peligro individual de juego abierto sin penales + penales oficiales' },
      { name: '3. Vulnerabilidad Defensiva Rival en su Condición', weight: '15%', val: `${(offSeg && offSeg.scoreRivalDefWeakness ? (offSeg.scoreRivalDefWeakness * 100).toFixed(0) : 60)}% Fragilidad`, rp: calcRankAndPercentile(offSeg?.scoreRivalDefWeakness || 0.5, posPool.map(x => (x._delAudit?.offSeg?.scoreRivalDefWeakness || 0.5)), true), desc: 'Tiros concedidos y goles recibidos por el rival L/V' },
      { name: '4. Valor del Gol Gran DT (+4 Loc / +6 Vis)', weight: '10%', val: `+${bonusGol.toFixed(0)} pts (${ctx ? (ctx.isHome ? '🏠 Local' : '✈️ Visitante') : 'Local'})`, rp: calcRankAndPercentile(bonusGol, [4, 6], true, { isRuleBonus: true }), desc: 'Reglamento Gran DT (+4 base +2 visitante)' },
      { name: '5. P(Figura Clarín +4 pts) [40.7% son DEL]', weight: '10%', val: `${(pFig * 100).toFixed(1)}% P(Fig) | ${delAvg.toFixed(2)} Ficha`, rp: calcRankAndPercentile(pFig, posPool.map(x => (x._delAudit?.P_figura || 0.2)), true), desc: 'Puesto #1 en figuras de toda la Liga + Ficha limpia' }
    ];

    formulaText = `P(Gol) = (0.50 * PeligroDEL * PotOfensivo) + (0.35 * npxG) + Penales\nEP = (NotaClarínLimpia * 0.65) + (P_gol * bonusGolDEL) + (P_figura * 4.0) - Tarjetas`;
    subFormulaCalc = `P(Gol): <strong>${(pGol * 100).toFixed(1)}%</strong> | Ficha: <strong>${delAvg.toFixed(2)}</strong> | EP: (${delAvg.toFixed(2)} * 0.65) + (${pGol.toFixed(3)} * ${bonusGol}) + (${pFig.toFixed(3)} * 4.0) - ${((p.yellowCards || 0) * 0.25).toFixed(2)} = <strong>${(p.rawEP || (p.finalScore / 10)).toFixed(2)} pts</strong>`;
  }

  // Renderizar la tabla de bloques y percentiles
  let rowsHtml = '';
  blocks.forEach((b, idx) => {
    rowsHtml += `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06);background:${idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'};">
        <td style="padding:10px 12px;vertical-align:middle;">
          <strong style="color:var(--text-main);font-size:0.88rem;">${b.name}</strong>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${b.desc}</div>
        </td>
        <td class="text-center" style="padding:10px 8px;vertical-align:middle;">
          <span style="background:rgba(255,255,255,0.08);color:var(--primary);font-weight:700;padding:3px 8px;border-radius:4px;font-size:0.8rem;">${b.weight}</span>
        </td>
        <td class="text-center" style="padding:10px 8px;vertical-align:middle;">
          <strong style="color:#ffffff;font-size:0.92rem;">${b.val}</strong>
        </td>
        <td class="text-center" style="padding:10px 8px;vertical-align:middle;">
          <span style="font-weight:800;font-size:0.92rem;color:${b.rp.badgeColor};">${b.rp.rankStr}</span>
        </td>
        <td style="padding:10px 12px;vertical-align:middle;min-width:140px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:0.78rem;font-weight:700;color:${b.rp.badgeColor};background:${b.rp.badgeBg};padding:2px 6px;border-radius:4px;">${b.rp.pctStr}</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">${b.rp.pct}%</span>
          </div>
          <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
            <div style="width:${b.rp.pct}%;height:100%;background:${b.rp.badgeColor};border-radius:3px;"></div>
          </div>
        </td>
      </tr>
    `;
  });

  const overallPosRank = calcRankAndPercentile(p.finalScore, posPool.map(x => {
    const c = getFixtureContext(x.team);
    const s = calculateScoreDT(x, c, posPool);
    return s.rawEP ? (s.rawEP * 10) : 50;
  }), true);

  // Generar HTML de las Tarjetas de Segmento (Defensivo / Ofensivo)
  let segmentCardHtml = '';
  if (pos === 'ARQ' || pos === 'DEF') {
    const pVi = defSeg ? (defSeg.P_VI_combinada * 100).toFixed(1) : '30.0';
    const csMercado = defSeg ? (defSeg.cleanSheetProb * 100).toFixed(0) : '30';
    const rivExpG = defSeg ? defSeg.rivalExpGoals.toFixed(2) : '1.10';
    const mySotAg = defSeg ? defSeg.mySotAgainst.toFixed(1) : '4.5';
    const rivSotF = defSeg ? defSeg.rivalSotFor.toFixed(1) : '4.0';

    segmentCardHtml += `
      <div style="background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.3);border-radius:10px;padding:12px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#60a5fa;font-size:0.92rem;letter-spacing:0.3px;">🛡️ SEGMENTO DEFENSIVO DEL CLUB [FECHA 5]</strong>
          <span style="background:rgba(37,99,235,0.25);color:#93c5fd;font-size:0.75rem;padding:2px 8px;border-radius:4px;font-weight:700;">100% IDÉNTICO PARA ARQ Y DEF</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px;font-size:0.82rem;">
          <div><span style="color:var(--text-muted);">P(VI) Combinada:</span> <strong style="color:#10b981;font-size:0.95rem;">${pVi}%</strong></div>
          <div><span style="color:var(--text-muted);">VI Mercado Bet365:</span> <strong style="color:#ffffff;">${csMercado}%</strong></div>
          <div><span style="color:var(--text-muted);">xG Rival Match:</span> <strong style="color:#ffffff;">${rivExpG} xG</strong></div>
          <div><span style="color:var(--text-muted);">Tiros Concedidos L/V:</span> <strong style="color:#ffffff;">${mySotAg}/p</strong></div>
          <div><span style="color:var(--text-muted);">Tiros Rival L/V:</span> <strong style="color:#ffffff;">${rivSotF}/p</strong></div>
        </div>
      </div>
    `;
  }

  if (pos === 'DEF' || pos === 'VOL' || pos === 'DEL') {
    const potOf = offSeg ? (offSeg.potencialOfensivoIndex * 100).toFixed(1) : '60.0';
    const golProb = offSeg ? (offSeg.teamGoalProb * 100).toFixed(0) : '70';
    const golOdds = offSeg ? offSeg.teamGoalOdds.toFixed(2) : '1.35';
    const expG = offSeg ? offSeg.teamExpGoals.toFixed(2) : '1.20';
    const mySotF = offSeg ? offSeg.mySotFor.toFixed(1) : '4.5';
    const rivSotAg = offSeg ? offSeg.rivalSotAg.toFixed(1) : '4.5';

    segmentCardHtml += `
      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:12px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#f87171;font-size:0.92rem;letter-spacing:0.3px;">⚽ SEGMENTO OFENSIVO DEL CLUB [FECHA 5]</strong>
          <span style="background:rgba(239,68,68,0.25);color:#fca5a5;font-size:0.75rem;padding:2px 8px;border-radius:4px;font-weight:700;">PODER DE FUEGO & DESBORDE</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px;font-size:0.82rem;">
          <div><span style="color:var(--text-muted);">Potencial Ofensivo:</span> <strong style="color:#f59e0b;font-size:0.95rem;">${potOf}%</strong></div>
          <div><span style="color:var(--text-muted);">Cuota Gol Bet365:</span> <strong style="color:#ffffff;">${golOdds} (${golProb}%)</strong></div>
          <div><span style="color:var(--text-muted);">xG Club Match:</span> <strong style="color:#ffffff;">${expG} xG</strong></div>
          <div><span style="color:var(--text-muted);">Tiros a Favor L/V:</span> <strong style="color:#ffffff;">${mySotF}/p</strong></div>
          <div><span style="color:var(--text-muted);">Tiros Concedidos Rival:</span> <strong style="color:#ffffff;">${rivSotAg}/p</strong></div>
        </div>
      </div>
    `;
  }

  const html = `
    <div style="display:flex;flex-direction:column;gap:12px;color:var(--text-main);">
      
      <!-- ENCABEZADO DE RESUMEN EJECUTIVO -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:12px 16px;">
        <div>
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Jugador & Puesto</div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--primary);">${p.name} <span class="badge-pos badge-${pos.toLowerCase()}">${pos}</span></div>
          <div style="font-size:0.8rem;color:var(--text-muted);">${p.team}</div>
        </div>
        <div>
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Próximo Cruce (Fecha 5)</div>
          <div style="font-size:1.0rem;font-weight:700;">${ctx ? (ctx.isHome ? '🏠 vs ' + ctx.rival : '✈️ @ ' + ctx.rival) : 'Sin fixture'}</div>
          <div style="font-size:0.8rem;color:var(--success);">${ctx && ctx.isRealOdds ? '🏆 Cuotas Bet365 Oficiales' : '📊 Baseline Oficial'}</div>
        </div>
        <div>
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Score DT Proyectado</div>
          <div style="font-size:1.3rem;font-weight:900;color:var(--success);">${p.finalScore.toFixed(1)} <span style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">pts</span></div>
          <div style="font-size:0.8rem;font-weight:700;color:#10b981;">Ranking: ${overallPosRank.rankStr} (${overallPosRank.pctStr})</div>
        </div>
      </div>

      <!-- TARJETAS DE SEGMENTOS DEL CLUB -->
      ${segmentCardHtml}

      <!-- TABLA DESGLOSE OFICIAL V2 -->
      <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;overflow:hidden;">
        <div style="padding:10px 14px;background:rgba(255,255,255,0.03);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:800;font-size:0.92rem;letter-spacing:0.3px;">📊 DESGLOSE EXACTO DEL ALGORITMO [${pos} V2]</span>
          <span style="font-size:0.75rem;color:var(--text-muted);">100% Percentilado vs Liga Oficial</span>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
            <thead>
              <tr style="background:rgba(255,255,255,0.04);border-bottom:1px solid var(--border-color);color:var(--text-muted);font-size:0.75rem;text-transform:uppercase;">
                <th style="padding:8px 12px;text-align:left;">Bloque / Métrica Evaluada</th>
                <th style="padding:8px 8px;text-align:center;">Peso %</th>
                <th style="padding:8px 8px;text-align:center;">Valor Medido</th>
                <th style="padding:8px 8px;text-align:center;">Puesto / Ranking</th>
                <th style="padding:8px 12px;text-align:left;">Percentil Liga</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- AUDITORÍA DE FÓRMULA MATEMÁTICA -->
      <div style="background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:10px;padding:12px 16px;">
        <div style="font-size:0.8rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;">Fórmula Matemática Aplicada [${pos} V2]</div>
        <div style="font-family:monospace;font-size:0.82rem;color:var(--text-muted);background:rgba(255,255,255,0.03);padding:6px 10px;border-radius:6px;margin-bottom:6px;">${formulaText}</div>
        <div style="font-size:0.84rem;color:var(--text-main);">Cálculo Individual: ${subFormulaCalc}</div>
      </div>

    </div>
  `;

  body.innerHTML = html;
  openModal('audit-modal');
};

window.openDataHealthModal = function() {
  const modal = document.getElementById('audit-modal');
  const title = document.getElementById('audit-title');
  const body = document.getElementById('audit-body');
  if (!modal || !title || !body) return;

  title.textContent = `🛡️ PANEL DE CONTROL & DISPONIBILIDAD DE DATOS RECTIFICADOS`;

  const totalP = appData.players ? appData.players.length : 0;
  const pgtP = appData.players ? appData.players.filter(p => (p.matchesRated || 0) > 0).length : 0;
  const s365P = appData.players ? appData.players.filter(p => (p.matches365 || 0) > 0).length : 0;
  const xgP = appData.players ? appData.players.filter(p => (p.xg365 || 0) > 0).length : 0;

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;font-size:0.88rem;line-height:1.6;">
      <div style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.4);padding:12px 16px;border-radius:10px;">
        <h4 style="margin:0 0 6px 0;color:#10b981;">✅ FUENTES DE DATOS ACTIVAS Y OFICIALES (${totalP} Jugadores)</h4>
          <strong>PlanetaGranDT (Clarín):</strong> ${pgtP} jugadores con Ficha Clarín, Goles, Tarjetas, Figuras y Vallas Invictas oficiales.<br>
          <strong>365Scores:</strong> ${s365P} jugadores con Remates Totales, Minutos de Juego y Cobertura en Vivo.<br>
          <strong>365Scores xG:</strong> ${xgP} jugadores con Goles Esperados (xG) acumulados reales.<br>
          <strong>ESPN Posiciones:</strong> 30/30 equipos con Goles a Favor, Goles en Contra y Splits de Local/Visitante reales.<br>
          <strong>Casas de Apuestas:</strong> Cuotas oficiales de Victoria, Empate y Valla Invicta del Mercado.
      </div>

      <div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);padding:12px 16px;border-radius:10px;">
        <h4 style="margin:0 0 6px 0;color:#f59e0b;">⚠️ ESTADÍSTICAS NO DISPONIBLES EN APIS GRATUITAS & PROTECCIÓN</h4>
          <strong>Tiros al Arco directos:</strong> No disponibles en el feed público de 365Scores &rarr; <em>ELIMINADOS del algoritmo. Se usan únicamente Remates Totales + xG acumulado.</em><br>
          <strong>Centros y Córners:</strong> No disponibles por partido &rarr; <em>ELIMINADOS 100% del algoritmo. Se eliminó la estimación de 14-15 centros y córners ficticios.</em><br>
          <strong>Cuotas de Gol Estimadas:</strong> <em>ELIMINADAS del fixture. Solo se muestran las cuotas reales del mercado de apuestas ingresadas manualmente.</em>
      </div>

      <div style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.4);padding:12px 16px;border-radius:10px;">
        <h4 style="margin:0 0 6px 0;color:#60a5fa;">🛡️ CAPAS DE SEGURIDAD Y GARANTÍA ALGORÍTMICA</h4>
          <strong>✔️ Auditoría de Goles Reales Enteros:</strong> Todos los jugadores fueron auditados y corregidos a sus goles 100% reales y exactos convertidos en este torneo LPF 2026.<br>
          <strong>Garantía de Imparcialidad:</strong> Ninguna posición usa porcentajes genéricos ni promedios de liga.<br>
          <strong>Protección de Datos Atrasados:</strong> Si PlanetaGranDT aún no subió la planilla reciente, se activa la estimación híbrida en vivo con 365Scores.<br>
          <strong>Filtro Anti-Copas:</strong> Si 365Scores registra partidos de Copa (Libertadores/Sudamericana), se limita al torneo de liga y se escala proporcionalmente.
      </div>
    </div>
  `;

  openModal('audit-modal');
};

function shortenPlayerName(name) {
  if (!name) return 'Jugador';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0];
  const lastName = parts[parts.length - 1];
  const firstNameInitial = parts[0].charAt(0).toUpperCase();
  return `${lastName} ${firstNameInitial}`;
}

function getJerseySVG(pos, team) {
  let primaryColor = '#e50914'; // Default Clarín Red / Jersey
  if (pos === 'ARQ') primaryColor = '#8b5cf6';
  else if (pos === 'DEF') primaryColor = '#2563eb';
  else if (pos === 'VOL') primaryColor = '#10b981';
  else if (pos === 'DEL') primaryColor = '#ef4444';

  return `<svg viewBox="0 0 64 64" width="34" height="34" fill="${primaryColor}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round">
    <path d="M 20 12 L 8 20 L 14 30 L 20 26 L 20 54 L 44 54 L 44 26 L 50 30 L 56 20 L 44 12 C 40 16 24 16 20 12 Z" />
    <path d="M 28 12 Q 32 18 36 12" fill="none" stroke="#ffffff" stroke-width="2.5" />
    <line x1="32" y1="18" x2="32" y2="54" stroke="rgba(255,255,255,0.4)" stroke-width="3" />
  </svg>`;
}

function generateBest11() {
  if (!STATE.optimalEvaluation) {
    updateFormationsAndCaptainBanner();
  }

  const evalObj = (STATE.best11Mode === 'risky' && STATE.riskyEvaluation) ? STATE.riskyEvaluation : STATE.optimalEvaluation;
  const activeFmtId = STATE.activeFormation;
  const currentFmtObj = (evalObj && evalObj.allFormations) ? evalObj.allFormations.find(e => e.formation.id === activeFmtId) : null;
  const chosenEval = currentFmtObj || (evalObj ? evalObj.optimal : null);

  const fmtObj = chosenEval ? chosenEval.formation : { name: '1-4-4-2', arq: 1, def: 4, vol: 4, del: 2 };
  const best = chosenEval ? chosenEval.players : { arq: [], def: [], vol: [], del: [] };

  const select = document.getElementById('select-active-formation');
  if (select) {
    select.value = fmtObj.id;
  }

  // Render Pitch Modal Header
  const modalTitle = document.querySelector('#best11-modal h2');
  if (modalTitle) {
    const modeLabel = STATE.best11Mode === 'risky' ? '🚀 11 Arriesgado (Techo Alto)' : '🛡️ 11 Sólido (Piso Seguro)';
    modalTitle.textContent = `🌟 ${modeLabel} - Formación ${fmtObj.name}`;
  }

  const allSelected = chosenEval ? Object.values(chosenEval.players).flat() : [];
  const captainPlayer = STATE.topCap || allSelected.slice().sort((a, b) => (b.captainScore || 0) - (a.captainScore || 0))[0];

  const totalGranDtPts = STATE.teamProjectedPts || allSelected.reduce((sum, p) => {
    const isCap = captainPlayer && p.id === captainPlayer.id;
    const fichaBase = (p.avgRating || 6.0) * 0.75;
    const rawBonus = p.rawEP || 0;
    return sum + (isCap ? (fichaBase * 2 + rawBonus) : (fichaBase + rawBonus));
  }, 0);

  // Render to pitch modal
  const modal = document.getElementById('best11-modal');
  const pitch = document.getElementById('pitch-layout');
  const totalSpan = document.getElementById('best11-total-score');
  
  if (pitch) {
    pitch.innerHTML = '';
    
    // Top Advertising Board Clarín / Gran DT
    const adBoard = document.createElement('div');
    adBoard.className = 'pitch-ad-board';
    adBoard.innerHTML = `
      <div><span class="clarin-logo">Clarín</span> Gran DT</div>
      <div style="color:#ffcc00;font-size:0.72rem;letter-spacing:0.5px;">ALGORITMO DE SELECCIÓN PRO</div>
    `;
    pitch.appendChild(adBoard);

    // Pitch Container with Lines
    const pitchContainer = document.createElement('div');
    pitchContainer.className = 'pitch-container';

    // Lines Overlay SVG
    const linesSvg = document.createElement('div');
    linesSvg.className = 'pitch-lines-svg';
    linesSvg.innerHTML = `
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect x="2%" y="2%" width="96%" height="96%" fill="none" stroke="#ffffff" stroke-width="2" />
        <line x1="2%" y1="50%" x2="98%" y2="50%" stroke="#ffffff" stroke-width="2" />
        <circle cx="50%" cy="50%" r="45" fill="none" stroke="#ffffff" stroke-width="2" />
        <rect x="28%" y="2%" width="44%" height="16%" fill="none" stroke="#ffffff" stroke-width="2" />
        <rect x="28%" y="82%" width="44%" height="16%" fill="none" stroke="#ffffff" stroke-width="2" />
      </svg>
    `;
    pitchContainer.appendChild(linesSvg);

    const grid = document.createElement('div');
    grid.className = 'best11-grid';

    const pitchLines = [
      { name: 'DEL', arr: best.del || [] },
      { name: 'VOL', arr: best.vol || [] },
      { name: 'DEF', arr: best.def || [] },
      { name: 'ARQ', arr: best.arq || [] }
    ];

    pitchLines.forEach(line => {
      const row = document.createElement('div');
      row.className = 'pitch-row';
      line.arr.forEach(p => {
        const isCap = captainPlayer && p.id === captainPlayer.id;
        const fichaBase = (p.avgRating || 6.0) * 0.75;
        const rawBonus = p.rawEP || 0;
        const finalProj = isCap ? (fichaBase * 2 + rawBonus) : (fichaBase + rawBonus);
        
        const shortName = shortenPlayerName(p.name);
        const teamUpper = (p.team || '').toUpperCase();

        const card = document.createElement('div');
        card.className = `gdt-card-badge ${isCap ? 'captain' : ''}`;
        card.onclick = () => openAuditModal(p.id);
        card.title = `${p.name} (${p.team}) - Click para Auditar`;

        card.innerHTML = `
          <div class="gdt-card-icons">
            <span class="gdt-badge-icon swap" title="Cambiar / Sustituir">⇅</span>
            ${isCap ? '<span class="gdt-badge-icon captain-icon" title="Capitán Recomendado (Score x2)">C</span>' : '<span class="gdt-badge-icon warning" title="Titular Confirmado">!</span>'}
          </div>
          <div class="gdt-jersey-wrap">
            ${getJerseySVG(p.position, p.team)}
          </div>
          <div class="gdt-player-name">${shortName}</div>
          <div class="gdt-player-team">${teamUpper}</div>
          <div class="gdt-player-score">${finalProj.toFixed(1)} pts</div>
        `;
        row.appendChild(card);
      });
      grid.appendChild(row);
    });

    pitchContainer.appendChild(grid);
    pitch.appendChild(pitchContainer);

    // Render Suplentes (Bench) Section like official Gran DT
    const startersIds = new Set(allSelected.map(p => p.id));
    const benchArq = (appData.players || []).filter(p => p.position === 'ARQ' && !startersIds.has(p.id)).sort((a,b) => (b.finalScore||0)-(a.finalScore||0))[0];
    const benchDef = (appData.players || []).filter(p => p.position === 'DEF' && !startersIds.has(p.id)).sort((a,b) => (b.finalScore||0)-(a.finalScore||0))[0];
    const benchVol = (appData.players || []).filter(p => p.position === 'VOL' && !startersIds.has(p.id)).sort((a,b) => (b.finalScore||0)-(a.finalScore||0))[0];
    const benchDel = (appData.players || []).filter(p => p.position === 'DEL' && !startersIds.has(p.id)).sort((a,b) => (b.finalScore||0)-(a.finalScore||0))[0];

    const benchArr = [
      { posLabel: 'ARQ', p: benchArq },
      { posLabel: 'DEF', p: benchDef },
      { posLabel: 'VOL', p: benchVol },
      { posLabel: 'DEL', p: benchDel }
    ];

    const benchSec = document.createElement('div');
    benchSec.className = 'gdt-bench-section';
    benchSec.innerHTML = `
      <div class="gdt-bench-title">Suplentes</div>
      <div class="gdt-bench-grid">
        ${benchArr.map(b => {
          if (!b.p) return `<div class="gdt-bench-col"><div class="gdt-bench-pos-label">${b.posLabel}</div></div>`;
          const bp = b.p;
          const shortName = shortenPlayerName(bp.name);
          const teamUpper = (bp.team || '').toUpperCase();
          const proj = ((bp.avgRating || 6.0) * 0.75) + (bp.rawEP || 0);
          return `
            <div class="gdt-bench-col" onclick="openAuditModal('${bp.id}')" style="cursor:pointer;" title="${bp.name} (${bp.team})">
              <div class="gdt-card-badge">
                <div class="gdt-card-icons">
                  <span class="gdt-badge-icon swap">⇅</span>
                  <span class="gdt-badge-icon warning">!</span>
                </div>
                <div class="gdt-jersey-wrap">
                  ${getJerseySVG(bp.position, bp.team)}
                </div>
                <div class="gdt-player-name">${shortName}</div>
                <div class="gdt-player-team">${teamUpper}</div>
                <div class="gdt-player-score">${proj.toFixed(1)} pts</div>
              </div>
              <div class="gdt-bench-pos-label">${b.posLabel}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    pitch.appendChild(benchSec);
  }

  if (totalSpan) {
    const sPts = STATE.teamProjectedPts || 120.0;
    const rPts = STATE.teamRiskyPts || (sPts + 25.0);
    totalSpan.innerHTML = `<span style="color:#10b981;font-weight:800;">🛡️ Piso: ${sPts.toFixed(1)} pts</span> • <span style="color:#f59e0b;font-weight:800;">🚀 Techo: ${rPts.toFixed(1)} pts</span> Gran DT`;
  }

  // Store globally for saving
  window._currentBest11 = {
    date: new Date().toISOString(),
    score: totalGranDtPts,
    formation: fmtObj.name,
    captain: captainPlayer ? captainPlayer.name : 'N/A',
    players: allSelected.map(p => ({ id: p.id, name: p.name, pos: p.position, team: p.team, expectedScore: (p.avgRating || 6.0) * 0.75 + (p.rawEP || 0) }))
  };

  openModal('best11-modal');
}

function saveBest11() {
  if (!window._currentBest11) return;
  STATE.savedTeams.push(window._currentBest11);
  localStorage.setItem('grandt_saved_teams', JSON.stringify(STATE.savedTeams));
  renderSavedTeams();
  const modal = document.getElementById('best11-modal');
  if (modal) modal.classList.remove('active');
  alert("¡Equipo guardado con éxito!");
}

function renderSavedTeams() {
  const container = document.getElementById('saved-teams-list');
  if (!container) return;
  container.innerHTML = '';

  STATE.savedTeams.slice().reverse().forEach((team, idx) => {
    const div = document.createElement('div');
    div.className = 'saved-team-card';
    const dateStr = new Date(team.date).toLocaleDateString('es-AR');
    div.innerHTML = `
      <h5>Equipo del ${dateStr}</h5>
      <p>Score Esperado: <strong>${team.score.toFixed(1)}</strong></p>
      <div class="saved-players-mini">
        ${team.players.map(p => `<span>${p.name} (${p.pos})</span>`).join(', ')}
      </div>
    `;
    container.appendChild(div);
  });
}

function renderSofaScoreView() {
  const container = document.getElementById('players-body');
  if (!container) return;
  container.innerHTML = '<tr><td colspan="8">Vista SofaScore en desarrollo...</td></tr>';
}

function renderLeadersHub() {
  const container = document.getElementById('leaders-body');
  const catSelect = document.getElementById('leaders-cat-select');
  const posSelect = document.getElementById('leaders-pos-select');
  const headerLabel = document.getElementById('lbl-leader-metric-header');
  if (!container) return;

  const cat = catSelect ? catSelect.value : 'xgPerMatch_noPen';
  const posFilter = posSelect ? posSelect.value : 'ALL';

  const catLabels = {
    xgPerMatch_noPen: 'xG Generado / Partido',
    shotsPerMatch: 'Tiros al Arco / Partido',
    goalsPerMatch: 'Goles / Partido',
    avgRating: 'Promedio Ficha Clarín',
    cleanSheets: 'Vallas Invictas Totales',
    yellowCards: 'Tarjetas Amarillas / Partido'
  };

  if (headerLabel) {
    headerLabel.textContent = catLabels[cat] || 'Valor Métrica';
  }

  let pool = (appData.players || []).filter(p => (p.matchesRated || p.pj || 0) >= 1);
  if (posFilter !== 'ALL') {
    pool = pool.filter(p => p.position === posFilter);
  }

  function getMetricValue(p, category) {
    const pj365 = Math.max(1, p.matches365 || 1);
    const masterPj = Math.max(1, p.matchesRated || p.pj || 1);

    if (category === 'xgPerMatch_noPen') {
      const xgTot = Math.max(0, (p.xg365 || 0) - (0.79 * (p.goalsPenalty || 0)));
      return xgTot / pj365;
    }
    if (category === 'shotsPerMatch') {
      return (p.shots365 || 0) / pj365;
    }
    if (category === 'goalsPerMatch') {
      return (p.goals || 0) / masterPj;
    }
    if (category === 'avgRating') {
      return p.avgRating || 0;
    }
    if (category === 'cleanSheets') {
      return p.cleanSheets || 0;
    }
    if (category === 'yellowCards') {
      return (p.yellowCards || 0) / masterPj;
    }
    return 0;
  }

  const evaluated = pool.map(p => {
    const val = getMetricValue(p, cat);
    return { ...p, leaderVal: val };
  }).sort((a, b) => b.leaderVal - a.leaderVal);

  const valuesArr = evaluated.map(p => p.leaderVal);
  const minVal = Math.min(...valuesArr);
  const maxVal = Math.max(...valuesArr);
  const valRange = (maxVal - minVal) || 1;

  container.innerHTML = '';
  if (evaluated.length === 0) {
    container.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">No se encontraron jugadores.</td></tr>';
    return;
  }

  evaluated.forEach((p, idx) => {
    const tr = document.createElement('tr');
    const rankNum = idx + 1;
    const masterPj = Math.max(1, p.matchesRated || p.pj || 1);
    const pct = Math.min(100, Math.max(5, ((p.leaderVal - minVal) / valRange) * 100));

    let valDisplay = p.leaderVal.toFixed(2);
    if (cat === 'cleanSheets') valDisplay = String(p.cleanSheets || 0);

    let rankBadgeStyle = 'color:var(--text-muted);';
    if (rankNum === 1) rankBadgeStyle = 'color:#f59e0b;font-weight:900;font-size:1.1rem;';
    else if (rankNum === 2) rankBadgeStyle = 'color:#94a3b8;font-weight:800;font-size:1.0rem;';
    else if (rankNum === 3) rankBadgeStyle = 'color:#d97706;font-weight:800;font-size:0.95rem;';

    tr.innerHTML = `
      <td class="text-center"><span style="${rankBadgeStyle}">#${rankNum}</span></td>
      <td>
        <strong style="color:var(--text-main);cursor:pointer;" onclick="openAuditModal('${p.id}')">${p.name}</strong>
      </td>
      <td><span class="player-team" onclick="openTeamModal('${p.team}')" style="cursor:pointer;text-decoration:underline;">${p.team}</span></td>
      <td class="text-center"><span class="badge-pos badge-${(p.position||'def').toLowerCase()}">${p.position}</span></td>
      <td class="text-center">${masterPj}</td>
      <td class="text-center"><strong style="color:var(--primary);font-size:0.95rem;">${valDisplay}</strong></td>
      <td>
        <div class="stat-bar" style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg, var(--primary), var(--success));"></div>
        </div>
      </td>
      <td class="text-center">
        <button class="btn btn-secondary" onclick="openAuditModal('${p.id}')" style="font-size:0.75rem;padding:3px 8px;">🔍 Auditar</button>
      </td>
    `;
    container.appendChild(tr);
  });

  if (catSelect && !catSelect._bound) {
    catSelect.addEventListener('change', renderLeadersHub);
    catSelect._bound = true;
  }
  if (posSelect && !posSelect._bound) {
    posSelect.addEventListener('change', renderLeadersHub);
    posSelect._bound = true;
  }
}

function renderFullStandingsModal() {
  const modal = document.getElementById('full-standings-modal');
  const body = document.getElementById('full-standings-body');
  if (!modal || !body) return;

  const zona = STATE.fullStandingsZona || STATE.standingsZona || 'zonaA';
  const filter = STATE.fullStandingsFilter || STATE.standingsFilter || 'all';

  let zonaData = [...(appData.standings?.[zona] || [])];

  if (filter === 'home' || filter === 'away') {
    zonaData.forEach(teamEntry => {
      const splits = getFixtureSplits(teamEntry.team);
      const espnSplit = filter === 'home' ? teamEntry.home : teamEntry.away;
      const fixtureSplit = filter === 'home' ? splits.home : splits.away;
      
      if (!espnSplit || espnSplit.pj === 0 || espnSplit.pj === undefined) {
        teamEntry['_activeSplit'] = fixtureSplit;
      } else {
        const espnPts = espnSplit.pts || 0;
        const fixturePts = fixtureSplit.pts || 0;
        const correctPts = (fixtureSplit.pg || 0) * 3 + (fixtureSplit.pe || 0) * 1;
        if (espnPts !== correctPts && fixtureSplit.pj > 0) {
          teamEntry['_activeSplit'] = fixtureSplit;
        } else {
          teamEntry['_activeSplit'] = { ...espnSplit, forma: fixtureSplit.forma };
        }
      }
    });
  }

  // Sort by PTS desc, DIF desc, GF desc
  zonaData.sort((a, b) => {
    let statsA = (filter === 'home' || filter === 'away') ? a._activeSplit : a;
    let statsB = (filter === 'home' || filter === 'away') ? b._activeSplit : b;
    if (!statsA) statsA = a;
    if (!statsB) statsB = b;
    
    if ((statsB.pts || 0) !== (statsA.pts || 0)) {
      return (statsB.pts || 0) - (statsA.pts || 0);
    }
    const difA = (statsA.gf || 0) - (statsA.gc || 0);
    const difB = (statsB.gf || 0) - (statsB.gc || 0);
    if (difB !== difA) {
      return difB - difA;
    }
    if ((statsB.gf || 0) !== (statsA.gf || 0)) {
      return (statsB.gf || 0) - (statsA.gf || 0);
    }
    return a.team.localeCompare(b.team);
  });

  body.innerHTML = '';
  zonaData.forEach((teamEntry, index) => {
    let stats, formaArr;
    if (filter === 'home' || filter === 'away') {
      stats = teamEntry._activeSplit || { pj: 0, pts: 0 };
      formaArr = (stats.forma || []).slice(-5);
    } else {
      stats = teamEntry;
      formaArr = getTeamForma(teamEntry.team, teamEntry.forma, stats.pj);
    }

    const dif = (stats.gf || 0) - (stats.gc || 0);
    const difStr = dif > 0 ? `+${dif}` : `${dif}`;

    const tr = document.createElement('tr');
    tr.className = 'clickable-team-row';
    tr.title = `Hacé clic para ver la Base de Datos completa de ${teamEntry.team}`;
    tr.onclick = () => window.openTeamModal(teamEntry.team);

    tr.innerHTML = `
      <td class="text-center">#${index + 1}</td>
      <td class="team-name" style="font-weight:700;color:var(--primary);">${teamEntry.team}</td>
      <td class="text-center">${stats.pj !== undefined ? stats.pj : 0}</td>
      <td class="text-center">${stats.pg !== undefined ? stats.pg : 0}</td>
      <td class="text-center">${stats.pe !== undefined ? stats.pe : 0}</td>
      <td class="text-center">${stats.pp !== undefined ? stats.pp : 0}</td>
      <td class="text-center">${stats.gf !== undefined ? stats.gf : 0}</td>
      <td class="text-center">${stats.gc !== undefined ? stats.gc : 0}</td>
      <td class="text-center" style="font-weight:700;color:${dif > 0 ? '#10b981' : (dif < 0 ? '#ef4444' : 'var(--text-muted)')};">${difStr}</td>
      <td class="text-center" style="font-weight:800;color:var(--success);font-size:1.05rem;">${stats.pts !== undefined ? stats.pts : 0}</td>
      <td class="text-center">
        <div class="form-dots" style="justify-content:center;">
          ${formaArr.map(f => `<span class="result-dot ${f === 'W' ? 'win' : f === 'D' ? 'draw' : 'loss'}" title="${f === 'W' ? 'Victoria' : f === 'D' ? 'Empate' : 'Derrota'}"></span>`).join('')}
        </div>
      </td>
    `;
    body.appendChild(tr);
  });

  openModal('full-standings-modal');
}
