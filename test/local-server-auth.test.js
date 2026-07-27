const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForResponse(url, child) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`local server exited before responding: ${child.exitCode}`);
    }
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

test('loopback local server works without a persistent passcode', async t => {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-local-auth-'));
  const port = await unusedPort();
  const env = { ...process.env, APP_SECRET: '', REVIEW_SECRET: '', LOCAL_STORE_DIR: store, PORT: String(port) };
  const child = spawn(process.execPath, ['local-server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    fs.rmSync(store, { recursive: true, force: true });
  });

  const response = await waitForResponse(`http://127.0.0.1:${port}/api/items`, child);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.items, []);
  assert.deepEqual(payload.reads, []);
  assert.deepEqual(payload.answered, []);
});
