// ════════════════════════════════════════════════════════════════════════════
//  AUDITAR_TORNEO.cjs  —  recalcula el torneo de amigos DESDE LOS ARCHIVOS
//
//  Por que existe (17/09): el puntaje de cada equipo se calculaba SOLO en el
//  navegador, dentro de marcadorDe(). Ningun auditor lo miraba, asi que si la
//  pantalla mostraba 99 donde iban 107 no habia forma de enterarse — y de hecho
//  paso: una foto vieja de Revision quedo con numeros de cuando faltaban
//  partidos por publicar, y convivio durante dias con la pantalla del torneo,
//  que mostraba otros. Dos pantallas, dos numeros, ningun control.
//
//  Esto rehace la cuenta con las reglas del juego y sin tocar el navegador:
//    · los 11 titulares suman lo que publico Planeta
//    · al titular que NO jugo lo reemplaza su suplente del mismo puesto
//    · la cinta duplica la FICHA del capitan, y se pierde si el capitan no sumo
//
//  No arregla nada: dice lo que da. Si no coincide con la pantalla, la pantalla
//  esta mal.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = f => path.join(__dirname, f);
const leer = f => { const c = { window: {} }; vm.createContext(c);
  vm.runInContext(fs.readFileSync(P(f), 'utf8'), c); return c.window; };

let D, V, L;
try { D = leer('datos.js').DATOS; } catch (e) { console.log('no pude leer datos.js: ' + e.message); process.exit(2); }
try { V = leer('dataVivo.js').VIVO; } catch (e) { console.log('no pude leer dataVivo.js: ' + e.message); process.exit(2); }
try { L = leer('dataLiga.js').LIGA_BASE; } catch (e) { console.log('no pude leer dataLiga.js: ' + e.message); process.exit(2); }

const problemas = [], avisos = [], ok = [];
const P_ = t => problemas.push(t), A_ = t => avisos.push(t), OK = t => ok.push(t);

console.log('');
console.log('  ══════════════════════════════════════════════════════════════');
console.log('   AUDITORIA DEL TORNEO DE AMIGOS   ·   fecha ' + V.fecha);
console.log('  ══════════════════════════════════════════════════════════════');
console.log('');

// ── el sello: los ids son numeros de fila y se corren en cada corrida ───────
if (!V.generadoCon || V.generadoCon !== D.generado) {
  P_('dataVivo.js se cruzo contra otro datos.js (' + (V.generadoCon || 'sin sello') +
     ' vs ' + D.generado + '). Los ids no corresponden: cualquier numero de aca abajo le puede estar colgando los puntos de un jugador a otro. Corre SYNC_VIVO.bat.');
  console.log('  ✗ EL SELLO NO COINCIDE. No sigo: los numeros no significarian nada.');
  console.log('');
  process.exit(3);
}
OK('dataVivo.js y datos.js son de la misma corrida del motor');

const TODOS = {};
['ARQ', 'DEF', 'VOL', 'DEL'].forEach(p => (D.rankings[p] || []).forEach(x => { TODOS[x.k] = x; }));

const de = k => {
  const j = TODOS[k];
  if (!j) return { falta: true };
  const v = V.puntos[j.id];
  return { j, v: v || null, ficha: (V.fichas && V.fichas[j.id] != null) ? V.fichas[j.id] : null };
};

