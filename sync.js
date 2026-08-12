import fs from 'fs';
import path from 'path';
import axios from 'axios';

// ═══════════════════════════════════════════════════════
// CONFIGURACIÓN - Actualizar cada torneo
// ═══════════════════════════════════════════════════════
const PLANETA_GRANDT_SHEET_ID = '2PACX-1vT2BKHkgC0kJbGSHNlC3jv37qow42OcSSw89CLKvDFsWIBocEMrVwRhcwHCXg084QTzRDTphLwpjkss';
const PLANETA_GRANDT_TORNEO_PASADO_SHEET_ID = '2PACX-1vTP7ix6p9f6B5hXlV7nmJ8OKMXNMl5c9RIWO_0rF8dez84XskFpv3lRZS1TGQbsTdW_GUtfbLsMaUTy';

// GIDs de cada pestaña de la planilla de Planeta Gran DT
const SHEET_GIDS = {
  general: 21,         // Acumulada General - TODOS los jugadores con todas las stats
  puntosEquipo: 0,     // Puntos Por Equipo
  arqueros: 20,
  defensores: 19,
  volantes: 18,
  delanteros: 17,
  posiciones: 2146215009,
  goleadores: 1604517413,
  figuras: 3,
  vallasInvictas: 2,
  amarillas: 1074006563,
  rojas: 1142819332,
  penalesErrados: 807498580,
  penalesAtajados: 102129549,
};

const SOFASCORE_TOURNAMENT_ID = 153; // Liga Profesional Argentina

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Referer': 'https://www.sofascore.com/',
  'Origin': 'https://www.sofascore.com'
};

const TEAM_NAME_MAPPING = {
  'Boca Juniors': 'Boca Juniors', 'River Plate': 'River', 'River': 'River',
  'Racing Club': 'Racing', 'Racing': 'Racing',
  'Independiente': 'Independiente', 'San Lorenzo': 'San Lorenzo',
  'Estudiantes': 'Estudiantes LP', 'Estudiantes de La Plata': 'Estudiantes LP', 'Estudiantes LP': 'Estudiantes LP',
  'Gimnasia (LP)': 'Gimnasia LP', 'Gimnasia y Esgrima': 'Gimnasia LP', 'Gimnasia LP': 'Gimnasia LP', 'Gimnasia': 'Gimnasia LP', 'Gimnasia La Plata': 'Gimnasia LP',
  'Vélez Sarsfield': 'Vélez', 'Vélez': 'Vélez', 'Velez Sarsfield BA': 'Vélez', 'Velez Sarsfield': 'Vélez',
  'Huracán': 'Huracán', 'Atlético Huracán': 'Huracán', 'Atletico Huracan': 'Huracán',
  'Lanús': 'Lanús', 'Lanus': 'Lanús',
  'Banfield': 'Banfield',
  'Talleres (Córdoba)': 'Talleres', 'Talleres': 'Talleres',
  'Aldosivi Mar del Plata': 'Aldosivi', 'Aldosivi': 'Aldosivi',
  'Instituto de Córdoba': 'Instituto', 'Instituto de Cordoba': 'Instituto', 'Instituto (Córdoba)': 'Instituto', 'Instituto': 'Instituto',
  'Atlético Tucuman': 'Atl. Tucumán', 'Atletico Tucuman': 'Atl. Tucumán', 'Atlético Tucumán': 'Atl. Tucumán', 'Atl. Tucumán': 'Atl. Tucumán',
  'Newells Old Boys': "Newell's", "Newell's Old Boys": "Newell's", "Newell's": "Newell's", 'Newells': "Newell's",
  'Union Santa Fe': 'Unión', 'Unión': 'Unión', 'Unión (Santa Fe)': 'Unión', 'Unión de Santa Fe': 'Unión',
  'Belgrano de Cordoba': 'Belgrano', 'Belgrano de Córdoba': 'Belgrano', 'Belgrano (Córdoba)': 'Belgrano', 'Belgrano': 'Belgrano',
  'CA Tigre BA': 'Tigre', 'Tigre': 'Tigre',
  'Sarmiento de Junin': 'Sarmiento', 'Sarmiento de Junín': 'Sarmiento', 'Sarmiento (Junín)': 'Sarmiento', 'Sarmiento': 'Sarmiento',
  'Defensa y Justicia': 'Def. y Justicia', 'Def. y Justicia': 'Def. y Justicia',
  'Deportivo Riestra': 'Dep. Riestra', 'Dep. Riestra': 'Dep. Riestra',
  'Barracas Central': 'Barracas Ctral.', 'Barracas Ctral.': 'Barracas Ctral.',
  'Rosario Central': 'Rosario Ctral.', 'Rosario Ctral.': 'Rosario Ctral.',
  'Argentinos Juniors': 'Argentinos', 'Argentinos': 'Argentinos',
  'Central Córdoba (SdE)': 'Central Cba. (SdE)', 'Central Córdoba': 'Central Cba. (SdE)', 'Central Cordoba': 'Central Cba. (SdE)',
  'Central Córdoba (Santiago del Estero)': 'Central Cba. (SdE)',
  'San Martín (SJ)': 'San Martín (SJ)',
  'Ind. Rivadavia': 'Ind. Rivadavia', 'Independiente Rivadavia': 'Ind. Rivadavia',
  'Gimnasia (M)': 'Gimnasia (M)', 'Gimnasia Mendoza': 'Gimnasia (M)', 'Gimnasia (Mendoza)': 'Gimnasia (M)',
  'Estudiantes de Río Cuarto': 'Estudiantes (RC)', 'Estudiantes de Rio Cuarto': 'Estudiantes (RC)', 'Estudiantes (RC)': 'Estudiantes (RC)',
  'San Martín (T)': 'San Martín (T)',
};

