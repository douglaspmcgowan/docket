const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDocumentStore, createLocalProvider } = require('../api/_document-store');
const { createExport, verifyExport } = require('../api/_transfer');
const {
  applyRetention,
  createSnapshot,
  planRetention,
} = require('../api/_retention');

async function sourceStore(root) {
  const store = createDocumentStore(createLocalProvider(root));
  await store.replace('items.json', {
    x: { id: 'x', title: 'Card', options: ['Approve', 'Reject'] },
  });
  for (const name of ['results.json', 'tickets.json', 'reads.json']) await store.replace(name, {});
  return store;
}

async function addExport(store, root, generatedAt) {
  const name = generatedAt.replace(/[:.]/g, '-');
  const destination = path.join(root, name);
  await createExport(store, destination, { generatedAt });
  return destination;
}

test('retention keeps the union of 3 UTC daily, 4 ISO-weekly, and 3 monthly buckets', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-retention-'));
  const snapshots = path.join(root, 'snapshots');
  const store = await sourceStore(path.join(root, 'source'));
  const dates = [
    '2026-07-29T12:00:00.000Z',
    '2026-07-28T12:00:00.000Z',
    '2026-07-27T12:00:00.000Z',
    '2026-07-26T12:00:00.000Z',
    '2026-07-20T12:00:00.000Z',
    '2026-07-13T12:00:00.000Z',
    '2026-07-06T12:00:00.000Z',
    '2026-06-30T12:00:00.000Z',
    '2026-06-01T12:00:00.000Z',
    '2026-05-31T12:00:00.000Z',
    '2026-05-01T12:00:00.000Z',
    '2026-04-30T12:00:00.000Z',
  ];
  for (const date of dates) await addExport(store, snapshots, date);

  const plan = planRetention(snapshots, { daily: 3, weekly: 4, monthly: 3 });
  assert.deepEqual(plan.keep.map(item => item.generatedAt), [
    '2026-07-29T12:00:00.000Z',
    '2026-07-28T12:00:00.000Z',
    '2026-07-27T12:00:00.000Z',
    '2026-07-26T12:00:00.000Z',
    '2026-07-13T12:00:00.000Z',
    '2026-07-06T12:00:00.000Z',
    '2026-06-30T12:00:00.000Z',
    '2026-05-31T12:00:00.000Z',
  ]);
  assert.equal(plan.remove.length, 4);
  assert.equal(plan.keep[0].generatedAt, dates[0], 'newest verified snapshot must survive');

  const dryRun = applyRetention(plan, { dryRun: true });
  assert.equal(dryRun.removed.length, 0);
  assert.equal(dryRun.wouldRemove.length, 4);
  assert.equal(plan.remove.every(item => fs.existsSync(item.path)), true);

  const applied = applyRetention(plan);
  assert.equal(applied.removed.length, 4);
  assert.equal(plan.remove.every(item => !fs.existsSync(item.path)), true);
});

test('snapshot creates a timestamped verified export and can prove pruning without deleting', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-snapshot-'));
  const snapshots = path.join(root, 'snapshots');
  const store = await sourceStore(path.join(root, 'source'));
  await addExport(store, snapshots, '2026-07-28T12:00:00.000Z');

  const result = await createSnapshot(store, snapshots, {
    generatedAt: '2026-07-29T12:00:00.000Z',
    daily: 1,
    weekly: 0,
    monthly: 0,
    pruneDryRun: true,
  });

  assert.equal(verifyExport(result.snapshotPath).ok, true);
  assert.equal(result.pruning.wouldRemove.length, 1);
  assert.equal(fs.readdirSync(snapshots).length, 2);
});

test('all-zero retention still preserves the newest verified recovery point', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-zero-retention-'));
  const snapshots = path.join(root, 'snapshots');
  const store = await sourceStore(path.join(root, 'source'));
  await addExport(store, snapshots, '2026-07-28T12:00:00.000Z');
  await addExport(store, snapshots, '2026-07-29T12:00:00.000Z');

  const plan = planRetention(snapshots, { daily: 0, weekly: 0, monthly: 0 });
  assert.deepEqual(plan.keep.map(item => item.generatedAt), ['2026-07-29T12:00:00.000Z']);
  assert.equal(plan.remove.length, 1);
});

test('retention rejects a linked snapshot entry before pruning', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-retention-link-'));
  const snapshots = path.join(root, 'snapshots');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(snapshots);
  fs.mkdirSync(outside);
  const link = path.join(snapshots, 'linked');
  try {
    fs.symlinkSync(outside, link, 'junction');
  } catch (error) {
    t.skip(`junction creation unavailable: ${error.code || error.message}`);
    return;
  }
  assert.throws(
    () => planRetention(snapshots, { daily: 3, weekly: 4, monthly: 3 }),
    /linked|reparse|symbolic/i
  );
});
