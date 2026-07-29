#!/usr/bin/env node
// Cloud auto-sync FROM the personal local store. The authenticated cloud and local mirror carry
// the same card set. Each run:
//   1. push every valid unresolved local card to the cloud (upsert by id)
//   2. pull decisions for known local cards and merge only newer, well-formed results
//   node sync-cloud.js            # one sync pass
//   node sync-cloud.js --selftest # offline check of the load-bearing filter
const fs = require('fs');
const path = require('path');

const CLOUD_URL = (process.env.REVIEW_URL || 'https://vault-review-mobile.vercel.app').replace(/\/$/, '');
const HOME = process.env.USERPROFILE || process.env.HOME || __dirname;
const STORE = process.env.LOCAL_STORE_DIR || path.join(HOME, '.docket-local');

function secret() {
  if (process.env.REVIEW_SECRET) return process.env.REVIEW_SECRET.trim();
  const pc = path.join(__dirname, '.passcode.txt');
  if (fs.existsSync(pc)) return fs.readFileSync(pc, 'utf8').trim();
  throw new Error('no passcode: set REVIEW_SECRET or add .passcode.txt next to sync-cloud.js');
}
function readLocal(name) {
  try { const v = JSON.parse(fs.readFileSync(path.join(STORE, name), 'utf8')); return v && typeof v === 'object' ? v : {}; }
  catch { return {}; }
}
function writeLocal(name, obj) {
  fs.mkdirSync(STORE, { recursive: true });
  const dst = path.join(STORE, name), tmp = dst + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, dst);   // atomic swap
}

function syncItems(items, results) {
  const resolved = results && typeof results === 'object' ? results : {};
  return Object.values(items || {}).filter(it =>
    it && typeof it.id === 'string' && it.id.length > 0 &&
    !Object.prototype.hasOwnProperty.call(resolved, it.id)
  );
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
  const items = readLocal('items.json');
  const local = readLocal('results.json');
  const outbound = syncItems(items, local);

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
  const decisionMerge = mergeCloudDecisions(cloudResults, local, items);
  if (decisionMerge.pulled) writeLocal('results.json', decisionMerge.merged);
  return { pushed, pulled: decisionMerge.pulled, refusedDecisions: decisionMerge.refused };
}

if (process.argv.includes('--selftest')) {
  const assert = require('assert');
  const items = { a: { id: 'a', sensitive: false }, b: { id: 'b', sensitive: true }, c: { id: 'c' }, d: { id: 'd', sensitive: 'yes' } };
  assert.deepEqual(syncItems(items).map(x => x.id), ['a', 'b', 'c', 'd'], 'every local card must sync');
  assert.deepEqual(syncItems(items, { b: { id: 'b', archived: true } }).map(x => x.id), ['a', 'c', 'd'], 'resolved local cards must not sync');
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
    .then(r => console.log(`sync: pushed ${r.pushed} card(s), pulled ${r.pulled} decision(s), refused ${r.refusedDecisions} invalid/unknown decision(s)  @ ${CLOUD_URL}`))
    .catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { syncOnce, syncItems, mergeCloudDecisions };
