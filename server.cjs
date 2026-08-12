/**
 * server.cjs
 * Local Web Server & Automated Pipeline Host for Gran DT Analyzer Pro
 * Zero-dependency Node.js HTTP server.
 * Runs on http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 3000;
const APP_DIR = path.join(__dirname, 'app');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // Enable CORS headers for all API requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoint: /api/sync
  if (req.method === 'POST' && urlPath === '/api/sync') {
    console.log('\n🔄 API Sync requested from browser...');
    try {
      execSync('node app/sync_all.cjs', { stdio: 'inherit', cwd: __dirname });
      const dataJson = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'data.json'), 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        message: 'Sincronización completa de las 5 fuentes realizada con éxito.',
        currentRound: dataJson.currentRound,
        syncAudit: dataJson.syncAudit
      }));
    } catch (err) {
      console.error('❌ Error during API sync:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Serve static files from /app
  let filePath = path.join(APP_DIR, urlPath === '/' ? 'index.html' : urlPath);
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(APP_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Server Error: ' + err.code);
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIp = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
  console.log('=====================================================');
  console.log(`🏆 Gran DT Analyzer Pro Server is RUNNING`);
  console.log(`👉 En esta PC:           http://localhost:${PORT}`);
  console.log(`📱 Desde otra PC o Celu:  http://${localIp}:${PORT}`);
  console.log('=====================================================');
});
