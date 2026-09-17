// ---------------------------------------------------------------------------
//  construir.cjs — arma un index.html que se banca solo
// ---------------------------------------------------------------------------
//  Por que existe: mandar appV3.js por el chat es un dolor de cabeza. El
//  navegador a veces se niega a bajar archivos .js, Windows los renombra
//  "appV3 (1).js", y si uno solo de los tres archivos no llega, la pagina se
//  ve vieja y parece que nada funcionara. Pasamos dos dias arreglando cosas que
//  ya estaban arregladas por eso.
//
//  Solucion: un solo archivo. Este script mete styles.css, teamsRegistry.js y
//  appV3.js ADENTRO de index.html. Queda un unico index.html de ~170 KB que se
//  copia solo y anda. Lo unico que sigue afuera es datos.js, que es justamente
//  lo que regenera ACTUALIZAR_TODO.
//
//  Se corre desde la carpeta:  node construir.cjs
// ---------------------------------------------------------------------------
const fs = require('fs');
const crypto = require('crypto');

const plantilla = fs.readFileSync('index.fuente.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const registry = fs.readFileSync('teamsRegistry.js', 'utf8');
const app = fs.readFileSync('appV3.js', 'utf8');

// Dos trampas al pegar codigo dentro de un <script>:
//   1) un "</script>" literal corta el bloque aunque este adentro de un string
//   2) String.replace interpreta $&, $', $` y $1 EN EL REEMPLAZO. El codigo de
//      la app esta lleno de template literals con ${...} y de cadenas con
//      comillas; con el reemplazo como string, JavaScript se comia pedazos y
//      quedaba un archivo roto ("Invalid or unexpected token"). Por eso todos
//      los replace de abajo van con FUNCION, que no interpreta nada.
const seguro = t => t.replace(/<\/script>/gi, '<\\/script>');

let salida = plantilla;
let SELLO = '';

salida = salida.replace(
  /<script>\s*\n\s*\/\/ ANTI-CACHE[\s\S]*?<\/noscript>/,
  () => '<style>\n' + css + '\n</style>');
if (salida.indexOf('<style>') < 0) {
  salida = salida.replace('</head>', () => '<style>\n' + css + '\n</style>\n</head>');
}
salida = salida.replace(/<link rel="stylesheet" href="styles\.css[^"]*">/g, '');

// El bloque que cargaba los tres scripts pasa a ser: datos.js afuera (se
// regenera), el resto adentro.
salida = salida.replace(
  /<script>\s*\n\s*\(function \(\) \{\s*\n\s*var v = Date\.now\(\);[\s\S]*?\}\)\(\);\s*\n\s*<\/script>/,
  // datos.js y dataVivo.js quedan AFUERA: los dos se regeneran solos.
  // datos.js lo hace ACTUALIZAR_TODO y dataVivo.js SYNC_VIVO, que uno corre
  // varias veces el domingo mientras se juega. Si dataVivo.js no existe, el
  // 404 en la consola es esperable y la pagina anda igual.
  () => '<script>document.write(\'<script src="datos.js?v=\' + Date.now() + \'"><\\/script>\');</script>\n' +
  '    <script>document.write(\'<script src="dataVivo.js?v=\' + Date.now() + \'"><\\/script>\');</script>\n' +
  '    <script>document.write(\'<script src="dataHist.js?v=\' + Date.now() + \'"><\\/script>\');</script>\n' +
  '    <script>document.write(\'<script src="dataLiga.js?v=\' + Date.now() + \'"><\\/script>\');</script>\n' +
  // dataFotos.js: como termino cada fecha, calculado por foto.cjs desde los
  // archivos. Antes esto vivia SOLO en el localStorage de cada navegador, o sea
  // que en Vercel los amigos no veian ningun historial. Ahora viaja con la app.
  '    <script>document.write(\'<script src="dataFotos.js?v=\' + Date.now() + \'"><\\/script>\');</script>\n' +
  '    <script>\n' + seguro(registry) + '\n</script>\n' +
  '    <script>\n' + seguro(app) + '\n</script>');

// ── EL SELLO DEL BUILD ─────────────────────────────────────────────────────
// Nace de un problema concreto (08/09): la pagina publicada en GitHub estaba
// muchas versiones atras y no habia forma de darse cuenta mirandola. Ahora cada
// index.html lleva adentro una huella de los cuatro archivos con los que se
// armo. Se puede comparar la de tu carpeta con la de GitHub y saber, sin
// discutir, si lo que esta publicado es lo ultimo.
// La huella depende SOLO del contenido: reconstruir sin cambiar nada da el
// mismo archivo y git no ve ningun cambio.
// El separador es " | " y no "·" porque PowerShell 5.1 lee BUILD.txt con la
// codepage de Windows y el punto medio salia como "Â·" en la consola.
{
  const huella = crypto.createHash('sha256')
    .update(plantilla).update(css).update(registry).update(app)
    .digest('hex').slice(0, 12);
  const masNuevo = ['index.fuente.html', 'styles.css', 'teamsRegistry.js', 'appV3.js']
    .map(f => fs.statSync(f).mtime.getTime()).sort((a, b) => b - a)[0];
  const d = new Date(masNuevo);
  const dd = n => String(n).padStart(2, '0');
  const cuando = d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate()) +
                 ' ' + dd(d.getHours()) + ':' + dd(d.getMinutes());
  SELLO = huella + ' | ' + cuando;   // ASCII a proposito: ver el comentario de arriba
  salida = salida.replace('</head>', () =>
    '    <meta name="gdt-build" content="' + SELLO + '">\n</head>');
  fs.writeFileSync('BUILD.txt', SELLO + '\n');
}
fs.writeFileSync('index.html', salida);
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('sello del build: ' + SELLO);
console.log('index.html armado — ' + kb(salida.length) +
  '  (css ' + kb(css.length) + ' + registry ' + kb(registry.length) + ' + app ' + kb(app.length) + ')');
console.log('Lo unico que queda afuera es datos.js, que lo regenera ACTUALIZAR_TODO.');
