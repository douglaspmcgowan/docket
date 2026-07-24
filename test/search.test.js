// TDD for the search ranking across the item dataset. Pure, shared with the browser (public/search.js).
const { test } = require('node:test');
const assert = require('node:assert');
const { searchItems } = require('../public/search.js');

const items = [
  { id: 'a', title: 'Reviewer app parity', project: 'cad-forge', set: 'PRDs', tags: [{ text: 'ux' }],
    description: 'the reviewer needs option parity with the desktop' },
  { id: 'b', kind: 'brief', title: 'Weekly notes', project: 'cad-forge', set: 'logs',
    body: 'nothing about parity here at all, just a mention of the reviewer once' },
  { id: 'c', title: 'Bolt pattern', project: 'truss', filepath: 'C:\\proj\\bolt_patterns.py',
    description: 'unrelated' },
];

test('empty query returns all items unchanged', () => {
  const r = searchItems(items, '');
  assert.equal(r.length, items.length);
});

test('a title match outranks a body-only match for the same term', () => {
  const r = searchItems(items, 'parity');
  assert.equal(r[0].item.id, 'a', 'title+desc match ranks first');
  assert.ok(r.some(x => x.item.id === 'b'), 'body match still included');
  assert.ok(r.find(x => x.item.id === 'a').score > r.find(x => x.item.id === 'b').score);
});

test('search is case-insensitive', () => {
  assert.equal(searchItems(items, 'REVIEWER').length, searchItems(items, 'reviewer').length);
  assert.ok(searchItems(items, 'REVIEWER').length >= 2);
});

test('multi-token query requires ALL tokens to match somewhere (AND)', () => {
  const r = searchItems(items, 'reviewer parity');
  assert.ok(r.every(x => x.item.id !== 'c'), 'c has neither term');
  assert.ok(r.some(x => x.item.id === 'a'));
});

test('a project/set/tag match counts', () => {
  assert.ok(searchItems(items, 'cad-forge').length >= 2);
  assert.ok(searchItems(items, 'ux').some(x => x.item.id === 'a'));
});

test('a filepath match is findable', () => {
  const r = searchItems(items, 'bolt_patterns');
  assert.equal(r[0].item.id, 'c');
});

test('a query matching nothing returns empty', () => {
  assert.equal(searchItems(items, 'zzzznomatch').length, 0);
});

test('results carry which fields matched (for highlighting)', () => {
  const top = searchItems(items, 'parity')[0];
  assert.ok(Array.isArray(top.fields));
  assert.ok(top.fields.includes('title'));
});
