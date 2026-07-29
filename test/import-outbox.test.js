const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadCards, mergeCards, importCards } = require('../import-outbox');
const { createDocumentStore, createMemoryProvider } = require('../api/_document-store');

test('loadCards reads a deterministic set and mergeCards preserves unrelated items', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-outbox-unit-'));
  try {
    fs.writeFileSync(path.join(root, 'b.json'), JSON.stringify({ id: 'b', title: 'B' }));
    fs.writeFileSync(path.join(root, 'a.json'), JSON.stringify({ id: 'a', title: 'A' }));
    const cards = loadCards(root);
    assert.deepStrictEqual(cards.map(card => card.id), ['a', 'b']);
    assert.deepStrictEqual(
      mergeCards({ existing: { id: 'existing' } }, cards),
      { existing: { id: 'existing' }, a: { id: 'a', title: 'A' }, b: { id: 'b', title: 'B' } }
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('parallel outbox imports use atomic mutations and preserve both batches', async () => {
  const documents = createDocumentStore(createMemoryProvider({ 'items.json': {} }));
  const store = { updateItems: mutator => documents.mutate('items.json', mutator) };
  await Promise.all([
    importCards(store, [{ id: 'a', title: 'A' }]),
    importCards(store, [{ id: 'b', title: 'B' }]),
  ]);
  const items = await documents.read('items.json');
  assert.ok(items.a);
  assert.ok(items.b);
});

test('CLI imports an outbox into SQLite and the readable JSON export', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-outbox-integration-'));
  const outbox = path.join(root, 'outbox');
  const store = path.join(root, 'store');
  fs.mkdirSync(outbox);
  fs.writeFileSync(path.join(outbox, 'card.json'), JSON.stringify({ id: 'card', title: 'Card' }));

  try {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'import-outbox.js'), '--outbox', outbox, '--store', store],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(store, 'docket.sqlite3')));
    const exported = JSON.parse(fs.readFileSync(path.join(store, 'items.json'), 'utf8'));
    assert.deepStrictEqual(exported, { card: { id: 'card', title: 'Card' } });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
