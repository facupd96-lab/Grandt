/* ============================================================================
 * sync365.js — Extractor de datos INDIVIDUALES desde 365Scores
 * ----------------------------------------------------------------------------
 * Qué resuelve: hoy `players[].xg365`, `shots365`, `matches365` y `minutes365`
 * se LEEN en 20+ lugares del algoritmo y NUNCA se escriben en ningún lado.
 * Los datos están en 365Scores y son gratis. Este script los baja y los deja
 * listos.
 *
 * Qué saca, partido por partido y jugador por jugador:
 *   minutos · goles · asistencias · TIROS · TIROS AL ARCO · xG · ranking
 * Y agrega por equipo, separando LOCAL y VISITANTE:
 *   tiros generados / concedidos · tiros al arco gen. / conc. · xG gen. / conc.
 *
 * Uso:   node sync365.js
 * Salida: data365.json  (en la misma carpeta)
 *
 * Verificado el 19/08/2026: el endpoint de partido responde y trae stats por
 * jugador. competitionId = 72 (Liga Profesional Argentina).
 * ==========================================================================*/

const fs = require('fs');
const path = require('path');

const COMPETITION_ID = 72;
const BASE = 'https://webws.365scores.com/web';
const Q = 'appTypeId=5&langId=29&timezoneName=America/Argentina/Buenos_Aires&userCountryId=11';

// Tipos de estadística de 365Scores (verificados sobre el JSON real)
const STAT = {
  MINUTOS: 30, GOLES: 27, ASISTENCIAS: 26,
  TIROS: 3, TIROS_AL_ARCO: 4, TIROS_AFUERA: 5,
  XG: 76, PASES: 19, TOQUES: 45, FALTAS: 42,
  DUELOS_AEREOS: 56, INTERCEPCIONES: 41, DESPEJES: 40
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.365scores.com/'
        }
      });
      if (!r.ok) { await sleep(700 * (i + 1)); continue; }
      return await r.json();
    } catch (e) { await sleep(700 * (i + 1)); }
  }
  return null;
}

/** Lista de gameIds. Primero pide el calendario; si falla, usa los que ya
 *  tenemos en data.js y escanea hacia adelante. */
async function listarPartidos(gidsConocidos) {
  const ids = new Set(gidsConocidos.map(Number).filter(Boolean));
  const endpoints = [
    `${BASE}/games/results/?${Q}&competitions=${COMPETITION_ID}`,
    `${BASE}/games/current/?${Q}&competitions=${COMPETITION_ID}`,
    `${BASE}/games/fixtures/?${Q}&competitions=${COMPETITION_ID}`
  ];
  for (const url of endpoints) {
    const j = await getJson(url, 2);
    const games = j?.games || j?.data?.games;
    if (Array.isArray(games) && games.length) {
      games.forEach(g => { if (g.id) ids.add(Number(g.id)); });
      console.log(`   calendario ok (${games.length} partidos) desde ${url.split('?')[0]}`);
    }
  }
  // Barrido hacia adelante desde el último id conocido, por si el calendario
  // no devolvió las fechas nuevas.
  if (ids.size) {
    const max = Math.max(...ids);
    for (let g = max + 1; g <= max + 90; g++) ids.add(g);
  }
  return [...ids].sort((a, b) => a - b);
}

function statsDeMiembro(m) {
  const out = {};
  (m.stats || []).forEach(s => {
    const v = String(s.value ?? '').replace(/[^0-9.,-]/g, '').replace(',', '.');
    const n = parseFloat(v);
    out[s.type] = isFinite(n) ? n : 0;
  });
  return {
    minutos: out[STAT.MINUTOS] || 0,
    goles: out[STAT.GOLES] || 0,
    asistencias: out[STAT.ASISTENCIAS] || 0,
    tiros: out[STAT.TIROS] || 0,
    tirosAlArco: out[STAT.TIROS_AL_ARCO] || 0,
    xg: out[STAT.XG] || 0,
    ranking: m.ranking || 0
  };
}

function nombreDe(game, m) {
  if (m.name) return m.name;
  if (m.shortName) return m.shortName;
  const roster = game.members || game.competitors?.flatMap(c => c.members || []) || [];
  const found = roster.find(r => String(r.id) === String(m.id));
  return found?.name || found?.shortName || `id_${m.id}`;
}

