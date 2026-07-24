// TDD for cross-device brief read-state: a pure toggle over the reads map (id -> iso when read).
const { test } = require('node:test');
const assert = require('node:assert');
const { toggleRead } = require('../api/_reads');

test('marking read adds a timestamp', () => {
  const r = toggleRead({}, { id: 'b1', read: true }, '2026-07-21T00:00:00Z');
  assert.equal(r.changed, true);
  assert.equal(r.reads.b1, '2026-07-21T00:00:00Z');
});

test('marking read is idempotent (no change if already read)', () => {
  const r = toggleRead({ b1: '2026-07-20T00:00:00Z' }, { id: 'b1', read: true }, '2026-07-21T00:00:00Z');
  assert.equal(r.changed, false);
  assert.equal(r.reads.b1, '2026-07-20T00:00:00Z');   // original stamp preserved
});

test('marking unread removes the id', () => {
  const r = toggleRead({ b1: 'x', b2: 'y' }, { id: 'b1', read: false });
  assert.equal(r.changed, true);
  assert.equal('b1' in r.reads, false);
  assert.equal(r.reads.b2, 'y');
});

test('unread on an already-unread id is a no-op', () => {
  const r = toggleRead({ b2: 'y' }, { id: 'b1', read: false });
  assert.equal(r.changed, false);
});

test('a missing id is rejected', () => {
  const r = toggleRead({}, { read: true });
  assert.equal(r.error, 400);
});
