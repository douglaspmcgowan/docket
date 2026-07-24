// TDD for canonical projects/sets: list distinct groups, and rename a project or set by writing
// explicit project/set fields onto every matching item (which also de-dups source-only grouping).
const { test } = require('node:test');
const assert = require('node:assert');
const { listGroups, remapGroup, classifyItem } = require('../api/_groups');

const sample = () => [
  { id: '1', title: 'a', project: 'cad-forge', set: 'schema' },
  { id: '2', title: 'b', project: 'cad-forge', set: 'git' },
  { id: '3', title: 'c', source: 'cad-forge: schema' },      // grouped only via source
  { id: '4', title: 'd', project: 'text-to-truss' },          // project-level, no set
];

test('listGroups returns distinct projects with their sets and counts', () => {
  const g = listGroups(sample());
  assert.equal(g.length, 2);
  const cad = g.find(x => x.project === 'cad-forge');
  assert.deepEqual(cad.sets, ['git', 'schema']);
  assert.equal(cad.count, 3);
});

test('listGroups accepts an id->item map too', () => {
  const map = Object.fromEntries(sample().map(i => [i.id, i]));
  assert.equal(listGroups(map).length, 2);
});

test('rename a set writes the new set onto matching items (incl. source-only ones)', () => {
  const items = sample();
  const { changed } = remapGroup(items, { project: 'cad-forge', set: 'schema', toSet: 'schemas' });
  assert.equal(changed, 2);                       // id 1 (explicit) + id 3 (source-only)
  assert.equal(items.find(i => i.id === '1').set, 'schemas');
  assert.equal(items.find(i => i.id === '3').set, 'schemas');
  assert.equal(items.find(i => i.id === '3').project, 'cad-forge'); // project pinned canonical
  assert.equal(items.find(i => i.id === '2').set, 'git');           // untouched
});

test('rename a project rewrites every item in it, sets included', () => {
  const items = sample();
  const { changed } = remapGroup(items, { project: 'cad-forge', toProject: 'cadforge' });
  assert.equal(changed, 3);
  assert.equal(items.find(i => i.id === '1').project, 'cadforge');
  assert.equal(items.find(i => i.id === '3').project, 'cadforge');
  assert.equal(items.find(i => i.id === '4').project, 'text-to-truss');
});

test('renaming a set to an existing name merges (both land under one set)', () => {
  const items = sample();
  remapGroup(items, { project: 'cad-forge', set: 'schema', toSet: 'git' });
  const g = listGroups(items).find(x => x.project === 'cad-forge');
  assert.deepEqual(g.sets, ['git']);
});

test('clearing a set (toSet:"") moves items to project-level', () => {
  const items = sample();
  remapGroup(items, { project: 'cad-forge', set: 'schema', toSet: '' });
  assert.equal(items.find(i => i.id === '1').set, undefined);
});

test('a spec with no project changes nothing', () => {
  const items = sample();
  assert.equal(remapGroup(items, {}).changed, 0);
});
