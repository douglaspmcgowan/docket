#!/usr/bin/env node
const path = require('node:path');
const {
  createBlobProvider,
  createDocumentStore,
  createLocalProvider,
} = require('../api/_document-store');
const { createExport, restoreExport, verifyExport } = require('../api/_transfer');

function parse(argv) {
  const options = { action: argv[0] || '' };
  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--disposable') options.disposable = true;
    else if (argument === '--backend') options.backend = argv[++index];
    else if (argument === '--store-dir') options.storeDir = argv[++index];
    else if (argument === '--output') options.output = argv[++index];
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
  if (!['inspect', 'export', 'verify', 'restore'].includes(options.action)) {
    throw new Error('action must be inspect, export, verify, or restore');
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