const filas = [];
(L.equipos || []).forEach(e => {
  let once = 0, jugaron = 0, sinCruce = [], noJugaron = [], entraron = [], banco = 0;
  const faltaPorPos = {};

  (e.kOnce || []).forEach(k => {
    const r = de(k);
    if (r.falta) { sinCruce.push(k); return; }
    if (r.v && r.v.p != null) { once += r.v.p; jugaron++; }
    else { noJugaron.push(r.j.n); faltaPorPos[r.j.pos] = (faltaPorPos[r.j.pos] || 0) + 1; }
  });

  // REGLA DEL JUEGO: al titular que no jugo lo reemplaza SU suplente del mismo
  // puesto. Hay uno solo por puesto, asi que si faltan dos del mismo puesto,
  // uno queda sin cubrir.
  Object.keys(faltaPorPos).forEach(pos => {
    const bk = e.kBanco && e.kBanco[pos];
    if (!bk) { A_(e.nombre + ': le falto un ' + pos + ' y no tiene suplente de ese puesto cargado.'); return; }
    const r = de(bk);
    if (r.falta) { A_(e.nombre + ': su suplente ' + pos + ' (' + bk.split('@')[0] + ') no cruza con el ranking.'); return; }
    if (!r.v || r.v.p == null) { A_(e.nombre + ': su suplente ' + pos + ' (' + r.j.n + ') tampoco jugo.'); return; }
    banco += r.v.p; entraron.push(r.j.n + ' (' + pos + ')');
    if (faltaPorPos[pos] > 1) A_(e.nombre + ': le faltaron ' + faltaPorPos[pos] + ' de ' + pos +
      ' y el banco solo tiene uno: ' + (faltaPorPos[pos] - 1) + ' queda(n) sin cubrir.');
  });

  // LA CINTA: duplica la FICHA del capitan, no su puntaje. Y si el capitan no
  // sumo puntos, se pierde.
  const c = de(e.kCap || '');
  let cinta = 0, estadoCinta;
  if (c.falta) { estadoCinta = 'el capitan no cruza con el ranking'; P_(e.nombre + ': el capitan (' + (e.kCap || '?') + ') no existe en el ranking.'); }
  else if (!c.v || c.v.p == null) estadoCinta = 'PERDIDA (el capitan no jugo)';
  else if (c.ficha == null) { estadoCinta = 'sin ficha publicada'; A_(e.nombre + ': su capitan ' + c.j.n + ' jugo (' + c.v.p + ' pts) pero Planeta no publico su ficha. La cinta suma 0 y eso NO es que se perdio: es que falta el dato.'); }
  else { cinta = c.ficha; estadoCinta = '+' + c.ficha + ' (' + c.j.n + ')'; }

  if (sinCruce.length) P_(e.nombre + ': ' + sinCruce.length + ' jugador(es) del once no cruzan con el ranking: ' + sinCruce.join(' · '));

  filas.push({ n: e.nombre, once, banco, cinta, total: once + banco + cinta, jugaron,
               nOnce: (e.kOnce || []).length, noJugaron, entraron, estadoCinta });
});

