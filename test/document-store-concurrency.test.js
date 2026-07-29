const { test } = require('node:test');
const assert = require('node:assert');
const {
  VersionConflictError,
  createDocumentStore,
  createMemoryProvider,
} = require('../api/_document-store');

test('parallel mutations retry after a version conflict and preserve both results', async () => {
  const provider = createMemoryProvider({
    'results.json': {
      seed: { id: 'seed', archived: true, answered_at: '2026-07-29T00:00:00.000Z' },
    },
  });
  const store = createDocumentStore(provider, { maxAttempts: 5 });
  let releases;
  const bothRead = new Promise(resolve => { releases = resolve; });
  let firstWrites = 0;

  provider.beforeWrite = async () => {
    firstWrites += 1;
    if (firstWrites === 2) releases();
    if (firstWrites <= 2) await bothRead;
  };

  await Promise.all([
    store.mutate('results.json', doc => {
      doc.a = { id: 'a', chosen: 'Approve', answered_at: '2026-07-29T01:00:00.000Z' };
      return doc;
    }),
    store.mutate('results.json', doc => {
      doc.b = { id: 'b', chosen: 'Reject', answered_at: '2026-07-29T01:00:01.000Z' };
      return doc;
    }),
  ]);

  const final = await store.read('results.json');
  assert.ok(final.a);
  assert.ok(final.b);
  assert.ok(final.seed);
  assert.ok(provider.conflicts >= 1, 'the fixture must exercise a real version conflict');
});

test('a mutation fails clearly after the bounded retry budget is exhausted', async () => {
  const provider = createMemoryProvider({ 'reads.json': {} });
  provider.write = async () => { throw new VersionConflictError('forced conflict'); };
  const store = createDocumentStore(provider, { maxAttempts: 2 });
  await assert.rejects(
    store.mutate('reads.json', doc => {
      doc.b1 = '2026-07-29T00:00:00.000Z';
      return doc;
    }),
    /after 2 attempts/i
  );
});

test('a mutation that returns metadata exposes the result from the successful attempt', async () => {
  const provider = createMemoryProvider({
    'tickets.json': { a: { id: 'a', requested_at: '2026-07-29T00:00:00.000Z' } },
  });
  const store = createDocumentStore(provider);
  const outcome = await store.mutate('tickets.json', doc => ({
    document: {},
    result: Object.keys(doc),
  }));
  assert.deepEqual(outcome.result, ['a']);
  assert.deepEqual(await store.read('tickets.json'), {});
});
