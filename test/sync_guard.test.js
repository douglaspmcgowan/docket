// Personal Docket publishes every valid card through an authenticated endpoint.
const { test } = require('node:test');
const assert = require('node:assert');
const { admissible } = require('../api/sync.js');

test('cloud accepts a legacy sensitive-marked card', () => {
  assert.equal(admissible({ id: 'x', title: 'Legacy', sensitive: true }, true), true);
});
test('cloud accepts a public card and an unmarked card', () => {
  assert.equal(admissible({ id: 'x', title: 'Public', sensitive: false }, true), true);
  assert.equal(admissible({ id: 'x', title: 'Unmarked' }, true), true);
});
test('invalid cards are refused', () => {
  assert.equal(admissible(null, true), false);
  assert.equal(admissible({}, true), false);
  assert.equal(admissible({ id: '' }, true), false);
  assert.equal(admissible({ id: 'missing-title' }, true), false);
  assert.equal(admissible({ id: 'bad-brief', kind: 'brief', title: 'Bad', body: 'x', src: 'x.md' }, true), false);
  assert.equal(admissible({
    id: 'bad-tradeoff',
    kind: 'decision',
    type: 'tradeoff',
    title: 'Bad',
    options: ['Only one'],
  }, true), false);
});
