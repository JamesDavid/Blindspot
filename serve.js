// Local dev server: rebuilds on every request touching index.html and serves
// with no-store headers so playtesters on the LAN always get the current build.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const port = process.argv[2] ? parseInt(process.argv[2], 10) : 8080;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(root, urlPath);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (urlPath === '/index.html') {
    try { execSync('node build.js', { cwd: root }); }
    catch (e) { res.writeHead(500); res.end('build failed:\n' + e.message); return; }
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(port, () => console.log(`serving on http://localhost:${port} (rebuilds index.html per request)`));
