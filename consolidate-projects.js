// Consolidate fragmented projects into fewer real ones, each with multiple SETS (briefs/reviews/decisions
// under one project). Reads the pending cloud items (_fetch_audit writes _cloud_items.json first), rewrites
// project+set on each, and pushes them back in ONE POST (single write, not a per-card mass-write signature).
//   node consolidate-projects.js            (dry run — cloud, prints the before/after project map)
//   node consolidate-projects.js --apply    (push the regrouped items to the cloud)
//   node consolidate-projects.js --local            (dry run against the local mirror :8471)
//   node consolidate-projects.js --local --apply    (regroup the local sensitive board)
const https = require('https'), http = require('http'), fs = require('fs'), path = require('path');
const SEC = fs.readFileSync(__dirname + '/.passcode.txt', 'utf8').trim();
const LOCAL = process.argv.includes('--local');
const HOST = 'vault-review-mobile.vercel.app';
const APPLY = process.argv.includes('--apply');
// Local mirror reads the raw store file directly (full fidelity, no /api/items projection loss).
const STORE = path.join(process.env.USERPROFILE || process.env.HOME || '', '.docket-local', 'items.json');

// current classification (mirrors api/_groups.classifyItem): source "a: b" => project a, set b
function classify(it) {
  const src = it.source || it.type || '';
  const pj = (it.project || '').trim(), st = (it.set || '').trim();
  const ci = src.indexOf(':');
  if (ci >= 0) return { project: pj || src.slice(0, ci).trim() || 'Ungrouped', set: st || src.slice(ci + 1).trim() || null };
  return { project: pj || src || 'Ungrouped', set: st || null };
}
const K = '__keep__'; // keep the current source-derived set as-is

// current project name -> { project: canonical, set: fixed set name | __keep__ }
const MERGE = {
  'Tacit Knowledge Capture': { project: 'Tacit Knowledge Capture', set: 'Deck cards' },
  'TKC Deck Review':         { project: 'Tacit Knowledge Capture', set: 'Deck review' },
  'sift':                    { project: 'sift', set: K },
  'cad-forge':               { project: 'cad-forge', set: 'PRDs & briefs' },
  'Assembly 2':              { project: 'cad-forge', set: 'Assembly 2 — fillets' },
  'LPJ0011BBNL':             { project: 'cad-forge', set: 'LPJ0011BBNL — fillets' },
  'viewer UI (perspective + holes)': { project: 'cad-forge', set: 'Viewer UI' },
  'x-band mount':            { project: 'X-band antenna', set: 'Mount' },
  'x-band antenna A':        { project: 'X-band antenna', set: 'Antenna A' },
  'x-band antenna B':        { project: 'X-band antenna', set: 'Antenna B' },
  'vault-org':               { project: 'vault-org', set: K },
  'consolidate safe-mode':   { project: 'vault-org', set: 'Cleanup' },
  'consolidate orphan pass': { project: 'vault-org', set: 'Orphans' },
  // one-off session-named buckets -> a single Harness project, each becomes a set
  'opus session — front-end redesign + consolidation + ship': { project: 'Harness', set: 'Front-end redesign' },
  'overnight goal — mid-run incident':                        { project: 'Harness', set: 'Overnight incident' },
  'the plan I executed on, with per-item DONE/latent status + commit hashes': { project: 'Harness', set: 'Executed plan' },
  'recon (2026-07-17) — grounded harness inventory vs verified 2026 Codex/Cursor docs': { project: 'Harness', set: 'Recon' },
  'research':                { project: 'Harness', set: 'Research' },
  'harness':                 { project: 'Harness', set: 'Harness notes' },
  'deep-search (public web)':{ project: 'Harness', set: 'Deep-search' },
  '/task -> parallel failure-research Workflow (14 agents, 12 categories) -> consolidation': { project: 'Harness', set: 'Failure-research' },
  // extra cad-forge session buckets present only in the migrated local store
  'cad-forge session 9570e31e':                                   { project: 'cad-forge', set: 'Text-to-Satellite' },
  'cad-forge PRD (the loop-side PRD I followed)':                 { project: 'cad-forge', set: 'Loop PRD' },
  'cad-forge PRD (the viewer-side PRD + parity checklist I followed)': { project: 'cad-forge', set: 'Viewer PRD' },
  // decision cards with no source classify under their type name — these two are cad-forge decisions
  'reversibility':           { project: 'cad-forge', set: 'Decisions' },
  'tradeoff':                { project: 'cad-forge', set: 'Decisions' },
  // schema-studio was fragmented locally into session buckets -> one project, each a set
  'schema-studio':                   { project: 'schema-studio', set: K },
  'schema-studio · Request 3 (benchmark testing)': { project: 'schema-studio', set: 'Benchmark testing' },
  'Schema Studio left-rail research + build record (2026-07-19)': { project: 'schema-studio', set: 'Left-rail research' },
  '/design-review on the Phase-F surfaces': { project: 'schema-studio', set: 'Phase-F design review' },
  // Berkeley Capstone / Examples: already single clean projects — left untouched (no entry = unchanged)
};

const post = (p, body) => new Promise((res, rej) => {
  const data = JSON.stringify(body);
  const mod = LOCAL ? http : https;
  const opts = LOCAL
    ? { host: '127.0.0.1', port: 8471, path: p, method: 'POST', headers: { Authorization: 'Bearer ' + SEC, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }
    : { hostname: HOST, path: p, method: 'POST', headers: { Authorization: 'Bearer ' + SEC, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
  const r = mod.request(opts, rp => { let d = ''; rp.on('data', c => d += c); rp.on('end', () => res({ status: rp.statusCode, body: d })); });
  r.on('error', rej); r.write(data); r.end();
});

(async () => {
  // Local: read the raw store map (full fidelity). Cloud: the pending set from _fetch_audit.js.
  const items = LOCAL ? Object.values(JSON.parse(fs.readFileSync(STORE, 'utf8'))) : require('./_cloud_items.json');
  const beforeProjects = new Set(items.map(it => classify(it).project));
  let changed = 0;
  for (const it of items) {
    const cur = classify(it);
    const m = MERGE[cur.project];
    if (!m) continue;
    const newSet = m.set === K ? cur.set : m.set;
    if (it.project !== m.project || (it.set || null) !== (newSet || null)) changed++;
    it.project = m.project;
    if (newSet) it.set = newSet; else delete it.set;
  }
  const afterProjects = {};
  for (const it of items) { const p = classify(it).project; (afterProjects[p] = afterProjects[p] || new Set()).add(classify(it).set || '(direct)'); }
  console.log(`before: ${beforeProjects.size} projects | after: ${Object.keys(afterProjects).length} projects | ${changed} items regrouped`);
  console.log('\nafter — project (set count):');
  for (const [p, sets] of Object.entries(afterProjects).sort((a,b)=>a[0].localeCompare(b[0])))
    console.log(`  ${p}  —  ${sets.size} set(s): ${[...sets].join(', ')}`);
  if (!APPLY) { console.log('\nDRY RUN — pass --apply to push.'); return; }
  if (LOCAL) { const bak = STORE.replace(/\.json$/, '.BACKUP.json'); fs.copyFileSync(STORE, bak); console.log('store backed up ->', bak); }
  const r = await post('/api/sync?op=push', { items });
  console.log('\npush:', r.status, r.body);
})().catch(e => { console.error(e.message); process.exit(1); });
