// The local-file backend of _store.js (LOCAL_STORE_DIR set) — round-trips through disk and never
// touches @vercel/blob (which isn't installed locally). Env must be set BEFORE requiring _store.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-store-'));
process.env.LOCAL_STORE_DIR = dir;
const store = require('../api/_store');

test('local store: first read of a missing document is an empty map', async () => {
  assert.deepStrictEqual(await store.readTickets(), {});
});

test('local store: write then read round-trips through SQLite and exports JSON', async () => {
  await store.writeItems({ a: { id: 'a', title: 'x' } });
  assert.deepStrictEqual(await store.readItems(), { a: { id: 'a', title: 'x' } });
  assert.ok(fs.existsSync(path.join(dir, 'docket.sqlite3')), 'SQLite database written to disk');
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(path.join(dir, 'items.json'), 'utf8')),
    { a: { id: 'a', title: 'x' } },
    'portable JSON export written after the mutation'
  );
});

test('local store: separate blobs do not collide', async () => {
  await store.writeResults({ a: { id: 'a', chosen: 'Approve' } });
  assert.deepStrictEqual(await store.readResults(), { a: { id: 'a', chosen: 'Approve' } });
  assert.deepStrictEqual(await store.readItems(), { a: { id: 'a', title: 'x' } }, 'items untouched by a results write');
});

test('local store: a later mutation preserves the previous JSON export', async () => {
  await store.writeItems({ b: { id: 'b', title: 'y' } });
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(path.join(dir, 'backups', 'items.previous.json'), 'utf8')),
    { a: { id: 'a', title: 'x' } }
  );
  assert.deepStrictEqual(await store.readItems(), { b: { id: 'b', title: 'y' } });
});

test('local store: atomic export leaves no .tmp behind', async () => {
  await store.writeReads({ b: '2026-01-01' });
  assert.ok(!fs.existsSync(path.join(dir, 'reads.json.tmp')), 'temp file renamed away');
});

test('local store: existing JSON imports into SQLite on first read', async () => {
  fs.writeFileSync(path.join(dir, 'tickets.json'), JSON.stringify({ old: { id: 'old' } }));
  assert.deepStrictEqual(await store.readTickets(), { old: { id: 'old' } });
});
