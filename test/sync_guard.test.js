// The load-bearing safety rule: the cloud board refuses sensitive cards; the local mirror accepts all.
const { test } = require('node:test');
const assert = require('node:assert');
const { admissible } = require('../api/sync.js');

test('cloud refuses a sensitive card', () => {
  assert.equal(admissible({ id: 'x', sensitive: true }, true), false);
});
test('cloud accepts a public card', () => {
  assert.equal(admissible({ id: 'x', sensitive: false }, true), true);
});
test('cloud accepts a legacy card with no sensitive field (backward compat)', () => {
  assert.equal(admissible({ id: 'x' }, true), true);
});
test('local mirror accepts a sensitive card', () => {
  assert.equal(admissible({ id: 'x', sensitive: true }, false), true);
});
test('only a strict true is sensitive (a truthy string does not accidentally block)', () => {
  // guard keys on === true; anything else is treated as non-sensitive so the field can never soft-fail open the other way
  assert.equal(admissible({ id: 'x', sensitive: 'yes' }, true), true);
});