function normalizeTeamName(name) {
  if (!name) return '';
  return TEAM_NAME_MAPPING[name.trim()] || name.trim();
}

// ═══════════════════════════════════════════════════════
// PARSER DE CSV ROBUSTO (maneja campos entre comillas)
// ═══════════════════════════════════════════════════════
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

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  return lines.filter(l => l.length > 0).map(parseCSVLine);
}

function parseArgNum(val) {
  if (!val || val === '' || val === 's/c') return null;
  let cleaned = val.replace(/\$/g, '').trim();
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    cleaned = cleaned.replace(',', '.');
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    cleaned = cleaned.replace(/\./g, '');
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ═══════════════════════════════════════════════════════
// TORNEO PASADO (Para Suavizado Bayesiano)
// ═══════════════════════════════════════════════════════
async function fetchTorneoPasadoData() {
  console.log('🔄 Descargando datos del Torneo Pasado (Google Sheets)...');
  const url = `https://docs.google.com/spreadsheets/d/e/${PLANETA_GRANDT_TORNEO_PASADO_SHEET_ID}/pub?output=csv&gid=21`;
  try {
    const res = await axios.get(url, { responseType: 'text', timeout: 15000 });
    const rows = parseCSV(res.data);
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      if (rows[i][0] && rows[i][0].toLowerCase().includes('jugador')) {
        headerIdx = i; break;
      }
    }
    if (headerIdx === -1) return [];
    const headers = rows[headerIdx];
    const colIdx = {}; headers.forEach((h, i) => { colIdx[h.trim()] = i; });
    const players = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[colIdx['Jugador']] || '';
      if (!name || name.length < 2) continue;
      players.push({
        name: name,
        position: row[colIdx['POS']] || '',
        team: normalizeTeamName(row[colIdx['Equipo']] || ''),
        matches: parseArgNum(row[colIdx['CT']]) || 0,
        avgRating: parseArgNum(row[colIdx['PrT']]) || 0,
        goals: parseArgNum(row[colIdx['GT']]) || 0,
        figuras: parseArgNum(row[colIdx['VF']]) || 0,
        cleanSheets: parseArgNum(row[colIdx['VI']]) || 0
      });
    }
    console.log(`✅ Torneo Pasado: ${players.length} jugadores cargados para suavizado Bayesiano.`);
    return players;
  } catch (err) {
    console.warn('⚠️ No se pudieron descargar datos del Torneo Pasado:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// 1. PLANETA GRAN DT (Fuente Principal)
// ═══════════════════════════════════════════════════════
function buildSheetURL(gid) {
  return `https://docs.google.com/spreadsheets/d/e/${PLANETA_GRANDT_SHEET_ID}/pub?output=csv&gid=${gid}`;
}

async function fetchPlanetaGranDT() {
  console.log('🔄 Descargando datos de Planeta Gran DT (Google Sheets)...');
  const url = buildSheetURL(SHEET_GIDS.general);
  
  try {
    const res = await axios.get(url, { responseType: 'text', timeout: 15000 });
    const rows = parseCSV(res.data);
    
    // Encontrar la fila de encabezado (la que comienza con "Jugador")
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      if (rows[i][0] && rows[i][0].toLowerCase().includes('jugador')) {
        headerIdx = i;
        break;
      }
    }
    
    if (headerIdx === -1) {
      throw new Error('No se encontró la fila de encabezado "Jugador" en la planilla.');
    }
    
    const headers = rows[headerIdx];
    console.log(`   📋 Encabezado encontrado en fila ${headerIdx + 1}: ${headers.slice(0, 8).join(', ')}...`);
    
    // Mapear índices de columnas
    const colIdx = {};
    headers.forEach((h, i) => { colIdx[h.trim()] = i; });
    
    const players = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[colIdx['Jugador']] || '';
      if (!name || name.length < 2) continue;
      
      const pos = row[colIdx['POS']] || '';
      if (!['ARQ', 'DEF', 'VOL', 'DEL'].includes(pos)) continue;
      
      // Extraer puntajes por fecha (F1, F2, ... F16+)
      const scores = [];
      for (let f = 1; f <= 30; f++) {
        const key = `F${f}`;
        if (colIdx[key] !== undefined) {
          const val = parseArgNum(row[colIdx[key]]);
          scores.push(val); // null si no jugó o s/c
        }
      }
      
      players.push({
        id: `pg_${i}`,
        name: name,
        position: pos,
        team: normalizeTeamName(row[colIdx['Equipo']]),
        price: parseArgNum(row[colIdx['Cotización']]),
        scores: scores,
        matchesRated: parseArgNum(row[colIdx['CT']]) || 0,
        totalPoints: parseArgNum(row[colIdx['AcT']]) || 0,
        avgRating: parseArgNum(row[colIdx['PrT']]) || 0,
        goals: parseArgNum(row[colIdx['GT']]) || 0,
        goalsOpenPlay: parseArgNum(row[colIdx['GJ']]) || 0,
        goalsHeader: parseArgNum(row[colIdx['GC']]) || 0,
        goalsFreeKick: parseArgNum(row[colIdx['TL']]) || 0,
        goalsPenalty: parseArgNum(row[colIdx['GP']]) || 0,
        goalsAway: parseArgNum(row[colIdx['GV']]) || 0,
        goalsGolden: parseArgNum(row[colIdx['GO']]) || 0,
        goalsReceived: parseArgNum(row[colIdx['GR']]) || 0,
        ownGoals: parseArgNum(row[colIdx['GE']]) || 0,
        figuras: parseArgNum(row[colIdx['VF']]) || 0,
        cleanSheets: parseArgNum(row[colIdx['VI']]) || 0,
        yellowCards: parseArgNum(row[colIdx['TA']]) || 0,
        redCards: parseArgNum(row[colIdx['TR']]) || 0,
        penaltiesMissed: parseArgNum(row[colIdx['PE']]) || 0,
        penaltiesSaved: parseArgNum(row[colIdx['PA']]) || 0,
        // Campos opcionales de SofaScore (se llenan después si están disponibles)
        xg: null,
        shots: null,
        shotsOnTarget: null,
        minutes: 0, // Se calculará desde los partidos calificados
      });
    }
    
    // Estimar minutos jugados desde partidos calificados (CT * 90 aprox)
    players.forEach(p => {
      p.minutes = p.matchesRated * 90;
    });
    
    console.log(`✅ Planeta Gran DT: ${players.length} jugadores procesados exitosamente.`);
    return players;
  } catch (err) {
    console.error(`❌ Error al descargar Planeta Gran DT: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// 2. ESPN API (Fixture y Standings)
// ═══════════════════════════════════════════════════════
async function fetchESPNData() {
  console.log('🔄 Descargando fixture completo y tablas desde ESPN...');
  const standingsUrl = 'https://site.api.espn.com/apis/v2/sports/soccer/arg.1/standings';
  
  let standings = { zonaA: [], zonaB: [] };
  let fixture = [];
  let currentRound = 1;

  // 1. Descargar tablas de posiciones (separadas por zona)
  try {
    const stdRes = await axios.get(standingsUrl, { timeout: 10000 });
    const children = stdRes.data?.children || [];
    
    const parseEntries = (entries) => {
      return entries.map((entry, idx) => {
        const team = entry.team;
        const stats = entry.stats || [];
        const findStat = (name) => stats.find(s => s.name === name)?.value || 0;
        return {
          rank: idx + 1,
          team: normalizeTeamName(team.displayName),
          logo: team.logos?.[0]?.href || '',
          pj: findStat('gamesPlayed'),
          pg: findStat('wins'),
          pe: findStat('ties'),
          pp: findStat('losses'),
          gf: findStat('pointsFor'),
          gc: findStat('pointsAgainst'),
          df: findStat('pointDifferential'),
          pts: findStat('points'),
          // Inicializar Home/Away (los calculamos abajo)
          home: { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 },
          away: { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 },
          forma: []
        };
      });
    };

    if (children[0]) {
      standings.zonaA = parseEntries(children[0].standings?.entries || []);
      console.log(`✅ Zona A de ESPN cargada: ${standings.zonaA.length} equipos.`);
    }
    if (children[1]) {
      standings.zonaB = parseEntries(children[1].standings?.entries || []);
      console.log(`✅ Zona B de ESPN cargada: ${standings.zonaB.length} equipos.`);
    }
  } catch (err) {
    console.error('⚠️ Error al descargar tablas de posiciones de ESPN:', err.message);
  }

  // 2. Descargar fixture completo del torneo (Julio a Diciembre 2026)
  try {
    const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?dates=20260701-20261231&limit=1000`;
    const scRes = await axios.get(scoreboardUrl, { timeout: 15000 });
    
    if (scRes.data?.events) {
      const events = scRes.data.events;
      
      // Ordenar por fecha cronológica
      events.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      fixture = events.map(event => {
        const comp = event.competitions[0];
        const homeTeam = comp.competitors.find(c => c.homeAway === 'home');
        const awayTeam = comp.competitors.find(c => c.homeAway === 'away');
        const statusType = event.status?.type;
        
        return {
          id: event.id,
          date: event.date,
          status: statusType?.name || '',
          state: statusType?.state || 'pre', // 'pre', 'in', 'post'
          statusText: statusType?.shortDetail || '',
          round: 1, // Se asigna abajo
          home: normalizeTeamName(homeTeam.team.displayName),
          homeLogo: homeTeam.team.logo || '',
          away: normalizeTeamName(awayTeam.team.displayName),
          awayLogo: awayTeam.team.logo || '',
          homeScore: homeTeam.score !== undefined && homeTeam.score !== '' ? parseInt(homeTeam.score) : null,
          awayScore: awayTeam.score !== undefined && awayTeam.score !== '' ? parseInt(awayTeam.score) : null
        };
      });

      // Asignar ronda dinámica garantizando 30 equipos ÚNICOS (15 partidos) por fecha
      fixture.sort((a, b) => new Date(a.date) - new Date(b.date));

      const roundsMap = {};
      for (let r = 1; r <= 16; r++) roundsMap[r] = [];

      fixture.forEach(m => {
        const hName = m.home;
        const aName = m.away;
        const pairStr = `${hName} vs ${aName}`;

        // Tratar partidos reprogramados de la Fecha 2 jugados en días posteriores
        if ((pairStr.includes('Boca') && pairStr.includes('Estudiantes')) ||
            (pairStr.includes('Tigre') && pairStr.includes('Belgrano')) ||
            (pairStr.includes('Unión') && pairStr.includes('Lanús'))) {
          if (new Date(m.date) > new Date('2026-08-04T00:00:00Z')) {
            m.round = 2;
            roundsMap[2].push(m);
            return;
          }
        }

        // Buscar la primera fecha donde NINGUNO de los dos equipos haya jugado aún
        let targetRound = 1;
        while (targetRound <= 16) {
          const existingTeams = new Set();
          roundsMap[targetRound].forEach(item => {
            existingTeams.add(item.home);
            existingTeams.add(item.away);
          });

          if (!existingTeams.has(hName) && !existingTeams.has(aName) && roundsMap[targetRound].length < 15) {
            m.round = targetRound;
            roundsMap[targetRound].push(m);
            break;
          }
          targetRound++;
        }
      });

      // Detectar ronda actual (primer partido no finalizado)
      const firstScheduled = fixture.find(m => m.state === 'pre' || m.state === 'in');
      if (firstScheduled) {
        currentRound = firstScheduled.round;
      } else if (fixture.length > 0) {
        currentRound = fixture[fixture.length - 1].round;
      }

      console.log(`✅ Fixture completo: ${fixture.length} partidos cargados (Ronda actual detectada: Fecha ${currentRound}).`);

      // 3. Calcular Home/Away stats y forma cronológicamente para cada equipo
      const allTeams = [...standings.zonaA, ...standings.zonaB];
      
      fixture.forEach(match => {
        // Solo acumular partidos finalizados
        if (match.state !== 'post') return;
        if (match.homeScore === null || match.awayScore === null) return;

        const homeTeam = allTeams.find(t => t.team === match.home);
        const awayTeam = allTeams.find(t => t.team === match.away);

        if (homeTeam) {
          homeTeam.home.pj += 1;
          homeTeam.home.gf += match.homeScore;
          homeTeam.home.gc += match.awayScore;
          if (match.homeScore > match.awayScore) {
            homeTeam.home.pg += 1;
            homeTeam.home.pts += 3;
            homeTeam.forma.push('W');
          } else if (match.homeScore === match.awayScore) {
            homeTeam.home.pe += 1;
            homeTeam.home.pts += 1;
            homeTeam.forma.push('D');
          } else {
            homeTeam.home.pp += 1;
            homeTeam.forma.push('L');
          }
        }

        if (awayTeam) {
          awayTeam.away.pj += 1;
          awayTeam.away.gf += match.awayScore;
          awayTeam.away.gc += match.homeScore;
          if (match.awayScore > match.homeScore) {
            awayTeam.away.pg += 1;
            awayTeam.away.pts += 3;
            awayTeam.forma.push('W');
          } else if (match.homeScore === match.awayScore) {
            awayTeam.away.pe += 1;
            awayTeam.away.pts += 1;
            awayTeam.forma.push('D');
          } else {
            awayTeam.away.pp += 1;
            awayTeam.forma.push('L');
          }
        }
      });

      // Recortar forma a los últimos 5 partidos de cada equipo
      allTeams.forEach(t => {
        t.forma = t.forma.slice(-5);
      });
      console.log('✅ Estadísticas Home/Away y Forma calculadas con éxito.');
    }
  } catch (err) {
    console.error('⚠️ Error al procesar fixture de ESPN:', err.message);
  }

  return { standings, fixture, currentRound };
}

// ═══════════════════════════════════════════════════════
// 3. SOFASCORE (Intento de Enriquecimiento - xG y Tiros)
// ═══════════════════════════════════════════════════════
async function tryEnrichWithSofaScore(players) {
  try {
    console.log('🔄 Intentando enriquecer con datos de SofaScore (xG, tiros)...');
    const seasonsUrl = `https://api.sofascore.com/api/v1/unique-tournament/${SOFASCORE_TOURNAMENT_ID}/seasons`;
    const seasonsRes = await axios.get(seasonsUrl, { headers: BROWSER_HEADERS, timeout: 8000 });
    
    if (!seasonsRes.data?.seasons?.length) return;
    const seasonId = seasonsRes.data.seasons[0].id;
    
    // Descargar estadísticas con paginación
    let allStats = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const statsUrl = `https://api.sofascore.com/api/v1/unique-tournament/${SOFASCORE_TOURNAMENT_ID}/season/${seasonId}/statistics?limit=100&offset=${offset}&order=-rating&accumulation=total&group=summary`;
      const statsRes = await axios.get(statsUrl, { headers: BROWSER_HEADERS, timeout: 10000 });
      if (statsRes.data?.results) {
        allStats = allStats.concat(statsRes.data.results);
        if (statsRes.data.results.length < 100) break; // última página
      } else break;
    }
    
    if (allStats.length === 0) return;
    console.log(`   📊 SofaScore descargó ${allStats.length} registros. Cruzando datos...`);
    
    // Crear mapa de SofaScore por nombre normalizado
    const sofaMap = {};
    allStats.forEach(item => {
      const name = item.player?.name?.toLowerCase().trim();
      if (name) {
        sofaMap[name] = {
          xg: item.statistics?.expectedGoals || 0,
          shots: item.statistics?.totalShots || 0,
          shotsOnTarget: item.statistics?.shotsOnTarget || 0,
          minutes: item.statistics?.minutesPlayed || 0,
          rating: item.statistics?.rating || 0,
        };
      }
    });
    
    // Cruzar con jugadores de Planeta Gran DT
    let matched = 0;
    players.forEach(p => {
      // Intentar match por nombre (formato PG: "Apellido, Nombre" vs SofaScore: "Nombre Apellido")
      const pgName = p.name.toLowerCase().trim();
      
      // Intentar match directo
      if (sofaMap[pgName]) {
        Object.assign(p, { xg: sofaMap[pgName].xg, shots: sofaMap[pgName].shots, shotsOnTarget: sofaMap[pgName].shotsOnTarget });
        if (sofaMap[pgName].minutes > 0) p.minutes = sofaMap[pgName].minutes;
        matched++;
        return;
      }
      
      // Intentar invertir "Apellido, Nombre" -> "nombre apellido"
      if (pgName.includes(',')) {
        const parts = pgName.split(',').map(s => s.trim());
        const reversed = `${parts[1]} ${parts[0]}`;
        if (sofaMap[reversed]) {
          Object.assign(p, { xg: sofaMap[reversed].xg, shots: sofaMap[reversed].shots, shotsOnTarget: sofaMap[reversed].shotsOnTarget });
          if (sofaMap[reversed].minutes > 0) p.minutes = sofaMap[reversed].minutes;
          matched++;
        }
      }
    });
    
  } catch (err) {
    console.warn(`⚠️ SofaScore no disponible (${err.message}). El sistema funciona igual sin xG.`);
    console.warn('   💡 Podés cargar datos de SofaScore manualmente desde la web app (pestaña "Cargar Sofa").');
  }
}

