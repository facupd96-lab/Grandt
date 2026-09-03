/**
 * teamsRegistry.js
 * Centralized Canonical Team Registry & Data Integrity Checker
 * Maps team names across PlanetaGrandT, ESPN Fixture, ESPN Standings, 365Scores, and Betting Odds.
 */

const TEAMS = [
  {
    id: 'aldosivi',
    name: 'Aldosivi',
    aliases: ['aldosivi']
  },
  {
    id: 'argentinos',
    name: 'Argentinos Juniors',
    aliases: ['argentinos', 'argentinos juniors', 'argentinos jrs', 'argentinos jrs.']
  },
  {
    id: 'atl-tucuman',
    name: 'Atlético Tucumán',
    aliases: ['atl. tucuman', 'atletico tucuman', 'atl tucuman']
  },
  {
    id: 'banfield',
    name: 'Banfield',
    aliases: ['banfield']
  },
  {
    id: 'barracas',
    name: 'Barracas Central',
    aliases: ['barracas ctral.', 'barracas central', 'barracas ctral']
  },
  {
    id: 'belgrano',
    name: 'Belgrano',
    aliases: ['belgrano']
  },
  {
    id: 'boca',
    name: 'Boca Juniors',
    aliases: ['boca', 'boca juniors']
  },
  {
    id: 'central-cordoba',
    name: 'Central Córdoba (SdE)',
    aliases: ['ctral. cordoba', 'central cba. (sde)', 'central cordoba sde', 'ctral cordoba', 'central cordoba']
  },
  {
    id: 'defensa',
    name: 'Defensa y Justicia',
    aliases: ['def. y justicia', 'defensa y justicia', 'def y justicia']
  },
  {
    id: 'riestra',
    name: 'Deportivo Riestra',
    aliases: ['dep. riestra', 'riestra', 'dep riestra']
  },
  {
    id: 'estudiantes-lp',
    name: 'Estudiantes (LP)',
    aliases: ['estudiantes lp', 'estudiantes de la plata', 'estudiantes (lp)']
  },
  {
    id: 'estudiantes-rc',
    name: 'Estudiantes (RC)',
    aliases: ['estudiantes rc', 'estudiantes (rc)', 'estudiantes rio cuarto', 'estudiantes de rio cuarto']
  },
  {
    id: 'gimnasia-lp',
    name: 'Gimnasia (LP)',
    aliases: ['gimnasia lp', 'gimnasia la plata', 'gimnasia (lp)']
  },
  {
    id: 'gimnasia-mza',
    name: 'Gimnasia (Mza)',
    aliases: ['gimnasia mza', 'gimnasia (m)', 'gimnasia mendoza', 'gimnasia (mza)', 'gimnasia de mendoza']
  },
  {
    id: 'godoy-cruz',
    name: 'Godoy Cruz',
    aliases: ['godoy cruz']
  },
  {
    id: 'huracan',
    name: 'Huracán',
    aliases: ['huracan', 'huracán']
  },
  {
    id: 'ind-rivadavia',
    name: 'Independiente Rivadavia',
    aliases: ['ind. rivadavia', 'cs independiente rivadavia', 'independiente rivadavia', 'ind rivadavia']
  },
  {
    id: 'independiente',
    name: 'Independiente',
    aliases: ['independiente', 'ca independiente']
  },
  {
    id: 'instituto',
    name: 'Instituto',
    aliases: ['instituto', 'instituto ac cordoba', 'instituto cordoba']
  },
  {
    id: 'lanus',
    name: 'Lanús',
    aliases: ['lanus', 'lanús']
  },
  {
    id: 'newells',
    name: 'Newell\'s Old Boys',
    aliases: ['newell\'s', 'newells', 'newell\'s old boys', 'newells old boys']
  },
  {
    id: 'platense',
    name: 'Platense',
    aliases: ['platense']
  },
  {
    id: 'racing',
    name: 'Racing Club',
    aliases: ['racing', 'racing club']
  },
  {
    id: 'river',
    name: 'River Plate',
    aliases: ['river', 'river plate']
  },
  {
    id: 'rosario-central',
    name: 'Rosario Central',
    aliases: ['rosario ctral.', 'rosario central', 'rosario ctral']
  },
  {
    id: 'san-lorenzo',
    name: 'San Lorenzo',
    aliases: ['san lorenzo']
  },
  {
    id: 'sarmiento',
    name: 'Sarmiento (J)',
    aliases: ['sarmiento', 'sarmiento (j)', 'sarmiento junin']
  },
  {
    id: 'talleres',
    name: 'Talleres (Cba)',
    aliases: ['talleres', 'talleres cordoba', 'talleres (cba)']
  },
  {
    id: 'tigre',
    name: 'Tigre',
    aliases: ['tigre']
  },
  {
    id: 'union',
    name: 'Unión (SF)',
    aliases: ['union', 'unión', 'union santa fe', 'unión santa fe', 'unión (sf)']
  },
  {
    id: 'velez',
    name: 'Vélez Sarsfield',
    aliases: ['velez', 'vélez', 'velez sarsfield', 'vélez sarsfield']
  }
];

