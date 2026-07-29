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

test('export verification rejects any extra file or non-plain inventory entry', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-exact-export-'));
  const source = createDocumentStore(createLocalProvider(path.join(root, 'source')));
  for (const [name, document] of Object.entries(fixtureDocuments())) await source.replace(name, document);

  const extraFileExport = path.join(root, 'extra-file');
  await createExport(source, extraFileExport);
  fs.writeFileSync(path.join(extraFileExport, 'unrelated.txt'), 'keep');
  assert.throws(() => verifyExport(extraFileExport), /exactly|inventory|plain file/i);

  const directoryExport = path.join(root, 'directory-entry');
  await createExport(source, directoryExport);
  fs.mkdirSync(path.join(directoryExport, 'unexpected-directory'));
  assert.throws(() => verifyExport(directoryExport), /exactly|inventory|plain file/i);
});

test('export verification rejects a linked or reparse-like inventory entry', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-linked-export-'));
  const source = createDocumentStore(createLocalProvider(path.join(root, 'source')));
  for (const [name, document] of Object.entries(fixtureDocuments())) await source.replace(name, document);
  const output = path.join(root, 'export');
  await createExport(source, output);
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  fs.rmSync(path.join(output, 'reads.json'));
  try {
    fs.symlinkSync(outside, path.join(output, 'reads.json'), 'junction');
  } catch (error) {
    t.skip(`junction creation unavailable: ${error.code || error.message}`);
    return;
  }
  assert.throws(() => verifyExport(output), /plain file|linked|reparse/i);
});

test('export verification rejects a linked or reparse-like snapshot root', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-linked-export-root-'));
  const source = createDocumentStore(createLocalProvider(path.join(root, 'source')));
  for (const [name, document] of Object.entries(fixtureDocuments())) await source.replace(name, document);
  const realOutput = path.join(root, 'real-export');
  await createExport(source, realOutput);
  const linkedOutput = path.join(root, 'linked-export');
  try {
    fs.symlinkSync(realOutput, linkedOutput, 'junction');
  } catch (error) {
    t.skip(`junction creation unavailable: ${error.code || error.message}`);
    return;
  }
  assert.throws(() => verifyExport(linkedOutput), /snapshot root|export root|linked|reparse/i);
});

test('an export retries until all authoritative versions remain stable across assembly', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-stable-export-'));
  const documents = fixtureDocuments();
  let reads = 0;
  const store = {
    async readVersioned(name) {
      reads += 1;
      let version = 'v2';
      if (reads <= 4) version = 'v1';
      else if (reads <= 8) version = name === 'items.json' ? 'v2' : 'v1';
      return { document: documents[name], version };
    },
  };

  const output = path.join(root, 'export');
  const manifest = await createExport(store, output, {
    generatedAt: '2026-07-29T01:00:00.000Z',
    maxSnapshotAttempts: 3,
  });

  assert.equal(reads, 16);
  assert.equal(manifest.documents.every(entry => entry.source_version === 'v2'), true);
  assert.equal(verifyExport(output).ok, true);
});

test('an unstable authority publishes no target-visible partial export', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-unstable-export-'));
  const documents = fixtureDocuments();
  let reads = 0;
  const store = {
    async readVersioned(name) {
      reads += 1;
      return {
        document: documents[name],
        version: `v${Math.ceil(reads / 4)}`,
      };
    },
  };

  const output = path.join(root, 'export');
  await assert.rejects(
    createExport(store, output, { maxSnapshotAttempts: 2 }),
    /stable snapshot.*2 attempts/i
  );
  assert.equal(fs.existsSync(output), false);
  assert.deepEqual(
    fs.readdirSync(root).filter(name => name.includes('.building-')),
    []
  );
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

  const physicallyOccupiedRoot = path.join(root, 'physically-occupied');
  fs.mkdirSync(physicallyOccupiedRoot);
  fs.writeFileSync(path.join(physicallyOccupiedRoot, 'unrelated.txt'), 'preserve');
  const physicallyOccupied = createDocumentStore(createLocalProvider(physicallyOccupiedRoot));
  await assert.rejects(
    restoreExport(physicallyOccupied, output, { disposable: true }),
    /target is not (physically )?empty/i
  );
  assert.equal(fs.readFileSync(path.join(physicallyOccupiedRoot, 'unrelated.txt'), 'utf8'), 'preserve');
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
