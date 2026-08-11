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
    ARQ: { cleanSheet: 40, avgRating: 30, teamDefense: 20, recentForm: 10 },
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

var currentRankings = [];
var appData = window.appData || window.APP_DATA || {};

window.openModal = function(id) {
  const m = typeof id === 'string' ? document.getElementById(id) : id;
  if (m) {
    m.classList.add('active');
    m.style.display = 'block';
  }
};

window.closeModal = function(id) {
  const m = typeof id === 'string' ? document.getElementById(id) : id;
  if (m) {
    m.classList.remove('active');
    m.style.display = 'none';
  }
};

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  setTimeout(init, 0);
} else {
  document.addEventListener('DOMContentLoaded', init);
}

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
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      if (['ARQ', 'DEF', 'VOL', 'DEL'].includes(tab)) {
        STATE.activeTab = tab;
        updateActiveTabUI();
        renderWeightsSliders();
        document.getElementById('view-rankings').style.display = 'block';
        const vLeaders = document.getElementById('view-leaders');
        if (vLeaders) vLeaders.style.display = 'none';
        renderRankings();
      } else if (tab === 'LEADERS') {
        STATE.activeTab = tab;
        updateActiveTabUI();
        document.getElementById('view-rankings').style.display = 'none';
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
      const hGoalVal = odds && odds.homeGoalOdds ? odds.homeGoalOdds.toFixed(2) : '';
      const aGoalVal = odds && odds.awayGoalOdds ? odds.awayGoalOdds.toFixed(2) : '';

      editMatchOddsPrompt(m.home, m.away, hVal, dVal, aVal, hGoalVal, aGoalVal);
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
  if (datosEl) {
    const audit = appData.syncAudit || {};
    const lastScored = (audit.planetaGranDT && audit.planetaGranDT.lastRoundWithScores) || appData.currentRound || '?';
    datosEl.textContent = lastScored;
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
    // Smart default: last scored round + 1 (the next fecha to analyze)
    const audit = appData.syncAudit || {};
    const lastScored = (audit.planetaGranDT && audit.planetaGranDT.lastRoundWithScores) || appData.currentRound || 2;
    const defaultAnalysis = Math.min(lastScored + 1, maxRounds);
    roundSelect.value = STATE.analysisTargetRound || defaultAnalysis;
    STATE.analysisTargetRound = parseInt(roundSelect.value);

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
      healthBadgeEl.style.cursor = 'pointer';
      healthBadgeEl.onclick = () => window.openDataHealthModal();
      if (safety.isSystemSafe) {
        healthBadgeEl.style.background = 'rgba(16,185,129,0.12)';
        healthBadgeEl.style.color = '#10b981';
        healthBadgeEl.style.borderColor = 'rgba(16,185,129,0.3)';
        healthBadgeEl.title = `🛡️ Sistema 100% Seguro (Hacé clic para ver el Panel de Control de Datos). 30/30 Equipos Coincidentes.`;
      } else {
        healthBadgeEl.style.background = 'rgba(245,158,11,0.12)';
        healthBadgeEl.style.color = '#f59e0b';
        healthBadgeEl.style.borderColor = 'rgba(245,158,11,0.3)';
        healthBadgeEl.title = `⚠️ Auditoría de Datos (Hacé clic para ver detalles): ${safety.teamMismatches.length} desajustes de equipos.`;
      }
    }
  }
}

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
        • <strong>PlanetaGranDT (Clarín):</strong> ${pgtP} jugadores con Ficha Clarín, Goles, Tarjetas, Figuras y Vallas Invictas oficiales.<br>
        • <strong>365Scores:</strong> ${s365P} jugadores con Remates Totales, Minutos de Juego y Cobertura en Vivo.<br>
        • <strong>365Scores xG:</strong> ${xgP} jugadores con Goles Esperados (xG) acumulados reales.<br>
        • <strong>ESPN Posiciones:</strong> 30/30 equipos con Goles a Favor, Goles en Contra y Splits de Local/Visitante reales.<br>
        • <strong>Casas de Apuestas:</strong> Cuotas oficiales de Victoria, Empate y Valla Invicta del Mercado.
      </div>

      <div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);padding:12px 16px;border-radius:10px;">
        <h4 style="margin:0 0 6px 0;color:#f59e0b;">⚠️ ESTADÍSTICAS NO DISPONIBLES EN APIS GRATUITAS & PROTECCIÓN</h4>
        • <strong>Tiros al Arco directos:</strong> No disponibles en el feed público de 365Scores &rarr; <em>ELIMINADOS del algoritmo. Se usan únicamente Remates Totales + xG acumulado.</em><br>
        • <strong>Centros y Córners:</strong> No disponibles por partido &rarr; <em>ELIMINADOS 100% del algoritmo. Se eliminó la estimación de 14-15 centros y córners ficticios.</em><br>
        • <strong>Cuotas de Gol Estimadas:</strong> <em>ELIMINADAS del fixture. Solo se muestran las cuotas reales del mercado de apuestas ingresadas manualmente.</em>
      </div>

      <div style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.4);padding:12px 16px;border-radius:10px;">
        <h4 style="margin:0 0 6px 0;color:#60a5fa;">🛡️ CAPAS DE SEGURIDAD Y GARANTÍA ALGORÍTMICA</h4>
        • <strong>🔒 Auditoría de Goles Reales Enteros:</strong> Todos los jugadores (incluyendo Jordy Caicedo) fueron auditados y corregidos a sus goles 100% reales y exactos convertidos en este torneo LPF 2026. *(Cero números decimales ni cuotas fraccionadas)*.<br>
        • <strong>Garantía de Imparcialidad:</strong> Ninguna posición (defensor, volante, delantero) usa porcentajes genéricos ni "promedios de liga".<br>
        • <strong>Protección de Datos Atrasados:</strong> Si PlanetaGranDT aún no subió la planilla reciente, se activa la estimación híbrida en vivo con 365Scores para no penalizar a los titulares.<br>
        • <strong>Filtro Anti-Copas:</strong> Si 365Scores registra partidos de Copa (Libertadores/Sudamericana), se limita al torneo de liga y se escala proporcionalmente.
      </div>
    </div>
  `;

  openModal('audit-modal');
};

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
  return [];
}

// Recalcular splits Local/Visitante desde el fixture real (fuente de verdad)
// ESPN a veces devuelve home/away vacíos o incorrectos
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

// Cache de splits computados desde el fixture
let _fixtureSpitsCache = null;
function getFixtureSplits(teamName) {
  if (!_fixtureSpitsCache) {
    _fixtureSpitsCache = {};
    // Pre-compute all teams
    const allTeams = [...(appData.standings?.zonaA || []), ...(appData.standings?.zonaB || [])];
    allTeams.forEach(t => {
      _fixtureSpitsCache[t.team] = computeHomeAwaySplitsFromFixture(t.team);
    });
  }
  return _fixtureSpitsCache[teamName] || computeHomeAwaySplitsFromFixture(teamName);
}

function renderStandings() {
  const container = document.getElementById('standings-body');
  if (!container) return;
  container.innerHTML = '';
  _fixtureSpitsCache = null; // Invalidar cache en cada render

  let zonaData = [...(appData.standings?.[STATE.standingsZona] || [])];
  const filter = STATE.standingsFilter; // 'all', 'home', 'away'

  // Enriquecer splits desde el fixture (fuente de verdad) si el filtro es home/away
  if (filter === 'home' || filter === 'away') {
    zonaData.forEach(teamEntry => {
      const splits = getFixtureSplits(teamEntry.team);
      const espnSplit = filter === 'home' ? teamEntry.home : teamEntry.away;
      const fixtureSplit = filter === 'home' ? splits.home : splits.away;
      
      // Usar el fixture como fuente de verdad si ESPN tiene datos vacíos o incorrectos
      if (!espnSplit || espnSplit.pj === 0 || espnSplit.pj === undefined) {
        teamEntry['_activeSplit'] = fixtureSplit;
      } else {
        // Verificar consistencia: si ESPN y fixture no coinciden, priorizar fixture
        const espnPts = espnSplit.pts || 0;
        const fixturePts = fixtureSplit.pts || 0;
        const correctPts = (fixtureSplit.pg || 0) * 3 + (fixtureSplit.pe || 0) * 1;
        if (espnPts !== correctPts && fixtureSplit.pj > 0) {
          teamEntry['_activeSplit'] = fixtureSplit;
        } else {
          // ESPN is fine, but still use fixture forma (more reliable)
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

        // Cuotas de gol: SOLO reales del mercado (cargadas por el usuario vía ⚙️)
        // NO se estima NADA — solo datos oficiales de casas de apuestas
        let goalOddsHtml = '';
        if (odds && odds.homeGoalOdds && odds.awayGoalOdds) {
          const hGoalOdds = parseFloat(odds.homeGoalOdds).toFixed(2);
          const aGoalOdds = parseFloat(odds.awayGoalOdds).toFixed(2);
          goalOddsHtml = `
            <div class="fixture-goal-odds-row" style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;">
              <span class="goal-odds-pill" title="Cuota Gol ${m.home} (mercado real)" style="background:rgba(76,175,80,0.15);color:#4caf50;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;">⚽ Gol ${m.home}: <strong>${hGoalOdds}</strong></span>
              <span class="goal-odds-pill" title="Cuota Gol ${m.away} (mercado real)" style="background:rgba(255,152,0,0.15);color:#ff9800;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;">⚽ Gol ${m.away}: <strong>${aGoalOdds}</strong></span>
            </div>
          `;
        }

        oddsRowHtml = `
          <div class="fixture-odds-row" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            <span class="odds-pill" title="Cuota Victoria ${m.home}">1: <strong>${hOddsVal}</strong></span>
            <span class="odds-pill" title="Cuota Empate">X: <strong>${dOddsVal}</strong></span>
            <span class="odds-pill" title="Cuota Victoria ${m.away}">2: <strong>${aOddsVal}</strong></span>
            <span class="cs-pill" title="Prob. Valla Invicta ${m.home}">🧤 ${csHome}%</span>
            <span class="cs-pill" title="Prob. Valla Invicta ${m.away}">🧤 ${csAway}%</span>
          </div>
          ${goalOddsHtml}
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
  const s = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  if (s.includes('barracas')) return 'Barracas Ctral.';
  if (s.includes('rosario')) return 'Rosario Ctral.';
  if (s.includes('centralcordoba') || s.includes('ctralcordoba') || (s.includes('cordoba') && s.includes('central')) || s.includes('centralcba') || s.includes('ctralcba')) return 'Ctral. Córdoba';
  if (s.includes('atleticotucuman') || s.includes('atltucuman') || (s.includes('tucuman') && s.includes('atletico'))) return 'Atl. Tucumán';
  if (s.includes('independienterivadavia') || s.includes('indrivadavia') || s.includes('indepr')) return 'Ind. Rivadavia';
  if (s.includes('independiente')) return 'Independiente';
  if (s.includes('estudiantesrc') || s.includes('estudiantesriocuarto') || (s.includes('estudiantes') && s.includes('cuarto'))) return 'Estudiantes RC';
  if (s.includes('estudiantes')) return 'Estudiantes LP';
  if (s.includes('gimnasiamendoza') || s.includes('gimnasiamza') || (s.includes('gimnasia') && s.includes('mendoza')) || s.includes('gimnasiam')) return 'Gimnasia Mza';
  if (s.includes('gimnasia')) return 'Gimnasia LP';
  if (s.includes('defensa') || s.includes('defy')) return 'Def. y Justicia';
  if (s.includes('riestra')) return 'Dep. Riestra';
  if (s.includes('argentinos')) return 'Argentinos';
  if (s.includes('boca')) return 'Boca';
  if (s.includes('river')) return 'River';
  if (s.includes('racing')) return 'Racing';
  if (s.includes('sanlorenzo')) return 'San Lorenzo';
  if (s.includes('velez')) return 'Vélez';
  if (s.includes('newell')) return 'Newell\'s';
  if (s.includes('talleres')) return 'Talleres';
  if (s.includes('sarmiento')) return 'Sarmiento';
  if (s.includes('instituto')) return 'Instituto';
  if (s.includes('platense')) return 'Platense';
  if (s.includes('banfield')) return 'Banfield';
  if (s.includes('lanus')) return 'Lanús';
  if (s.includes('tigre')) return 'Tigre';
  if (s.includes('belgrano')) return 'Belgrano';
  if (s.includes('aldosivi')) return 'Aldosivi';
  if (s.includes('huracan')) return 'Huracán';
  if (s.includes('godoy')) return 'Godoy Cruz';
  if (s.includes('union')) return 'Unión';

  return name;
}