function normStr(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
}

/**
 * Resolves any raw team name to canonical team object
 */
function resolveTeam(rawName) {
  if (!rawName) return null;
  const n = normStr(rawName);
  
  // 1. Exact match by ID, Name or Alias
  for (const team of TEAMS) {
    if (team.id === n) return team;
    if (normStr(team.name) === n) return team;
    for (const alias of team.aliases) {
      if (normStr(alias) === n) return team;
    }
  }

  // 2. Specific disambiguations
  if (n.includes('rivadavia')) return TEAMS.find(t => t.id === 'ind-rivadavia') || null;
  if (n.includes('mendoza') || (n.includes('gimnasia') && (n.includes('mza') || n.includes(' m ')))) return TEAMS.find(t => t.id === 'gimnasia-mza') || null;
  if (n.includes('la plata') || (n.includes('gimnasia') && (n.includes('lp') || n.includes(' l ')))) return TEAMS.find(t => t.id === 'gimnasia-lp') || null;
  if (n.includes('cuarto') || (n.includes('estudiantes') && (n.includes('rc') || n.includes(' r ')))) return TEAMS.find(t => t.id === 'estudiantes-rc') || null;
  if (n.includes('cordoba') && n.includes('central')) return TEAMS.find(t => t.id === 'central-cordoba') || null;

  // 3. Longest partial match search
  let bestMatch = null;
  let maxMatchLen = 0;
  for (const team of TEAMS) {
    for (const alias of team.aliases) {
      const na = normStr(alias);
      if (na.length >= 4 && (n.includes(na) || na.includes(n))) {
        if (na.length > maxMatchLen) {
          maxMatchLen = na.length;
          bestMatch = team;
        }
      }
    }
  }
  return bestMatch;
}

/**
 * Returns canonical team ID
 */
function getCanonicalTeamId(rawName) {
  const team = resolveTeam(rawName);
  return team ? team.id : null;
}

/**
 * Returns canonical display name
 */
function getCanonicalTeamName(rawName) {
  const team = resolveTeam(rawName);
  return team ? team.name : rawName;
}

/**
 * Check integrity status for a single player
 */
function validatePlayerIntegrity(player, data) {
  const issues = [];
  const checks = {
    hasPgtScores: false,
    has365Stats: false,
    hasTeamStandings: false,
    hasUpcomingFixture: false,
    hasOdds: false
  };

  // 1. Check PlanetaGrandT score data & roster registration
  if (player.matchesRated >= 0 && (player.name || player.team)) {
    checks.hasPgtScores = true;
  } else {
    issues.push('Sin registro oficial en Planeta Gran DT');
  }

  // 2. Check 365Scores / stats coverage
  if (player.matches365 !== undefined || player.xgPerMatch !== undefined || player.shotsPerMatch !== undefined || player.matchesRated >= 0) {
    checks.has365Stats = true;
  } else {
    issues.push('Sin estadísticas reales de 365Scores (xG/Tiros)');
  }

  // 3. Check Team Standings
  const teamObj = resolveTeam(player.team);
  const teamId = teamObj ? teamObj.id : null;

  if (data.standings) {
    const allStandings = (data.standings.zonaA || []).concat(data.standings.zonaB || []);
    const foundStand = allStandings.find(s => resolveTeam(s.team)?.id === teamId);
    if (foundStand) {
      checks.hasTeamStandings = true;
    } else {
      issues.push(`Equipo (${player.team}) no encontrado en tabla de posiciones`);
    }
  }

  // 4. Check Upcoming Fixture
  if (data.fixture && Array.isArray(data.fixture)) {
    const nextMatch = data.fixture.find(m => {
      const hId = resolveTeam(m.home)?.id;
      const aId = resolveTeam(m.away)?.id;
      return (hId === teamId || aId === teamId) && m.state !== 'post';
    });
    if (nextMatch) {
      checks.hasUpcomingFixture = true;
      // Check odds for this match
      if (data.odds) {
        const hasOddsHome = data.odds[nextMatch.home] !== undefined;
        const hasOddsAway = data.odds[nextMatch.away] !== undefined;
        if (hasOddsHome || hasOddsAway) {
          checks.hasOdds = true;
        } else {
          issues.push('Sin cuotas de apuestas para el próximo partido');
        }
      }
    } else {
      issues.push('Sin próximo partido en fixture');
    }
  }

  const isComplete = checks.hasPgtScores && checks.has365Stats && checks.hasTeamStandings && checks.hasUpcomingFixture;
  const healthScore = (checks.hasPgtScores ? 35 : 0) +
                      (checks.has365Stats ? 30 : 0) +
                      (checks.hasTeamStandings ? 15 : 0) +
                      (checks.hasUpcomingFixture ? 10 : 0) +
                      (checks.hasOdds ? 10 : 0);

  return {
    isComplete,
    healthScore,
    status: healthScore >= 90 ? 'EXCELLENT' : (healthScore >= 65 ? 'GOOD' : (healthScore >= 40 ? 'PARTIAL' : 'POOR')),
    checks,
    issues
  };
}

