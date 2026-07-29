const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDocumentStore, createLocalProvider } = require('../api/_document-store');
const { createExport, restoreExport, verifyExport } = require('../api/_transfer');

function fixtureDocuments() {
  return {
    'items.json': {
      r1: { id: 'r1', title: 'Review', options: ['Approve', 'Reject'], submitted_at: '2026-07-29T00:00:00.000Z' },
    },
    'results.json': {
      r1: { id: 'r1', chosen: 'Approve', answered_at: '2026-07-29T00:01:00.000Z' },
    },
    'tickets.json': {
      t1: { id: 't1', title: 'More', notes: '', requested_at: '2026-07-29T00:02:00.000Z' },
    },
    'reads.json': {
      brief1: '2026-07-29T00:03:00.000Z',
    },
  };
}

test('an export contains every authoritative document plus checksummed metadata', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-transfer-'));
  const source = createDocumentStore(createLocalProvider(path.join(root, 'source')));
  for (const [name, document] of Object.entries(fixtureDocuments())) await source.replace(name, document);

  const output = path.join(root, 'export');
  const manifest = await createExport(source, output, { generatedAt: '2026-07-29T01:00:00.000Z' });
  assert.deepEqual(manifest.documents.map(x => x.name).sort(), [
    'items.json', 'reads.json', 'results.json', 'tickets.json',
  ]);
  assert.equal(manifest.documents.every(x => /^[a-f0-9]{64}$/.test(x.sha256)), true);
  assert.equal(verifyExport(output).ok, true);
});

test('a verified export restores completely into an empty disposable target', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-restore-'));
  const source = createDocumentStore(createLocalProvider(path.join(root, 'source')));
  for (const [name, document] of Object.entries(fixtureDocuments())) await source.replace(name, document);
  const output = path.join(root, 'export');
  await createExport(source, output);

  const target = createDocumentStore(createLocalProvider(path.join(root, 'disposable-target')));
  const result = await restoreExport(target, output, { disposable: true });
  assert.equal(result.ok, true);
  for (const [name, document] of Object.entries(fixtureDocuments())) {
    assert.deepEqual(await target.read(name), document);
  }
});

test('restore defaults to a mutation-free dry run and refuses a non-empty target', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-dry-restore-'));
  const source = createDocumentStore(createLocalProvider(path.join(root, 'source')));
  for (const [name, document] of Object.entries(fixtureDocuments())) await source.replace(name, document);
  const output = path.join(root, 'export');
  await createExport(source, output);

  const emptyTarget = createDocumentStore(createLocalProvider(path.join(root, 'empty-target')));
  const dry = await restoreExport(emptyTarget, output);
  assert.equal(dry.dryRun, true);
  assert.deepEqual(await emptyTarget.read('items.json'), {});

  const occupied = createDocumentStore(createLocalProvider(path.join(root, 'occupied')));
  await occupied.replace('items.json', { existing: { id: 'existing', title: 'Keep me' } });
  await assert.rejects(
    restoreExport(occupied, output, { disposable: true }),
    /target is not empty/i
  );
  assert.ok((await occupied.read('items.json')).existing);
});

test('checksum or schema corruption blocks restore before target mutation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-corrupt-'));
  const source = createDocumentStore(createLocalProvider(path.join(root, 'source')));
  for (const [name, document] of Object.entries(fixtureDocuments())) await source.replace(name, document);
  const output = path.join(root, 'export');
  await createExport(source, output);
  fs.writeFileSync(path.join(output, 'reads.json'), JSON.stringify({ brief1: '' }));

  const target = createDocumentStore(createLocalProvider(path.join(root, 'target')));
  await assert.rejects(restoreExport(target, output, { disposable: true }), /checksum|timestamp/i);
  assert.deepEqual(await target.read('items.json'), {});
});