function extraerPartido(game) {
  if (!game || !game.homeCompetitor || !game.awayCompetitor) return null;
  const lados = [
    { c: game.homeCompetitor, esLocal: true,  rival: game.awayCompetitor.name },
    { c: game.awayCompetitor, esLocal: false, rival: game.homeCompetitor.name }
  ];
  const jugadores = [], equipos = [];
  lados.forEach(({ c, esLocal, rival }) => {
    const miembros = c.lineups?.members || [];
    if (!miembros.length) return;
    const agg = { tiros: 0, tirosAlArco: 0, xg: 0 };
    miembros.forEach(m => {
      const st = statsDeMiembro(m);
      if (st.minutos <= 0 && st.tiros === 0 && st.xg === 0) return; // no entró
      jugadores.push({
        gid: game.id, round: game.stageNum ?? game.roundNum ?? null,
        nombre: nombreDe(game, m), id365: m.id, equipo: c.name,
        esLocal, rival, ...st
      });
      agg.tiros += st.tiros; agg.tirosAlArco += st.tirosAlArco; agg.xg += st.xg;
    });
    equipos.push({ gid: game.id, equipo: c.name, esLocal, rival, ...agg,
                   goles: c.score ?? null });
  });
  // los tiros concedidos de un lado son los generados del otro
  if (equipos.length === 2) {
    equipos[0].tirosConcedidos = equipos[1].tiros;
    equipos[0].tirosAlArcoConcedidos = equipos[1].tirosAlArco;
    equipos[0].xgConcedido = round2(equipos[1].xg);
    equipos[1].tirosConcedidos = equipos[0].tiros;
    equipos[1].tirosAlArcoConcedidos = equipos[0].tirosAlArco;
    equipos[1].xgConcedido = round2(equipos[0].xg);
  }
  return { jugadores, equipos };
}

function agregar(filasJug, filasEq) {
  // ── por jugador ──
  const P = {};
  filasJug.forEach(f => {
    const k = f.nombre;
    P[k] = P[k] || { nombre: f.nombre, id365: f.id365, equipo: f.equipo,
                     partidos: 0, minutos: 0, goles: 0, asistencias: 0,
                     tiros: 0, tirosAlArco: 0, xg: 0, log: [] };
    const p = P[k];
    p.partidos++; p.minutos += f.minutos; p.goles += f.goles;
    p.asistencias += f.asistencias; p.tiros += f.tiros;
    p.tirosAlArco += f.tirosAlArco; p.xg += f.xg; p.equipo = f.equipo;
    p.log.push({ gid: f.gid, round: f.round, vs: f.rival, local: f.esLocal,
                 min: f.minutos, tiros: f.tiros, xg: round2(f.xg) });
  });
  Object.values(P).forEach(p => {
    p.xg = round2(p.xg);
    p.minutosPorPartido = Math.round(p.minutos / Math.max(1, p.partidos));
    p.tirosPorPartido = round2(p.tiros / Math.max(1, p.partidos));
    p.xgPorPartido = round3(p.xg / Math.max(1, p.partidos));
    // titularidad: cuántas veces jugó 60+ minutos sobre los partidos de su equipo
    p.titularidad = round2(p.log.filter(l => l.min >= 60).length / Math.max(1, p.partidos));
  });

  // ── por equipo, separado local / visitante ──
  const T = {};
  const vacio = () => ({ pj: 0, tiros: 0, tirosConc: 0, sot: 0, sotConc: 0, xg: 0, xgConc: 0 });
  filasEq.forEach(f => {
    T[f.equipo] = T[f.equipo] || { equipo: f.equipo, total: vacio(), local: vacio(), visitante: vacio() };
    [T[f.equipo].total, f.esLocal ? T[f.equipo].local : T[f.equipo].visitante].forEach(b => {
      b.pj++; b.tiros += f.tiros; b.tirosConc += f.tirosConcedidos || 0;
      b.sot += f.tirosAlArco; b.sotConc += f.tirosAlArcoConcedidos || 0;
      b.xg += f.xg; b.xgConc += f.xgConcedido || 0;
    });
  });
  Object.values(T).forEach(t => {
    ['total', 'local', 'visitante'].forEach(k => {
      const b = t[k], n = Math.max(1, b.pj);
      t[k] = { pj: b.pj,
        tirosPorPartido: round2(b.tiros / n), tirosConcedidosPorPartido: round2(b.tirosConc / n),
        tirosAlArcoPorPartido: round2(b.sot / n), tirosAlArcoConcedidosPorPartido: round2(b.sotConc / n),
        xgPorPartido: round3(b.xg / n), xgConcedidoPorPartido: round3(b.xgConc / n) };
    });
  });
  return { jugadores: P, equipos: T };
}