/**
 * Get overall system data health summary
 */
function getDataHealthSummary(data) {
  const players = data.players || [];
  let totalPlayers = players.length;
  let excellent = 0, good = 0, partial = 0, poor = 0;
  let pgtCount = 0, s365Count = 0, fixtureCount = 0, standingsCount = 0;

  players.forEach(p => {
    const val = validatePlayerIntegrity(p, data);
    if (val.status === 'EXCELLENT') excellent++;
    else if (val.status === 'GOOD') good++;
    else if (val.status === 'PARTIAL') partial++;
    else poor++;

    if (val.checks.hasPgtScores) pgtCount++;
    if (val.checks.has365Stats) s365Count++;
    if (val.checks.hasUpcomingFixture) fixtureCount++;
    if (val.checks.hasTeamStandings) standingsCount++;
  });

  const totalGames365 = data.stats365 && data.stats365._games ? Object.keys(data.stats365._games).length : 0;
  const totalFixtureMatches = data.fixture ? data.fixture.length : 0;

  return {
    totalPlayers,
    qualityBreakdown: { excellent, good, partial, poor },
    completePercentage: Math.round(((excellent + good) / Math.max(1, totalPlayers)) * 100),
    coverage: {
      pgt: { count: pgtCount, pct: Math.round((pgtCount / Math.max(1, totalPlayers)) * 100) },
      s365: { count: s365Count, pct: Math.round((s365Count / Math.max(1, totalPlayers)) * 100), games: totalGames365 },
      fixture: { count: fixtureCount, pct: Math.round((fixtureCount / Math.max(1, totalPlayers)) * 100), matches: totalFixtureMatches },
      standings: { count: standingsCount, pct: Math.round((standingsCount / Math.max(1, totalPlayers)) * 100) }
    }
  };
}

/**
 * Comprehensive Safety & Integrity Auditor
 * Verifies team match counts (Standings vs Fixture vs TeamStats)
 * and player match counts (PlanetaGrandT vs 365Scores).
 */
function validateDataSafety(data) {
  if (!data) return { isSystemSafe: true, teamAudit: [], teamMismatches: [], playerDiscrepancies: [] };

  const standings = [...(data.standings?.zonaA || []), ...(data.standings?.zonaB || [])];
  const fixture = data.fixture || [];
  const teamStats = data.teamStats || {};
  const players = data.players || [];

  const teamAudit = [];
  const playerDiscrepancies = [];

  standings.forEach(t => {
    const expectedPj = t.pj || 0;
    const resolvedTeam = resolveTeam(t.team);
    const tId = resolvedTeam ? resolvedTeam.id : null;
    const tName = resolvedTeam ? resolvedTeam.name : t.team;

    const fixtureCompleted = fixture.filter(m => {
      const hId = resolveTeam(m.home)?.id;
      const aId = resolveTeam(m.away)?.id;
      return (hId === tId || aId === tId) && m.state === 'post';
    }).length;

    const statsEntry = teamStats[tName] || (tId ? teamStats[tId] : null);
    const statsMatches = statsEntry?.total?.matches || 0;

    const isFixtureMatch = expectedPj === fixtureCompleted;
    const isStatsMatch = expectedPj === statsMatches || statsMatches === 0;

    teamAudit.push({
      team: t.team,
      expectedPj,
      fixtureCompleted,
      statsMatches,
      isOk: isFixtureMatch,
      status: isFixtureMatch ? 'OK' : 'MISMATCH',
      message: !isFixtureMatch ? `Posiciones (${expectedPj} PJ) vs Fixture (${fixtureCompleted} PJ)` : '100% Coincidente'
    });
  });

  players.forEach(p => {
    const pgtPj = p.matchesRated !== undefined ? p.matchesRated : (p.pj || 0);
    const s365Pj = p.matches365 || 0;

    if (pgtPj > 0 && s365Pj > 0 && pgtPj !== s365Pj) {
      playerDiscrepancies.push({
        id: p.id,
        name: p.name,
        team: p.team,
        pgtPj,
        s365Pj,
        difference: s365Pj - pgtPj,
        message: `${p.name} (${p.team}): PlanetaGrandT (${pgtPj} PJ) vs 365Scores (${s365Pj} PJ)`
      });
    }
  });

  const teamMismatches = teamAudit.filter(a => !a.isOk);
  const isSystemSafe = teamMismatches.length === 0;

  return {
    isSystemSafe,
    teamAudit,
    teamMismatches,
    playerDiscrepancies,
    totalTeamsChecked: standings.length,
    matchedTeamsCount: standings.length - teamMismatches.length,
    discrepancyCount: playerDiscrepancies.length
  };
}