// ── EL CRUCE CONTRA LA TABLA OFICIAL (17/09) ───────────────────────────────
// Lo que nos falto siempre: un numero de verdad contra el cual medirnos. Sin
// esto, un error en el once de alguien —un nombre repetido, un club mal puesto,
// un cambio a mitad de fecha— daba un total creible y NADIE se enteraba. Paso
// con El Favorito de la Tati en la fecha 9: dabamos 106 y el oficial decia 115.
// La diferencia eran 9 puntos exactos, que resultaron ser el arquero: el once
// decia "Ledesma (instituto)" —Marcos, 0 puntos— y el que jugo fue Jeremias
// Ledesma, de Rosario Central, que hizo 9.
//
// Pegá la tabla del Gran DT en puntajes_oficiales.txt y esto la cruza sola.
const norm = s => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
// Los nombres los escribe gente: "Runnero atomico" en la tabla del juego y
// "Runero Atomico" en equipos.txt son el mismo equipo. Se colapsan las letras
// repetidas y, si aun asi no pega, se acepta una distancia de edicion chica
// siempre que haya UN solo candidato: adivinar entre dos seria peor que fallar.
const flat = s => norm(s).replace(/(.)\1+/g, '$1');
function dist(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
let oficial = null;
try {
  const txt = fs.readFileSync(P('puntajes_oficiales.txt'), 'utf8');
  oficial = require('./parsear_oficial.cjs')(txt);
  if (!oficial.length) oficial = null;
} catch (e) { oficial = null; }

if (!oficial) {
  A_('no hay puntajes_oficiales.txt, asi que estos numeros no se cruzaron contra nada. ' +
     'Pega ahi la tabla del Gran DT y este auditor te dice, equipo por equipo, si la cuenta da.');
} else {
  const buscar = nombre => {
    let o = oficial.find(x => norm(x.equipo) === norm(nombre));
    if (o) return o;
    o = oficial.find(x => flat(x.equipo) === flat(nombre));
    if (o) return o;
    const cerca = oficial.filter(x => dist(flat(x.equipo), flat(nombre)) <= 2);
    return cerca.length === 1 ? cerca[0] : null;
  };
  let cruzados = 0, difieren = 0;
  filas.forEach(f => {
    const o = buscar(f.n);
    if (!o) { A_('"' + f.n + '" no aparece en la tabla oficial: revisá el nombre en equipos.txt.'); return; }
    if (norm(o.equipo) !== norm(f.n))
      A_('"' + f.n + '" (equipos.txt) lo cruce con "' + o.equipo + '" (Gran DT). Si no son el mismo equipo, avisá.');
    cruzados++;
    f.oficial = o.pts; f.dtOficial = o.dt; f.veces = o.veces;
    const d = o.pts - f.total;
    if (d === 0) return;
    difieren++;
    P_('"' + f.n + '": damos ' + f.total + ' y el Gran DT dice ' + o.pts +
       ' (' + (d > 0 ? 'faltan ' + d : 'sobran ' + (-d)) + ').' +
       (o.veces ? ' Ese DT modifico el equipo ' + o.veces + ' ' + (o.veces === 1 ? 'vez' : 'veces') + ' durante la fecha.' : '') +
       ' Casi siempre es un jugador mal identificado en equipos.txt (nombre repetido o club equivocado)' +
       ' o un cambio hecho a mitad de fecha. Buscá un jugador que haya sacado ' + Math.abs(d) + '.');
  });
  const sinCruzar = oficial.filter(o => !filas.some(f => f.oficial != null && f.dtOficial === o.dt));
  sinCruzar.forEach(o => A_('la tabla oficial trae "' + o.equipo + '" (' + o.dt + ') y no lo tenemos en equipos.txt.'));
  if (cruzados && !difieren) OK('los ' + cruzados + ' equipos dan EXACTO contra la tabla del Gran DT');
  else if (cruzados) OK(cruzados + ' equipos cruzados con la tabla oficial, ' + (cruzados - difieren) + ' exactos');
}

filas.sort((a, b) => (b.oficial != null ? b.oficial : b.total) - (a.oficial != null ? a.oficial : a.total));
console.log('   #  EQUIPO                    ONCE  BANCO  CINTA   TOTAL   OFICIAL   JUGARON');
console.log('   ───────────────────────────────────────────────────────────────────────────');
filas.forEach((f, i) => {
  console.log('   ' + String(i + 1).padEnd(2) + ' ' + f.n.slice(0, 24).padEnd(25) +
    String(f.once).padStart(4) + String(f.banco ? '+' + f.banco : '  -').padStart(7) +
    String(f.cinta ? '+' + f.cinta : '  -').padStart(7) + String(f.total).padStart(8) +
    (f.oficial == null ? '        -' : (f.oficial === f.total ? String(f.oficial).padStart(9)
      : (f.oficial + ' ✗').padStart(9))) +
    ('   ' + f.jugaron + '/' + f.nOnce).padStart(10));
  if (f.noJugaron.length) console.log('       no jugaron: ' + f.noJugaron.join(', ') +
    (f.entraron.length ? '  →  entraron: ' + f.entraron.join(', ') : '  →  sin reemplazo'));
  if (/PERDIDA|sin ficha|no cruza/.test(f.estadoCinta)) console.log('       cinta: ' + f.estadoCinta);
});
console.log('');

// ── controles ──────────────────────────────────────────────────────────────
const pub = Object.values(V.puntos).filter(v => v.p != null).length;
if ((V.partidos || []).length < 15)
  A_('dataVivo.js tiene ' + (V.partidos || []).length + ' de 15 partidos. Los equipos con jugadores de los partidos que faltan estan incompletos.');
else OK('los 15 partidos de la fecha estan publicados');
if (V.fechaMotor != null && V.fecha !== V.fechaMotor)
  A_('dataVivo.js es de la fecha ' + V.fecha + ' y el motor esta en la ' + V.fechaMotor +
     '. Es lo normal justo despues de cerrar una fecha, pero la portada no va a mostrar puntos en vivo hasta que corras SYNC_VIVO.bat.');
OK(pub + ' jugadores con puntaje publicado, ' + Object.keys(V.fichas || {}).length + ' con ficha de Clarin');
const empates = {};
filas.forEach(f => { empates[f.total] = (empates[f.total] || 0) + 1; });
const conEmpate = Object.entries(empates).filter(([, n]) => n > 1);
if (conEmpate.length) A_('hay empate en ' + conEmpate.map(([p, n]) => n + ' equipos con ' + p).join(' y ') + '. El orden entre ellos es arbitrario.');
if (filas.length) OK('los ' + filas.length + ' equipos tienen once, banco y capitan cargados');

const P2 = t => console.log('     • ' + t);
if (problemas.length) { console.log('  ✗ PROBLEMAS (' + problemas.length + ')'); problemas.forEach(P2); console.log(''); }
if (avisos.length) { console.log('  ! PARA MIRAR (' + avisos.length + ')'); avisos.forEach(P2); console.log(''); }
console.log('  ✓ CONTROLES QUE PASARON (' + ok.length + ')');
ok.forEach(t => console.log('     · ' + t));
console.log('');
console.log('  ══════════════════════════════════════════════════════════════');
console.log(problemas.length
  ? '   HAY ' + problemas.length + ' PROBLEMA(S). Los numeros de arriba no son de fiar.'
  : '   El torneo cierra. Si la pantalla muestra otra cosa, la pantalla esta mal.');
console.log('  ══════════════════════════════════════════════════════════════');
console.log('');
process.exit(problemas.length ? 3 : 0);