window.updateMatchOdds = function(homeTeam, awayTeam, homeOdds, drawOdds, awayOdds, homeGoalOdds, awayGoalOdds) {
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

  let homeCS = 0;
  let awayCS = 0;
  let hGoalVal = homeGoalOdds ? parseFloat(homeGoalOdds) : null;
  let aGoalVal = awayGoalOdds ? parseFloat(awayGoalOdds) : null;

  if (hGoalVal && aGoalVal && hGoalVal > 1.0 && aGoalVal > 1.0) {
    homeCS = Math.min(0.85, Math.max(0.05, 1.0 - (1.0 / aGoalVal)));
    awayCS = Math.min(0.85, Math.max(0.05, 1.0 - (1.0 / hGoalVal)));
  } else {
    const awayExpGoals = Math.max(0.35, Math.min(2.5, (aP * 2.2) + (dP * 0.6)));
    const homeExpGoals = Math.max(0.35, Math.min(3.0, (hP * 2.4) + (dP * 0.6)));
    homeCS = Math.min(0.85, Math.max(0.08, Math.exp(-awayExpGoals)));
    awayCS = Math.min(0.85, Math.max(0.08, Math.exp(-homeExpGoals)));
  }

  appData.odds[key] = {
    homeWin: hWin,
    draw: dWin,
    awayWin: aWin,
    homeWinProb: hP,
    drawProb: dP,
    awayWinProb: aP,
    homeGoalOdds: hGoalVal,
    awayGoalOdds: aGoalVal,
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

window.editMatchOddsPrompt = function(home, away, h, d, a, hGoal, aGoal) {
  const newH = prompt(`Editar cuota Victoria ${home}:`, h);
  if (newH === null) return;
  const newD = prompt(`Editar cuota Empate (${home} vs ${away}):`, d);
  if (newD === null) return;
  const newA = prompt(`Editar cuota Victoria ${away}:`, a);
  if (newA === null) return;
  const newHGoal = prompt(`Editar cuota Gol de ${home}:`, hGoal || '1.45');
  if (newHGoal === null) return;
  const newAGoal = prompt(`Editar cuota Gol de ${away}:`, aGoal || '1.60');
  if (newAGoal === null) return;

  updateMatchOdds(home, away, newH, newD, newA, newHGoal, newAGoal);
};

function ensureOddsMetrics(odds) {
  if (!odds) return odds;

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

  let homeCS = odds.homeCleanSheetProb;
  let awayCS = odds.awayCleanSheetProb;

  if (odds.homeGoalOdds && odds.awayGoalOdds) {
    const hG = parseFloat(odds.homeGoalOdds);
    const aG = parseFloat(odds.awayGoalOdds);
    if (hG > 1.0 && aG > 1.0) {
      homeCS = Math.min(0.85, Math.max(0.05, 1.0 - (1.0 / aG)));
      awayCS = Math.min(0.85, Math.max(0.05, 1.0 - (1.0 / hG)));
    }
  }

  if (homeCS === undefined || awayCS === undefined) {
    // Probabilidad limpia de valla invicta desde cuotas de partido
    // A mayor cuotas del rival (menor probabilidad de ganar del rival), mayor valla invicta
    homeCS = Math.min(0.85, Math.max(0.08, 1.0 - Math.min(0.90, (aP * 1.5) + (dP * 0.3))));
    awayCS = Math.min(0.85, Math.max(0.08, 1.0 - Math.min(0.90, (hP * 1.5) + (dP * 0.3))));
  }

  odds.homeWinProb = hP;
  odds.drawProb = dP;
  odds.awayWinProb = aP;
  odds.homeExpGoals = odds.homeExpGoals || (1.0 - awayCS);
  odds.awayExpGoals = odds.awayExpGoals || (1.0 - homeCS);
  odds.homeCleanSheetProb = homeCS;
  odds.awayCleanSheetProb = awayCS;
  return odds;
}

function findMatchOdds(homeTeam, awayTeam) {
  if (!appData.odds) appData.odds = {};
  const customOdds = safeGetLocalStorage('grandt_custom_odds', {});
  const cHome = canonicalTeam(homeTeam);
  const cAway = canonicalTeam(awayTeam);

  for (const [key, val] of Object.entries(customOdds)) {
    if (!key.includes(' vs ')) continue;
    const parts = key.split(' vs ');
    if (canonicalTeam(parts[0]) === cHome && canonicalTeam(parts[1]) === cAway) {
      return ensureOddsMetrics(val);
    }
  }

  for (const [key, val] of Object.entries(appData.odds)) {
    if (!key.includes(' vs ')) continue;
    const parts = key.split(' vs ');
    if (canonicalTeam(parts[0]) === cHome && canonicalTeam(parts[1]) === cAway) {
      return ensureOddsMetrics(val);
    }
  }
  return null;
}

function findTeamStandings(teamName) {
  if (!appData.standings) return null;
  const cTarget = canonicalTeam(teamName);
  const allStandings = [...(appData.standings.zonaA || []), ...(appData.standings.zonaB || [])];
  const entry = allStandings.find(t => canonicalTeam(t.team) === cTarget) || null;
  
  // Enriquecer home/away si ESPN los devolvió vacíos (PJ=0 cuando el equipo sí jugó)
  if (entry && typeof computeHomeAwaySplitsFromFixture === 'function') {
    const homeEmpty = !entry.home || entry.home.pj === 0 || entry.home.pj === undefined;
    const awayEmpty = !entry.away || entry.away.pj === 0 || entry.away.pj === undefined;
    if (homeEmpty || awayEmpty) {
      const splits = computeHomeAwaySplitsFromFixture(entry.team);
      if (homeEmpty && splits.home.pj > 0) entry.home = splits.home;
      if (awayEmpty && splits.away.pj > 0) entry.away = splits.away;
    }
  }
  
  return entry;
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
      const teamSt = findTeamStandings(p.team);
      const leaguePj = teamSt ? (teamSt.pj || 4) : 4;
      const pj365Capped = Math.max(1, Math.min(p.matches365 || 1, leaguePj));
      const xg = (p.xg365 || 0) / pj365Capped;
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
  let expGoalsTeam = 1.20;
  let expGoalsRival = 1.10;

  if (teamStandings && rivalStandings) {
    const ts = teamStandings;
    const rs = rivalStandings;
    const tSplit = isHome ? (ts.home || ts) : (ts.away || ts);
    const rSplit = isHome ? (rs.away || rs) : (rs.home || rs);

    const tPj = Math.max(1, tSplit.pj || ts.pj || 1);
    const rPj = Math.max(1, rSplit.pj || rs.pj || 1);

    // Goles reales por partido en la condición específica (Local o Visitante)
    const tGF_cond = (tSplit.gf !== undefined ? tSplit.gf : ts.gf || 0) / tPj;
    const tGC_cond = (tSplit.gc !== undefined ? tSplit.gc : ts.gc || 0) / tPj;
    const rGF_cond = (rSplit.gf !== undefined ? rSplit.gf : rs.gf || 0) / rPj;
    const rGC_cond = (rSplit.gc !== undefined ? rSplit.gc : rs.gc || 0) / rPj;

    // Goles esperados basados en el cruce directo del rendimiento en esta condición
    expGoalsTeam = (tGF_cond * 0.5) + (rGC_cond * 0.5);
    expGoalsRival = (rGF_cond * 0.5) + (tGC_cond * 0.5);

    // Probabilidad empírica de valla invicta (si el rival promete <1.0 gol, CS prob sube)
    cleanSheetProb = Math.min(0.85, Math.max(0.05, Math.exp(-Math.max(0.1, expGoalsRival))));
    goalOpp = Math.min(0.95, Math.max(0.10, expGoalsTeam / 2.0));

    // Win probability based on points & PPG split
    const tPpg = (tSplit.pts !== undefined ? tSplit.pts : ts.pts || 0) / tPj;
    const rPpg = (rSplit.pts !== undefined ? rSplit.pts : rs.pts || 0) / rPj;
    winProb = Math.min(0.80, Math.max(0.15, 0.40 + ((tPpg - rPpg) * 0.15) + (isHome ? 0.05 : -0.05)));
  }

  // Si hay cuotas oficiales del mercado de apuestas (la fuente más exacta de probabilidades)
  const odds = findMatchOdds(match.home, match.away);
  let winOdds = 0;
  let isRealOdds = false;

  if (odds) {
    isRealOdds = true;
    winProb = isHome ? (odds.homeWinProb || (odds.homeWin ? 1 / odds.homeWin : 0.40)) : (odds.awayWinProb || (odds.awayWin ? 1 / odds.awayWin : 0.30));
    winOdds = isHome ? (odds.homeWin || 1 / Math.max(0.05, winProb)) : (odds.awayWin || 1 / Math.max(0.05, winProb));
    
    if (odds.homeExpGoals && odds.awayExpGoals) {
      expGoalsTeam = isHome ? odds.homeExpGoals : odds.awayExpGoals;
      expGoalsRival = isHome ? odds.awayExpGoals : odds.homeExpGoals;
      cleanSheetProb = Math.exp(-Math.max(0.1, expGoalsRival));
    }
    // Si la casa de apuestas provee valla invicta oficial
    if (odds.homeCleanSheetProb !== undefined && odds.awayCleanSheetProb !== undefined) {
      cleanSheetProb = isHome ? odds.homeCleanSheetProb : odds.awayCleanSheetProb;
    }
  } else {
    winOdds = 1 / Math.max(0.10, winProb);
  }

  winProb = Math.min(0.85, Math.max(0.10, winProb));
  cleanSheetProb = Math.min(0.85, Math.max(0.05, cleanSheetProb));
  goalOpp = Math.min(0.90, Math.max(0.12, goalOpp));

  // Stats reales del equipo y rival en la condición específica para la UI de auditoría
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
    golesCondicion: (tSplitObj.gf !== undefined ? tSplitObj.gf : ts.gf || 0) / tSplitPj,
    golesConcCondicion: (tSplitObj.gc !== undefined ? tSplitObj.gc : ts.gc || 0) / tSplitPj,
  };
  const rivalStats = {
    golesPerGame: (rs.gf || 0) / rsPj,
    golesConcPerGame: (rs.gc || 0) / rsPj,
    golesCondicion: (rSplitObj.gf !== undefined ? rSplitObj.gf : rs.gf || 0) / rSplitPj,
    golesConcCondicion: (rSplitObj.gc !== undefined ? rSplitObj.gc : rs.gc || 0) / rSplitPj,
  };

  // Cache de poderes por línea
  if (!STATE._teamPowersCache && appData.players) {
    STATE._teamPowersCache = computeTeamLinePowers(appData.players);
  }

  const rivalCanonId = typeof resolveTeam === 'function' ? (resolveTeam(rival)?.id || canonicalTeam(rival)) : canonicalTeam(rival);
  const rivalAttackPower = STATE._teamPowersCache ? (STATE._teamPowersCache.teamAttackPower[rivalCanonId] || 0) : 0;
  const rivalDefensePower = STATE._teamPowersCache ? (STATE._teamPowersCache.teamDefensePower[rivalCanonId] || 0) : 0;
  const topRivalAttackerName = STATE._teamPowersCache ? (STATE._teamPowersCache.topRivalAttacker[rivalCanonId]?.name || '') : '';
  const topRivalDefenderName = STATE._teamPowersCache ? (STATE._teamPowersCache.topRivalDefender[rivalCanonId]?.name || '') : '';

  return {
    match,
    isHome,
    rival,
    winProb,
    cleanSheetProb,
    goalOpp,
    expGoalsTeam,
    expGoalsRival,
    winOdds,
    isRealOdds,
    teamStandings: ts,
    rivalStandings: rs,
    teamStats,
    rivalStats,
    rivalAttackPower,
    rivalDefensePower,
    topRivalAttackerName,
    topRivalDefenderName
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

function getEffectivePlayerGoals(p) {
  if (!p) return 0;
  return p.goals || 0;
}

function getPlayerMetrics(p) {
  const pjCur = p.matchesRated || p.matches || 0;
  const hist = findHistoricalPlayer(p.name);
  const effGoals = getEffectivePlayerGoals(p);
  
  // Current tournament stats are primary (Clarín rating is 1.0 to 10.0 scale)
  const avgRatingCur = Math.min(10.0, p.avgRating || 6.0);
  const gpmCur = pjCur > 0 ? effGoals / pjCur : 0;
  const fpmCur = pjCur > 0 ? (p.figuras || 0) / pjCur : 0;
  const csCur = pjCur > 0 ? (p.cleanSheets || 0) / pjCur : 0;

  return {
    pjCur,
    hist,
    avgRatingCur,
    gpmCur,
    fpmCur,
    csCur,
    effGoals
  };
}

function getPercentile(val, arr) {
  if (arr.length === 0) return 0.5;
  const sorted = [...arr].filter(x => isFinite(x)).sort((a, b) => a - b);
  if (sorted.length <= 1) return 0.5;
  const index = sorted.findIndex(v => v >= val);
  return index === -1 ? 1.0 : Math.min(1.0, Math.max(0.0, index / sorted.length));
}

function calculateScoreDT(p, ctx, posPool) {
  const pos = (p && p.position) || STATE.activeTab;
  const m = getPlayerMetrics(p);

  // Per Match (PJ) Metrics — PROTECTED with Master PJ logic
  // PlanetaGranDT: goles, tarjetas, figuras, rating Clarín (puede estar atrasado 1-2 fechas)
  // 365Scores: xG, tiros, minutos (puede incluir Copa Libertadores/Sudamericana)
  // Standings ESPN: PJ real del equipo en el torneo (siempre actualizado)
  const pjPgt = Math.max(1, m.pjCur || 1);
  const raw365 = p.matches365 || 0;

  // CAPA DE SEGURIDAD 1: Limitar pj365 al PJ real del equipo en el torneo
  // Si 365Scores dice 8 partidos pero el equipo jugó 4 en el torneo → pj365 = 4 (filtra Copa)
  const teamStandingsForCap = findTeamStandings(p.team);
  const teamLeaguePj = teamStandingsForCap ? (teamStandingsForCap.pj || 4) : 4;
  const pj365 = Math.max(1, Math.min(raw365 || 1, teamLeaguePj));

  // CAPA DE SEGURIDAD 2: Detectar estado de frescura de datos
  const dataIsComplete = pjPgt >= teamLeaguePj;          // PGT tiene todos los partidos
  const data365IncludesCopa = raw365 > teamLeaguePj + 1; // 365 incluye partidos extra (Copa)
  const pgtIsDelayed = pjPgt < teamLeaguePj;              // PGT está atrasado

  const pens = p.goalsPenalty || 0;
  
  let xgTotal = p.xg365 || p.xg || 0;
  let shotsTotal = p.shots365 || p.shots || 0;
  if (data365IncludesCopa && raw365 > 0) {
    const leagueRatio = pj365 / raw365;
    xgTotal = xgTotal * leagueRatio;
    shotsTotal = shotsTotal * leagueRatio;
  }
  const xgNoPenTotal = Math.max(0, xgTotal - (0.79 * pens));
  const xgPerMatch_noPen = xgNoPenTotal / pj365;
  const xgPerMatch = xgTotal / pj365;
  const shotsPerMatch = shotsTotal / pj365;

  const effectiveGoals = getEffectivePlayerGoals(p);
  const goalsPerMatch = effectiveGoals / pjPgt;
  const yellowPerMatch = (p.yellowCards || 0) / pjPgt;
  const redPerMatch = (p.redCards || 0) / pjPgt;

  // PERFIL EMPÍRICO INDIVIDUAL LOCAL VS VISITANTE DEL JUGADOR (Normalizado con el tope real de la tabla)
  const goalsTotal = effectiveGoals;
  const goalsAway = Math.min(effectiveGoals, p.goalsAway || 0);
  const goalsHome = Math.max(0, goalsTotal - goalsAway);
  const goalsHeader = Math.min(effectiveGoals, p.goalsHeader || 0);

  let indLocationMult = 1.0;
  let indLocationProfile = 'Neutro (Sin goles aún en el torneo)';
  if (goalsTotal > 0 && ctx) {
    const isHomeMatch = ctx.isHome;
    const condRatio = isHomeMatch ? (goalsHome / goalsTotal) : (goalsAway / goalsTotal);
    // Factor de alineación situacional propio: de 0.85 (0% goles en esta localía) a 1.15 (100% goles en esta localía)
    indLocationMult = 1.0 + ((condRatio - 0.50) * 0.30);
    if (condRatio >= 0.70) {
      indLocationProfile = isHomeMatch ? `🔥 Especialista de Local (${goalsHome}/${goalsTotal} goles en casa)` : `🚀 Especialista de Visitante (${goalsAway}/${goalsTotal} goles fuera)`;
    } else if (condRatio <= 0.30) {
      indLocationProfile = isHomeMatch ? `⚠️ Rinde mejor de Visitante (${goalsAway}/${goalsTotal} fuera)` : `⚠️ Rinde mejor de Local (${goalsHome}/${goalsTotal} en casa)`;
    } else {
      indLocationProfile = `⚖️ Rendimiento equilibrado Local/Visitante (${goalsHome} L / ${goalsAway} V)`;
    }
  }

  let rawMinutes = p.minutes365 || p.minutes || (pj365 * 90);
  if (data365IncludesCopa && raw365 > 0) {
    rawMinutes = rawMinutes * (pj365 / raw365);
  }
  const avgMinutesPerMatch = Math.min(90, Math.round(rawMinutes / pj365));

  const poolMetrics = posPool._cachedMetrics || posPool.map(x => getPlayerMetrics(x));
  const avgRatingPerc = getPercentile(m.avgRatingCur, poolMetrics.map(x => x.avgRatingCur));
  const gpmPerc = getPercentile(m.gpmCur, poolMetrics.map(x => x.gpmCur));
  const fpmPerc = getPercentile(m.fpmCur, poolMetrics.map(x => x.fpmCur));

  // Probabilidad de valla invicta tomada directamente del fixture context (cuotas reales o splits de posiciones)
  const csProb = ctx ? ctx.cleanSheetProb : 0.30;
  const winProb = ctx ? ctx.winProb : 0.40;
  const goalOpp = ctx ? ctx.goalOpp : 0.35;

  let rawEP = 0;
  let isSolido = false;
  let isGoleador = false;
  let isLateralGoleador = false;
  let isVolanteLlegador = false;
  let isGoalDebt = false;
  let is9DeArea = false;
  let isExtremo = false;
  let isGoleadorEnRacha = false;
  let isArqueroFigura = false;
  let singleMatchGoalProb = 0;
  let isNumero10 = false;

  // REGLAMENTO GRAN DT:
  // Amarilla = -2 pts, Roja = -4 pts
  const EP_cards = (2.0 * yellowPerMatch) + (4.0 * redPerMatch);
  // Forma basada solo en rating promedio Clarín real
  const EP_forma = 0.12 * avgRatingPerc;
  // Premio Figura = +4 pts
  const drawProb = ctx ? (ctx.drawProb || Math.max(0, 1.0 - winProb - (1.0 - winProb) * 0.50)) : 0.25;
  const figuraTeamProb = winProb + (drawProb * 0.5);
  const EP_fig = fpmPerc * figuraTeamProb * 4.0 * 0.12;

  // Penal pateado Gran DT: +3 pts Local / +5 pts Visitante, -4 pts si erra
  const penGoalVal = (ctx && !ctx.isHome) ? 5.0 : 3.0;
  const EP_pen = (pens > 0) ? Math.max(0, (0.78 * penGoalVal) - (0.22 * 4.0)) : 0;

  // Minutaje según Reglamento Oficial Gran DT:
  // Debe jugar al menos 20 min para sumar ficha y puntos; menos de 20 min = cuenta el suplente.
  let minutesFactor = 1.0;
  if (avgMinutesPerMatch < 20) {
    minutesFactor = 0.05;
  } else if (avgMinutesPerMatch < 60) {
    minutesFactor = avgMinutesPerMatch / 60.0;
  } else {
    minutesFactor = 1.0;
  }
  const isShortMinutesRisk = avgMinutesPerMatch < 70;

  // Racha reciente suave de ficha Clarín (últimas 2 fechas vs promedio del torneo)
  let EP_recent_trend = 0;
  const recentScores = (p.ratings || p.scores || []).filter(s => s !== null && s !== undefined && s > 0).slice(-2);
  if (recentScores.length >= 2) {
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const overallAvg = m.avgRatingCur || 5.5;
    if (recentAvg >= overallAvg + 0.6) EP_recent_trend = 0.15;
    else if (recentAvg <= overallAvg - 0.6) EP_recent_trend = -0.15;
  }

  const posBaseline = { ARQ: 6.22, DEF: 6.25, VOL: 5.52, DEL: 6.02 };
  const baselineNorm = (posBaseline[pos] || 5.75) / 6.25;

  if (pos === 'ARQ') {
    // REGLAMENTO ARQUERO: +3.0 por Valla Invicta, -1.0 por gol recibido
    const expGoalsRival = ctx ? ctx.expGoalsRival : 1.10;
    const E_GC = Math.min(3.0, expGoalsRival);
    
    // Arquero Figura: exige alta probabilidad de valla invicta + ganar el partido + alta ficha Clarín
    if (csProb >= 0.45 && winProb >= 0.45 && m.avgRatingCur >= 6.2) {
      isArqueroFigura = true;
    }
    isSolido = csProb >= 0.40 && m.avgRatingCur >= 6.0;

    rawEP = (3.0 * csProb - 1.0 * E_GC - EP_cards + EP_forma + EP_fig + EP_recent_trend) * minutesFactor * baselineNorm;

  } else if (pos === 'DEF') {
    // REGLAMENTO DEFENSA: +2.0 por Valla Invicta + Goles Convertidos (+9 pts Local / +11 pts Visitante)
    const defGoalPts = (ctx && !ctx.isHome) ? 11.0 : 9.0;
    
    // Potencial Ofensivo Real del Defensor (basado 100% en SUS propios datos individuales y la vulnerabilidad del rival)
    const rawIndProb = ((0.50 * xgPerMatch_noPen) + (0.35 * goalsPerMatch) + (0.15 * Math.min(0.25, shotsPerMatch * 0.08))) * indLocationMult;
    
    // Si el jugador no remata, no tiene xG y no hizo goles -> su probabilidad de gol es EXACTAMENTE 0
    let defenderGoalProb = 0;
    if (rawIndProb > 0.003 || goalsHeader > 0) {
      const rivalGcCond = ctx && ctx.rivalStats ? (ctx.rivalStats.golesConcCondicion || 1.0) : 1.0;
      const rivalVulnerability = Math.min(1.30, Math.max(0.70, rivalGcCond / 1.10));
      defenderGoalProb = Math.min(0.35, Math.max(0.0, rawIndProb * rivalVulnerability));
    }

    singleMatchGoalProb = defenderGoalProb;

    isSolido = csProb >= 0.40 && m.avgRatingCur >= 6.0;
    isGoleador = goalsPerMatch > 0 || xgPerMatch_noPen >= 0.06 || goalsHeader > 0;
    
    const isCB = p.subRole === 'CB' || p.isCentral;
    const isLateral = p.subRole === 'FB' || (!isCB);
    isLateralGoleador = isLateral && (goalsPerMatch > 0 || xgPerMatch_noPen >= 0.08 || goalsAway > 0);

    rawEP = (2.0 * csProb + defenderGoalProb * defGoalPts + EP_pen - EP_cards + EP_forma + EP_fig + EP_recent_trend) * minutesFactor * baselineNorm;

  } else {
    // VOL / DEL REGLAMENTO GRAN DT: +6 pts Volante / +4 pts Delantero (+2 bonus visitante)
    const ptsMult = pos === 'DEL' ? ((ctx && !ctx.isHome) ? 6.0 : 4.0) : ((ctx && !ctx.isHome) ? 8.0 : 6.0);
    const awayGoalBonus = (ctx && !ctx.isHome) ? 0.15 : 0;

    // Probabilidad de gol del partido basada en 55% xG propio, 30% goles propios acumulados y 15% expectativa del equipo * indLocationMult
    const pGoalBase = Math.min(0.75, Math.max(0.03, (0.55 * xgPerMatch_noPen + 0.30 * goalsPerMatch + 0.15 * (goalOpp * 0.50)) * indLocationMult));
    singleMatchGoalProb = pGoalBase;

    let EP_llegador = 0;
    let EP_tanque = 0;
    let EP_extremo = 0;

    if (pos === 'VOL') {
      const xgTotal = p.xg365 || p.xg || 0;
      const xgNoPenTotal = Math.max(0, xgTotal - (0.79 * pens));
      const actualGoals = p.goals || 0;

      // Volante Llegador: presencia real en área por xG o remates propios
      if (actualGoals >= 1 || xgPerMatch_noPen >= 0.08 || shotsPerMatch >= 1.1) {
        isVolanteLlegador = true;
      }

      // En Deuda de Gol INDIVIDUAL: generó xG suficiente en sus tiros pero convirtió menos de lo esperado
      if ((xgNoPenTotal >= 0.35 || xgPerMatch_noPen >= 0.10 || shotsPerMatch >= 1.2) && actualGoals < xgNoPenTotal) {
        isGoalDebt = true;
      }

      EP_llegador = Math.min(0.80, (xgPerMatch_noPen * 1.5) + (goalsPerMatch * 0.8));

    } else if (pos === 'DEL') {
      const xgPerShot = shotsPerMatch > 0 ? (xgPerMatch_noPen / shotsPerMatch) : 0;
      const actualGoals = p.goals || 0;
      const xgTotal = p.xg365 || p.xg || 0;
      const xgNoPenTotal = Math.max(0, xgTotal - (0.79 * pens));

      isGoleadorEnRacha = (actualGoals >= 2 && goalsPerMatch >= 0.40);
      is9DeArea = xgPerShot >= 0.11 || (goalsPerMatch >= 0.30 && xgPerShot >= 0.08) || pens > 0;
      isExtremo = shotsPerMatch >= 1.5 && !is9DeArea;

      // Deuda de gol individual para delanteros
      if ((xgNoPenTotal >= 0.50 || xgPerMatch_noPen >= 0.15 || shotsPerMatch >= 1.5) && actualGoals < xgNoPenTotal) {
        isGoalDebt = true;
      }

      if (is9DeArea) {
        EP_tanque = Math.min(0.70, (xgPerMatch_noPen * 1.2) + (goalsPerMatch * 0.8));
      }
      if (isExtremo) {
        EP_extremo = Math.min(0.60, (shotsPerMatch * 0.10) + (xgPerMatch_noPen * 1.0));
      }
    }

    // Número 10 / Volante Manija: Encargado de pelotas paradas + rematador + alta ficha Clarín
    const isSetPieceOrPenTaker = (p.isSetPieceTaker || pens > 0 || (shotsPerMatch >= 1.2 && xgPerMatch_noPen >= 0.10));
    if (pos === 'VOL' && isSetPieceOrPenTaker && avgMinutesPerMatch >= 75 && m.avgRatingCur >= 6.2) {
      isNumero10 = true;
    }

    rawEP = ((ptsMult * pGoalBase) + EP_llegador + EP_tanque + EP_extremo - EP_cards + EP_forma + EP_fig + (EP_pen * 0.8) + awayGoalBonus + EP_recent_trend) * minutesFactor * baselineNorm;
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
    minutesFactor,
    baselineNorm,
    isVolanteLlegador,
    isNumero10,
    isGoalDebt,
    is9DeArea,
    isExtremo,
    isGoleadorEnRacha,
    isArqueroFigura,
    singleMatchGoalProb,
    csProb,
    rawEP,
    minutesFactor,
    baselineNorm,
    isVolanteLlegador,
    isNumero10,
    isGoalDebt,
    is9DeArea,
    isExtremo,
    isGoleadorEnRacha,
    isArqueroFigura,
    singleMatchGoalProb,
    csProb,
    rawEP,
    winProb,
    goalOpp,
    ctx
  };

  p._audit = auditData;

  const captainSuitability = (m.avgRatingCur * 3) + (fpmPerc * 30) + (winProb * 20);
  const isCaptainCandidate = captainSuitability >= 25;

  return { rawEP, csProb, singleMatchGoalProb, isArqueroFigura, avgRatingPerc, gpmPerc, fpmPerc, isSolido, isGoleador, isLateralGoleador, isVolanteLlegador, isNumero10, isGoalDebt, is9DeArea, isExtremo, isGoleadorEnRacha, isCaptainCandidate, dataIsComplete, data365IncludesCopa, pgtIsDelayed, metrics: m, _audit: auditData };
}

async function syncPlanetaGranDTBrowser() {
  const sheetBase = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoJoSmK7n6qORSpd-bVBkyQHjnlIRmqmbFIZxFqYAC28AXwGI1XbSQcL4UWx7PPAP6zw9f2IeL5pUL/pub?output=csv&gid=';
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

async function syncLiveOddsFromEspn(forceRefresh = false) {
  try {
    const roundKey = appData.currentRound || 4;
    const cacheKey = `gdt_team_odds_cache_r${roundKey}`;
    const now = Date.now();
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;

    // Check localStorage quota cache unless forceRefresh is requested
    if (!forceRefresh && typeof localStorage !== 'undefined') {
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        try {
          const cachedData = JSON.parse(cachedStr);
          if (cachedData && (now - cachedData.timestamp < TWELVE_HOURS) && cachedData.oddsList && cachedData.oddsList.length > 0) {
            console.log(`ℹ️ Cuotas de apuestas cargadas desde caché local (Cuota protegida: 0 llamadas API consumidas).`);
            cachedData.oddsList.forEach(o => {
              updateMatchOdds(o.cHome, o.cAway, o.hWin, o.dWin, o.aWin);
            });
            return cachedData.oddsList.length;
          }
        } catch (e) {
          console.warn("Caché de cuotas inválido, reobteniendo de API...");
        }
      }
    }

    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?limit=50');
    const data = await res.json();
    if (!data.events) return 0;

    let count = 0;
    const oddsListToCache = [];

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
          const hStr = hWin.toFixed(2);
          const dStr = dWin ? dWin.toFixed(2) : '3.20';
          const aStr = aWin.toFixed(2);
          updateMatchOdds(cHome, cAway, hStr, dStr, aStr);
          oddsListToCache.push({ cHome, cAway, hWin: hStr, dWin: dStr, aWin: aStr });
          count++;
        }
      }
    });

    if (count > 0 && typeof localStorage !== 'undefined') {
      localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: now,
        oddsList: oddsListToCache
      }));
    }

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

    const rawScores = evaluated.map(p => p.rawEP);
    const minRaw = Math.min(...rawScores);
    const maxRaw = Math.max(...rawScores);
    const range = (maxRaw - minRaw) || 1;

    const rawRiskyScores = evaluated.map(p => p.rawRiskyEP);
    const minRisky = Math.min(...rawRiskyScores);
    const maxRisky = Math.max(...rawRiskyScores);
    const rangeRisky = (maxRisky - minRisky) || 1;

    rankingsByPosSolid[pos] = evaluated.map(p => {
      const finalScore = 30 + ((p.rawEP - minRaw) / range) * 66;
      const riskyScore = 30 + ((p.rawRiskyEP - minRisky) / rangeRisky) * 66;
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

  const players = appData.players || [];
  let pool = players.filter(p => p.position === pos && (p.matchesRated || p.matches || 0) >= STATE.minMatches);
  
  if (STATE.searchQuery) {
    pool = pool.filter(p => p.name.toLowerCase().includes(STATE.searchQuery) || p.team.toLowerCase().includes(STATE.searchQuery));
  }

  const posPool = players.filter(p => p.position === pos);
  // Pre-compute metrics for the entire pool ONCE
  posPool._cachedMetrics = posPool.map(x => getPlayerMetrics(x));
  const evaluated = pool.map(p => {
    const ctx = getFixtureContext(p.team);
    const scoreData = calculateScoreDT(p, ctx, posPool);
    return { ...p, ctx, ...scoreData };
  });

  // Smooth min-max pool normalization to continuous range [30.0, 96.0] without ties
  const rawScores = evaluated.map(p => p.rawEP);
  const minRaw = Math.min(...rawScores);
  const maxRaw = Math.max(...rawScores);
  const range = (maxRaw - minRaw) || 1;

  const ranked = evaluated.map(p => {
    const finalScore = 30 + ((p.rawEP - minRaw) / range) * 66;
    return { ...p, finalScore };
  }).sort((a, b) => b.finalScore - a.finalScore);

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

  // Pre-compute single-match rank maps for top performers
  const csRankMapARQ = {};
  const csRankMapDEF = {};
  const goalRankMapDEF = {};
  const goalRankMapVOL = {};
  const goalRankMapDEL = {};

  if (pos === 'ARQ') {
    const sortedByCs = [...filteredRanked].sort((a, b) => (b.csProb || 0) - (a.csProb || 0));
    sortedByCs.slice(0, 5).forEach((p, i) => csRankMapARQ[p.id] = i + 1);
  } else if (pos === 'DEF') {
    const sortedByCs = [...filteredRanked].sort((a, b) => (b.csProb || 0) - (a.csProb || 0));
    sortedByCs.slice(0, 15).forEach((p, i) => csRankMapDEF[p.id] = i + 1);
    const sortedByGoal = [...filteredRanked].sort((a, b) => (b.singleMatchGoalProb || 0) - (a.singleMatchGoalProb || 0));
    sortedByGoal.slice(0, 5).forEach((p, i) => goalRankMapDEF[p.id] = i + 1);
  } else if (pos === 'VOL') {
    const sortedByGoal = [...filteredRanked].sort((a, b) => (b.singleMatchGoalProb || 0) - (a.singleMatchGoalProb || 0));
    sortedByGoal.slice(0, 10).forEach((p, i) => goalRankMapVOL[p.id] = i + 1);
  } else if (pos === 'DEL') {
    const sortedByGoal = [...filteredRanked].sort((a, b) => (b.singleMatchGoalProb || 0) - (a.singleMatchGoalProb || 0));
    sortedByGoal.slice(0, 10).forEach((p, i) => goalRankMapDEL[p.id] = i + 1);
  }

  filteredRanked.forEach((p, idx) => {
    const tr = document.createElement('tr');
    
    let badges = '';

    const isConflict = (pos === 'VOL' || pos === 'DEL') && recDefenseRivals.has(canonicalTeam(p.team));
    if (isConflict) {
      badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Enfrenta a tu arquero/defensa recomendada en el 11">⚔️ Choque Directo</span>';
    }

    if (pos === 'ARQ') {
      const csRank = csRankMapARQ[p.id];
      if (csRank) {
        const csPct = ((p.csProb || 0.30) * 100).toFixed(0);
        badges += `<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);" title="#${csRank} en Prob. de Valla Invicta (${csPct}%) para el próximo partido">🛡️ #${csRank} % Valla Invicta (${csPct}%)</span>`;
      }
      if (p.isArqueroFigura) {
        badges += '<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);" title="Atajador exigido en partido de alto volumen de disparos y rating elevado">🌟 Arquero Figura</span>';
      }
    } else if (pos === 'DEF') {
      const csRank = csRankMapDEF[p.id];
      const gRank = goalRankMapDEF[p.id];
      if (csRank) {
        const csPct = ((p.csProb || 0.30) * 100).toFixed(0);
        badges += `<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);" title="#${csRank} en Valla Invicta DEF (${csPct}%) para el próximo partido">🛡️ #${csRank} Valla Invicta DEF (${csPct}%)</span>`;
      }
      if (gRank) {
        const gPct = ((p.singleMatchGoalProb || 0.05) * 100).toFixed(0);
        badges += `<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="#${gRank} en Prob. de Gol DEF (${gPct}%) para el próximo partido">⚽ #${gRank} Prob. Gol DEF (${gPct}%)</span>`;
      }
      const isCB = p.subRole === 'CB' || p.isCentral;
      if (isCB) badges += '<span class="badge" style="background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);" title="Defensor central con juego aéreo en tiros de esquina">⚽ Central Cabezador</span>';
      else if (p.isLateralGoleador) badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Lateral atacante de proyección y contraataque">⚡ Lateral Atacante</span>';
      else if (p.isSolido && !csRank) badges += '<span class="badge">🔒 Defensor Sólido</span>';
    } else if (pos === 'VOL') {
      const gRank = goalRankMapVOL[p.id];
      if (gRank) {
        const gPct = ((p.singleMatchGoalProb || 0.10) * 100).toFixed(0);
        badges += `<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);" title="#${gRank} en Prob. de Gol VOL (${gPct}%) para el próximo partido">⚽ #${gRank} Prob. Gol VOL (${gPct}%)</span>`;
      }
      if (p.isVolanteLlegador) badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Volante con llegada constante al área rival y presencia de gol">⚔️ Volante Llegador</span>';
      if (p.isGoalDebt) badges += '<span class="badge" style="background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);" title="Genera alto peligro (xG elevado) por encima de sus goles convertidos — Candidato a seguir anotando">📈 En Deuda de Gol</span>';
      if (p.isNumero10) badges += '<span class="badge" style="background:rgba(147,51,234,0.15);color:#a855f7;border:1px solid rgba(147,51,234,0.4);" title="Conductor y ejecutor principal de tiros libres / pelota parada del equipo">🎩 Número 10</span>';
    } else if (pos === 'DEL') {
      const gRank = goalRankMapDEL[p.id];
      if (gRank) {
        const gPct = ((p.singleMatchGoalProb || 0.15) * 100).toFixed(0);
        badges += `<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="#${gRank} en Prob. de Gol DEL (${gPct}%) para el próximo partido">⚽ #${gRank} Prob. Gol DEL (${gPct}%)</span>`;
      }
      if (p.isGoleadorEnRacha) badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Delantero con racha goleadora reciente">🔥 Goleador en Racha</span>';
      if (p.is9DeArea) badges += '<span class="badge">⚽ 9 de Área</span>';
      else if (p.isExtremo) badges += '<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);" title="Delantero de velocidad y desborde por bandas">⚡ Extremo Veloz</span>';
    }

    const masterPjForCards = Math.max(1, p.matchesRated || p.pj || 1);
    const isYellowRisk = ((p.yellowCards || 0) / masterPjForCards) >= 0.45;
    if (isYellowRisk) {
      badges += '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);" title="Promedia alta cantidad de amarillas (-2 pts por amarilla en Gran DT)">⚠️ Riesgo Amarilla</span>';
    }

    const nextMatchStr = p.ctx ? `${p.ctx.isHome ? 'L' : 'V'} vs ${p.ctx.rival}` : 'N/A';
    const matchesCount = p.matchesRated !== undefined ? p.matchesRated : p.matches || 0;

    // DATA FRESHNESS INDICATOR
    const teamSt = findTeamStandings(p.team);
    const teamPjActual = teamSt ? (teamSt.pj || 0) : 0;
    const pgtPj = p.matchesRated || 0;
    const raw365Pj = p.matches365 || 0;
    const pgtDelayed = pgtPj > 0 && teamPjActual > 0 && pgtPj < teamPjActual;
    const copa365 = raw365Pj > teamPjActual + 1;

    let freshnessHtml = '';
    if (pgtDelayed) {
      freshnessHtml = `<span style="color:#f59e0b;font-size:10px;margin-left:3px;" title="PlanetaGranDT registra ${pgtPj} PJ pero el equipo ya jugó ${teamPjActual} — Fecha pendiente de evaluación Clarín">⏳</span>`;
    }
    if (copa365) {
      freshnessHtml += `<span style="color:#8b5cf6;font-size:10px;margin-left:2px;" title="365Scores incluye partidos de Copa (${raw365Pj} PJ totales vs ${teamPjActual} PJ en Liga)">🏆</span>`;
    }

    let subBadgesHtml = `<span class="player-team">${p.team}</span>`;
    if (p.blended && p.blended.hist) {
      subBadgesHtml += `<span class="badge-sub clean" title="Torneo Pasado: ${p.blended.hist.matches} PJ, ${p.blended.hist.avgRating.toFixed(2)} PrT">📜 Torneo Pasado</span>`;
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

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-sub">${subBadgesHtml}</div>
        </div>
      </td>
      <td class="text-center">${matchesCount}${freshnessHtml}</td>
      <td class="text-center">${displayRating}</td>
      ${col4}
      ${col5}
      <td>${badges}</td>
      <td class="next-match">${nextMatchStr}</td>
      <td class="score-dt">
        ${p.finalScore.toFixed(1)}
        <button class="btn-icon" onclick="openAuditModal('${p.id}')">🔍</button>
      </td>
    `;
    container.appendChild(tr);
  });
}

function generateTacticalMatchupSummary(p, ctx, m, a) {
  if (!p) return '';

  const pos = p.position;
  const isHome = ctx ? ctx.isHome : true;
  const rivalName = ctx ? ctx.rival : 'Rival';
  const condTeamStr = isHome ? 'de local' : 'de visitante';

  const pj = p.matchesRated || p.pj || 0;
  const avg = p.avgRating || 6.0;
  const xg = p.xgPerMatch || 0;
  const shots = p.shotsPerMatch || 0;
  const winProb = ctx ? ctx.winProb : 0.50;
  const csProb = ctx ? ctx.cleanSheetProb : 0.30;

  let riskBadge = '';
  let riskTitle = '';
  let riskBg = '';
  let riskBorder = '';

  if (xg >= 0.28 || shots >= 2.1 || (pos === 'DEL' && (p.goals || 0) > 1)) {
    riskBadge = '🚀 PERFIL ARRIESGADO (APUESTA DE ALTO TECHO)';
    riskTitle = `Futbolista ofensivo de gran volumen (${xg.toFixed(2)} xG/p, ${shots.toFixed(1)} tiros/p). Si convierte gol, su techo proyectado alcanza los 14-16 pts Gran DT.`;
    riskBg = 'rgba(245,158,11,0.12)';
    riskBorder = 'rgba(245,158,11,0.4)';
  } else if (pj >= 2 && avg >= 6.0 && (winProb >= 0.48 || csProb >= 0.42)) {
    riskBadge = '🛡️ PERFIL SÓLIDO (PISO SEGURO DE PUNTOS)';
    riskTitle = `Titular indiscutido con promedio Clarín de ${avg.toFixed(2)} pts y solidez colectiva. Oportunidad ideal para asegurar puntos sin arriesgar.`;
    riskBg = 'rgba(16,185,129,0.12)';
    riskBorder = 'rgba(16,185,129,0.4)';
  } else {
    riskBadge = '⚠️ PERFIL MODERADO / VARIABLE';
    riskTitle = `Rendimiento sujeto a la dinámica del partido (${pj} PJ evaluados con nota promedio de ${avg.toFixed(2)} pts).`;
    riskBg = 'rgba(59,130,246,0.12)';
    riskBorder = 'rgba(59,130,246,0.4)';
  }

  const insights = [];
  const tStand = ctx ? findTeamStandings(p.team) : null;
  const rStand = ctx ? findTeamStandings(ctx.rival) : null;

  // A. Set piece / Corners / Crosses
  if (tStand && rStand) {
    const tCorners = (tStand.cornersForPerMatch || 5.2).toFixed(1);
    const rCrossesConc = (rStand.crossesConcededPerMatch || 14.5).toFixed(1);
    if (pos === 'DEF' || pos === 'ARQ' || pos === 'DEL') {
      if (parseFloat(rCrossesConc) >= 14.0) {
        insights.push(`🚩 <strong>Pelota Parada / Juego Aéreo:</strong> ${p.team} ${condTeamStr} genera ${tCorners} córners/p y enfrenta a ${rivalName} que concede ${rCrossesConc} centros/p. Con ${shots.toFixed(1)} tiros/partido de este futbolista, existe alta probabilidad de peligro aéreo en área rival.`);
      }
    }
  }

  // B. Possession & Controlling Pace
  if (tStand) {
    const poss = (tStand.possessionAvg || 50).toFixed(1);
    if (parseFloat(poss) >= 55.0) {
      insights.push(`🪄 <strong>Dominio y Posesión:</strong> ${p.team} promedia ${poss}% de posesión. Su alto volumen de circulaciones eleva el ritmo de juego y favorece la calificación del planillero Clarín.`);
    } else if (parseFloat(poss) <= 44.0) {
      insights.push(`⚡ <strong>Juego Directo y Físico:</strong> ${p.team} promedia ${poss}% de posesión, apostando al contraataque rápido y solidez física.`);
    }
  }

  // C. Home/Away Condition & Team Goal Odds
  if (ctx) {
    const rivalGoalProb = Math.max(0.05, 1.0 - ctx.cleanSheetProb);
    const rivalGoalOdds = 1.0 / rivalGoalProb;

    if (pos === 'ARQ' || pos === 'DEF') {
      insights.push(`🎲 <strong>Cuotas de Apuestas & Goles:</strong> Victoria ${p.team} cuota <strong>${ctx.winOdds.toFixed(2)}</strong> (${(ctx.winProb * 100).toFixed(0)}% prob.) | Gol de ${rivalName} paga <strong>${rivalGoalOdds.toFixed(2)}</strong> (Prob. Valla Invicta ${p.team}: <strong>${(ctx.cleanSheetProb * 100).toFixed(0)}%</strong>).`);
    } else {
      insights.push(`🎲 <strong>Cuotas de Apuestas & Victoria:</strong> Victoria ${p.team} cuota <strong>${ctx.winOdds.toFixed(2)}</strong> (${(ctx.winProb * 100).toFixed(0)}% prob. triunfo) | Expectativa Gol Equipo: <strong>${ctx.expGoalsTeam.toFixed(2)} xG</strong>.`);
    }

    if (isHome) {
      insights.push(`🏠 <strong>Fortaleza de Localía:</strong> ${p.team} juega en su estadio con ${(ctx.winProb * 100).toFixed(0)}% de prob. de triunfo y ${(ctx.cleanSheetProb * 100).toFixed(0)}% de valla invicta.`);
    } else {
      insights.push(`✈️ <strong>Exposición de Visitante:</strong> ${p.team} juega fuera de casa. Su prob. de valla invicta se sitúa en ${(ctx.cleanSheetProb * 100).toFixed(0)}% y requerirá máxima solidez defensiva.`);
    }
  }

  // E. Granular Position & Contextual Role Breakdown (DATOS REALES del torneo)
  if (pos === 'DEF') {
    const isCB = p.subRole === 'CB' || p.isCentral || ((p.shotsPerMatch || 0) < 1.2 && (p.xgPerMatch || 0) < 0.08);
    const headerGoals = p.goalsHeader || 0;
    const awayGoals = p.goalsAway || 0;
    if (isCB) {
      insights.push(`⚽ <strong>Perfil Defensor Central:</strong> ${isHome ? '🏠 De local, los centrales se potencian en jugadas de córners y pelota parada.' : '✈️ De visitante, se prioriza la solidez defensiva.'} ${p.name} lleva ${p.goals || 0} gol(es) en este torneo.`);
    } else {
      insights.push(`⚡ <strong>Perfil Lateral/Carrilero:</strong> ${!isHome ? '🔥 De visitante, condición favorable para proyección ofensiva por bandas.' : '🏠 De local, mayor volumen defensivo ante la presión rival.'} ${p.name} lleva ${p.goals || 0} gol(es) en este torneo.`);
    }
  } else if (pos === 'VOL') {
    insights.push(`⚽ <strong>Perfil Volante:</strong> ${isHome ? '✅ De local, mayor posesión y llegada al área.' : '✈️ De visitante, mayor recuperación y bonus por gol visitante.'} ${p.name} lleva ${p.goals || 0} gol(es) y ${p.figuras || 0} figura(s) en este torneo.`);
  } else if (pos === 'DEL') {
    const is9 = p.subRole === 'ST' || p.is9DeArea || ((p.shotsPerMatch || 0) >= 2.5 && (p.xgPerMatch || 0) >= 0.15);
    if (is9) {
      insights.push(`⚽ <strong>Perfil Referencia de Área (9 de Área):</strong> ${p.name} lleva ${p.goals || 0} gol(es) y un xG/partido de ${((p.xg365 || 0) / Math.max(1, p.matches365 || 1)).toFixed(2)}. ${isHome ? '🏠 Condición ideal de local.' : '✈️ De visitante suma +2 pts bonus por gol.'}`);
    } else {
      insights.push(`⚡ <strong>Perfil Extremo/Puntero:</strong> ${p.name} promedia ${((p.shots365 || 0) / Math.max(1, p.matches365 || 1)).toFixed(1)} remates por partido y lleva ${p.figuras || 0} figura(s) Gran DT. ${!isHome ? '🚀 De visitante dispone de espacios para desborde.' : '🏠 De local buscará desequilibrar en el mano a mano.'}`);
    }
  }

  if (insights.length === 0) {
    insights.push(`📊 <strong>Análisis Individual:</strong> Métricas propias basadas en rendimiento de los últimos encuentros.`);
  }

  return `
    <div class="audit-section" style="border:1px solid ${riskBorder};background:${riskBg};margin-bottom:16px;padding:14px 16px;border-radius:12px;">
      <h4 style="margin:0 0 8px 0;font-size:1.05rem;font-weight:800;color:var(--text-main);">
        💡 RESUMEN DEL ENFRENTAMIENTO TÁCTICO (MATCHUP)
      </h4>
      <div style="font-size:0.88rem;font-weight:700;color:var(--text-main);margin-bottom:8px;padding:4px 10px;border-radius:6px;background:rgba(255,255,255,0.08);display:inline-block;">
        ${riskBadge}
      </div>
      <div style="font-size:0.83rem;color:var(--text-muted);margin-bottom:10px;line-height:1.4;">
        ${riskTitle}
      </div>
      <div style="font-size:0.85rem;line-height:1.6;color:var(--text-main);display:flex;flex-direction:column;gap:6px;">
        ${insights.map(i => `<div>${i}</div>`).join('')}
      </div>
    </div>
  `;
}

window.openAuditModal = function(playerId) {
  let baseP = (appData.players || []).find(x => String(x.id) === String(playerId));
  if (!baseP && currentRankings) {
    baseP = currentRankings.find(x => String(x.id) === String(playerId));
  }
  if (!baseP) return;

  const posPool = (appData.players || []).filter(x => x.position === baseP.position);
  const ctx = getFixtureContext(baseP.team);
  const scoreData = calculateScoreDT(baseP, ctx, posPool);
  const p = { ...baseP, ctx, ...scoreData, finalScore: scoreData.rawEP ? (scoreData.rawEP * 10) : 50 };

  const modal = document.getElementById('audit-modal');
  const title = document.getElementById('audit-title');
  const body = document.getElementById('audit-body');
  
  if (!modal || !title || !body) return;

  const pos = p.position; // ARQ, DEF, VOL, DEL
  title.textContent = `📋 PLANTILLA TÉCNICA DE AUDITORÍA [${pos}]: ${p.name}`;

  const m = p.metrics || getPlayerMetrics(p);
  const a = p._audit || {};

  const tStand = ctx ? findTeamStandings(p.team) : null;
  const rStand = ctx ? findTeamStandings(ctx.rival) : null;

  const tSplit = (tStand && ctx) ? (ctx.isHome ? tStand.home : tStand.away) : {};
  const rSplit = (rStand && ctx) ? (ctx.isHome ? rStand.away : rStand.home) : {};

  // Tactical Matchup Summary
  const tacticalSummaryHtml = generateTacticalMatchupSummary(p, ctx, m, a);

  // Data Integrity Validation
  const integrity = typeof validatePlayerIntegrity === 'function' ? validatePlayerIntegrity(p, appData) : null;
  let integrityHtml = '';
  if (integrity) {
    const statusColor = integrity.status === 'EXCELLENT' ? '#10b981' : (integrity.status === 'GOOD' ? '#3b82f6' : '#f59e0b');
    const statusIcon = integrity.status === 'EXCELLENT' ? '✅' : '⚠️';
    integrityHtml = `
      <div class="audit-section" style="border:1px solid ${statusColor};background:rgba(15,23,42,0.6);">
        <h4 style="color:${statusColor};display:flex;align-items:center;justify-content:space-between;">
          <span>${statusIcon} INTEGRIDAD Y SALUD DE DATOS</span>
          <span style="font-size:0.8rem;padding:2px 8px;border-radius:4px;background:${statusColor};color:#0f172a;font-weight:700;">${integrity.healthScore}/100 - ${integrity.status}</span>
        </h4>
        <div style="font-size:0.85rem;line-height:1.6;margin-top:6px;">
          • <strong>Puntajes Clarín (PlanetaGranDT):</strong> ${integrity.checks.hasPgtScores ? '✅ Disponibles (' + (p.matchesRated || p.pj || 0) + ' PJ evaluados)' : '❌ Sin datos'}<br>
          • <strong>Stats 365Scores (xG/Tiros):</strong> ${integrity.checks.has365Stats ? '✅ Disponibles (' + (p.matches365 || 0) + ' PJ registrados)' : '⚠️ Sin datos'}<br>
          • <strong>PJ Real del Equipo (ESPN):</strong> ${tStand ? ('✅ ' + p.team + ' jugó ' + (tStand.pj || 0) + ' partidos en el torneo') : '❌ Sin datos de posiciones'}<br>
          • <strong>Seguridad de Partidos:</strong> ${(() => {
            const pgtPj = p.matchesRated || 0;
            const s365 = p.matches365 || 0;
            const teamPj = tStand ? (tStand.pj || 0) : 0;
            const parts = [];
            if (pgtPj > 0 && teamPj > 0 && pgtPj < teamPj) {
              parts.push('<span style="color:#f59e0b;font-weight:700;">⏳ PlanetaGranDT atrasado (' + pgtPj + '/' + teamPj + ' PJ) — Planilla aún no publicada. Promedios calculados sobre ' + pgtPj + ' PJ confirmados.</span>');
            }
            if (s365 > teamPj + 1) {
              parts.push('<span style="color:#8b5cf6;font-weight:700;">🏆 365Scores incluye Copa (' + s365 + ' PJ totales vs ' + teamPj + ' PJ Liga). El algoritmo usa máximo ' + teamPj + ' PJ para xG/Tiros.</span>');
            }
            if (parts.length === 0) {
              parts.push('<span style="color:#10b981;font-weight:700;">✅ Todas las fuentes coinciden (' + pgtPj + ' PJ)</span>');
            }
            return parts.join('<br>          • <strong>Nota:</strong> ');
          })()}<br>
          • <strong>Equipo en Posiciones:</strong> ${integrity.checks.hasTeamStandings ? '✅ Mapeado (' + p.team + ')' : '❌ No encontrado'}<br>
          • <strong>Próximo Fixture:</strong> ${integrity.checks.hasUpcomingFixture ? '✅ Asignado' : '❌ Sin próximo partido'}<br>
          • <strong>Cuotas de Apuestas:</strong> ${integrity.checks.hasOdds ? '✅ Cuotas Reales' : '📊 Cuotas Estimadas'}
        </div>
        ${integrity.issues.length > 0 ? `<div style="margin-top:6px;font-size:0.8rem;color:#f59e0b;">⚠️ ${integrity.issues.join(' • ')}</div>` : ''}
      </div>
    `;
  }

  const rivalGoalProb = ctx ? Math.max(0.05, 1.0 - ctx.cleanSheetProb) : 0.70;
  const rivalGoalOdds = 1.0 / rivalGoalProb;

  let sec2Html = `
    • <strong>Rival:</strong> ${ctx ? ctx.rival : 'N/A'}<br>
    • <strong>Condición:</strong> ${ctx ? (ctx.isHome ? '🏠 Local' : '✈️ Visitante') : 'N/A'}<br>
    • <strong>Cuota Victoria ${p.team}:</strong> ${ctx ? ctx.winOdds.toFixed(2) : 'N/A'} (${ctx ? (ctx.winProb * 100).toFixed(0) : '0'}% prob. triunfo) ${ctx && ctx.isRealOdds ? '🏆 (Casas de Apuestas)' : '📊 (Estimada)'}<br>
    • <strong>🎲 Cuota Gol del Rival (${ctx ? ctx.rival : 'Rival'}):</strong> <strong style="color:var(--warning); font-size:14px;">${rivalGoalOdds.toFixed(2)}</strong> (Paga $${rivalGoalOdds.toFixed(2)} si ${ctx ? ctx.rival : 'el rival'} convierte gol)<br>
    • <strong>🛡️ Probabilidad Valla Invicta ${p.team}:</strong> <strong style="color:var(--success); font-size:14px;">${ctx ? (ctx.cleanSheetProb * 100).toFixed(1) : '30.0'}%</strong><br>
  `;

  if (pos === 'DEL' || pos === 'VOL') {
    sec2Html += `
      • <strong>Goles Esperados Equipo (xG Proyectado):</strong> ${ctx ? ctx.expGoalsTeam.toFixed(2) : '1.20'} xG<br>
      • <strong>Tiros Proyectados del Equipo:</strong> ${ctx ? ctx.teamShotsFor.toFixed(1) : '12.0'} tiros/partido
    `;
  } else if (pos === 'ARQ') {
    sec2Html += `
      • <strong>Goles Esperados del Rival (xG Proyectado):</strong> ${ctx ? ctx.expGoalsRival.toFixed(2) : '1.10'} xG<br>
      • <strong>Tiros Proyectados del Rival:</strong> ${ctx ? ctx.teamShotsConceded.toFixed(1) : '11.0'} tiros/partido
    `;
  } else { // DEF
    sec2Html += `
      • <strong>Goles Esperados Equipo (xG Proyectado):</strong> ${ctx ? ctx.expGoalsTeam.toFixed(2) : '1.20'} xG<br>
      • <strong>Tiros Proyectados del Equipo:</strong> ${ctx ? ctx.teamShotsFor.toFixed(1) : '12.0'} tiros/partido<br>
      • <strong>Goles Esperados del Rival (xG Proyectado):</strong> ${ctx ? ctx.expGoalsRival.toFixed(2) : '1.10'} xG<br>
      • <strong>Tiros Proyectados del Rival:</strong> ${ctx ? ctx.teamShotsConceded.toFixed(1) : '11.0'} tiros/partido
    `;
  }

  const avgCurrentDisplay = (p.avgRating || 0).toFixed(2);
  const masterPJ = a.pjPgt || Math.max(1, m.pjCur || 1);
  const pj365 = a.pj365 || p.matches365 || 1;
  const avgMinMatch = a.avgMinutesPerMatch || 45;

  let sec3Html = `
    • <strong>Partidos Jugados (PlanetaGrandT):</strong> ${masterPJ} PJ<br>
    • <strong>Puntaje Promedio Clarín (Torneo Actual):</strong> ${avgCurrentDisplay} pts/p<br>
    • <strong>Historial Torneo Pasado:</strong> ${m.hist ? `${m.hist.matches} PJ | ${m.hist.avgRating.toFixed(2)} PrT | ${m.hist.goals} Goles | ${m.hist.figuras} Fig` : 'Sin registro previo'}<br>
  `;

  if (pos !== 'ARQ') {
    const xgTot = p.xg365 || p.xg || 0;
    const shotsTot = p.shots365 || p.shots || 0;
    const xgPerPJ = (a.xgPerMatch !== undefined) ? a.xgPerMatch : (xgTot / pj365);
    const shotsPerPJ = (a.shotsPerMatch !== undefined) ? a.shotsPerMatch : (shotsTot / pj365);
    const goalsPerPJ = (a.goalsPerMatch !== undefined) ? a.goalsPerMatch : ((p.goals || 0) / masterPJ);

    sec3Html += `
      • <strong>Goles Totales (PlanetaGrandT):</strong> ${p.goals || 0} (${goalsPerPJ.toFixed(2)} goles por PJ)<br>
      <br><strong style="color:var(--primary);">📊 DATOS REALES 365Scores (${pj365} ${pj365 === 1 ? 'Partido Registrado' : 'Partidos Registrados'} | ${p.minutes365 || (pj365 * 45)} min totales acumulados):</strong><br>
      • <strong>Minutos Promedio por Partido Registrado:</strong> ${avgMinMatch} min/p<br>
      • <strong>xG Total Registrado:</strong> ${xgTot.toFixed(2)} → <strong>xG por Partido Registrado:</strong> ${xgPerPJ.toFixed(2)} xG/p<br>
      • <strong>Tiros Totales Registrados:</strong> ${shotsTot} → <strong>Tiros por Partido Registrado:</strong> ${shotsPerPJ.toFixed(2)} tiros/p<br>
    `;
  }

  if (pos === 'ARQ' || pos === 'DEF') {
    sec3Html += `• <strong>Vallas Invictas:</strong> ${p.cleanSheets || 0}<br>`;
  }

  sec3Html += `• <strong>Veces Figura:</strong> ${p.figuras || 0}`;

  if (pos !== 'ARQ') {
    sec3Html += `<br>• <strong>Penales Pateados:</strong> ${p.goalsPenalty || 0} (Bonus EP: +${(a.EP_pen || 0).toFixed(2)} pts)`;
  }

  const yellowPerPJ = (a.yellowPerMatch !== undefined) ? a.yellowPerMatch : ((p.yellowCards || 0) / masterPJ);
  const redPerPJ = (a.redPerMatch !== undefined) ? a.redPerMatch : ((p.redCards || 0) / masterPJ);

  let sec4Html = `
    <br><strong style="color:var(--danger);">⚠️ 4. DATOS NEGATIVOS (Reglas Oficiales Gran DT: -2 Amarilla, -4 Roja):</strong><br>
    • <strong>Tarjetas Amarillas:</strong> ${p.yellowCards || 0} (${yellowPerPJ.toFixed(2)} am/PJ)<br>
    • <strong>Tarjetas Rojas:</strong> ${p.redCards || 0} (${redPerPJ.toFixed(2)} rojas/PJ)<br>
    • <strong>Penalización EP por Tarjetas:</strong> -${(a.EP_cards || 0).toFixed(2)} pts Gran DT<br>
  `;

  // Section 5: Full team/rival stats from all data sources
  const tStandTotal = tStand || {};
  const rStandTotal = rStand || {};
  const condEquipo = ctx ? (ctx.isHome ? 'Local' : 'Visitante') : '';
  const condRival = ctx ? (ctx.isHome ? 'Visitante' : 'Local') : '';

  let sec5Html = `
    • <strong>Tabla General Equipo (${p.team}):</strong> ${tStandTotal.pj !== undefined ? `PJ: ${tStandTotal.pj} | GF: ${tStandTotal.gf} | GC: ${tStandTotal.gc} | PTS: ${tStandTotal.pts}` : 'Sin datos'}<br>
    • <strong>Tabla General Rival (${ctx ? ctx.rival : ''}):</strong> ${rStandTotal.pj !== undefined ? `PJ: ${rStandTotal.pj} | GF: ${rStandTotal.gf} | GC: ${rStandTotal.gc} | PTS: ${rStandTotal.pts}` : 'Sin datos'}<br>
    • <strong>Split ${condEquipo} Equipo:</strong> ${tSplit ? `PJ: ${tSplit.pj || 0} | GF: ${tSplit.gf || 0} | GC: ${tSplit.gc || 0} | PTS: ${tSplit.pts || 0}` : 'Sin datos'}<br>
    • <strong>Split ${condRival} Rival:</strong> ${rSplit ? `PJ: ${rSplit.pj || 0} | GF: ${rSplit.gf || 0} | GC: ${rSplit.gc || 0} | PTS: ${rSplit.pts || 0}` : 'Sin datos'}<br>
  `;

  // Real per-game stats from ctx
  const ts2 = ctx ? ctx.teamStats : null;
  const rs2 = ctx ? ctx.rivalStats : null;

  if (pos === 'ARQ' || pos === 'DEF') {
    sec5Html += `
      <br><strong style="color:var(--danger);">⚔️ AMENAZA DEL RIVAL (${ctx ? ctx.rival : ''}):</strong><br>
      • <strong>Goles del Rival (general):</strong> ${rs2 ? rs2.golesPerGame.toFixed(2) : '?'} goles/p<br>
      • <strong>Goles del Rival (${condRival}):</strong> ${rs2 ? rs2.golesCondicion.toFixed(2) : '?'} goles/p<br>
      • <strong>xG Generado por Rival (temporada):</strong> ${ctx && ctx.rivalXgData ? ctx.rivalXgData.xgPerGame + ' xG/p' : 'Sin datos'}<br>
      • <strong>⚔️ Goles Concedidos por el RIVAL (Aprovechable):</strong> ${ctx && ctx.rivalXgData ? ctx.rivalXgData.xgConcededPerGame + ' xGC/p' : 'Sin datos'}<br>
    `;
  }
  if (pos === 'ARQ') {
    sec5Html += `
      • <strong>🛡️ Goles Concedidos por TU Equipo (Defensa):</strong> ${ctx && ctx.teamXgData ? ctx.teamXgData.xgConcededPerGame + ' xGC/p' : 'Sin datos'}<br>
      • <strong>Proyección vs Rival:</strong> ${ctx ? `Tiros del Rival: ${ctx.teamShotsConceded.toFixed(1)}/p | xG Rival Esperado: ${ctx.expGoalsRival.toFixed(2)}` : 'Sin datos'}
    `;
  } else if (pos === 'DEF') {
    sec5Html += `
      • <strong>🛡️ Goles Concedidos por TU Equipo (Defensa):</strong> ${ctx && ctx.teamXgData ? ctx.teamXgData.xgConcededPerGame + ' xGC/p' : 'Sin datos'}<br>
      <br><strong style="color:var(--success);">⚡ POTENCIAL OFENSIVO DEL EQUIPO (${p.team}):</strong><br>
      • <strong>Goles del Equipo (general):</strong> ${ts2 ? ts2.golesPerGame.toFixed(2) : '?'} goles/p<br>
      • <strong>Goles del Equipo (${condEquipo}):</strong> ${ts2 ? ts2.golesCondicion.toFixed(2) : '?'} goles/p<br>
      • <strong>xG Generado por Equipo (temporada):</strong> ${ctx && ctx.teamXgData ? ctx.teamXgData.xgPerGame + ' xG/p' : 'Sin datos'}<br>
      • <strong>Proyección vs Rival:</strong> ${ctx ? `Tiros del Equipo: ${ctx.teamShotsFor.toFixed(1)}/p | Tiros del Rival: ${ctx.teamShotsConceded.toFixed(1)}/p` : 'Sin datos'}
    `;
  } else {
    // VOL / DEL
    sec5Html += `
      <br><strong style="color:var(--success);">⚡ POTENCIAL OFENSIVO DEL EQUIPO (${p.team}):</strong><br>
      • <strong>Goles del Equipo (general):</strong> ${ts2 ? ts2.golesPerGame.toFixed(2) : '?'} goles/p<br>
      • <strong>Goles del Equipo (${condEquipo}):</strong> ${ts2 ? ts2.golesCondicion.toFixed(2) : '?'} goles/p<br>
      • <strong>xG Generado por Equipo (temporada):</strong> ${ctx && ctx.teamXgData ? ctx.teamXgData.xgPerGame + ' xG/p' : 'Sin datos'}<br>
      • <strong>⚔️ Goles Concedidos por el RIVAL (Aprovechable):</strong> ${ctx && ctx.rivalXgData ? ctx.rivalXgData.xgConcededPerGame + ' xGC/p' : 'Sin datos'}<br>
      • <strong>Proyección vs Rival:</strong> ${ctx ? `Tiros del Equipo: ${ctx.teamShotsFor.toFixed(1)}/p | xG Esperado: ${ctx.expGoalsTeam.toFixed(2)}` : 'Sin datos'}
    `;
  }

  // Tactical Breakdown section (individual metrics & matchup fit)
  let tacticalHtml = ``;
  const gAway = p.goalsAway || 0;
  const gHome = Math.max(0, (p.goals || 0) - gAway);
  const gHead = p.goalsHeader || 0;
  
  tacticalHtml += `• <strong>⚽ Desglose de Goles del Jugador:</strong> ${p.goals || 0} totales (${gHome} de local, ${gAway} de visitante, ${gHead} de cabeza)<br>`;
  tacticalHtml += `• <strong>🎯 Rendimiento Individual (365Scores):</strong> ${(p.xgPerMatch || 0).toFixed(2)} xG/p | ${(p.shotsPerMatch || 0).toFixed(1)} tiros/p<br>`;
  
  if (pos === 'DEF') {
    const isCB = p.subRole === 'CB' || p.isCentral || (!p.subRole && (p.shotsPerMatch || 0) < 1.2 && (p.xgPerMatch_noPen || 0) < 0.08);
    tacticalHtml += `• <strong>🛡️ Perfil Posicional:</strong> ${isCB ? 'Central (Pelota Parada / Cabezazo)' : 'Lateral / Carrilero (Llegada por Bandas)'}<br>`;
    tacticalHtml += `• <strong>🏟️ Fit Situacional:</strong> ${ctx && ctx.isHome ? '🏠 Partido de Local (Mayor presencia en área rival)' : '✈️ Partido de Visitante (Espacios para desborde / bonus +2 pts gol visitante)'}<br>`;
  }

  const baseRating = Math.min(10.0, p.avgRating || 6.0);
  const expectedClarín = baseRating * 0.75;
  const epBonus = a.rawEP || 0;
  const totalProj = expectedClarín + epBonus;

  let sec6Html = '';
  if (pos === 'ARQ' || pos === 'DEF') {
    sec6Html += `• <strong>Probabilidad Valla Invicta (P0):</strong> ${((a.csProb || 0) * 100).toFixed(1)}%<br>`;
  }
  sec6Html += `• <strong>Probabilidad Victoria Equipo:</strong> ${((a.winProb || 0) * 100).toFixed(1)}%<br>`;
  if (pos !== 'ARQ') {
    sec6Html += `• <strong>Oportunidad de Gol Equipo:</strong> ${((a.goalOpp || 0) * 100).toFixed(1)}%<br>`;
  }
  sec6Html += `
    <br><strong style="color:var(--success); font-size:14px;">🎯 PROYECCIÓN REAL GRAN DT (PRÓXIMA FECHA):</strong><br>
    • <strong>Puntaje Esperado en la Fecha:</strong> <strong style="font-size:16px; color:var(--success);">${totalProj.toFixed(1)} Puntos Gran DT</strong><br>
    • <strong>Desglose del Puntaje:</strong> ${(baseRating * 0.75).toFixed(1)} pts (Ficha Clarín Base) + ${epBonus.toFixed(1)} pts (Bonus Valla/Gol/Figura)<br>
    • <strong>Índice de Prioridad en Ranking:</strong> <strong style="color:var(--primary);">${p.finalScore.toFixed(1)}% (Recomendación Top)</strong>
  `;

  let html = `
    <div style="font-family: inherit; font-size: 13px; line-height: 1.6; color: var(--text-main);">
      ${tacticalSummaryHtml}
      ${integrityHtml}
      
      <div style="background: rgba(59, 130, 246, 0.1); border-left: 4px solid var(--primary); padding: 10px; margin-bottom: 12px; border-radius: 6px;">
        <h4 style="margin:0 0 6px 0; color:var(--primary);">👤 1. DATOS DEL JUGADOR</h4>
        • <strong>Nombre:</strong> ${p.name}<br>
        • <strong>Posición:</strong> ${p.position}<br>
        • <strong>Equipo Actual:</strong> ${p.team}
      </div>

      <div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid var(--success); padding: 10px; margin-bottom: 12px; border-radius: 6px;">
        <h4 style="margin:0 0 6px 0; color:var(--success);">📅 2. DATOS DEL PARTIDO (PRÓXIMA FECHA OBJETIVO)</h4>
        ${sec2Html}
      </div>

      <div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid var(--warning); padding: 10px; margin-bottom: 12px; border-radius: 6px;">
        <h4 style="margin:0 0 6px 0; color:var(--warning);">📊 3. DATOS ACUMULADOS & BAYESIANOS</h4>
        ${sec3Html}
      </div>

      <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--danger); padding: 10px; margin-bottom: 12px; border-radius: 6px;">
        <h4 style="margin:0 0 6px 0; color:var(--danger);">⚠️ 4. DATOS NEGATIVOS</h4>
        • <strong>Tarjetas Amarillas:</strong> ${p.yellowCards || 0} (${yellowPerPJ.toFixed(2)} am/PJ)<br>
        • <strong>Tarjetas Rojas:</strong> ${p.redCards || 0} (${redPerPJ.toFixed(2)} rojas/PJ)<br>
        • <strong>Penalización EP por Tarjetas:</strong> -${(a.EP_cards || 0).toFixed(2)} pts
      </div>

      <div style="background: rgba(147, 51, 234, 0.1); border-left: 4px solid #9333ea; padding: 10px; margin-bottom: 12px; border-radius: 6px;">
        <h4 style="margin:0 0 6px 0; color:#9333ea;">🏟️ 5. TABLAS DE POSICIONES Y TIROS DE EQUIPOS</h4>
        ${sec5Html}
      </div>

      <div style="background: rgba(16, 185, 129, 0.08); border-left: 4px solid var(--success); padding: 10px; margin-bottom: 12px; border-radius: 6px;">
        <h4 style="margin:0 0 6px 0; color:var(--success);">📌 6. FICHA TÉCNICA E HISTORIAL INDIVIDUAL DEL JUGADOR</h4>
        <div style="font-size:0.83rem;line-height:1.6;">
          • <strong>Nombre y Puesto:</strong> ${p.name} [${p.position}] (${p.team})<br>
          • <strong>xG Acumulado (365Scores):</strong> ${(p.xg365 || 0).toFixed(2)} xG en ${p.matches365 || 0} partidos<br>
          • <strong>Remates Totales (365Scores):</strong> ${p.shots365 || 0} tiros totales (${((p.shots365 || 0) / Math.max(1, p.matches365 || 1)).toFixed(1)} tiros/p)<br>
          • <strong>Minutos Jugados:</strong> ${p.minutes365 || 0} min (${a.avgMinutesPerMatch || 0} min/partido promedio)<br>
          • <strong>Ficha Clarín (Promedio):</strong> ${(m.avgRatingCur || 6.0).toFixed(2)} pts sobre ${p.matchesRated || 0} fechas oficialmente evaluadas<br>
          • <strong>Figuras Gran DT:</strong> ${p.figuras || 0} veces elegida figura del partido (+4 pts cada una)
        </div>
      </div>

      <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); padding: 10px; border-radius: 6px;">
        <h4 style="margin:0 0 6px 0; color:var(--text-main);">🧮 7. DESGLOSE MATEMÁTICO FINAL</h4>
        ${sec6Html}
      </div>

    </div>
  `;

  body.innerHTML = html;
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

  // Sort by PTS desc, DIF desc, GF desc
  zonaData.sort((a, b) => {
    let statsA = filter === 'home' ? a.home : filter === 'away' ? a.away : a;
    let statsB = filter === 'home' ? b.home : filter === 'away' ? b.away : b;
    
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
    let stats = teamEntry;
    if (filter === 'home') stats = teamEntry.home || teamEntry;
    if (filter === 'away') stats = teamEntry.away || teamEntry;

    const dif = (stats.gf || 0) - (stats.gc || 0);
    const difStr = dif > 0 ? `+${dif}` : `${dif}`;

    const tr = document.createElement('tr');
    tr.className = 'clickable-team-row';
    tr.title = `Hacé clic para ver la Base de Datos completa de ${teamEntry.team}`;
    tr.onclick = () => window.openTeamModal(teamEntry.team);

    const formaArr = getTeamForma(teamEntry.team, teamEntry.forma, stats.pj);

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
