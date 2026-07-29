const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {
  createDocumentStore,
  createMemoryProvider,
} = require('../api/_document-store');

const LOCAL_REQUEST = Symbol.for('docket.localRequest');

function response() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function loadWithStore(moduleName, replacements) {
  const storePath = require.resolve('../api/_store');
  const modulePath = require.resolve(`../api/${moduleName}`);
  const originalStore = require.cache[storePath];
  const originalModule = require.cache[modulePath];
  require.cache[storePath] = {
    id: storePath,
    filename: storePath,
    loaded: true,
    exports: replacements,
    paths: [],
    children: [],
  };
  delete require.cache[modulePath];
  const loaded = require(modulePath);
  return {
    loaded,
    restore() {
      delete require.cache[modulePath];
      if (originalModule) require.cache[modulePath] = originalModule;
      if (originalStore) require.cache[storePath] = originalStore;
      else delete require.cache[storePath];
    },
  };
}

test('parallel submit handlers preserve both decisions through updateResults', async () => {
  const items = {
    a: { id: 'a', title: 'A', options: ['Approve', 'Reject'] },
    b: { id: 'b', title: 'B', options: ['Approve', 'Reject'] },
  };
  const documents = createDocumentStore(createMemoryProvider({ 'results.json': {} }));
  const mock = loadWithStore('submit.js', {
    readItems: async () => items,
    updateResults: mutator => documents.mutate('results.json', mutator),
  });
  try {
    const req = id => ({
      method: 'POST',
      body: { id, chosen: 'Approve' },
      headers: {},
      [LOCAL_REQUEST]: true,
    });
    const a = response();
    const b = response();
    await Promise.all([mock.loaded(req('a'), a), mock.loaded(req('b'), b)]);
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);
    const stored = await documents.read('results.json');
    assert.ok(stored.a);
    assert.ok(stored.b);
  } finally {
    mock.restore();
  }
});

test('push handler uses updateItems and refuses malformed cards without rejecting valid siblings', async () => {
  const documents = createDocumentStore(createMemoryProvider({ 'items.json': {} }));
  const mock = loadWithStore('sync.js', {
    readItems: () => documents.read('items.json'),
    updateItems: mutator => documents.mutate('items.json', mutator),
    readResults: async () => ({}),
    readTickets: async () => ({}),
    updateTickets: async () => {},
    readReads: async () => ({}),
    updateReads: async () => {},
  });
  try {
    const req = {
      method: 'POST',
      query: { op: 'push' },
      body: {
        items: [
          { id: 'good', title: 'Good card', options: ['Approve', 'Reject'] },
          { id: 'bad' },
          { id: 'cui', title: 'CUI//SP-PRVCY' },
          { id: 'sensitive', title: 'Sensitive card', sensitive: true },
        ],
      },
      headers: {},
      [LOCAL_REQUEST]: true,
    };
    const res = response();
    await mock.loaded(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.pushed, 1);
    assert.equal(res.payload.refused, 3);
    assert.ok((await documents.read('items.json')).good);
    assert.equal((await documents.read('items.json')).cui, undefined);
    assert.equal((await documents.read('items.json')).sensitive, undefined);
  } finally {
    mock.restore();
  }
});
