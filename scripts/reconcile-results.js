#!/usr/bin/env node
// Reconcile the results divergence created by sync-cloud.js's old direct-to-flat-file writer.
//
//   node scripts/reconcile-results.js              # dry run: report only, writes nothing
//   node scripts/reconcile-results.js --apply      # perform it (backs up both surfaces first)
//
// WHY THIS IS NOT A STRAIGHT "TAKE THE BIGGER FILE" MERGE
// ------------------------------------------------------
// On 2026-08-06 the flat results.json held 435 records and the authoritative `documents` row held 28.
// The flat file is newer, but it is not simply "more complete": 391 of its 407 extra records are
// ARCHIVE records for the very cards that were then restored to the board (they match
// backups/pending-cloud-unarchive-*.txt id for id). Importing them wholesale would re-hide every one
// of those cards — undoing the restore rather than repairing the store.
//
// So the reconciliation splits the extra records by what they actually are:
//   * genuine answers (chosen / comment / action) -> imported into the store; these are real review
//     decisions that exist only in the flat file and would otherwise be lost.
//   * archive records for ids queued to be unarchived -> dropped, so both surfaces agree the card is
//     pending, which is the state the restore is aiming for.
//   * anything else -> imported, since an unexplained result is safer kept than silently discarded.
//
// Afterwards both surfaces are written through api/_store, so the documents row and the flat mirror
// agree by construction.
const fs = require('fs');
const path = require('path');

const HOME = process.env.USERPROFILE || process.env.HOME;
const STORE = process.env.LOCAL_STORE_DIR || path.join(HOME, '.docket-local');
process.env.LOCAL_STORE_DIR = STORE;
const store = require('../api/_store');

const APPLY = process.argv.includes('--apply');
const QUEUE = process.argv.includes('--queue')
  ? process.argv[process.argv.indexOf('--queue') + 1]
  : path.join(STORE, 'backups', 'pending-cloud-unarchive-2026-08-06.txt');

const isAnswer = r => !!(r && (r.chosen || r.comment != null || r.action));

function readFlat() {
  try { return JSON.parse(fs.readFileSync(path.join(STORE, 'results.json'), 'utf8')); }
  catch { return {}; }
}

async function main() {
  const flat = readFlat();
  const authoritative = await store.readResults();
  const queued = new Set(fs.existsSync(QUEUE)
    ? fs.readFileSync(QUEUE, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    : []);

  const extra = Object.keys(flat).filter(id => !(id in authoritative));
  const importAnswers = [], dropArchives = [], importOther = [];
  for (const id of extra) {
    const r = flat[id];
    if (isAnswer(r)) importAnswers.push(id);
    else if (r && r.archived && queued.has(id)) dropArchives.push(id);
    else importOther.push(id);
  }

  const next = { ...authoritative };
  for (const id of [...importAnswers, ...importOther]) next[id] = flat[id];

  console.log('store dir                     :', STORE);
  console.log('unarchive queue               :', fs.existsSync(QUEUE) ? `${queued.size} ids` : '(none found)');
  console.log('');
  console.log('BEFORE  documents row         :', Object.keys(authoritative).length);
  console.log('BEFORE  flat results.json     :', Object.keys(flat).length);
  console.log('');
  console.log('extra records only in flat    :', extra.length);
  console.log('  -> import (real answers)    :', importAnswers.length);
  console.log('  -> import (unclassified)    :', importOther.length);
  console.log('  -> drop (archives queued to be unarchived):', dropArchives.length);
  console.log('');
  console.log('AFTER   both surfaces         :', Object.keys(next).length);
  if (importAnswers.length) {
    console.log('\nanswers that would be rescued from the flat file:');
    importAnswers.slice(0, 20).forEach(id => console.log('  ', id, JSON.stringify(flat[id]).slice(0, 110)));
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to perform it.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(STORE, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, `results.flat.before-reconcile-${stamp}.json`), JSON.stringify(flat));
  fs.writeFileSync(path.join(backupDir, `results.documents.before-reconcile-${stamp}.json`), JSON.stringify(authoritative));
  fs.copyFileSync(path.join(STORE, 'docket.sqlite3'), path.join(backupDir, `docket.before-reconcile-${stamp}.sqlite3`));

  await store.updateResults(() => next);
  const after = await store.readResults();
  const flatAfter = readFlat();
  console.log('\napplied. documents row:', Object.keys(after).length, '| flat mirror:', Object.keys(flatAfter).length);
  console.log('surfaces agree:', JSON.stringify(after) === JSON.stringify(flatAfter));
  console.log('backups written to', backupDir);
}

main().catch(e => { console.error(e); process.exit(1); });
