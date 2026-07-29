// Personal Docket publishes every valid card through an authenticated endpoint.
const { test } = require('node:test');
const assert = require('node:assert');
const { admissible } = require('../api/sync.js');

test('cloud accepts a legacy sensitive-marked card', () => {
  assert.equal(admissible({ id: 'x', sensitive: true }, true), true);
});
test('cloud accepts a public card and an unmarked card', () => {
  assert.equal(admissible({ id: 'x', sensitive: false }, true), true);
  assert.equal(admissible({ id: 'x' }, true), true);
});
test('invalid cards are refused', () => {
  assert.equal(admissible(null, true), false);
  assert.equal(admissible({}, true), false);
  assert.equal(admissible({ id: '' }, true), false);
});
