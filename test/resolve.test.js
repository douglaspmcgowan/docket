// Tests for the pure submit-resolution logic (decision / archive / comment-only).
// Run: node --test
const { test } = require('node:test');
const assert = require('node:assert');
const { resolveResult } = require('../api/_resolve');

const item = { id: 'x', options: ['Approve', 'Reject'] };

test('a decision records chosen + notes', () => {
  const r = resolveResult({ id: 'x', chosen: 'Approve', notes: 'looks good' }, item);
  assert.equal(r.error, undefined);
  assert.equal(r.result.chosen, 'Approve');
  assert.equal(r.result.notes, 'looks good');
  assert.equal(typeof r.result.answered_at, 'string');
});

test('a chosen option not in the declared options is rejected', () => {
  const r = resolveResult({ id: 'x', chosen: 'Maybe' }, item);
  assert.equal(r.error, 400);
  assert.equal(r.result, undefined);
});

test('archive records archived:true with no chosen', () => {
  const r = resolveResult({ id: 'x', archived: true }, item);
  assert.equal(r.error, undefined);
  assert.equal(r.result.archived, true);
  assert.equal(r.result.chosen, undefined);
});

test('comment-only (notes, no chosen) records chosen:null + comment', () => {
  const r = resolveResult({ id: 'x', notes: 'needs a second pass' }, item);
  assert.equal(r.error, undefined);
  assert.equal(r.result.chosen, null);
  assert.equal(r.result.comment, 'needs a second pass');
});

test('comment-only with an empty note is rejected', () => {
  const r = resolveResult({ id: 'x', notes: '' }, item);
  assert.equal(r.error, 400);
  assert.equal(r.result, undefined);
});

test('a missing id is rejected', () => {
  const r = resolveResult({ chosen: 'Approve' }, item);
  assert.equal(r.error, 400);
});

test('an item with no declared options accepts any chosen', () => {
  const r = resolveResult({ id: 'x', chosen: 'Whatever' }, { id: 'x' });
  assert.equal(r.error, undefined);
  assert.equal(r.result.chosen, 'Whatever');
});

test('action:more resolves the card with a more action (bypasses option validation)', () => {
  const r = resolveResult({ id: 'x', action: 'more', notes: 'go deeper on the tradeoffs' }, item);
  assert.equal(r.error, undefined);
  assert.equal(r.result.action, 'more');
  assert.equal(r.result.notes, 'go deeper on the tradeoffs');
  assert.ok(r.result.answered_at);
});

test('action:more needs no note (it clears the card either way)', () => {
  const r = resolveResult({ id: 'x', action: 'more' }, item);
  assert.equal(r.error, undefined);
  assert.equal(r.result.action, 'more');
});

test('object options (a tradeoff) validate by label', () => {
  const tradeoff = { id: 'x', options: [{ id: 'a', label: 'Option A' }, { id: 'b', label: 'Option B' }] };
  assert.equal(resolveResult({ id: 'x', chosen: 'Option A' }, tradeoff).error, undefined);
  assert.equal(resolveResult({ id: 'x', chosen: 'Nope' }, tradeoff).error, 400);
});
