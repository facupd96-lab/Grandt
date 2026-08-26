/* ============================================================================
 * backtest.cjs — ¿el motor acierta?
 * ----------------------------------------------------------------------------
 * Compara, para cada fecha con foto guardada, lo que el motor recomendo ANTES
 * de que se jugara contra lo que realmente paso, y lo mide contra referencias
 * simples. Sin referencias un numero no dice nada: 73 puntos puede ser muy
 * bueno o muy malo segun contra que.
 *
 * Se corre solo, sin argumentos:   node backtest.cjs
 * ==========================================================================*/
const fs = require('fs');

const P = JSON.parse(fs.readFileSync('dataPlaneta.json', 'utf8'));
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

const idx = {};
P.jugadores.forEach(j => { idx[norm(j.nombre)] = j; });
const buscar = n => {
  const k = norm(n);
  if (idx[k]) return idx[k];
  return P.jugadores.find(j => norm(j.nombre).includes(k) || k.includes(norm(j.nombre))) || null;
};
const puntosEn = (j, fecha) => {
  if (!j || !j.puntajes) return null;
  const v = j.puntajes[fecha - 1];
  return (v == null) ? null : v;
};

// Cuando un titular no juega, en Gran DT entra el suplente del banco. No es 0.
// Se usa la mediana de lo que saca un jugador que califica.
const todos = [];
P.jugadores.forEach(j => (j.puntajes || []).forEach(v => { if (v != null) todos.push(v); }));
todos.sort((a, b) => a - b);
const SUPLENTE = todos.length ? todos[Math.floor(todos.length / 2)] : 5;

if (!fs.existsSync('historial')) {
  console.log('No hay carpeta historial. Se crea sola cada vez que corre armar.cjs.');
  process.exit(0);
}
const fotos = fs.readdirSync('historial').filter(f => /^fecha_\d+\.json$/.test(f))
  .map(f => ({ f, n: Number(f.match(/\d+/)[0]) })).sort((a, b) => a.n - b.n);

console.log('');
console.log('BACKTEST — el motor contra la realidad');
console.log('  el suplente que entra cuando un titular no juega vale ' + SUPLENTE + ' puntos');
console.log('');

let filasResumen = [];
fotos.forEach(({ f, n }) => {
  const foto = JSON.parse(fs.readFileSync('historial/' + f, 'utf8'));
  // ¿ya se jugo esa fecha?
  const jugaron = P.jugadores.filter(j => puntosEn(j, n) != null).length;
  if (jugaron < 50) { console.log('  fecha ' + n + ': todavia no se jugo (' + jugaron + ' jugadores con puntaje)'); return; }

  // --- lo que recomendo el motor ---
  let real = 0, jugadosDelOnce = 0;
  const detalle = foto.once.map(x => {
    const j = buscar(x.nombre);
    const p = puntosEn(j, n);
    if (p != null) { real += p; jugadosDelOnce++; } else { real += SUPLENTE; }
    return { ...x, real: p };
  });

  // --- referencias, todas eligiendo a ciegas con lo que se sabia antes ---
  const pool = [];
  P.jugadores.forEach(j => {
    const prev = [];
    for (let k = 1; k < n; k++) { const v = puntosEn(j, k); if (v != null) prev.push(v); }
    if (prev.length < 2) return;
    pool.push({ pos: j.posicion, prom: media(prev), pj: prev.length,
                cot: j.cotizacion || 0, real: puntosEn(j, n) });
  });
  const esquema = { ARQ: 1, DEF: 5, VOL: 3, DEL: 2 };
  const armar = criterio => {
    let t = 0;
    Object.entries(esquema).forEach(([pos, c]) => {
      pool.filter(x => x.pos === pos).sort((a, b) => criterio(b) - criterio(a)).slice(0, c)
        .forEach(x => { t += (x.real != null ? x.real : SUPLENTE); });
    });
    return t;
  };
  const azar = Object.entries(esquema).reduce((t, [pos, c]) =>
    t + c * media(pool.filter(x => x.pos === pos).map(x => x.real != null ? x.real : SUPLENTE)), 0);
  const techo = Object.entries(esquema).reduce((t, [pos, c]) =>
    t + pool.filter(x => x.pos === pos && x.real != null).sort((a, b) => b.real - a.real)
      .slice(0, c).reduce((s, x) => s + x.real, 0), 0);

  const refs = {
    azar: Math.round(azar),
    promedio: armar(x => x.prom),
    promedioConMuestra: armar(x => x.prom * Math.min(1, x.pj / (n - 1))),
    caros: armar(x => x.cot),
    techo
  };

  console.log('=== FECHA ' + n + ' ===  (esquema recomendado: ' + foto.esquema + ')');
  detalle.forEach(x => console.log('   ' + (x.pos + '   ').slice(0, 4) +
    (x.nombre + '                       ').slice(0, 24) +
    (x.equipo + '              ').slice(0, 16) +
    'esperaba ' + String(x.EP).padStart(5) + '   saco ' +
    (x.real == null ? 'NO JUGO (entra suplente: ' + SUPLENTE + ')' : String(x.real).padStart(3))));
  console.log('');
  console.log('   EL MOTOR                          ' + String(real).padStart(4) + '   (' + jugadosDelOnce + '/11 jugaron)');
  console.log('   once al azar                      ' + String(refs.azar).padStart(4));
  console.log('   los mas caros                     ' + String(refs.caros).padStart(4));
  console.log('   mejor promedio previo             ' + String(refs.promedio).padStart(4));
  console.log('   promedio castigando poca muestra  ' + String(refs.promedioConMuestra).padStart(4));
  console.log('   once perfecto (diario del lunes)  ' + String(refs.techo).padStart(4));
  const mejorRef = Math.max(refs.azar, refs.caros, refs.promedio, refs.promedioConMuestra);
  console.log('');
  console.log('   -> el motor ' + (real >= mejorRef ? 'GANO' : 'perdio') + ' contra la mejor referencia por ' +
    Math.abs(real - mejorRef) + ' puntos');
  console.log('');
  filasResumen.push({ n, real, ...refs, mejorRef });
});

if (filasResumen.length) {
  console.log('RESUMEN DE ' + filasResumen.length + ' FECHA(S)');
  console.log('   fecha   motor   azar   caros   promedio   prom+muestra   techo');
  filasResumen.forEach(r => console.log('   ' + String(r.n).padStart(5) + String(r.real).padStart(8) +
    String(r.azar).padStart(7) + String(r.caros).padStart(8) + String(r.promedio).padStart(11) +
    String(r.promedioConMuestra).padStart(15) + String(r.techo).padStart(8)));
  const m = k => Math.round(media(filasResumen.map(r => r[k])));
  console.log('   ' + 'media'.padStart(5) + String(m('real')).padStart(8) + String(m('azar')).padStart(7) +
    String(m('caros')).padStart(8) + String(m('promedio')).padStart(11) +
    String(m('promedioConMuestra')).padStart(15) + String(m('techo')).padStart(8));
  console.log('');
  const ganadas = filasResumen.filter(r => r.real >= r.mejorRef).length;
  console.log('   el motor le gano a la mejor referencia en ' + ganadas + ' de ' + filasResumen.length + ' fechas');
  if (filasResumen.length < 8) {
    console.log('   OJO: con ' + filasResumen.length + ' fecha(s) esto no alcanza para concluir nada.');
    console.log('   Un once tiene un desvio de +-10 puntos por fecha solo por azar: hacen falta');
    console.log('   unas 14 fechas para distinguir una mejora de 8 puntos del ruido.');
  }
}
console.log('');
