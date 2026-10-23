// Tiny local web server for the two browser tools (no dependencies). npm start, then open the printed URLs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIRS = ['ram-calculator', 'motd-generator'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const port = Number(process.env.PORT) || 8080;

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
  const file = path.normalize(path.join(ROOT, p));
  const ok = DIRS.some((d) => file.startsWith(path.join(ROOT, d) + path.sep)) && !file.includes(`${path.sep}test${path.sep}`);
  if (!ok || !TYPES[path.extname(file)] || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  for (const d of DIRS) console.log(`http://localhost:${port}/${d}/`);
});
