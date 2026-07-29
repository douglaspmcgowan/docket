const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { archiveCard } = require('../enqueue.js');

async function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`local server exited ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('local server did not become ready');
}

function response({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('archiveCard verifies the archived result returned for the requested id', async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    return response({
      body: {
        ok: true,
        result: {
          id: 'stale-card',
          archived: true,
          answered_at: '2026-07-29T00:00:00Z',
        },
      },
    });
  };

  const result = await archiveCard('stale-card', 'https://example.test/', 'secret-value', fetchFn);

  assert.equal(result.id, 'stale-card');
  assert.equal(result.archived, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/api/submit');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-value');
  assert.deepEqual(JSON.parse(calls[0].options.body), { id: 'stale-card', archived: true });
});

test('archiveCard rejects an HTTP failure', async () => {
  const fetchFn = async () => response({
    ok: false,
    status: 503,
    body: { error: 'unavailable' },
  });

  await assert.rejects(
    archiveCard('stale-card', 'https://example.test', 'secret-value', fetchFn),
    /archive failed 503/,
  );
});

test('archiveCard rejects an acknowledgement for the wrong id', async () => {
  const fetchFn = async () => response({
    body: {
      ok: true,
      result: {
        id: 'different-card',
        archived: true,
        answered_at: '2026-07-29T00:00:00Z',
      },
    },
  });

  await assert.rejects(
    archiveCard('stale-card', 'https://example.test', 'secret-value', fetchFn),
    /archive acknowledgement did not match stale-card/,
  );
});

test('archiveCard rejects an acknowledgement without archived:true', async () => {
  const fetchFn = async () => response({
    body: {
      ok: true,
      result: {
        id: 'stale-card',
        chosen: 'Approve',
        answered_at: '2026-07-29T00:00:00Z',
      },
    },
  });

  await assert.rejects(
    archiveCard('stale-card', 'https://example.test', 'secret-value', fetchFn),
    /archive acknowledgement did not match stale-card/,
  );
});

test('archiveCard rejects an acknowledgement without ok:true', async () => {
  const fetchFn = async () => response({
    body: {
      result: {
        id: 'stale-card',
        archived: true,
        answered_at: '2026-07-29T00:00:00Z',
      },
    },
  });

  await assert.rejects(
    archiveCard('stale-card', 'https://example.test', 'secret-value', fetchFn),
    /archive acknowledgement did not match stale-card/,
  );
});

test('archiveCard rejects an acknowledgement without an answer timestamp', async () => {
  const fetchFn = async () => response({
    body: {
      ok: true,
      result: {
        id: 'stale-card',
        archived: true,
      },
    },
  });

  await assert.rejects(
    archiveCard('stale-card', 'https://example.test', 'secret-value', fetchFn),
    /archive acknowledgement did not match stale-card/,
  );
});

test('enqueue --archive rejects a missing card id', () => {
  const cli = spawnSync(
    process.execPath,
    ['enqueue.js', '--archive'],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, REVIEW_SECRET: 'local-test-secret' },
      encoding: 'utf8',
    },
  );
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /--archive needs a card id/);
});

test('enqueue --archive retires an existing card and exits only after verification', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-archive-cli-'));
  const store = path.join(root, 'store');
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['local-server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LOCAL_STORE_DIR: store, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  await waitForServer(`${base}/api/items`, child);

  const pushed = await fetch(`${base}/api/sync?op=push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 'stale-card', title: 'Stale' }] }),
  });
  assert.equal(pushed.ok, true);

  const cli = spawnSync(
    process.execPath,
    ['enqueue.js', '--archive', 'stale-card', '--url', base],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, REVIEW_SECRET: 'local-test-secret' },
      encoding: 'utf8',
    },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /archived stale-card/);

  const active = await (await fetch(`${base}/api/items`)).json();
  assert.deepEqual(active.items, []);
  const pulled = await (await fetch(`${base}/api/sync?op=pull`)).json();
  assert.equal(pulled.results.length, 1);
  assert.equal(pulled.results[0].id, 'stale-card');
  assert.equal(pulled.results[0].archived, true);
});
