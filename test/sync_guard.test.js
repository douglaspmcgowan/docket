// The shared Docket authority accepts personal/public cards only.
const { test } = require('node:test');
const assert = require('node:assert');
const { admissible } = require('../api/sync.js');

test('cloud refuses a sensitive-marked card while the local mirror may retain it', () => {
  const card = { id: 'x', title: 'Legacy', sensitive: true };
  assert.equal(admissible(card, true), false);
  assert.equal(admissible(card, false), true);
});
test('cloud accepts a public card and an unmarked card', () => {
  assert.equal(admissible({ id: 'x', title: 'Public', sensitive: false }, true), true);
  assert.equal(admissible({ id: 'x', title: 'Unmarked' }, true), true);
  assert.equal(admissible({ id: 'x', title: 'Public NASA mission update' }, true), true);
});
test('cloud refuses CUI and NASA-internal marker strings anywhere in a card', () => {
  assert.equal(admissible({ id: 'cui', title: 'Review', sections: [{ text: 'CUI//SP-PRVCY' }] }, true), false);
  assert.equal(admissible({ id: 'controlled', title: 'Controlled Unclassified Information' }, true), false);
  assert.equal(admissible({ id: 'internal', title: 'Review', description: 'NASA INTERNAL USE ONLY' }, true), false);
  assert.equal(admissible({ id: 'sbu', title: 'Review', body: 'NASA SENSITIVE BUT UNCLASSIFIED' }, true), false);
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
