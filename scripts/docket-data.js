#!/usr/bin/env node
const path = require('node:path');
const {
  createBlobProvider,
  createDocumentStore,
  createLocalProvider,
} = require('../api/_document-store');
const { createExport, restoreExport, verifyExport } = require('../api/_transfer');
const { createSnapshot } = require('../api/_retention');

function parse(argv) {
  const options = { action: argv[0] || '' };
  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--disposable') options.disposable = true;
    else if (argument === '--prune-dry-run') options.pruneDryRun = true;
    else if (argument === '--backend') options.backend = argv[++index];
    else if (argument === '--store-dir') options.storeDir = argv[++index];
    else if (argument === '--output') options.output = argv[++index];
    else if (argument === '--generated-at') options.generatedAt = argv[++index];
    else if (argument === '--daily') options.daily = Number(argv[++index]);
    else if (argument === '--weekly') options.weekly = Number(argv[++index]);
    else if (argument === '--monthly') options.monthly = Number(argv[++index]);
    else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function createStore(options) {
  const backend = options.backend || 'local';
  if (backend === 'cloud') return createDocumentStore(createBlobProvider());
  if (backend !== 'local') throw new Error(`unsupported backend: ${backend}`);
  const root = options.storeDir || process.env.LOCAL_STORE_DIR;
  if (!root) throw new Error('--store-dir or LOCAL_STORE_DIR is required for the local backend');
  return createDocumentStore(createLocalProvider(path.resolve(root)));
}

function summarize(records, extra = {}) {
  return JSON.stringify({ ok: true, ...extra, records });
}

async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (!['inspect', 'export', 'snapshot', 'verify', 'restore'].includes(options.action)) {
    throw new Error('action must be inspect, export, snapshot, verify, or restore');
  }
  if (options.action === 'verify') {
    if (!options.output) throw new Error('--output is required');
    const result = verifyExport(path.resolve(options.output));
    process.stdout.write(`${summarize(result.records, { action: 'verify' })}\n`);
    return;
  }
  if (options.action === 'restore' && options.backend === 'cloud') {
    throw new Error('cloud restore is disabled; verify with a dry run and restore into a disposable local target');
  }
  const store = createStore(options);
  if (options.action === 'inspect') {
    const documents = await store.readAll();
    const records = Object.fromEntries(Object.entries(documents).map(([name, document]) => [name, Object.keys(document).length]));
    process.stdout.write(`${summarize(records, { action: 'inspect' })}\n`);
    return;
  }
  if (!options.output) throw new Error('--output is required');
  const output = path.resolve(options.output);
  if (options.action === 'export') {
    const manifest = await createExport(store, output);
    const records = Object.fromEntries(manifest.documents.map(document => [document.name, document.records]));
    process.stdout.write(`${summarize(records, { action: 'export', output })}\n`);
    return;
  }
  if (options.action === 'snapshot') {
    const result = await createSnapshot(store, output, {
      generatedAt: options.generatedAt,
      daily: options.daily,
      weekly: options.weekly,
      monthly: options.monthly,
      pruneDryRun: options.pruneDryRun,
    });
    const verification = verifyExport(result.snapshotPath);
    process.stdout.write(`${summarize(verification.records, {
      action: 'snapshot',
      output: result.snapshotPath,
      retention: {
        daily: options.daily == null ? 3 : options.daily,
        weekly: options.weekly == null ? 4 : options.weekly,
        monthly: options.monthly == null ? 3 : options.monthly,
      },
      pruning: {
        removed: result.pruning.removed.length,
        wouldRemove: result.pruning.wouldRemove.length,
        protected: result.protected.length,
      },
    })}\n`);
    return;
  }
  const restored = await restoreExport(store, output, { disposable: options.disposable === true });
  process.stdout.write(`${summarize(restored.records, {
    action: 'restore',
    dryRun: restored.dryRun,
  })}\n`);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, parse };