// ═══════════════════════════════════════════════════════
// 3.5. XGSCORE.IO (xG, xGC, xPTS por Equipo del Clausura 2026)
// ═══════════════════════════════════════════════════════
async function fetchXgScore() {
  try {
    console.log('🔄 Descargando métricas de xG y xGC de equipos (xGScore.io)...');
    const url = 'https://xgscore.io/xg-statistics/argentina-primera';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const match = res.data.match(/<script id="serverApp-state" type="application\/json">([^<]+)<\/script>/);
    if (!match) return {};

    const data = JSON.parse(match[1]);
    const teamStatsKey = Object.keys(data).find(k => k.includes('team-stats'));
    if (!teamStatsKey || !Array.isArray(data[teamStatsKey].body)) return {};

    const teamXgMap = {};
    data[teamStatsKey].body.forEach(item => {
      const rawName = item.team?.name || '';
      const normName = normalizeTeamName(rawName);
      teamXgMap[normName] = {
        games: item.games,
        goalsScored: item.goalsScored,
        goalsConceded: item.goalsConceded,
        xgScored: item.xgScored,
        xgConceded: item.xgConceded,
        xgPerGame: item.games > 0 ? parseFloat((item.xgScored / item.games).toFixed(2)) : 0,
        xgConcededPerGame: item.games > 0 ? parseFloat((item.xgConceded / item.games).toFixed(2)) : 0,
        xgSetPlay: item.xgSetPlay,
        xPoints: item.xPoints,
      };
    });

    console.log(`✅ xGScore.io: ${Object.keys(teamXgMap).length} equipos cargados con xG/xGC del Torneo Clausura 2026.`);
    return teamXgMap;
  } catch (err) {
    console.warn('⚠️ No se pudieron descargar métricas de xGScore.io:', err.message);
    return {};
  }
}

