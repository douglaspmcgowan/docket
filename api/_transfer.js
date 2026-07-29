const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { AUTHORITATIVE_DOCUMENTS, validateDocument } = require('./_schema');

const EXPORT_MANIFEST = 'docket-export.json';
const EXPORT_FORMAT = 1;

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function writeAtomic(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, body);
  fs.renameSync(temporary, file);
}

async function readStableSnapshot(store, maxAttempts) {
  let changed = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const captured = {};
    for (const name of AUTHORITATIVE_DOCUMENTS) {
      const state = await store.readVersioned(name);
      validateDocument(name, state.document);
      captured[name] = {
        document: state.document,
        version: state.version == null ? null : String(state.version),
      };
    }

    changed = [];
    for (const name of AUTHORITATIVE_DOCUMENTS) {
      const confirmed = await store.readVersioned(name);
      const confirmedVersion = confirmed.version == null ? null : String(confirmed.version);
      if (captured[name].version !== confirmedVersion) changed.push(name);
    }
    if (!changed.length) return captured;
  }
  throw new Error(`could not capture a stable snapshot after ${maxAttempts} attempts; changed: ${changed.join(', ')}`);
}

async function createExport(store, outputDirectory, options = {}) {
  const maxSnapshotAttempts = options.maxSnapshotAttempts == null ? 5 : options.maxSnapshotAttempts;
  if (!Number.isInteger(maxSnapshotAttempts) || maxSnapshotAttempts < 1) {
    throw new TypeError('maxSnapshotAttempts must be a positive integer');
  }
  if (fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length) {
    throw new Error(`export target is not empty: ${outputDirectory}`);
  }
  const snapshot = await readStableSnapshot(store, maxSnapshotAttempts);
  const parent = path.dirname(outputDirectory);
  const temporary = path.join(parent, `.${path.basename(outputDirectory)}.building-${crypto.randomUUID()}`);
  fs.mkdirSync(parent, { recursive: true });
  fs.mkdirSync(temporary);
  try {
    const documents = [];
    for (const name of AUTHORITATIVE_DOCUMENTS) {
      const state = snapshot[name];
      const body = `${JSON.stringify(state.document, null, 2)}\n`;
      writeAtomic(path.join(temporary, name), body);
      documents.push({
        name,
        records: Object.keys(state.document).length,
        sha256: hash(body),
        source_version: state.version,
      });
    }
    const manifest = {
      format: 'docket-authority-export',
      version: EXPORT_FORMAT,
      generated_at: options.generatedAt || new Date().toISOString(),
      documents,
    };
    writeAtomic(path.join(temporary, EXPORT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    verifyExport(temporary);
    if (fs.existsSync(outputDirectory)) fs.rmdirSync(outputDirectory);
    fs.renameSync(temporary, outputDirectory);
    return manifest;
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true });
  }
}

function readExport(outputDirectory) {
  const manifestPath = path.join(outputDirectory, EXPORT_MANIFEST);
  if (!fs.existsSync(manifestPath)) throw new Error(`export manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 'docket-authority-export' || manifest.version !== EXPORT_FORMAT) {
    throw new Error('unsupported Docket export format');
  }
  if (!Array.isArray(manifest.documents)) throw new Error('export document inventory is missing');
  const names = manifest.documents.map(entry => entry && entry.name).sort();
  const expected = [...AUTHORITATIVE_DOCUMENTS].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`export must contain exactly ${expected.join(', ')}`);
  }
  const documents = {};
  for (const entry of manifest.documents) {
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw new Error(`invalid checksum metadata for ${entry && entry.name}`);
    const file = path.join(outputDirectory, entry.name);
    if (!fs.existsSync(file)) throw new Error(`export document is missing: ${entry.name}`);
    const body = fs.readFileSync(file);
    if (hash(body) !== entry.sha256) throw new Error(`checksum mismatch for ${entry.name}`);
    const document = JSON.parse(body.toString('utf8'));
    validateDocument(entry.name, document);
    if (Object.keys(document).length !== entry.records) throw new Error(`record count mismatch for ${entry.name}`);
    documents[entry.name] = document;
  }
  return { manifest, documents };
}

function verifyExport(outputDirectory) {
  const { manifest } = readExport(outputDirectory);
  return {
    ok: true,
    generatedAt: manifest.generated_at,
    records: Object.fromEntries(manifest.documents.map(entry => [entry.name, entry.records])),
  };
}

async function restoreExport(store, outputDirectory, { disposable = false } = {}) {
  const verified = readExport(outputDirectory);
  if (!disposable) {
    return {
      ok: true,
      dryRun: true,
      records: Object.fromEntries(verified.manifest.documents.map(entry => [entry.name, entry.records])),
    };
  }
  const current = await store.readAll();
  if (Object.values(current).some(document => Object.keys(document).length)) {
    throw new Error('restore target is not empty; use a new disposable target');
  }
  for (const name of AUTHORITATIVE_DOCUMENTS) await store.replace(name, verified.documents[name]);
  const restored = await store.readAll();
  for (const name of AUTHORITATIVE_DOCUMENTS) {
    if (JSON.stringify(restored[name]) !== JSON.stringify(verified.documents[name])) {
      throw new Error(`restored document did not verify: ${name}`);
    }
  }
  return { ok: true, dryRun: false, records: Object.fromEntries(AUTHORITATIVE_DOCUMENTS.map(name => [name, Object.keys(restored[name]).length])) };
}

module.exports = {
  EXPORT_MANIFEST,
  createExport,
  restoreExport,
  verifyExport,
};
