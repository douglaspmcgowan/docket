#!/usr/bin/env node
// Local mirror of the cloud review board — the SAME public/index.html + the SAME api/*.js handlers,
// but bound to 127.0.0.1 and backed by a local-FILE store instead of Vercel Blob. This is the home for
// NASA-SENSITIVE cards: nothing here ever leaves the machine. It replaces the old stale :8471 workbench.
//
//   node local-server.js                 # serves http://127.0.0.1:8471, store in ~/.docket-local
//   PORT=8600 node local-server.js       # different port
//   LOCAL_STORE_DIR=... node local-server.js
//
// The loopback socket is the local trust boundary. Cloud handlers still require APP_SECRET.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8471;
const PUBLIC = path.join(__dirname, 'public');
const HOME = process.env.USERPROFILE || process.env.HOME || __dirname;
const TRUST_LOOPBACK = process.env.DOCKET_REQUIRE_BEARER !== '1';

// Local sensitive store lives OUTSIDE the git repo (never committed, never synced).
process.env.LOCAL_STORE_DIR = process.env.LOCAL_STORE_DIR || path.join(HOME, '.docket-local');
const LOCAL_REQUEST = Symbol.for('docket.localRequest');

// The Vercel serverless handlers, reused verbatim. LOCAL_STORE_DIR (set above) flips _store.js to files.
const handlers = {
  '/api/items': require('./api/items.js'),
  '/api/submit': require('./api/submit.js'),
  '/api/sync': require('./api/sync.js'),
  '/api/more': require('./api/more.js'),
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// Shim a Node req/res into the { req.query, req.body, res.status().json() } shape the handlers expect.
function shim(req, res, body) {
  const remote = req.socket && req.socket.remoteAddress;
  if (TRUST_LOOPBACK &&
      (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1')) {
    Object.defineProperty(req, LOCAL_REQUEST, { value: true });
  }
  const q = {};
  const qs = (req.url.split('?')[1] || '');
  for (const p of qs.split('&')) { if (!p) continue; const [k, v] = p.split('='); q[decodeURIComponent(k)] = v === undefined ? '' : decodeURIComponent(v); }
  req.query = q;
  req.body = body;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return { req, res };
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  // Legacy local critique cards store an image filename in artifact.ref. Serve those files only from the
  // fixed CAD audit directory; basename validation prevents traversal outside that directory.
  if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/artifact') {
    let ref = '';
    try { ref = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.get('ref') || ''; } catch {}
    if (!ref || path.basename(ref) !== ref) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Invalid artifact reference');
    }
    const auditDir = process.env.ARTIFACT_DIR || path.join(__dirname, '..', 'ai-for-cad', 'cad-forge', 'shots', 'audit');
    const file = path.join(auditDir, ref);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Artifact not found');
    }
    const buf = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    return res.end(req.method === 'HEAD' ? undefined : buf);
  }

  // Static: the exact same frontend as the cloud. Root -> index.html; anything else under public/.
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!pathname.startsWith('/api/')) {
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = path.join(PUBLIC, rel);
      if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const buf = fs.readFileSync(file);
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        return res.end(req.method === 'HEAD' ? undefined : buf);
      }
      // SPA / legacy-path fallback: an extensionless route (e.g. an OLD workbench bookmark to /review,
      // /decide, /briefs) serves the app instead of 404ing "Not found" — which reads as "nothing there".
      // A missing asset (has a file extension, like /foo.js) still 404s.
      if (!path.extname(rel)) {
        const idx = fs.readFileSync(path.join(PUBLIC, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(req.method === 'HEAD' ? undefined : idx);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
  }

  const handler = handlers[pathname];
  if (!handler) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'no route' })); }

  // Buffer the body (JSON) then dispatch. Cap at 12MB (a brief with an inlined doc is the big case).
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 12e6) req.destroy(); });
  req.on('end', () => {
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'bad json' })); } }
    shim(req, res, body);
    Promise.resolve(handler(req, res)).catch((e) => {
      if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
    });
  });
});

// 127.0.0.1 ONLY — sensitive content must never be reachable off-box.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Docket local mirror -> http://127.0.0.1:${PORT}  [store: ${process.env.LOCAL_STORE_DIR}, loopback trusted]`);
});

module.exports = { server, PORT };
