/**
 * DATA SANITIZER & SAFETY GUARD FOR GRAN DT 2026
 * Enforces strict consistency rules between team statistics, official standings,
 * and individual player metrics (goals, clean sheets, matches played, xG, shots).
 */

export function sanitizeAndValidateData(data) {
  if (!data || !Array.isArray(data.players)) return data;

  const CURRENT_TOURNAMENT_MAX_ROUNDS = 4; // Currently played 4 rounds
  const report = {
    fixedGoals: 0,
    fixedMatches: 0,
    fixedCleanSheets: 0,
    fixedTeamNames: 0,
    warnings: []
  };

  // 1. Build Team Standings Lookup
  const standingsMap = {};
  if (data.standings) {
    (data.standings.zonaA || []).forEach(t => { standingsMap[t.team] = t; });
    (data.standings.zonaB || []).forEach(t => { standingsMap[t.team] = t; });
  }

  // Canonical Team Aliases Map
  const CANONICAL_ALIASES = {
    'Independiente Rivadavia': 'Independiente Rivadavia',
    'Ind. Rivadavia': 'Independiente Rivadavia',
    'Indep. R.': 'Independiente Rivadavia',
    'Independiente': 'Independiente',
    'Gimnasia LP': 'Gimnasia LP',
    'Gimnasia y Esgrima La Plata': 'Gimnasia LP',
    'Gimnasia M.': 'Gimnasia (M)',
    'Gimnasia de Mendoza': 'Gimnasia (M)',
    'Gimnasia (M)': 'Gimnasia (M)',
    'Estudiantes LP': 'Estudiantes LP',
    'Estudiantes de La Plata': 'Estudiantes LP',
    'Estudiantes (RC)': 'Estudiantes (RC)',
    'Estudiantes RC': 'Estudiantes (RC)',
    'Estudiantes de Rio Cuarto': 'Estudiantes (RC)',
    'Rosario Central': 'Rosario Central',
    'Rosario Ctral.': 'Rosario Central',
    'Rosario C.': 'Rosario Central',
    'Central Córdoba (SdE)': 'Central Córdoba (SdE)',
    'Central Córdoba': 'Central Córdoba (SdE)',
    'Central Cba. (SdE)': 'Central Córdoba (SdE)',
    'Central C.': 'Central Córdoba (SdE)',
    'Barracas Central': 'Barracas Central',
    'Barracas Ctral.': 'Barracas Central',
    'Barracas C.': 'Barracas Central',
    'Defensa y Justicia': 'Defensa y Justicia',
    'Def. y Justicia': 'Defensa y Justicia',
    'Def. y Jus.': 'Defensa y Justicia',
    'Atlético Tucumán': 'Atlético Tucumán',
    'Atl. Tucumán': 'Atlético Tucumán',
    'Atletico T.': 'Atlético Tucumán',
    'Deportivo Riestra': 'Deportivo Riestra',
    'Dep. Riestra': 'Deportivo Riestra',
    'Newell\'s Old Boys': 'Newell\'s',
    'Newell\'s OB': 'Newell\'s',
    'Newell\'s': 'Newell\'s',
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
    'San Lorenzo de Almagro': 'San Lorenzo',
    'San Lorenzo': 'San Lorenzo',
    'Club Atlético Tigre': 'Tigre',
    'Tigre': 'Tigre',
    'Talleres de Córdoba': 'Talleres',
    'Talleres C.': 'Talleres',
    'Talleres': 'Talleres',
    'CA Banfield': 'Banfield',
    'Banfield': 'Banfield',
    'CA Sarmiento': 'Sarmiento',
    'Sarmiento': 'Sarmiento',
    'Club Atletico Huracan': 'Huracán',
    'Huracán': 'Huracán',
    'CA Aldosivi': 'Aldosivi',
    'Aldosivi': 'Aldosivi',
    'Instituto Córdoba': 'Instituto',
    'Instituto': 'Instituto',
    'Vélez Sarsfield': 'Vélez',
    'Vélez S.': 'Vélez',
    'Vélez': 'Vélez',
    'Lanus': 'Lanús',
    'Lanús': 'Lanús',
    'Argentinos Juniors': 'Argentinos',
    'Argentinos': 'Argentinos',
    'Belgrano': 'Belgrano',
    'Platense': 'Platense'
  };

  function getCanonical(t) {
    if (!t) return '';
    return CANONICAL_ALIASES[t] || t;
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

    // B. Match Count Sanity Check (Max 4 for current tournament)
    if (p.matchesRated && p.matchesRated > CURRENT_TOURNAMENT_MAX_ROUNDS) {
      p.matchesRated = CURRENT_TOURNAMENT_MAX_ROUNDS;
      report.fixedMatches++;
    }
    if (p.pj && p.pj > CURRENT_TOURNAMENT_MAX_ROUNDS) {
      p.pj = CURRENT_TOURNAMENT_MAX_ROUNDS;
      report.fixedMatches++;
    }

    // C. Clean Sheets Sanity Check (Max 4 for current tournament)
    if (p.cleanSheets && p.cleanSheets > CURRENT_TOURNAMENT_MAX_ROUNDS) {
      p.cleanSheets = CURRENT_TOURNAMENT_MAX_ROUNDS;
      report.fixedCleanSheets++;
    }

    // D. Individual Goal Sanity Check (Cannot exceed team total GF)
    const teamSt = standingsMap[p.team];
    const teamGF = teamSt ? teamSt.gf : CURRENT_TOURNAMENT_MAX_ROUNDS * 3;
    
    if (p.goals > teamGF) {
      report.warnings.push(`Goles de ${p.name} (${p.goals}) superaban los goles de ${p.team} en tabla (${teamGF}). Clampeado.`);
      p.goals = teamGF;
      report.fixedGoals++;
    }

    teamGoalsSum[p.team] = (teamGoalsSum[p.team] || 0) + (p.goals || 0);
  });

  // 3. Team-Wide Goal Overload Check
  Object.keys(teamGoalsSum).forEach(t => {
    const sum = teamGoalsSum[t];
    const teamSt = standingsMap[t];
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

  console.log(`🛡️ [DATA SANITIZER] Validación completada. Correcciones: Goles=${report.fixedGoals}, PJ=${report.fixedMatches}, Vallas=${report.fixedCleanSheets}, Equipos=${report.fixedTeamNames}.`);
  if (report.warnings.length > 0) {
    console.log('⚠️ Alertas del Sanitizer:', report.warnings);
  }

  return data;
}

if (typeof window !== 'undefined') window.sanitizeAndValidateData = sanitizeAndValidateData;
if (typeof global !== 'undefined') global.sanitizeAndValidateData = sanitizeAndValidateData;
export default sanitizeAndValidateData;
