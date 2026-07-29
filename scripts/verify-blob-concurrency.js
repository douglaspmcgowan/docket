#!/usr/bin/env node
const crypto = require('node:crypto');
const sdk = require('@vercel/blob');
const {
  createBlobProvider,
  createDocumentStore,
} = require('../api/_document-store');

async function main() {
  const prefix = `verification/docket-cas-${Date.now()}-${crypto.randomUUID()}`;
  const pathname = `${prefix}/results.json`;
  const base = createBlobProvider(sdk, { prefix });
  const seed = createDocumentStore(base);
  await seed.replace('results.json', {});

  let firstWrites = 0;
  let release;
  const bothReady = new Promise(resolve => { release = resolve; });
  const synchronized = {
    read: base.read,
    async write(name, body, version) {
      firstWrites += 1;
      if (firstWrites === 2) release();
      if (firstWrites <= 2) await bothReady;
      return base.write(name, body, version);
    },
  };

  try {
    const store = createDocumentStore(synchronized, { maxAttempts: 5 });
    const outcomes = await Promise.all([
      store.mutate('results.json', document => {
        document.a = { id: 'a', chosen: 'Approve', answered_at: '2026-07-29T01:00:00.000Z' };
        return document;
      }),
      store.mutate('results.json', document => {
        document.b = { id: 'b', chosen: 'Reject', answered_at: '2026-07-29T01:00:01.000Z' };
        return document;
      }),
    ]);
    const final = await store.read('results.json');
    if (!final.a || !final.b || !outcomes.some(outcome => outcome.attempts > 1)) {
      throw new Error('live Blob compare-and-swap verification did not preserve both writers through a retry');
    }
    process.stdout.write(`${JSON.stringify({ ok: true, writers: 2, retryObserved: true })}\n`);
  } finally {
    await sdk.del(pathname);
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
