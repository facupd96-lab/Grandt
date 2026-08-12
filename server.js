import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const APP_DIR = path.join(__dirname, 'app');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoint to trigger full sync
  if (req.method === 'POST' && req.url === '/api/sync') {
    console.log('🔄 Petición de sincronización recibida desde la Web App...');
    exec('node sync.js', { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error durante la sincronización:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
        return;
      }
      console.log(stdout);

      try {
        const dataPath = path.join(__dirname, 'app', 'data.json');
        const updatedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Sincronización completada exitosamente',
          syncAudit: updatedData.syncAudit
        }));
      } catch (_) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Sincronización completada exitosamente' }));
      }
    });
    return;
  }

  // Serve static files
  let filePath = path.join(APP_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 - Archivo no encontrado</h1>');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  🏆 GRAN DT ANALYZER PRO - SERVIDOR LOCAL       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  🌐 Web App activa en: http://localhost:${PORT}`);
  console.log(`  🔄 Botón de Sincronización en vivo HABILITADO.`);
  console.log('');
});
