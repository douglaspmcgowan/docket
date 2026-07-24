// TDD for decision ingest: a decision carries kind:'decision' + its type + type-specific fields
// through to the cloud store, so the UI can render the right structure. Only option-select gets options.
const { test } = require('node:test');
const assert = require('node:assert');
const { buildCard } = require('../enqueue.js');

test('an option-select decision keeps kind:decision, type, and its options', () => {
  const c = buildCard({ kind: 'decision', type: 'option-select', title: 'Pick one',
    options: ['A', 'B', 'C'], now: '2026-01-01T00:00:00.000Z' });
  assert.equal(c.kind, 'decision');
  assert.equal(c.type, 'option-select');
  assert.deepEqual(c.options, ['A', 'B', 'C']);
});

test('a tradeoff decision carries options/criteria/cells and does NOT force Approve/Reject', () => {
  const c = buildCard({ kind: 'decision', type: 'tradeoff', title: 'Weigh it',
    options: [{ id: 'a', label: 'A', summary: 'x' }, { id: 'b', label: 'B', summary: 'y' }],
    criteria: [{ id: 'c1', label: 'cost' }],
    cells: [{ option: 'a', criterion: 'c1', stance: 'supports' }],
    now: '2026-01-01T00:00:00.000Z' });
  assert.equal(c.kind, 'decision');
  assert.equal(c.type, 'tradeoff');
  assert.equal(c.options.length, 2);
  assert.equal(c.criteria.length, 1);
  assert.equal(c.cells.length, 1);
});

test('a reversibility decision carries door / cost_to_reverse / consequences', () => {
  const c = buildCard({ kind: 'decision', type: 'reversibility', title: 'Ship?',
    door: 'one-way', cost_to_reverse: 'high', consequences: ['data migration'], now: '2026-01-01T00:00:00.000Z' });
  assert.equal(c.type, 'reversibility');
  assert.equal(c.door, 'one-way');
  assert.equal(c.cost_to_reverse, 'high');
  assert.deepEqual(c.consequences, ['data migration']);
});

test('a diff decision carries before / after / lang', () => {
  const c = buildCard({ kind: 'decision', type: 'diff', title: 'Change', before: 'a', after: 'b', lang: 'py',
    now: '2026-01-01T00:00:00.000Z' });
  assert.equal(c.before, 'a');
  assert.equal(c.after, 'b');
  assert.equal(c.lang, 'py');
});

test('a reasoning-tree decision carries nodes', () => {
  const c = buildCard({ kind: 'decision', type: 'reasoning-tree', title: 'Tree',
    nodes: [{ id: 'r', label: 'root', status: 'active' }], now: '2026-01-01T00:00:00.000Z' });
  assert.deepEqual(c.nodes, [{ id: 'r', label: 'root', status: 'active' }]);
});

test('a critique decision carries its artifact', () => {
  const c = buildCard({ kind: 'decision', type: 'critique', title: 'Judge',
    artifact: { kind: 'text', content: 'the thing' }, now: '2026-01-01T00:00:00.000Z' });
  assert.equal(c.artifact.kind, 'text');
  assert.equal(c.artifact.content, 'the thing');
});

test('a review (no kind) still defaults options (regression)', () => {
  const c = buildCard({ title: 'plain review' });
  assert.deepEqual(c.options, ['Approve', 'Reject']);
  assert.equal(c.kind, undefined);
});
