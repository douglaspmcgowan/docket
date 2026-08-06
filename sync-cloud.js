#!/usr/bin/env node
// Cloud auto-sync FROM the personal local store. The authenticated cloud and local mirror carry
// the same card set. Each run:
//   1. push every valid unresolved local card to the cloud (upsert by id)
//   2. pull decisions for known local cards and merge only newer, well-formed results
//   node sync-cloud.js            # one sync pass
//   node sync-cloud.js --selftest # offline check of the load-bearing filter
const fs = require('fs');
const path = require('path');
const { cloudAdmissible } = require('./api/_content-guard');
const { requireReviewSecret } = require('./api/_review-secret');

const CLOUD_URL = (process.env.REVIEW_URL || 'https://vault-review-mobile.vercel.app').replace(/\/$/, '');
const HOME = process.env.USERPROFILE || process.env.HOME || __dirname;
const STORE = process.env.LOCAL_STORE_DIR || path.join(HOME, '.docket-local');

const secret = requireReviewSecret;
// The SQLite `documents` table is the authority and api/_store.js is its only sanctioned gateway
// (compare-and-swap updates, flat files mirrored out as a side effect). This script used to carry its
// own readLocal/writeLocal pair that wrote the flat JSON files DIRECTLY, so a cloud pull landed
// answers where the CLI and the API never looked: on 2026-08-06 that left results.json holding 435
// records while the documents row still held 28, and pushes then skipped cards because the two copies
// disagreed about what was resolved. One writer, one authority — hence _store, not fs.
// _store picks its backend at require time, so LOCAL_STORE_DIR is set first: this script syncs the
// LOCAL store up to the cloud over HTTP, so it must bind to the local SQLite provider, never the Blob
// one (which would also drag in @vercel/blob, a dependency this repo does not carry).
process.env.LOCAL_STORE_DIR = STORE;
const store = require('./api/_store');

function selectSyncItems(items, results) {
  const resolved = results && typeof results === 'object' ? results : {};
  const selected = [];
  let refused = 0;
  for (const item of Object.values(items || {})) {
    if (item && typeof item.id === 'string' &&
        Object.prototype.hasOwnProperty.call(resolved, item.id)) {
      continue;
    }
    if (!item || typeof item.id !== 'string' || !item.id || !cloudAdmissible(item)) {
      refused += 1;
      continue;
    }
    selected.push(item);
  }
  return { items: selected, refused };
}

function syncItems(items, results) {
  return selectSyncItems(items, results).items;
}

function mergeCloudDecisions(cloudResults, localResults, localItems) {
  const merged = { ...(localResults || {}) };
  let pulled = 0, refused = 0;
  for (const result of cloudResults || []) {
    if (!result || typeof result.id !== 'string' || !result.id ||
        typeof result.answered_at !== 'string' || !result.answered_at ||
        !localItems || !Object.prototype.hasOwnProperty.call(localItems, result.id)) {
      refused++;
      continue;
    }
    const current = merged[result.id];
    if (!current || String(result.answered_at) > String(current.answered_at || '')) {
      merged[result.id] = result;
      pulled++;
    }
  }
  return { merged, pulled, refused };
}

async function syncOnce() {
  const sec = secret();
  const items = await store.readItems();
  const local = await store.readResults();
  const selection = selectSyncItems(items, local);
  const outbound = selection.items;

  let pushed = 0;
  if (outbound.length) {
    const r = await fetch(CLOUD_URL + '/api/sync?op=push', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + sec, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: outbound }),
    });
    if (!r.ok) throw new Error('cloud push failed ' + r.status + ' ' + await r.text());
    pushed = (await r.json()).pushed || 0;
  }

  // Pull cloud decisions back into the local results store so the superset board shows public cards as
  // answered. Merge: take the cloud result when we have none, or when its answered_at is newer.
  const r2 = await fetch(CLOUD_URL + '/api/sync?op=pull', { headers: { Authorization: 'Bearer ' + sec } });
  if (!r2.ok) throw new Error('cloud pull failed ' + r2.status + ' ' + await r2.text());
  const cloudResults = (await r2.json()).results || [];
  // Merge inside the store's compare-and-swap mutator, against the freshest document rather than the
  // snapshot read at the top of the run, so a concurrent answer cannot be clobbered by this pull.
  let decisionMerge = mergeCloudDecisions(cloudResults, local, items);
  if (decisionMerge.pulled) {
    await store.updateResults(current => {
      decisionMerge = mergeCloudDecisions(cloudResults, current, items);
      return decisionMerge.merged;
    });
  }
  return {
    pushed,
    pulled: decisionMerge.pulled,
    refusedCards: selection.refused,
    refusedDecisions: decisionMerge.refused,
  };
}

if (process.argv.includes('--selftest')) {
  const assert = require('assert');
  const items = { a: { id: 'a', sensitive: false }, b: { id: 'b', sensitive: true }, c: { id: 'c' }, d: { id: 'd', title: 'CUI' } };
  assert.deepEqual(syncItems(items).map(x => x.id), ['a', 'c'], 'only cloud-safe local cards may sync');
  assert.deepEqual(syncItems(items, { c: { id: 'c', archived: true } }).map(x => x.id), ['a'], 'resolved local cards must not sync');
  assert.equal(syncItems({ bad: null, blank: { id: '' } }).length, 0, 'invalid cards must be skipped');
  const guarded = mergeCloudDecisions(
    [{ id: 'a', answered_at: '2026-07-29T00:00:00Z' }, { id: 'unknown', answered_at: '2026-07-29T00:00:00Z' }],
    {},
    items
  );
  assert.equal(guarded.pulled, 1, 'a known decision must merge');
  assert.equal(guarded.refused, 1, 'an unknown decision must be refused');
  console.log('sync-cloud selftest OK');
  process.exit(0);
}

if (require.main === module) {
  syncOnce()
    .then(r => console.log(`sync: pushed ${r.pushed} card(s), refused ${r.refusedCards} unsafe/invalid card(s), pulled ${r.pulled} decision(s), refused ${r.refusedDecisions} invalid/unknown decision(s)  @ ${CLOUD_URL}`))
    .catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { secret, selectSyncItems, syncOnce, syncItems, mergeCloudDecisions };
