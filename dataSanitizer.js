/**
 * DATA SANITIZER & SAFETY GUARD FOR GRAN DT 2026
 * Enforces strict consistency rules between team statistics, official standings,
 * and individual player metrics (goals, clean sheets, matches played, xG, shots).
 * 
 * v2.0 — Dynamic tournament rounds, canonical standings lookup, improved xG estimation
 */
function sanitizeAndValidateData(data) {
  if (!data || !Array.isArray(data.players)) return data;

  // FIX 1: Dynamic tournament max rounds — calculated from standings data, NOT hardcoded
  let maxPjFromStandings = 1;
  if (data.standings) {
    (data.standings.zonaA || []).forEach(t => { if (t.pj > maxPjFromStandings) maxPjFromStandings = t.pj; });
    (data.standings.zonaB || []).forEach(t => { if (t.pj > maxPjFromStandings) maxPjFromStandings = t.pj; });
  }
  const CURRENT_TOURNAMENT_MAX_ROUNDS = Math.max(maxPjFromStandings, data.currentRound || 1);

  const report = {
    fixedGoals: 0,
    fixedMatches: 0,
    fixedCleanSheets: 0,
    fixedTeamNames: 0,
    dynamicMaxRounds: CURRENT_TOURNAMENT_MAX_ROUNDS,
    warnings: []
  };

  // Canonical Team Aliases Map
  const CANONICAL_ALIASES = {
    'Independiente Rivadavia': 'Independiente Rivadavia',
    'Ind. Rivadavia': 'Independiente Rivadavia',
    'Indep. R.': 'Independiente Rivadavia',
    'CS Independiente Rivadavia': 'Independiente Rivadavia',
    'Independiente': 'Independiente',
    'Gimnasia LP': 'Gimnasia LP',
    'Gimnasia y Esgrima La Plata': 'Gimnasia LP',
    'Gimnasia La Plata': 'Gimnasia LP',
    'Gimnasia (LP)': 'Gimnasia LP',
    'Gimnasia M.': 'Gimnasia (M)',
    'Gimnasia de Mendoza': 'Gimnasia (M)',
    'Gimnasia Mza': 'Gimnasia (M)',
    'Gimnasia (M)': 'Gimnasia (M)',
    'Gimnasia Mendoza': 'Gimnasia (M)',
    'Estudiantes LP': 'Estudiantes LP',
    'Estudiantes de La Plata': 'Estudiantes LP',
    'Estudiantes (RC)': 'Estudiantes (RC)',
    'Estudiantes RC': 'Estudiantes (RC)',
    'Estudiantes de Rio Cuarto': 'Estudiantes (RC)',
    'Estudiantes de Río Cuarto': 'Estudiantes (RC)',
    'Rosario Central': 'Rosario Central',
    'Rosario Ctral.': 'Rosario Central',
    'Rosario C.': 'Rosario Central',
    'Central Córdoba (SdE)': 'Central Córdoba (SdE)',
    'Central Córdoba': 'Central Córdoba (SdE)',
    'Central Cba. (SdE)': 'Central Córdoba (SdE)',
    'Ctral. Córdoba': 'Central Córdoba (SdE)',
    'Central C.': 'Central Córdoba (SdE)',
    'Central Cordoba': 'Central Córdoba (SdE)',
    'Central Córdoba (Santiago del Estero)': 'Central Córdoba (SdE)',
    'Barracas Central': 'Barracas Central',
    'Barracas Ctral.': 'Barracas Central',
    'Barracas C.': 'Barracas Central',
    'Defensa y Justicia': 'Defensa y Justicia',
    'Def. y Justicia': 'Defensa y Justicia',
    'Def. y Jus.': 'Defensa y Justicia',
    'Defensa Y Justicia': 'Defensa y Justicia',
    'Atlético Tucumán': 'Atlético Tucumán',
    'Atl. Tucumán': 'Atlético Tucumán',
    'Atletico T.': 'Atlético Tucumán',
    'Atletico Tucuman': 'Atlético Tucumán',
    'Atlético Tucuman': 'Atlético Tucumán',
    'Deportivo Riestra': 'Deportivo Riestra',
    'Dep. Riestra': 'Deportivo Riestra',
    "Newell's Old Boys": "Newell's",
    "Newell's OB": "Newell's",
    "Newell's": "Newell's",
    'Newells Old Boys': "Newell's",
    'Newells': "Newell's",
    'River Plate': 'River',
    'River Plate Buenos Aires': 'River',
    'River': 'River',
    'Racing Club': 'Racing',
    'Racing Club de Avellaneda': 'Racing',
    'Racing': 'Racing',
    'Boca Juniors': 'Boca',
    'Boca': 'Boca',
    'Unión de Santa Fe': 'Unión',
    'Union SF': 'Unión',
    'Unión': 'Unión',
    'Unión (Santa Fe)': 'Unión',
    'San Lorenzo de Almagro': 'San Lorenzo',
    'San Lorenzo': 'San Lorenzo',
    'Club Atlético Tigre': 'Tigre',
    'CA Tigre BA': 'Tigre',
    'Tigre': 'Tigre',
    'Talleres de Córdoba': 'Talleres',
    'Talleres (Córdoba)': 'Talleres',
    'Talleres C.': 'Talleres',
    'Talleres': 'Talleres',
    'CA Banfield': 'Banfield',
    'Banfield': 'Banfield',
    'CA Sarmiento': 'Sarmiento',
    'Sarmiento de Junín': 'Sarmiento',
    'Sarmiento (Junín)': 'Sarmiento',
    'Sarmiento': 'Sarmiento',
    'Club Atletico Huracan': 'Huracán',
    'Atlético Huracán': 'Huracán',
    'Huracán': 'Huracán',
    'CA Aldosivi': 'Aldosivi',
    'Aldosivi Mar del Plata': 'Aldosivi',
    'Aldosivi': 'Aldosivi',
    'Instituto Córdoba': 'Instituto',
    'Instituto de Córdoba': 'Instituto',
    'Instituto de Cordoba': 'Instituto',
    'Instituto (Córdoba)': 'Instituto',
    'Instituto': 'Instituto',
    'Vélez Sarsfield': 'Vélez',
    'Velez Sarsfield': 'Vélez',
    'Velez Sarsfield BA': 'Vélez',
    'Vélez S.': 'Vélez',
    'Vélez': 'Vélez',
    'Lanus': 'Lanús',
    'Lanús': 'Lanús',
    'Argentinos Juniors': 'Argentinos',
    'Argentinos': 'Argentinos',
    'Belgrano': 'Belgrano',
    'Belgrano de Córdoba': 'Belgrano',
    'Belgrano de Cordoba': 'Belgrano',
    'Belgrano (Córdoba)': 'Belgrano',
    'Platense': 'Platense',
    'San Martín (SJ)': 'San Martín (SJ)',
    'San Martín (T)': 'San Martín (T)',
  };

  function getCanonical(t) {
    if (!t) return '';
    return CANONICAL_ALIASES[t] || t;
  }

  // FIX 2: Build Team Standings Lookup — index by BOTH raw name AND canonical name
  const standingsMap = {};
  if (data.standings) {
    const indexTeam = (t) => {
      standingsMap[t.team] = t;
      const canon = getCanonical(t.team);
      if (canon !== t.team) standingsMap[canon] = t;
      // Also store lowercase for fuzzy matching
      const lower = t.team.toLowerCase().trim();
      if (!standingsMap[lower]) standingsMap[lower] = t;
    };
    (data.standings.zonaA || []).forEach(indexTeam);
    (data.standings.zonaB || []).forEach(indexTeam);
  }

  // Helper to find team in standings with fallback
  function findTeamInStandings(teamName) {
    return standingsMap[teamName] || standingsMap[getCanonical(teamName)] || standingsMap[(teamName || '').toLowerCase().trim()] || null;
  }

  // 2. Track Team Sums for Clamping
  const teamGoalsSum = {};

  data.players.forEach(p => {
    // A. Team Canonical Sanitization
    const canonTeam = getCanonical(p.team);
    if (p.team !== canonTeam && CANONICAL_ALIASES[p.team]) {
      p.team = canonTeam;
      report.fixedTeamNames++;
    }

    // B. Match Count Sanity Check (dynamic based on actual tournament progress)
    if (p.matchesRated && p.matchesRated > CURRENT_TOURNAMENT_MAX_ROUNDS) {
      p.matchesRated = CURRENT_TOURNAMENT_MAX_ROUNDS;
      report.fixedMatches++;
    }
    if (p.pj && p.pj > CURRENT_TOURNAMENT_MAX_ROUNDS) {
      p.pj = CURRENT_TOURNAMENT_MAX_ROUNDS;
      report.fixedMatches++;
    }

    // C. Clean Sheets Sanity Check
    if (p.cleanSheets && p.cleanSheets > CURRENT_TOURNAMENT_MAX_ROUNDS) {
      p.cleanSheets = CURRENT_TOURNAMENT_MAX_ROUNDS;
      report.fixedCleanSheets++;
    }

    // D. Goalkeeper Goals Conceded Sanity & Fallback from Standings
    // FIX 2 APPLIED: Use findTeamInStandings instead of direct lookup
    const teamSt = findTeamInStandings(p.team);
    const teamGF = teamSt ? teamSt.gf : CURRENT_TOURNAMENT_MAX_ROUNDS * 3;
    const teamGC = teamSt ? teamSt.gc : 0;
    const pjPlayer = Math.max(1, p.matchesRated || p.pj || 1);
    const pjTeam = teamSt ? (teamSt.pj || CURRENT_TOURNAMENT_MAX_ROUNDS) : CURRENT_TOURNAMENT_MAX_ROUNDS;

    if (p.position === 'ARQ') {
      const isMissingOrZeroWithTeamGC = (p.goalsConceded === undefined || (p.goalsConceded === 0 && teamGC > 0 && (p.cleanSheets || 0) < pjPlayer));
      if (isMissingOrZeroWithTeamGC) {
        p.goalsConceded = Math.round((teamGC * pjPlayer) / Math.max(1, pjTeam));
        p.gc = p.goalsConceded;
      } else {
        p.goalsConceded = p.goalsConceded !== undefined ? p.goalsConceded : p.gc;
        p.gc = p.goalsConceded;
      }
    }

    // E. Individual Goal Sanity Check (Cannot exceed team total GF)
    if (p.goals > teamGF) {
      report.warnings.push(`Goles de ${p.name} (${p.goals}) superaban los goles de ${p.team} en tabla (${teamGF}). Clampeado.`);
      p.goals = teamGF;
      report.fixedGoals++;
    }

    // FIX 4: Clarín Average Rating — Expanded range [4.5, 7.0]
    // Clarín journalistic rating scale is 1-10, typically 4.0-7.5.
    // If avgRating > 7.5, it contains Gran DT bonuses (goals, figuras) and needs cleaning.
    if (p.avgRating && p.avgRating > 7.5) {
      // Strip out goal bonuses and figura bonuses to recover pure journalistic rating
      const goalBonusPerMatch = (p.position === 'VOL') ? 1.5 : (p.position === 'DEL') ? 1.2 : 1.0;
      const estimatedClean = Math.min(7.00, Math.max(4.50,
        p.avgRating - ((p.goals || 0) * goalBonusPerMatch / pjPlayer) - ((p.figuras || 0) * 1.0 / pjPlayer)
      ));
      p.avgRating = Number(estimatedClean.toFixed(2));
    }

    // FIX 3: xG/Shots — Use real 365Scores data when available, smart estimation only if missing
    const has365Data = p.matches365 !== undefined && p.matches365 !== null && p.matches365 > 0;
    const hasRealSofaData = p._sofascoreEnriched === true || has365Data;

    if (!hasRealSofaData && (p.xg365 === undefined || p.xg365 === null)) {
      // Estimate xG and shots based on actual goals scored and position
      // Uses calibrated ratios from Primera División averages:
      // - Average xG conversion rate: ~12-15% (1 goal per 7-8 xG roughly)
      // - Shots per xG: ~4-5 shots per 1 xG
      const goals = p.goals || 0;
      const penGoals = p.goalsPenalty || 0;
      const isPenTaker = penGoals > 0;
      const goalsPerMatch = goals / pjPlayer;

      let baseXgPerMatch = 0;
      let baseShotsPerMatch = 0;

      if (p.position === 'DEL') {
        // Delanteros: xG ≈ goalsPerMatch * 1.1 (strikers slightly underperform xG)
        // Shots ≈ xG * 4.5
        baseXgPerMatch = Math.max(0.10, goalsPerMatch * 1.10);
        baseShotsPerMatch = Math.max(0.80, baseXgPerMatch * 4.5);
        // Floor for active forwards with no goals yet
        if (goals === 0 && pjPlayer >= 3) {
          baseXgPerMatch = 0.12;
          baseShotsPerMatch = 0.90;
        }
      } else if (p.position === 'VOL') {
        // Volantes: More varied — some are pure creators, some are goal threats
        baseXgPerMatch = Math.max(0.05, goalsPerMatch * 1.20);
        baseShotsPerMatch = Math.max(0.50, baseXgPerMatch * 4.0);
        if (goals === 0 && pjPlayer >= 3) {
          baseXgPerMatch = 0.06;
          baseShotsPerMatch = 0.55;
        }
      } else if (p.position === 'DEF') {
        // Defensores: Low volume but important for set pieces
        baseXgPerMatch = Math.max(0.02, goalsPerMatch * 1.30);
        baseShotsPerMatch = Math.max(0.20, baseXgPerMatch * 3.5);
        if (goals === 0) {
          baseXgPerMatch = 0.02;
          baseShotsPerMatch = 0.20;
        }
      } else {
        // ARQ: Essentially zero
        baseXgPerMatch = 0;
        baseShotsPerMatch = 0;
      }

      // Penalty taker bonus
      if (isPenTaker) {
        const penXgPerMatch = (penGoals * 0.79) / pjPlayer;
        baseXgPerMatch += penXgPerMatch;
      }

      // Upper bounds to prevent outliers
      baseXgPerMatch = Math.min(0.80, baseXgPerMatch);
      baseShotsPerMatch = Math.min(4.50, baseShotsPerMatch);

      p.xgPerMatch = Number(baseXgPerMatch.toFixed(3));
      p.shotsPerMatch = Number(baseShotsPerMatch.toFixed(2));
      p.xg365 = Number((baseXgPerMatch * pjPlayer).toFixed(2));
      p.shots365 = Math.round(baseShotsPerMatch * pjPlayer);
      p.matches365 = pjPlayer;
      p._xgEstimated = true; // Flag so the algorithm knows this is estimated, not real
    }

    teamGoalsSum[p.team] = (teamGoalsSum[p.team] || 0) + (p.goals || 0);
  });

  // 3. Team-Wide Goal Overload Check
  Object.keys(teamGoalsSum).forEach(t => {
    const sum = teamGoalsSum[t];
    const teamSt = findTeamInStandings(t);
    if (teamSt && sum > teamSt.gf) {
      report.warnings.push(`ALERTA: Suma de goles de ${t} (${sum}) supera GF (${teamSt.gf}) en tabla oficial.`);
    }
  });

  // 4. Team xG Calibration against xGScore.io
  if (data.teamXg) {
    Object.keys(data.teamXg).forEach(t => {
      const s = data.teamXg[t];
      if (s.xgPerMatch > 3.0) s.xgPerMatch = 3.0; // Extreme outlier guard
      if (s.xgConcededPerMatch > 3.0) s.xgConcededPerMatch = 3.0;
    });
  }

  console.log(`🛡️ [DATA SANITIZER v2.0] Validación completada (Max Rondas: ${CURRENT_TOURNAMENT_MAX_ROUNDS}). Correcciones: Goles=${report.fixedGoals}, PJ=${report.fixedMatches}, Vallas=${report.fixedCleanSheets}, Equipos=${report.fixedTeamNames}.`);
  if (report.warnings.length > 0) {
    console.log('⚠️ Alertas del Sanitizer:', report.warnings);
  }

  return data;
}

if (typeof window !== 'undefined') window.sanitizeAndValidateData = sanitizeAndValidateData;
if (typeof global !== 'undefined') global.sanitizeAndValidateData = sanitizeAndValidateData;
if (typeof module !== 'undefined' && module.exports) module.exports = { sanitizeAndValidateData };