// ═══════════════════════════════════════════════════════
// 4. CUOTAS DE APUESTAS (The Odds API)
// ═══════════════════════════════════════════════════════
const DEFAULT_ODDS_API_KEY = '8a6d8b4cf6a4ce19d1163793902d564b';

async function fetchOdds(apiKey) {
  const key = apiKey || DEFAULT_ODDS_API_KEY;
  if (!key) return {};
  
  try {
    console.log('🔄 Descargando cuotas de apuestas (The Odds API)...');
    
    // Traer h2h (1X2) y totals (Over/Under) en una sola request
    const url = `https://api.the-odds-api.com/v4/sports/soccer_argentina_primera_division/odds/?apiKey=${key}&regions=us,eu&markets=h2h,totals&oddsFormat=decimal`;
    const res = await axios.get(url, { timeout: 15000 });
    
    // Mostrar créditos restantes
    const remaining = res.headers['x-requests-remaining'];
    const used = res.headers['x-requests-used'];
    if (remaining) console.log(`   💳 Créditos API: ${remaining} restantes (${used} usados este mes).`);
    
    if (!Array.isArray(res.data) || res.data.length === 0) {
      console.log('   ℹ️ No hay partidos con cuotas disponibles actualmente.');
      return {};
    }
    
    const oddsMap = {};
    
    res.data.forEach(match => {
      const homeRaw = match.home_team;
      const awayRaw = match.away_team;
      const home = normalizeTeamName(homeRaw);
      const away = normalizeTeamName(awayRaw);
      
      // Promediar cuotas de TODAS las casas de apuestas para más precisión
      let homeWinOdds = [], drawOdds = [], awayWinOdds = [];
      let overOdds = [], underOdds = [], totalLine = 2.5;
      
      (match.bookmakers || []).forEach(bk => {
        // h2h (1X2)
        const h2h = bk.markets?.find(m => m.key === 'h2h');
        if (h2h) {
          const hOut = h2h.outcomes.find(o => o.name === homeRaw);
          const aOut = h2h.outcomes.find(o => o.name === awayRaw);
          const dOut = h2h.outcomes.find(o => o.name === 'Draw');
          if (hOut) homeWinOdds.push(hOut.price);
          if (aOut) awayWinOdds.push(aOut.price);
          if (dOut) drawOdds.push(dOut.price);
        }
        
        // totals (Over/Under)
        const totals = bk.markets?.find(m => m.key === 'totals');
        if (totals) {
          const over = totals.outcomes.find(o => o.name === 'Over');
          const under = totals.outcomes.find(o => o.name === 'Under');
          if (over) { overOdds.push(over.price); totalLine = over.point || 2.5; }
          if (under) underOdds.push(under.price);
        }
      });
      
      // Calcular promedios
      const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b) / arr.length : null;
      const avgHomeWin = avg(homeWinOdds);
      const avgAwayWin = avg(awayWinOdds);
      const avgDraw = avg(drawOdds);
      const avgOver = avg(overOdds);
      const avgUnder = avg(underOdds);
      
      // Convertir cuotas decimales a probabilidades (1/cuota, normalizado)
      let homeWinProb = 0.5, drawProb = 0.3, awayWinProb = 0.2;
      if (avgHomeWin && avgAwayWin && avgDraw) {
        const totalProb = (1/avgHomeWin) + (1/avgAwayWin) + (1/avgDraw);
        homeWinProb = (1/avgHomeWin) / totalProb;
        drawProb = (1/avgDraw) / totalProb;
        awayWinProb = (1/avgAwayWin) / totalProb;
      }
      
      // Estimar goles esperados desde Over/Under
      // Si Over 2.5 paga bajo (ej 1.60), se esperan muchos goles
      // Si Under 2.5 paga bajo (ej 1.60), se esperan pocos goles
      let expectedGoals = 2.5;
      if (avgOver && avgUnder) {
        const overProb = (1/avgOver);
        const underProb = (1/avgUnder);
        // Estimación simple: si Over 2.5 tiene 60% chance → ~2.8 goles esperados
        expectedGoals = totalLine + (overProb - underProb) * 1.5;
        expectedGoals = Math.max(0.5, Math.min(5.0, expectedGoals));
      }
      
      // Estimar goles esperados ponderados por favoritismo de cuotas del mercado
      const hProbRatio = avgHomeWin > 0 ? (1 / avgHomeWin) : 0.5;
      const aProbRatio = avgAwayWin > 0 ? (1 / avgAwayWin) : 0.5;
      const totalRatio = hProbRatio + aProbRatio;
      
      const hShare = totalRatio > 0 ? hProbRatio / totalRatio : 0.5;
      const aShare = totalRatio > 0 ? aProbRatio / totalRatio : 0.5;

      const homeExpGoals = expectedGoals * hShare;
      const awayExpGoals = expectedGoals * aShare;
      
      const homeCleanSheet = Math.exp(-awayExpGoals); // P(rival mete 0) -> mas probable para el favorito
      const awayCleanSheet = Math.exp(-homeExpGoals); // P(local mete 0) -> mas probable para el favorito

      const matchKey = `${home} vs ${away}`;
      const oddsObj = {
        home,
        away,
        homeWin: avgHomeWin,
        draw: avgDraw,
        awayWin: avgAwayWin,
        homeWinProb,
        drawProb,
        awayWinProb,
        homeExpGoals,
        awayExpGoals,
        expectedGoals,
        homeCleanSheetProb: homeCleanSheet,
        awayCleanSheetProb: awayCleanSheet,
        overUnderLine: totalLine,
        overOdds: avgOver,
        underOdds: avgUnder,
        bookmakerCount: match.bookmakers?.length || 0,
      };

      // Store by match key
      oddsMap[matchKey] = oddsObj;

      // Store team-level entry
      if (!oddsMap[home]) {
        oddsMap[home] = {
          win: avgHomeWin, draw: avgDraw, lose: avgAwayWin,
          winProb: homeWinProb, drawProb, loseProb: awayWinProb,
          rival: away, expectedGoals, teamExpGoals: homeExpGoals, rivalExpGoals: awayExpGoals,
          cleanSheetProb: homeCleanSheet
        };
      }
      if (!oddsMap[away]) {
        oddsMap[away] = {
          win: avgAwayWin, draw: avgDraw, lose: avgHomeWin,
          winProb: awayWinProb, drawProb, loseProb: homeWinProb,
          rival: home, expectedGoals, teamExpGoals: awayExpGoals, rivalExpGoals: homeExpGoals,
          cleanSheetProb: awayCleanSheet
        };
      }
    });
    
    console.log(`✅ Cuotas procesadas: ${res.data.length} partidos con cuotas cargadas.`);
    
    // Log de ejemplo
    const firstKey = Object.keys(oddsMap).find(k => k.includes(' vs '));
    if (firstKey) {
      const odds = oddsMap[firstKey];
      console.log(`   📊 Ejemplo cuotas: ${firstKey} → 1: ${odds.homeWin.toFixed(2)} | X: ${odds.draw.toFixed(2)} | 2: ${odds.awayWin.toFixed(2)}`);
    }
    
    return oddsMap;
  } catch (err) {
    if (err.response?.status === 401) {
      console.warn('⚠️ API Key de cuotas inválida. Verificá tu clave en the-odds-api.com.');
    } else if (err.response?.status === 429) {
      console.warn('⚠️ Límite de cuotas excedido (500/mes). Se usarán estimaciones estadísticas.');
    } else {
      console.warn('⚠️ No se pudieron descargar cuotas:', err.message);
    }
    return {};
  }
}

