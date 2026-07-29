const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { AUTHORITATIVE_DOCUMENTS, validateDocument } = require('./_schema');

class VersionConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VersionConflictError';
  }
}

function serialize(document) {
  return JSON.stringify(document);
}

function parseDocument(name, body) {
  let document;
  try {
    document = body == null || body === '' ? {} : JSON.parse(body);
  } catch (error) {
    throw new Error(`${name} contains invalid JSON: ${error.message}`);
  }
  return validateDocument(name, document);
}

function clone(document) {
  return JSON.parse(JSON.stringify(document));
}

function normalizeMutation(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'document')) {
    return value;
  }
  return { document: value };
}

function createDocumentStore(provider, { maxAttempts = 8 } = {}) {
  if (!provider || typeof provider.read !== 'function' || typeof provider.write !== 'function') {
    throw new TypeError('document store provider must implement read and write');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError('maxAttempts must be a positive integer');

  async function readVersioned(name) {
    const state = await provider.read(name);
    const document = parseDocument(name, state && state.body);
    return { document, version: state ? state.version : null };
  }

  async function read(name) {
    return (await readVersioned(name)).document;
  }

  async function mutate(name, mutator) {
    let lastConflict;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const state = await readVersioned(name);
      const mutation = normalizeMutation(await mutator(clone(state.document), {
        attempt,
        version: state.version,
      }));
      validateDocument(name, mutation.document);
      try {
        const written = await provider.write(name, serialize(mutation.document), state.version);
        return {
          document: mutation.document,
          result: mutation.result,
          version: written && written.version,
          attempts: attempt,
        };
      } catch (error) {
        if (!(error instanceof VersionConflictError)) throw error;
        lastConflict = error;
      }
    }
    const error = new VersionConflictError(`version conflict for ${name} after ${maxAttempts} attempts`);
    error.cause = lastConflict;
    throw error;
  }

  async function replace(name, document) {
    return mutate(name, () => document);
  }

  async function readAll() {
    const output = {};
    for (const name of AUTHORITATIVE_DOCUMENTS) output[name] = await read(name);
    return output;
  }

  return { read, readVersioned, mutate, replace, readAll };
}

function versionOf(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function createMemoryProvider(initial = {}) {
  const bodies = new Map();
  for (const [name, document] of Object.entries(initial)) bodies.set(name, serialize(document));
  const provider = {
    conflicts: 0,
    beforeWrite: null,
    async read(name) {
      const body = bodies.has(name) ? bodies.get(name) : null;
      return { body, version: body == null ? null : versionOf(body) };
    },
    async write(name, body, expectedVersion) {
      if (provider.beforeWrite) await provider.beforeWrite(name, body, expectedVersion);
      const current = bodies.has(name) ? bodies.get(name) : null;
      const currentVersion = current == null ? null : versionOf(current);
      if (currentVersion !== expectedVersion) {
        provider.conflicts += 1;
        throw new VersionConflictError(`memory version conflict for ${name}`);
      }
      bodies.set(name, body);
      return { version: versionOf(body) };
    },
  };
  return provider;
}

function ensureDirectory(root) {
  fs.mkdirSync(root, { recursive: true });
}

function createLocalProvider(root) {
  if (!root) throw new TypeError('local provider root is required');
  const absoluteRoot = path.resolve(root);
  return {
    async read(name) {
      const file = path.join(absoluteRoot, name);
      if (!fs.existsSync(file)) return { body: null, version: null };
      const body = fs.readFileSync(file, 'utf8');
      return { body, version: versionOf(body) };
    },
    async write(name, body, expectedVersion) {
      ensureDirectory(absoluteRoot);
      const file = path.join(absoluteRoot, name);
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      const currentVersion = current == null ? null : versionOf(current);
      if (currentVersion !== expectedVersion) throw new VersionConflictError(`local version conflict for ${name}`);
      const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temporary, body);
      fs.renameSync(temporary, file);
      return { version: versionOf(body) };
    },
  };
}

function isBlobConflict(error, BlobPreconditionFailedError) {
  return error instanceof BlobPreconditionFailedError ||
    error && (
      error.status === 409 ||
      error.status === 412 ||
      error.statusCode === 409 ||
      error.statusCode === 412 ||
      /conditional request cannot succeed due to a conflicting operation/i.test(String(error.message))
    );
}

function createBlobProvider(blobModule, { prefix = '' } = {}) {
  const sdk = blobModule || require('@vercel/blob');
  const normalizedPrefix = String(prefix).replace(/^\/+|\/+$/g, '');
  const pathname = name => normalizedPrefix ? `${normalizedPrefix}/${name}` : name;
  return {
    async read(name) {
      const blobName = pathname(name);
      const response = await sdk.get(blobName, { access: 'private', useCache: false });
      if (!response || response.statusCode === 404) return { body: null, version: null };
      if (response.statusCode !== 200 || !response.stream) {
        throw new Error(`unexpected Blob read status for ${blobName}: ${response.statusCode}`);
      }
      const body = await new Response(response.stream).text();
      return { body, version: response.blob.etag };
    },
    async write(name, body, expectedVersion) {
      const blobName = pathname(name);
      try {
        const options = {
          access: 'private',
          contentType: 'application/json',
          addRandomSuffix: false,
          allowOverwrite: expectedVersion !== null,
        };
        if (expectedVersion !== null) options.ifMatch = expectedVersion;
        const result = await sdk.put(blobName, body, options);
        return { version: result.etag };
      } catch (error) {
        if (isBlobConflict(error, sdk.BlobPreconditionFailedError)) {
          throw new VersionConflictError(`Blob version conflict for ${blobName}`);
        }
        throw error;
      }
    },
  };
}

module.exports = {
  VersionConflictError,
  createBlobProvider,
  createDocumentStore,
  createLocalProvider,
  createMemoryProvider,
};
