// Data cleanup: consolidate the fragmented / filepath-leaked project names surfaced after migration.
// High-confidence merges only (all reversible via another rename). node cleanup-data.js [--apply]
const { chromium } = require('@playwright/test');
const fs = require('fs');
const SEC = (process.env.REVIEW_SECRET || fs.readFileSync(__dirname + '/.passcode.txt', 'utf8')).trim();
const BASE = (process.env.REVIEW_URL || 'https://vault-review-mobile.vercel.app').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');

// project (as currently classified) -> canonical project
const RENAMES = [
  ['Berkeley MEng Capstone / Slides/assets/celedon/chris.jpg', 'Berkeley Capstone'],
  ['schema-studio', 'Schema Studio'],
  ['Schema Studio design-review + Phase-F handoff (2026-07-19)', 'Schema Studio'],
  ['Schema Studio left-rail research + build record (2026-07-19)', 'Schema Studio'],
  ['schema-studio · Request 3 (benchmark testing)', 'Schema Studio'],
  ['/design-review on the Phase-F surfaces', 'Schema Studio'],
  ['cad-forge PRD (the loop-side PRD I followed)', 'cad-forge'],
  ['cad-forge PRD (the viewer-side PRD + parity checklist I followed)', 'cad-forge'],
  ['cad-forge session 9570e31e', 'cad-forge'],
  ['/task -> parallel failure-research Workflow (14 agents, 12 categories) -> consolidation', 'cad-forge'],
];

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const H = { Authorization: 'Bearer ' + SEC, 'Content-Type': 'application/json' };
  const before = (await (await p.request.get(`${BASE}/api/sync?op=groups`, { headers: H })).json()).groups.length;
  console.log('projects before:', before);
  if (!APPLY) { console.log('DRY RUN —', RENAMES.length, 'renames queued. Pass --apply.'); RENAMES.forEach(([f, t]) => console.log('  ', f, '->', t)); await b.close(); return; }
  for (const [from, to] of RENAMES) {
    const r = await p.request.post(`${BASE}/api/sync?op=rename`, { headers: H, data: { project: from, toProject: to } });
    const j = await r.json();
    console.log(`  ${j.changed ?? '?'} moved: "${from}" -> "${to}"`);
  }
  const after = (await (await p.request.get(`${BASE}/api/sync?op=groups`, { headers: H })).json()).groups.length;
  console.log('projects after:', after, '(', before - after, 'fewer )');
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
