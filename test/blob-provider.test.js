const { test } = require('node:test');
const assert = require('node:assert');
const {
  VersionConflictError,
  createBlobProvider,
  createDocumentStore,
} = require('../api/_document-store');

test('Blob updates use the ETag as an ifMatch precondition', async () => {
  const writes = [];
  const sdk = {
    BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {},
    async get() {
      return {
        statusCode: 200,
        stream: new Blob([JSON.stringify({})]).stream(),
        blob: { etag: 'etag-before' },
      };
    },
    async put(name, body, options) {
      writes.push({ name, body, options });
      return { etag: 'etag-after' };
    },
  };
  const store = createDocumentStore(createBlobProvider(sdk));
  await store.mutate('reads.json', reads => {
    reads.b1 = '2026-07-29T00:00:00.000Z';
    return reads;
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].options.ifMatch, 'etag-before');
  assert.equal(writes[0].options.allowOverwrite, true);
});

test('Blob precondition failures become retryable version conflicts', async () => {
  class BlobPreconditionFailedError extends Error {}
  const sdk = {
    BlobPreconditionFailedError,
    async get() {
      return {
        statusCode: 200,
        stream: new Blob([JSON.stringify({})]).stream(),
        blob: { etag: 'etag-before' },
      };
    },
    async put() {
      throw new BlobPreconditionFailedError('stale');
    },
  };
  const provider = createBlobProvider(sdk);
  await assert.rejects(
    provider.write('reads.json', '{}', 'etag-before'),
    VersionConflictError
  );
});

test('Blob service conflict responses without a status remain retryable', async () => {
  const sdk = {
    BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {},
    async put() {
      throw new Error('The conditional request cannot succeed due to a conflicting operation against this resource.');
    },
  };
  const provider = createBlobProvider(sdk);
  await assert.rejects(
    provider.write('reads.json', '{}', null),
    VersionConflictError
  );
});

test('first Blob creation refuses overwrite so concurrent creators cannot clobber', async () => {
  let options;
  const sdk = {
    BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {},
    async put(name, body, value) {
      options = value;
      return { etag: 'created' };
    },
  };
  const provider = createBlobProvider(sdk);
  await provider.write('reads.json', '{}', null);
  assert.equal(options.allowOverwrite, false);
  assert.equal(options.ifMatch, undefined);
});

test('a verification prefix isolates Blob operations from authoritative pathnames', async () => {
  const names = [];
  const sdk = {
    BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {},
    async get(name) {
      names.push(name);
      return null;
    },
    async put(name) {
      names.push(name);
      return { etag: 'created' };
    },
  };
  const provider = createBlobProvider(sdk, { prefix: 'verification/run-1' });
  await provider.read('results.json');
  await provider.write('results.json', '{}', null);
  assert.deepEqual(names, [
    'verification/run-1/results.json',
    'verification/run-1/results.json',
  ]);
});
