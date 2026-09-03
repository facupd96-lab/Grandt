// Auditoria de la APP, no de los datos: renderiza cada pantalla y busca
// numeros rotos (NaN, undefined, Infinity), celdas vacias y errores de JS.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push('JS: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|net::/.test(m.text())) errs.push('CONSOLA: ' + m.text()); });
await p.goto('file:///home/claude/index.html');
await p.waitForTimeout(1500);

const SECS = ['fecha','jugadores','fixture','posiciones','once','oportunidades','lideres','datos'];
const problemas = [];
const MALO = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]|\bnull\b/;

for (const sec of SECS) {
  const r = await p.evaluate(s => {
    mostrarSeccion(s);
    const el = document.getElementById('sec-' + s);
    return { txt: el ? el.innerText : '(sin seccion)', html: el ? el.innerHTML.length : 0 };
  }, sec);
  await p.waitForTimeout(400);
  if (!r.html) { problemas.push(`${sec}: la seccion no existe o quedo vacia`); continue; }
  const malas = (r.txt.match(new RegExp(MALO.source, 'g')) || []);
  if (malas.length) problemas.push(`${sec}: ${malas.length} apariciones de ${[...new Set(malas)].join(', ')}`);
  console.log(`  ${sec.padEnd(14)} ${String(r.html).padStart(7)} bytes · ${r.txt.split('\n').filter(Boolean).length} lineas`);
}

// Los 4 puestos de Jugadores y de Oportunidades
for (const pos of ['ARQ','DEF','VOL','DEL']) {
  const r = await p.evaluate(q => {
    mostrarSeccion('jugadores'); S.pos = q; pintarRankings();
    const filas = [...document.querySelectorAll('#players-body tr')];
    const txt = filas.map(t => t.innerText).join('\n');
    return { n: filas.length, malo: (txt.match(/NaN|undefined|Infinity/g) || []).length,
             primero: filas[0] ? filas[0].innerText.replace(/\s+/g,' ').slice(0,80) : '(vacio)' };
  }, pos);
  console.log(`  jugadores ${pos}   ${String(r.n).padStart(4)} filas · ${r.primero}`);
  if (r.malo) problemas.push(`jugadores ${pos}: ${r.malo} numeros rotos`);
  if (!r.n) problemas.push(`jugadores ${pos}: tabla vacia`);

  const o = await p.evaluate(q => {
    mostrarSeccion('oportunidades'); S_OP.pos = q; pintarOportunidades();
    const filas = [...document.querySelectorAll('#pantalla-oportunidades tbody tr')];
    const txt = filas.map(t => t.innerText).join('\n');
    return { n: filas.length, malo: (txt.match(/NaN|undefined|Infinity/g) || []).length,
             primero: filas[0] ? filas[0].innerText.replace(/\s+/g,' ').slice(0,80) : '(vacio)' };
  }, pos);
  console.log(`  oportunid ${pos}   ${String(o.n).padStart(4)} filas · ${o.primero}`);
  if (o.malo) problemas.push(`oportunidades ${pos}: ${o.malo} numeros rotos`);
  if (!o.n) problemas.push(`oportunidades ${pos}: tabla vacia`);
}

// Todas las categorias de Lideres
for (const cat of ['xgPerMatch_noPen','shotsPerMatch','goalsPerMatch','avgRating','cleanSheets','yellowCards']) {
  const r = await p.evaluate(c => {
    mostrarSeccion('lideres');
    document.getElementById('leaders-cat-select').value = c; pintarLideres();
    const filas = [...document.querySelectorAll('#leaders-body tr')];
    return { n: filas.length, malo: (filas.map(t=>t.innerText).join('\n').match(/NaN|undefined|Infinity/g)||[]).length,
             primero: filas[0] ? filas[0].innerText.replace(/\s+/g,' ').slice(0,70) : '(vacio)' };
  }, cat);
  console.log(`  lideres ${cat.padEnd(18)} ${String(r.n).padStart(3)} · ${r.primero}`);
  if (r.malo) problemas.push(`lideres ${cat}: ${r.malo} numeros rotos`);
  if (!r.n) problemas.push(`lideres ${cat}: tabla vacia`);
}

// El once solido y el arriesgado
for (const modo of ['solido','riesgo']) {
  const r = await p.evaluate(m => {
    mostrarSeccion('once');
    if (m === 'riesgo') cambiarEsquema('__riesgo'); else cambiarEsquema(D.esquema.optimo.esquema);
    const fichas = [...document.querySelectorAll('#pantalla-once .cancha .ficha11')];
    const banco = [...document.querySelectorAll('#pantalla-once .banco .ficha11')];
    return { once: fichas.length, banco: banco.length,
             malo: (document.getElementById('sec-once').innerText.match(/NaN|undefined|Infinity/g)||[]).length };
  }, modo);
  console.log(`  once ${modo.padEnd(8)} ${r.once} en cancha · ${r.banco} en el banco`);
  if (r.once !== 11) problemas.push(`once ${modo}: hay ${r.once} jugadores en la cancha, no 11`);
  if (r.malo) problemas.push(`once ${modo}: ${r.malo} numeros rotos`);
}

// La ficha de un jugador
const f = await p.evaluate(() => {
  const id = D.rankings.DEL[0].id; auditar(id);
  const el = document.getElementById('audit-modal');
  const t = el ? el.innerText : '';
  return { largo: t.length, malo: (t.match(/NaN|undefined|Infinity/g)||[]).length };
});
console.log(`  ficha jugador  ${f.largo} caracteres`);
if (f.malo) problemas.push(`ficha del jugador: ${f.malo} numeros rotos`);
if (f.largo < 500) problemas.push('ficha del jugador: quedo casi vacia');

console.log('\n== ERRORES DE JAVASCRIPT ==');
console.log(errs.length ? errs.join('\n') : '  ninguno');
console.log('\n== PROBLEMAS ==');
console.log(problemas.length ? problemas.map(x=>'  ✗ '+x).join('\n') : '  ninguno');
await b.close();
