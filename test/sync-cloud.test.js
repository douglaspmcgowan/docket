const { test } = require('node:test');
const assert = require('node:assert');
const { syncItems, mergeCloudDecisions } = require('../sync-cloud.js');

test('bulk sync includes every valid local card', () => {
  const items = {
    public: { id: 'public', sensitive: false },
    legacySensitive: { id: 'legacy-sensitive', sensitive: true },
    unmarked: { id: 'unmarked' },
    invalid: null,
  };
  assert.deepEqual(syncItems(items).map(item => item.id), ['public', 'legacy-sensitive', 'unmarked']);
});

test('decision pull accepts only known, timestamped card decisions', () => {
  const items = { known: { id: 'known' } };
  const result = mergeCloudDecisions([
    { id: 'known', answered_at: '2026-07-29T00:00:00Z', chosen: 'Approve' },
    { id: 'unknown', answered_at: '2026-07-29T00:00:00Z', chosen: 'Approve' },
    { id: 'known' },
    null,
  ], {}, items);
  assert.equal(result.pulled, 1);
  assert.equal(result.refused, 3);
  assert.equal(result.merged.known.chosen, 'Approve');
  assert.equal(result.merged.unknown, undefined);
});

test('decision pull keeps a newer local decision', () => {
  const items = { known: { id: 'known' } };
  const local = {
    known: { id: 'known', answered_at: '2026-07-29T01:00:00Z', chosen: 'Keep local' },
  };
  const result = mergeCloudDecisions([
    { id: 'known', answered_at: '2026-07-29T00:00:00Z', chosen: 'Older cloud' },
  ], local, items);
  assert.equal(result.pulled, 0);
  assert.equal(result.refused, 0);
  assert.equal(result.merged.known.chosen, 'Keep local');
});