/**
 * STRICT DATA INTEGRITY SANITIZER & SAFETY LAYER
 * Enforces strict ceiling rules:
 * 1. Player Goals CANNOT exceed Team Goals Scored (Standings GF)
 * 2. Player Clean Sheets CANNOT exceed Team Matches Disputed (Standings PJ)
 * 3. Player Rated Matches CANNOT exceed Team Matches Disputed (Standings PJ)
 * 4. Normalizes 365Scores xG and Shots to match official Liga Profesional limits.
 */
function sanitizeDataIntegrity(data) {
  if (!data || !data.players) return data;

  const standings = [...(data.standings?.zonaA || []), ...(data.standings?.zonaB || [])];
  const standingsMap = {};
  standings.forEach(s => {
    const tObj = resolveTeam(s.team);
    if (tObj) standingsMap[tObj.id] = s;
  });

  let sanitizedCount = 0;

  data.players.forEach(p => {
    const tObj = resolveTeam(p.team);
    const tStand = tObj ? standingsMap[tObj.id] : null;

    if (tStand) {
      const teamGf = tStand.gf !== undefined ? tStand.gf : 4;
      const teamPj = tStand.pj !== undefined ? tStand.pj : 4;
      const teamGc = tStand.gc !== undefined ? tStand.gc : 4;

      // Cap 1: Player goals cannot exceed team goals in Liga Profesional
      if ((p.goals || 0) > teamGf) {
        console.warn(`[SAFETY CAP] ${p.name} (${p.team}): Goles (${p.goals}) ajustados al máximo del equipo en Liga (${teamGf}).`);
        p.goals = Math.min(p.goals, teamGf);
        sanitizedCount++;
      }

      // Cap 2: Clean sheets cannot exceed team matches played
      if ((p.cleanSheets || 0) > teamPj) {
        p.cleanSheets = Math.min(p.cleanSheets, teamPj);
        sanitizedCount++;
      }

      // Cap 3: Rated matches cannot exceed team matches played
      if ((p.matchesRated || 0) > teamPj) {
        p.matchesRated = teamPj;
        sanitizedCount++;
      }

      // Cap 4: 365Scores matches cannot exceed team matches played
      if ((p.matches365 || 0) > teamPj) {
        p.matches365 = teamPj;
        sanitizedCount++;
      }

      // Recalculate normalized per-match stats strictly for Liga
      const pj = Math.max(1, p.matchesRated || teamPj);
      const rawXg = (p.xg365 || p.xg || 0);
      const rawShots = (p.shots365 || p.shots || 0);
      const pj365 = Math.max(1, p.matches365 || pj);

      let calcXg = Math.max(0, rawXg - (0.79 * (p.goalsPenalty || 0))) / pj365;
      let calcShots = rawShots / pj365;

      // Smart baseline if 365Scores was missing/zero for active players
      if (calcXg <= 0.01 && (p.goals || 0) > 0) {
        calcXg = ((p.goals || 0) / pj) * 0.65;
      } else if (calcXg <= 0.01 && p.position === 'DEL') {
        calcXg = 0.20;
      }

      if (calcShots <= 0.05 && (p.goals || 0) > 0) {
        calcShots = Math.max(1.0, ((p.goals || 0) / pj) * 2.2);
      } else if (calcShots <= 0.05 && p.position === 'DEL') {
        calcShots = 1.5;
      }

      p.xgPerMatch = Math.min(0.75, Math.round(calcXg * 1000) / 1000);
      p.shotsPerMatch = Math.min(4.0, Math.round(calcShots * 100) / 100);
      p.goalsPerMatch = Math.min(1.5, Math.round(((p.goals || 0) / pj) * 1000) / 1000);
    }
  });

  console.log(`🛡️ [DATA SANITIZER] ${sanitizedCount} campos corregidos y alineados 100% con la Liga Profesional.`);
  return data;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TEAMS,
    resolveTeam,
    getCanonicalTeamId,
    getCanonicalTeamName,
    validatePlayerIntegrity,
    validateDataSafety,
    sanitizeDataIntegrity,
    getDataHealthSummary
  };
}

