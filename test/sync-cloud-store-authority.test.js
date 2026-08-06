// Regression for the 2026-08-06 results divergence.
//
// sync-cloud.js used to hold private readLocal/writeLocal helpers that wrote the flat JSON files
// directly. Everything else (docket-cli, api/_store, api/_document-store) treats the SQLite
// `documents` table as the authority and mirrors flat files as a side effect. So a cloud pull wrote
// answers ONLY to the flat file: the store row said 28 results while results.json said 435, and later
// pushes skipped cards because the two copies disagreed about what was resolved.
//
// The rule these tests pin: after a pull, the documents row and the flat file agree.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-sync-authority-'));
process.env.LOCAL_STORE_DIR = dir;

const store = require('../api/_store');
const { mergeCloudDecisions } = require('../sync-cloud');

function sqliteResults() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(dir, 'docket.sqlite3'), { readOnly: true });
  const row = db.prepare('SELECT body FROM documents WHERE name = ?').get('results.json');
  db.close();
  return JSON.parse((row && row.body) || '{}');
}
function flatResults() {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8')); }
  catch { return {}; }
}

test('sync-cloud keeps no private store writer', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sync-cloud.js'), 'utf8');
  assert.ok(!/function\s+writeLocal/.test(src), 'sync-cloud must not define its own writer');
  assert.ok(!/function\s+readLocal/.test(src), 'sync-cloud must not define its own reader');
  assert.ok(/require\('\.\/api\/_store'\)/.test(src), 'sync-cloud must go through api/_store');
});

test('a pulled decision lands in the documents row AND the flat mirror, in agreement', async () => {
  const items = { a: { id: 'a', title: 'card a' }, b: { id: 'b', title: 'card b' } };
  await store.writeItems(items);
  await store.writeResults({ a: { id: 'a', archived: true, answered_at: '2026-01-01T00:00:00Z' } });

  const cloud = [
    { id: 'b', chosen: 'Approve', answered_at: '2026-08-06T01:00:00Z' },
    { id: 'a', chosen: 'Reject', answered_at: '2026-08-06T02:00:00Z' },   // newer than the local archive
  ];
  const merged = mergeCloudDecisions(cloud, await store.readResults(), items);
  assert.equal(merged.pulled, 2);
  await store.updateResults(() => merged.merged);

  const sq = sqliteResults(), flat = flatResults();
  assert.deepEqual(Object.keys(sq).sort(), ['a', 'b']);
  assert.deepEqual(sq, flat, 'the documents row and the flat mirror must agree after a pull');
  assert.equal(sq.b.chosen, 'Approve');
  assert.equal(sq.a.chosen, 'Reject');
});

test('the store read sees what the store wrote (no flat-file-only answers)', async () => {
  await store.writeResults({ z: { id: 'z', chosen: 'Yes', answered_at: '2026-08-06T03:00:00Z' } });
  const viaStore = await store.readResults();
  assert.deepEqual(Object.keys(viaStore), ['z']);
  assert.deepEqual(viaStore, sqliteResults());
  assert.deepEqual(viaStore, flatResults());
});

test('a flat-file write behind the store does not become the authority', async () => {
  await store.writeResults({ real: { id: 'real', chosen: 'A', answered_at: '2026-08-06T04:00:00Z' } });
  // simulate the OLD bug: something scribbles straight onto the flat file
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ ghost: { id: 'ghost' } }));
  const viaStore = await store.readResults();
  assert.deepEqual(Object.keys(viaStore), ['real'], 'the documents row stays authoritative');
  // and the next store write repairs the mirror
  await store.updateResults(cur => cur);
  assert.deepEqual(flatResults(), viaStore, 'a store write re-mirrors the flat file');
});

test('merge refuses ill-formed and unknown-card results', () => {
  const items = { a: { id: 'a' } };
  const r = mergeCloudDecisions(
    [null, { id: 'a' }, { id: 'unknown', answered_at: 'T' }, { id: 'a', answered_at: '2026-08-06T05:00:00Z' }],
    {}, items);
  assert.equal(r.pulled, 1);
  assert.equal(r.refused, 3);
});
