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
  () => '<script>document.write(\'<script src="datos.js?v=\' + Date.now() + \'"><\\/script>\');</script>\n' +
  '    <script>\n' + seguro(registry) + '\n</script>\n' +
  '    <script>\n' + seguro(app) + '\n</script>');

fs.writeFileSync('index.html', salida);
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('index.html armado — ' + kb(salida.length) +
  '  (css ' + kb(css.length) + ' + registry ' + kb(registry.length) + ' + app ' + kb(app.length) + ')');
console.log('Lo unico que queda afuera es datos.js, que lo regenera ACTUALIZAR_TODO.');