async function main() {
  console.log('── sync365: bajando datos individuales de 365Scores ──\n');

  // gameIds que ya conocemos (de data.js), para no depender solo del calendario
  let conocidos = [];
  try {
    const dataPath = path.join(__dirname, 'data.js');
    const txt = fs.readFileSync(dataPath, 'utf8');
    const g = {}; global.window = g;
    eval(txt.replace(/^window\./, 'global.window.'));
    conocidos = Object.keys(g.appData?.stats365?._games || {});
    console.log(`   ${conocidos.length} partidos ya conocidos en data.js`);
  } catch (e) { console.log('   (no pude leer data.js, sigo igual)'); }

  const ids = await listarPartidos(conocidos);
  console.log(`   ${ids.length} gameIds a probar\n`);

  const filasJug = [], filasEq = [];
  let ok = 0, vacios = 0;
  for (let i = 0; i < ids.length; i++) {
    const j = await getJson(`${BASE}/game/?${Q}&gameId=${ids[i]}`, 2);
    const game = j?.game || j;
    // filtrar: solo esta competencia y partidos terminados
    if (!game || Number(game.competitionId) !== COMPETITION_ID) { vacios++; continue; }
    const ext = extraerPartido(game);
    if (!ext || !ext.jugadores.length) { vacios++; continue; }
    filasJug.push(...ext.jugadores); filasEq.push(...ext.equipos);
    ok++;
    if (ok % 10 === 0) process.stdout.write(`   ${ok} partidos procesados...\r`);
    await sleep(180); // no pegarle fuerte al server
  }
  console.log(`\n   ${ok} partidos con datos · ${vacios} descartados\n`);

  if (!ok) {
    console.log('❌ No se bajó ningún partido. Probá de nuevo o avisá: puede que');
    console.log('   365Scores haya cambiado el endpoint o esté bloqueando la IP.');
    return;
  }

  const agg = agregar(filasJug, filasEq);
  const nJug = Object.keys(agg.jugadores).length;
  const conTiros = Object.values(agg.jugadores).filter(p => p.tiros > 0).length;
  const conXg = Object.values(agg.jugadores).filter(p => p.xg > 0).length;

  const salida = {
    generado: new Date().toISOString(),
    competitionId: COMPETITION_ID,
    partidos: ok,
    cobertura: { jugadores: nJug, conTiros, conXg,
                 pctConTiros: Math.round(100 * conTiros / nJug),
                 pctConXg: Math.round(100 * conXg / nJug) },
    jugadores: agg.jugadores,
    equipos: agg.equipos,
    filasPorPartido: { jugadores: filasJug.length, equipos: filasEq.length }
  };
  fs.writeFileSync(path.join(__dirname, 'data365.json'), JSON.stringify(salida, null, 1));

  console.log('✅ Listo. Escrito: data365.json\n');
  console.log(`   jugadores: ${nJug}`);
  console.log(`   con tiros registrados: ${conTiros} (${salida.cobertura.pctConTiros}%)`);
  console.log(`   con xG registrado:     ${conXg} (${salida.cobertura.pctConXg}%)`);
  console.log(`   equipos: ${Object.keys(agg.equipos).length}\n`);

  // Control de coherencia: los tiros generados y concedidos de toda la liga
  // tienen que dar lo mismo. Si no dan, el dato está mal capturado.
  const eqs = Object.values(agg.equipos);
  const mf = eqs.reduce((s, t) => s + t.total.tirosPorPartido, 0) / eqs.length;
  const mc = eqs.reduce((s, t) => s + t.total.tirosConcedidosPorPartido, 0) / eqs.length;
  console.log(`   control: tiros a favor ${mf.toFixed(2)} vs concedidos ${mc.toFixed(2)} por partido`);
  console.log(`   ${Math.abs(mf - mc) < 0.5 ? '   ✅ coherente' : '   ⚠️ NO coherente: revisar'}\n`);

  const top = Object.values(agg.jugadores).sort((a, b) => b.tirosPorPartido - a.tirosPorPartido).slice(0, 10);
  console.log('   Top 10 en tiros por partido:');
  top.forEach((p, i) => console.log(`   ${String(i + 1).padStart(2)}. ${p.nombre.padEnd(26)} ${p.equipo.padEnd(20)} ${p.tirosPorPartido} tiros/p · ${p.xgPorPartido} xG/p · ${p.partidos} PJ`));
}

function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }

main().catch(e => console.error('Error:', e.message));
