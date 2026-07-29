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

async function createExport(store, outputDirectory, options = {}) {
  if (fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length) {
    throw new Error(`export target is not empty: ${outputDirectory}`);
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  const documents = [];
  for (const name of AUTHORITATIVE_DOCUMENTS) {
    const state = await store.readVersioned(name);
    const body = `${JSON.stringify(state.document, null, 2)}\n`;
    writeAtomic(path.join(outputDirectory, name), body);
    documents.push({
      name,
      records: Object.keys(state.document).length,
      sha256: hash(body),
      source_version: state.version == null ? null : String(state.version),
    });
  }
  const manifest = {
    format: 'docket-authority-export',
    version: EXPORT_FORMAT,
    generated_at: options.generatedAt || new Date().toISOString(),
    documents,
  };
  writeAtomic(path.join(outputDirectory, EXPORT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
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