// ═══════════════════════════════════════════════════════
// 5. FALLBACK: CSV VIEJO
// ═══════════════════════════════════════════════════════
function parseOldPlayersCSV() {
  const oldCsvPath = 'c:/Users/Registro n°5/Desktop/Facu/Grandt/jugadores.csv.txt';
  if (!fs.existsSync(oldCsvPath)) return null;
  
  console.log('🔄 Cargando jugadores históricos desde CSV de backup...');
  try {
    const data = fs.readFileSync(oldCsvPath, 'utf-8');
    const rows = parseCSV(data);
    if (rows.length < 2) return null;
    
    const headers = rows[0];
    const colIdx = {};
    headers.forEach((h, i) => { colIdx[h.trim()] = i; });
    
    const players = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[colIdx['Name']] || '';
      if (!name) continue;
      
      players.push({
        id: `hist_${i}`,
        name: name,
        position: row[colIdx['Pos']] || 'DEL',
        team: normalizeTeamName(row[colIdx['Team']]),
        price: null,
        scores: [],
        matchesRated: Math.ceil((parseInt(row[colIdx['Minutes played']]) || 0) / 90),
        totalPoints: 0,
        avgRating: parseFloat(row[colIdx['PrG']]) || 6.0,
        goals: parseInt(row[colIdx['Goals']]) || 0,
        goalsOpenPlay: 0, goalsHeader: 0, goalsFreeKick: 0,
        goalsPenalty: parseInt(row[colIdx['Penalty goals']]) || 0,
        goalsAway: 0, goalsGolden: 0,
        goalsReceived: 0, ownGoals: 0,
        figuras: parseInt(row[colIdx['Figuras']]) || 0,
        cleanSheets: parseInt(row[colIdx['Clean sheets']]) || 0,
        yellowCards: parseInt(row[colIdx['Yellow cards']]) || 0,
        redCards: parseInt(row[colIdx['Red cards']]) || 0,
        penaltiesMissed: 0,
        penaltiesSaved: 0,
        xg: parseFloat(row[colIdx['Expected goals (xG)']]) || null,
        shots: parseInt(row[colIdx['Total shots']]) || null,
        shotsOnTarget: null,
        minutes: parseInt(row[colIdx['Minutes played']]) || 0,
      });
    }
    console.log(`✅ CSV Backup: ${players.length} jugadores.`);
    return players;
  } catch (err) {
    console.error('⚠️ Error al parsear CSV viejo:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🏆 GRAN DT ANALYZER PRO - SINCRONIZACIÓN     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  const appDir = path.join(process.cwd(), 'app');
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir);

  // 1. Planeta Gran DT (fuente principal)
  let players = await fetchPlanetaGranDT();
  
  // 1.5. Torneo Pasado (para suavizado Bayesiano)
  const historicalPlayers = await fetchTorneoPasadoData();

  // 2. Fallback si Planeta Gran DT falla
  if (!players || players.length === 0) {
    // Intentar data.json existente
    const outputPath = path.join(appDir, 'data.json');
    if (fs.existsSync(outputPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        if (existing.players?.length > 0) {
          players = existing.players;
          console.log(`✅ Usando ${players.length} jugadores del data.json existente.`);
        }
      } catch (_) {}
    }
    // Último recurso: CSV viejo
    if (!players || players.length === 0) {
      players = parseOldPlayersCSV() || [];
    }
  }

  // 3. ESPN (fixture + standings)
  const espn = await fetchESPNData();

  // 4. Enriquecer con SofaScore (xG, tiros)
  await tryEnrichWithSofaScore(players);

  // 4.5. Métricas de xG y xGC por equipo desde xGScore.io
  const teamXg = await fetchXgScore();

  // 5. Cuotas (opcional)
  const ODDS_API_KEY = process.env.ODDS_API_KEY || DEFAULT_ODDS_API_KEY;
  const odds = await fetchOdds(ODDS_API_KEY);

  // Data Validation & Safety Audit Guard
  let maxScoredRound = 0;
  players.forEach(p => {
    (p.scores || []).forEach((score, idx) => {
      if (score !== null && score !== undefined && score > 0) {
        if (idx + 1 > maxScoredRound) maxScoredRound = idx + 1;
      }
    });
  });

  const syncAudit = {
    timestamp: new Date().toISOString(),
    status: players.length > 0 && espn.fixture.length > 0 ? 'OK' : 'WARNING',
    planetaGranDT: {
      playersLoaded: players.length,
      lastRoundWithScores: maxScoredRound,
      status: players.length >= 350 ? 'VALID' : 'INVALID'
    },
    torneoPasado: {
      playersLoaded: historicalPlayers.length,
      status: historicalPlayers.length >= 300 ? 'VALID' : 'WARNING'
    },
    espn: {
      teamsLoaded: (espn.standings.zonaA || []).length + (espn.standings.zonaB || []).length,
      fixtureMatches: espn.fixture.length,
      activeRound: espn.currentRound,
      status: espn.fixture.length >= 200 ? 'VALID' : 'INVALID'
    },
    xgScore: {
      teamsLoaded: Object.keys(teamXg).length,
      status: Object.keys(teamXg).length >= 25 ? 'VALID' : 'WARNING'
    },
    odds: {
      matchesWithOdds: Object.keys(odds).length,
      status: Object.keys(odds).length > 0 ? 'VALID' : 'WARNING'
    }
  };

  // 6. Guardar resultado
  const output = {
    updatedAt: new Date().toISOString(),
    source: players.length > 0 && players[0].id?.startsWith('pg_') ? 'Planeta Gran DT' : 'Backup',
    currentRound: espn.currentRound,
    standings: espn.standings,
    fixture: espn.fixture,
    odds: odds,
    teamXg: teamXg,
    syncAudit: syncAudit,
    players: players,
    historicalPlayers: historicalPlayers,
  };

  // Guardar como .js (variable global) para evitar problemas de CORS con file://
  const outputPathJS = path.join(appDir, 'data.js');
  const jsContent = `// Generado automáticamente por sync.js — ${new Date().toISOString()}\nconst APP_DATA = ${JSON.stringify(output, null, 2)};\n`;
  fs.writeFileSync(outputPathJS, jsContent, 'utf-8');
  
  // También guardar como .json por compatibilidad
  const outputPath = path.join(appDir, 'data.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║           🎉 SINCRONIZACIÓN COMPLETA            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  📂 Archivo: ${outputPath}`);
  console.log(`  👥 Jugadores: ${players.length}`);
  console.log(`  📅 Fecha actual: ${espn.currentRound}`);
  console.log(`  🏟️ Partidos fixture: ${espn.fixture.length}`);
  console.log(`  📊 Fuente: ${output.source}`);
  console.log(`  💰 Cuotas: ${Object.keys(odds).length > 0 ? 'Sí' : 'No (sin API Key)'}`);
  const sofaEnriched = players.filter(p => p.xg !== null).length;
  console.log(`  ⚡ SofaScore xG: ${sofaEnriched > 0 ? `${sofaEnriched} jugadores` : 'No disponible'}`);
  console.log('');
}

main();
