#!/usr/bin/env node
// Local <-> Vercel sync for the mobile review board.
//   push: read ~/.claude/reviewer/incoming/*.json -> POST /api/sync?op=push
//   pull: GET /api/sync?op=pull -> for each answer, write results/<id>.json and move the
//         incoming file to archive/ (exactly what the local /api/submit would have done, so the
//         existing result-watcher routes the answer back to its origin WORK_QUEUE).
//
// Env: REVIEW_URL   (e.g. https://vault-review-mobile.vercel.app)
//      REVIEW_SECRET (the APP_SECRET set on Vercel)
// Run once:  node sync.js
// Loop:      node sync.js --watch   (every 15s)

const fs = require('fs');
const path = require('path');
const os = require('os');

const URL = (process.env.REVIEW_URL || '').replace(/\/$/, '');
const SECRET = process.env.REVIEW_SECRET || '';
if (!URL || !SECRET) { console.error('Set REVIEW_URL and REVIEW_SECRET env vars.'); process.exit(1); }

const ROOT = path.join(os.homedir(), '.claude', 'reviewer');
const INCOMING = path.join(ROOT, 'incoming');
const RESULTS = path.join(ROOT, 'results');
const ARCHIVE = path.join(ROOT, 'archive');
const TICKETS = path.join(ROOT, 'tickets');   // "tell me more" requests -> Claude expands the card

const H = { 'Authorization': 'Bearer ' + SECRET, 'Content-Type': 'application/json' };

async function push() {
  const files = fs.readdirSync(INCOMING).filter(f => f.endsWith('.json'));
  const items = [];
  for (const f of files) {
    try { items.push(JSON.parse(fs.readFileSync(path.join(INCOMING, f), 'utf8'))); }
    catch { /* torn/partial write — skip this cycle */ }
  }
  if (!items.length) return { pushed: 0 };
  // Chunk so one POST body stays small.
  let pushed = 0;
  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50);
    const r = await fetch(`${URL}/api/sync?op=push`, { method: 'POST', headers: H, body: JSON.stringify({ items: batch }) });
    if (!r.ok) throw new Error('push failed ' + r.status + ' ' + await r.text());
    pushed += (await r.json()).pushed || 0;
  }
  return { pushed };
}

async function pull() {
  const r = await fetch(`${URL}/api/sync?op=pull`, { headers: H });
  if (!r.ok) throw new Error('pull failed ' + r.status + ' ' + await r.text());
  const { results } = await r.json();
  fs.mkdirSync(RESULTS, { recursive: true });
  fs.mkdirSync(ARCHIVE, { recursive: true });
  let applied = 0;
  for (const res of results || []) {
    const id = res && res.id;
    if (!id) continue;
    const resultPath = path.join(RESULTS, id + '.json');
    if (fs.existsSync(resultPath)) continue; // already applied locally — idempotent
    // Only apply answers for cards THIS laptop actually pushed (incoming still present, or
    // already retired to archive). Skips anything the laptop never sent — e.g. test data.
    const inc = path.join(INCOMING, id + '.json');
    const arch = path.join(ARCHIVE, id + '.json');
    if (!fs.existsSync(inc) && !fs.existsSync(arch)) continue;
    // Write the result the local watcher expects, then retire the incoming file to archive.
    fs.writeFileSync(resultPath, JSON.stringify(res, null, 2), 'utf8');
    if (fs.existsSync(inc)) {
      try { fs.renameSync(inc, path.join(ARCHIVE, id + '.json')); } catch { /* leave in place */ }
    }
    applied++;
  }
  return { applied };
}

async function tickets() {
  // Drain "tell me more" requests into ~/.claude/reviewer/tickets/<id>.json for Claude to expand.
  const r = await fetch(`${URL}/api/sync?op=tickets&clear=1`, { headers: H });
  if (!r.ok) throw new Error('tickets failed ' + r.status + ' ' + await r.text());
  const { tickets } = await r.json();
  fs.mkdirSync(TICKETS, { recursive: true });
  let landed = 0;
  for (const tk of tickets || []) {
    if (!tk || !tk.id) continue;
    fs.writeFileSync(path.join(TICKETS, tk.id + '.json'), JSON.stringify(tk, null, 2), 'utf8');
    landed++;
  }
  return { landed };
}

async function cycle() {
  const p = await push();
  const q = await pull();
  const m = await tickets();
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] pushed=${p.pushed} answers_applied=${q.applied} more_requested=${m.landed}`);
}

(async () => {
  await cycle();
  if (process.argv.includes('--watch')) {
    setInterval(() => cycle().catch(e => console.error('cycle error:', e.message)), 15000);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
