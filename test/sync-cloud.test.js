const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { secret, selectSyncItems, syncItems, mergeCloudDecisions } = require('../sync-cloud.js');

test('cloud sync accepts only broker-injected REVIEW_SECRET', () => {
  assert.equal(secret({ REVIEW_SECRET: '  injected-fixture  ' }), 'injected-fixture');
  assert.throws(() => secret({}), /REVIEW_SECRET.*broker/i);
  const source = fs.readFileSync(path.join(__dirname, '..', 'sync-cloud.js'), 'utf8');
  assert.doesNotMatch(source, /\.passcode\.txt|readFileSync\s*\(\s*pc/i);
});

test('bulk sync preserves legitimate cards and excludes conservative sensitive markers', () => {
  const items = {
    public: { id: 'public', sensitive: false },
    legacySensitive: { id: 'legacy-sensitive', sensitive: true },
    unmarked: { id: 'unmarked' },
    cui: { id: 'cui', title: 'Boundary', description: 'CUI//SP-PRVCY' },
    nasaInternal: { id: 'nasa-internal', title: 'NASA INTERNAL USE ONLY' },
    publicNasa: { id: 'public-nasa', title: 'Public NASA mission update' },
    invalid: null,
  };
  assert.deepEqual(syncItems(items).map(item => item.id), ['public', 'unmarked', 'public-nasa']);
  const selection = selectSyncItems(items);
  assert.deepEqual(selection.items.map(item => item.id), ['public', 'unmarked', 'public-nasa']);
  assert.equal(selection.refused, 4);
});

test('bulk sync excludes locally archived cards', () => {
  const items = {
    active: { id: 'active' },
    archived: { id: 'archived' },
  };
  const results = {
    archived: { id: 'archived', archived: true, answered_at: '2026-07-29T00:00:00Z' },
  };
  assert.deepEqual(syncItems(items, results).map(item => item.id), ['active']);
});

test('bulk sync excludes locally decided cards', () => {
  const items = {
    active: { id: 'active' },
    decided: { id: 'decided' },
  };
  const results = {
    decided: { id: 'decided', chosen: 'Approve', answered_at: '2026-07-29T00:00:00Z' },
  };
  assert.deepEqual(syncItems(items, results).map(item => item.id), ['active']);
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
