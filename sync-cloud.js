#!/usr/bin/env node
// Cloud auto-sync FROM the local store. The local mirror (~/.docket-local) is the single source of
// truth (the superset); the cloud holds only the non-sensitive subset. Each run:
//   1. push every EXPLICITLY-public local card (sensitive===false) up to the cloud (upsert by id)
//   2. pull the cloud's decisions back down, merged into the local results store
// A card reaches the cloud ONLY if it is explicitly sensitive:false. Unmarked/legacy cards (no field)
// are treated as SENSITIVE (fail-safe) and never leave the machine — stricter than the cloud's own
// backward-compat guard on purpose, because pre-flag cards' sensitivity is unknown.
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

// Pure, load-bearing: which local items may go to the cloud — ONLY explicitly non-sensitive ones.
// sensitive===true (sensitive) and sensitive==null (unmarked/legacy, unknown => fail-safe) are withheld.
function publicItems(items) {
  return Object.values(items || {}).filter(it => it && it.sensitive === false);
}

async function syncOnce() {
  const sec = secret();
  const pub = publicItems(readLocal('items.json'));

  let pushed = 0;
  if (pub.length) {
    const r = await fetch(CLOUD_URL + '/api/sync?op=push', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + sec, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: pub }),
    });
    if (!r.ok) throw new Error('cloud push failed ' + r.status + ' ' + await r.text());
    pushed = (await r.json()).pushed || 0;
  }

  // Pull cloud decisions back into the local results store so the superset board shows public cards as
  // answered. Merge: take the cloud result when we have none, or when its answered_at is newer.
  const r2 = await fetch(CLOUD_URL + '/api/sync?op=pull', { headers: { Authorization: 'Bearer ' + sec } });
  if (!r2.ok) throw new Error('cloud pull failed ' + r2.status + ' ' + await r2.text());
  const cloudResults = (await r2.json()).results || [];
  const local = readLocal('results.json');
  let pulled = 0;
  for (const res of cloudResults) {
    if (!res || typeof res.id !== 'string') continue;
    const cur = local[res.id];
    if (!cur || String(res.answered_at || '') > String(cur.answered_at || '')) { local[res.id] = res; pulled++; }
  }
  if (pulled) writeLocal('results.json', local);
  return { pushed, pulled };
}
// ponytail: upsert-only — a card deleted/archived locally isn't removed from the cloud. Add a delete
// pass only if stale cloud cards ever become a problem.

if (process.argv.includes('--selftest')) {
  const assert = require('assert');
  const items = { a: { id: 'a', sensitive: false }, b: { id: 'b', sensitive: true }, c: { id: 'c' }, d: { id: 'd', sensitive: 'yes' } };
  const pub = publicItems(items).map(x => x.id);
  assert.deepEqual(pub, ['a'], 'only explicit sensitive===false may sync to cloud; got ' + JSON.stringify(pub));
  assert.equal(publicItems({}).length, 0, 'empty store -> nothing to push');
  console.log('sync-cloud selftest OK');
  process.exit(0);
}

if (require.main === module) {
  syncOnce()
    .then(r => console.log(`sync: pushed ${r.pushed} public card(s), pulled ${r.pulled} decision(s)  @ ${CLOUD_URL}`))
    .catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { syncOnce, publicItems };
