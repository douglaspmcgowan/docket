// Four private JSON documents are the Docket network authority:
// items.json, results.json, tickets.json, and reads.json.
// Every mutation goes through compare-and-swap in _document-store.js. Vercel Blob uses ETags;
// the local SQLite mirror uses the document-body hash while holding a SQLite write transaction.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  VersionConflictError,
  createBlobProvider,
  createDocumentStore,
} = require('./_document-store');

const LOCAL_DIR = process.env.LOCAL_STORE_DIR;
let localDb;

function versionOf(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function getLocalDb() {
  if (localDb) return localDb;
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

function atomicWrite(file, body) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temporary, body);
  fs.renameSync(temporary, file);
}

function createSqliteProvider() {
  return {
    async read(name) {
      const db = getLocalDb();
      const row = db.prepare('SELECT body FROM documents WHERE name = ?').get(name);
      if (row) return { body: row.body, version: versionOf(row.body) };

      const legacyFile = path.join(LOCAL_DIR, name);
      if (!fs.existsSync(legacyFile)) return { body: null, version: null };
      const body = fs.readFileSync(legacyFile, 'utf8');
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected an object map');
      } catch (error) {
        throw new Error(`${name} contains invalid JSON: ${error.message}`);
      }
      db.prepare(`
        INSERT INTO documents (name, body, updated_at)
        VALUES (?, ?, ?)
      `).run(name, body, new Date().toISOString());
      return { body, version: versionOf(body) };
    },

    async write(name, body, expectedVersion) {
      const db = getLocalDb();
      const exportFile = path.join(LOCAL_DIR, name);
      const backupFile = path.join(LOCAL_DIR, 'backups', name.replace(/\.json$/, '.previous.json'));
      const oldExport = fs.existsSync(exportFile) ? fs.readFileSync(exportFile) : null;
      const oldBackup = fs.existsSync(backupFile) ? fs.readFileSync(backupFile) : null;

      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT body FROM documents WHERE name = ?').get(name);
        const currentBody = row ? row.body : null;
        const currentVersion = currentBody == null ? null : versionOf(currentBody);
        if (currentVersion !== expectedVersion) throw new VersionConflictError(`local version conflict for ${name}`);

        db.prepare(`
          INSERT INTO documents (name, body, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
        `).run(name, body, new Date().toISOString());

        if (oldExport) atomicWrite(backupFile, oldExport);
        atomicWrite(exportFile, `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
        db.exec('COMMIT');
        return { version: versionOf(body) };
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        if (oldExport) atomicWrite(exportFile, oldExport);
        else if (fs.existsSync(exportFile)) fs.rmSync(exportFile);
        if (oldBackup) atomicWrite(backupFile, oldBackup);
        else if (fs.existsSync(backupFile)) fs.rmSync(backupFile);
        throw error;
      }
    },
  };
}

const documents = createDocumentStore(LOCAL_DIR ? createSqliteProvider() : createBlobProvider());

const read = name => documents.read(name);
const write = (name, value) => documents.replace(name, value);
const update = (name, mutator) => documents.mutate(name, mutator);

module.exports = {
  readItems: () => read('items.json'),
  writeItems: value => write('items.json', value),
  updateItems: mutator => update('items.json', mutator),
  readResults: () => read('results.json'),
  writeResults: value => write('results.json', value),
  updateResults: mutator => update('results.json', mutator),
  readTickets: () => read('tickets.json'),
  writeTickets: value => write('tickets.json', value),
  updateTickets: mutator => update('tickets.json', mutator),
  readReads: () => read('reads.json'),
  writeReads: value => write('reads.json', value),
  updateReads: mutator => update('reads.json', mutator),
  readAll: () => documents.readAll(),
};
