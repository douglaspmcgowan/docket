// TDD for briefs ingest (cloud). A brief ships its content INLINE (the cloud can't read a local
// file), keeps the original filepath as copyable metadata, and never gets forced review options.
const { test } = require('node:test');
const assert = require('node:assert');
const { buildCard, resolveBriefBody } = require('../enqueue.js');

test('a brief envelope has kind:brief and no forced options', () => {
  const c = buildCard({ kind: 'brief', title: 'A brief', body: '# Hi', format: 'md', now: '2026-01-01T00:00:00.000Z' });
  assert.equal(c.kind, 'brief');
  assert.equal(c.body, '# Hi');
  assert.equal(c.format, 'md');
  assert.equal(c.options, undefined, 'a brief must NOT default to Approve/Reject');
});

test('a brief can embed answerable cards (FR-038): embeds pass through', () => {
  const c = buildCard({
    kind: 'brief', title: 'Brief with a decision', body: 'read then decide',
    embeds: [
      { id: 'e1', title: 'Approve the plan?', options: ['Approve', 'Reject'] },
      { id: 'e2', kind: 'decision', type: 'reversibility', title: 'One-way?', door: 'one-way' },
    ],
    now: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(c.kind, 'brief');
  assert.equal(Array.isArray(c.embeds), true);
  assert.equal(c.embeds.length, 2);
  assert.equal(c.embeds[0].id, 'e1');
  assert.equal(c.embeds[1].type, 'reversibility');
});

test('a brief with no embeds has no embeds field', () => {
  const c = buildCard({ kind: 'brief', title: 'plain', body: 'x', now: '2026-01-01T00:00:00.000Z' });
  assert.equal(c.embeds, undefined);
});

test('a review still defaults its options (regression)', () => {
  const c = buildCard({ title: 'Ship it?' });
  assert.deepEqual(c.options, ['Approve', 'Reject']);
  assert.notEqual(c.kind, 'brief');
});

test('a brief carries filepath, source, project, set, tags', () => {
  const c = buildCard({
    kind: 'brief', title: 'B', body: 'x', format: 'md',
    filepath: 'C:\\notes\\b.md', source: 'proj: set', project: 'proj', set: 'set',
    now: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(c.filepath, 'C:\\notes\\b.md');
  assert.equal(c.project, 'proj');
  assert.equal(c.set, 'set');
});

test('resolveBriefBody inlines a src file and records its filepath + format', () => {
  const stub = (p) => (p === 'C:\\notes\\report.md' ? '# Report\n\nBody text.' : null);
  const out = resolveBriefBody({ kind: 'brief', title: 'R', src: 'C:\\notes\\report.md' }, stub);
  assert.equal(out.body, '# Report\n\nBody text.');
  assert.equal(out.format, 'md');
  assert.equal(out.filepath, 'C:\\notes\\report.md');
  assert.equal(out.src, undefined, 'src is consumed into body; not shipped as a path the cloud cannot read');
});

test('resolveBriefBody derives html format from a .html src', () => {
  const stub = () => '<h1>Hi</h1>';
  const out = resolveBriefBody({ kind: 'brief', title: 'H', src: 'C:\\notes\\page.html' }, stub);
  assert.equal(out.format, 'html');
});

test('resolveBriefBody throws if the src file is missing', () => {
  assert.throws(() => resolveBriefBody({ kind: 'brief', title: 'M', src: 'C:\\nope.md' }, () => null));
});

test('resolveBriefBody leaves an inline-body brief untouched', () => {
  const b = { kind: 'brief', title: 'I', body: 'already inline', format: 'md' };
  const out = resolveBriefBody(b, () => { throw new Error('should not read'); });
  assert.equal(out.body, 'already inline');
});
