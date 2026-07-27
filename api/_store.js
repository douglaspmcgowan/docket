// Storage layer over Vercel Blob (private store). Two aggregate JSON blobs:
//   items.json   -> { <id>: item }    written only by the laptop sync push
//   results.json -> { <id>: result }  written only by phone submits
// Splitting writers this way means the laptop push and a phone submit never write the
// same blob, so neither can clobber the other. (Two phone submits racing read-modify-write
// on results.json is possible but it's one human tapping — effectively serial.)
// ponytail: aggregate-blob store, split by writer. Move to per-key blobs only if the card
// count or concurrent-writer count ever makes a whole-file rewrite too costly.
// Backend select: LOCAL_STORE_DIR set (the local mirror, local-server.js) -> SQLite authority plus
// a current JSON export and one previous export per document. Unset (Vercel) -> the Blob store.
// @vercel/blob is lazy-required only in the cloud branch.
const LOCAL_DIR = process.env.LOCAL_STORE_DIR;
let localDb;

function getLocalDb() {
  if (localDb) return localDb;
  const fs = require('fs'), path = require('path');
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  localDb = new DatabaseSync(path.join(LOCAL_DIR, 'docket.sqlite3'));
  localDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS documents (
      name TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return localDb;
}

function parseObject(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function upsertLocal(pathname, obj) {
  const db = getLocalDb();
  db.prepare(`
    INSERT INTO documents (name, body, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
  `).run(pathname, JSON.stringify(obj), new Date().toISOString());
}

function readLocal(pathname) {
  const fs = require('fs'), path = require('path');
  const row = getLocalDb().prepare('SELECT body FROM documents WHERE name = ?').get(pathname);
  if (row) return parseObject(row.body);

  const legacyPath = path.join(LOCAL_DIR, pathname);
  if (!fs.existsSync(legacyPath)) return {};
  const imported = parseObject(fs.readFileSync(legacyPath, 'utf8'));
  upsertLocal(pathname, imported);
  return imported;
}

function writeLocal(pathname, obj) {
  const fs = require('fs'), path = require('path');
  const value = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  const dst = path.join(LOCAL_DIR, pathname);
  const tmp = dst + '.tmp';
  const backupDir = path.join(LOCAL_DIR, 'backups');
  const previous = path.join(backupDir, pathname.replace(/\.json$/, '.previous.json'));
  const oldExport = fs.existsSync(dst) ? fs.readFileSync(dst) : null;

  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  if (oldExport) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(previous + '.tmp', oldExport);
    fs.renameSync(previous + '.tmp', previous);
  }
  fs.renameSync(tmp, dst);

  try {
    upsertLocal(pathname, value);
  } catch (error) {
    if (oldExport) {
      fs.writeFileSync(tmp, oldExport);
      fs.renameSync(tmp, dst);
    } else if (fs.existsSync(dst)) {
      fs.rmSync(dst);
    }
    throw error;
  }
}

async function readJson(pathname) {
  if (LOCAL_DIR) {
    return readLocal(pathname);
  }
  const { get } = require('@vercel/blob');
  // useCache:false = read-after-write consistency (a push then immediate items read must be fresh).
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return {}; // 404 on first-ever read -> empty map
  const text = await new Response(r.stream).text();
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

async function writeJson(pathname, obj) {
  if (LOCAL_DIR) {
    writeLocal(pathname, obj);
    return;
  }
  const { put } = require('@vercel/blob');
  await put(pathname, JSON.stringify(obj), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

module.exports = {
  readItems: () => readJson('items.json'),
  writeItems: (o) => writeJson('items.json', o),
  readResults: () => readJson('results.json'),
  writeResults: (o) => writeJson('results.json', o),
  // tickets.json -> { <id>: {id,title,url,notes,requested_at} }: "tell me more" requests,
  // a separate channel from a review decision so it never consumes/overwrites a card's result.
  readTickets: () => readJson('tickets.json'),
  writeTickets: (o) => writeJson('tickets.json', o),
  // reads.json -> { <briefId>: iso }: cross-device brief read-state (a phone tap syncs to the laptop).
  readReads: () => readJson('reads.json'),
  writeReads: (o) => writeJson('reads.json', o),
};
