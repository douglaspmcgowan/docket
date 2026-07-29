const { test } = require('node:test');
const assert = require('node:assert');
const {
  AUTHORITATIVE_DOCUMENTS,
  DocumentValidationError,
  validateDocument,
  validateItem,
} = require('../api/_schema');

test('the authority consists of exactly four named documents', () => {
  assert.deepEqual(AUTHORITATIVE_DOCUMENTS, [
    'items.json',
    'results.json',
    'tickets.json',
    'reads.json',
  ]);
});

test('a valid review, brief, and structured decision pass item validation', () => {
  const review = { id: 'r1', title: 'Review', options: ['Approve', 'Reject'] };
  const brief = { id: 'b1', kind: 'brief', title: 'Brief', body: '# Body', format: 'md' };
  const tradeoff = {
    id: 'd1',
    kind: 'decision',
    type: 'tradeoff',
    title: 'Choose',
    options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    criteria: [{ id: 'cost', label: 'Cost' }],
    cells: [{ option: 'a', criterion: 'cost', stance: 'supports' }],
  };
  assert.equal(validateItem(review), review);
  assert.equal(validateItem(brief), brief);
  assert.equal(validateItem(tradeoff), tradeoff);
  assert.throws(
    () => validateItem({ ...tradeoff, cells: {} }),
    /cells.*array/i
  );
});

test('malformed items are rejected before they enter the authority', () => {
  assert.throws(
    () => validateItem({ id: 'b1', kind: 'brief', title: 'Brief', body: 'x', src: 'local.md' }),
    DocumentValidationError
  );
  assert.throws(
    () => validateItem({ id: 'd1', kind: 'decision', type: 'tradeoff', title: 'Choose', options: ['only one'] }),
    DocumentValidationError
  );
  assert.throws(
    () => validateItem({ id: 'x', title: '' }),
    DocumentValidationError
  );
});

test('document keys must match record ids and every result has a timestamped outcome', () => {
  assert.throws(
    () => validateDocument('items.json', { wrong: { id: 'right', title: 'Mismatch' } }),
    /key.*id/i
  );
  assert.throws(
    () => validateDocument('results.json', { x: { id: 'x', chosen: 'Approve' } }),
    /answered_at/i
  );
  assert.deepEqual(
    validateDocument('results.json', {
      x: { id: 'x', chosen: null, comment: 'Needs work', answered_at: '2026-07-29T00:00:00.000Z' },
    }),
    { x: { id: 'x', chosen: null, comment: 'Needs work', answered_at: '2026-07-29T00:00:00.000Z' } }
  );
});

test('invalid stored JSON is surfaced as corruption rather than becoming an empty map', () => {
  assert.throws(
    () => validateDocument('reads.json', { b1: '' }),
    /timestamp/i
  );
  assert.throws(
    () => validateDocument('unknown.json', {}),
    /unknown authoritative document/i
  );
});
