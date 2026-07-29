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
  const result = { id: 'a', chosen: 'Approve', answered_at: '2026-07-29T00:00:00.000Z' };
  await store.writeResults({ a: result });
  assert.deepStrictEqual(await store.readResults(), { a: result });
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
  const ticket = { id: 'old', requested_at: '2026-07-29T00:00:00.000Z' };
  fs.writeFileSync(path.join(dir, 'tickets.json'), JSON.stringify({ old: ticket }));
  assert.deepStrictEqual(await store.readTickets(), { old: ticket });
});

test('local store: atomic result mutations preserve parallel writers', async () => {
  await store.writeResults({});
  await Promise.all([
    store.updateResults(results => {
      results.a = { id: 'a', chosen: 'Approve', answered_at: '2026-07-29T01:00:00.000Z' };
      return results;
    }),
    store.updateResults(results => {
      results.b = { id: 'b', chosen: 'Reject', answered_at: '2026-07-29T01:00:01.000Z' };
      return results;
    }),
  ]);
  const results = await store.readResults();
  assert.ok(results.a);
  assert.ok(results.b);
});

test('local store: invalid JSON is reported instead of silently replaced with an empty map', async () => {
  const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-corrupt-store-'));
  fs.writeFileSync(path.join(corruptDir, 'reads.json'), '{bad json');
  const storePath = require.resolve('../api/_store');
  delete require.cache[storePath];
  const previous = process.env.LOCAL_STORE_DIR;
  process.env.LOCAL_STORE_DIR = corruptDir;
  try {
    const corruptStore = require('../api/_store');
    await assert.rejects(corruptStore.readReads(), /invalid JSON/i);
  } finally {
    delete require.cache[storePath];
    process.env.LOCAL_STORE_DIR = previous;
  }
});
