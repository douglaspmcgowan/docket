// One-shot migration: push PENDING items from the three local desktop stores (:8471 workbench) into
// the cloud board. reviewer -> review cards, ~/.decisions -> decision cards (add kind), ~/.claude/briefs
// -> brief cards (add kind + inline the src file into body). Skips items already answered locally.
// Pushes via Playwright's request API because this machine's node-fetch TLS to Vercel is flaky.
//   node migrate-local.js            (dry run: counts only)
//   node migrate-local.js --push     (actually push)
const fs = require('fs'); const path = require('path'); const os = require('os');
const { chromium } = require('@playwright/test');
const { resolveBriefBody } = require('./enqueue.js');
const { requireReviewSecret } = require('./api/_review-secret');

const H = os.homedir();
const DO_PUSH = process.argv.includes('--push');
// --local pushes the old desktop stores into the LOCAL MIRROR (127.0.0.1:8471) instead of the cloud.
// Localhost is plain http, so a direct fetch works — no Playwright needed (that's only for Vercel's flaky TLS).
const LOCAL = process.argv.includes('--local');
const BASE = LOCAL ? 'http://127.0.0.1:8471' : 'https://vault-review-mobile.vercel.app';

const readJsonDir = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } })
    .filter(Boolean);
};
const answeredIds = (dir) => new Set(
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')) : []);

// A source string is a real group label only if it's short; brief sources are often whole sentences,
// which must NOT become project names. Returns { project, set } or {} to leave ungrouped.
function groupOf(it) {
  if (it.project) return { project: it.project, set: it.set };
  const src = String(it.source || '');
  const ci = src.indexOf(':');
  if (ci >= 0) return { project: src.slice(0, ci).trim(), set: src.slice(ci + 1).trim() || undefined };
  const words = src.trim().split(/\s+/).filter(Boolean);
  if (src && src.length <= 40 && words.length <= 5) return { project: src.trim() };
  return {}; // sentence-y or empty -> Ungrouped (clean up later via rename)
}

function main() {
  const out = [];
  const skipped = { answered: 0, briefNoSrc: 0 };

  // reviewer (already review-shaped) — skip answered
  const rAns = answeredIds(path.join(H, '.claude/reviewer/results'));
  for (const it of readJsonDir(path.join(H, '.claude/reviewer/incoming'))) {
    if (rAns.has(it.id)) { skipped.answered++; continue; }
    out.push({ ...it, ...groupOf(it) });
  }
  // decisions — add kind, skip answered
  const dAns = answeredIds(path.join(H, '.decisions/results'));
  for (const it of readJsonDir(path.join(H, '.decisions/incoming'))) {
    if (dAns.has(it.id)) { skipped.answered++; continue; }
    out.push({ ...it, kind: 'decision', ...groupOf(it) });
  }
  // briefs — add kind, inline src, skip answered / missing src
  const bAns = answeredIds(path.join(H, '.claude/briefs/results'));
  for (const it of readJsonDir(path.join(H, '.claude/briefs/incoming'))) {
    if (bAns.has(it.id)) { skipped.answered++; continue; }
    let brief;
    try { brief = resolveBriefBody(it, p => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }); }
    catch { skipped.briefNoSrc++; continue; }
    out.push({ ...brief, kind: 'brief', ...groupOf(it) });
  }

  const byKind = out.reduce((m, it) => (m[it.kind || 'review'] = (m[it.kind || 'review'] || 0) + 1, m), {});
  console.log('to migrate:', out.length, JSON.stringify(byKind), '| skipped:', JSON.stringify(skipped));
  return out;
}

(async () => {
  const items = main();
  console.log(`target: ${BASE}${LOCAL ? '  [LOCAL MIRROR]' : '  [CLOUD]'}`);
  if (!DO_PUSH) { console.log('DRY RUN — pass --push to upload' + (LOCAL ? '' : ' (add --local to target the mirror)') + '.'); return; }

  // Local mirror: plain-http fetch (works to localhost). Cloud: Playwright (Vercel TLS is flaky here).
  const SEC = requireReviewSecret();
  let pushed = 0;
  if (LOCAL) {
    for (let i = 0; i < items.length; i += 40) {
      const batch = items.slice(i, i + 40);
      const r = await fetch(`${BASE}/api/sync?op=push`,
        { method: 'POST', headers: { Authorization: 'Bearer ' + SEC, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: batch }) });
      const j = await r.json();
      pushed += j.pushed || 0;
      console.log(`  batch ${i / 40 + 1}: +${j.pushed} (status ${r.status})`);
    }
  } else {
    const b = await chromium.launch(); const p = await b.newPage();
    for (let i = 0; i < items.length; i += 40) {
      const batch = items.slice(i, i + 40);
      const r = await p.request.post(`${BASE}/api/sync?op=push`,
        { headers: { Authorization: 'Bearer ' + SEC, 'Content-Type': 'application/json' }, data: { items: batch } });
      const j = await r.json();
      pushed += j.pushed || 0;
      console.log(`  batch ${i / 40 + 1}: +${j.pushed} (status ${r.status()})`);
    }
    await b.close();
  }
  console.log('pushed total:', pushed);
})().catch(e => { console.error(e.message); process.exit(1); });
