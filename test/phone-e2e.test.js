const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');

async function unusedPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error(`local server exited early with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('local server did not become ready');
}

test('phone viewport can log in, see a card, and operate its review controls', async t => {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-phone-e2e-'));
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['local-server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, LOCAL_STORE_DIR: store, PORT: String(port), APP_SECRET: '', REVIEW_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    fs.rmSync(store, { recursive: true, force: true });
  });

  await waitForServer(url, child);
  const pushed = await fetch(`${url}/api/sync?op=push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{
        id: 'phone-fixture',
        title: 'Phone fixture',
        description: 'Responsive review control check',
        options: ['Approve', 'Reject'],
        submitted_at: '2026-07-29T00:00:00.000Z',
      }],
    }),
  });
  assert.equal(pushed.status, 200);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url);
  await page.locator('#pw').fill('local-fixture');
  await page.locator('#go').click();
  await page.getByText('Phone fixture', { exact: true }).waitFor();
  await page.locator('.listrow[data-id="phone-fixture"]').click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Phone fixture'));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(overflow, false);
});

test('cloud-style phone login rejects a wrong bearer and persists a correct submission', async t => {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-phone-cloud-e2e-'));
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const bearer = 'phone-cloud-fixture-bearer';
  const child = spawn(process.execPath, ['local-server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      LOCAL_STORE_DIR: store,
      PORT: String(port),
      APP_SECRET: bearer,
      REVIEW_SECRET: '',
      DOCKET_REQUIRE_BEARER: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    fs.rmSync(store, { recursive: true, force: true });
  });

  await waitForServer(url, child);
  const wrongApi = await fetch(`${url}/api/items`, {
    headers: { Authorization: 'Bearer wrong-fixture-bearer' },
  });
  assert.equal(wrongApi.status, 401);

  const pushed = await fetch(`${url}/api/sync?op=push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{
        id: 'cloud-phone-fixture',
        title: 'Cloud phone fixture',
        options: ['Approve', 'Reject'],
        submitted_at: '2026-07-29T00:00:00.000Z',
      }],
    }),
  });
  assert.equal(pushed.status, 200);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url);
  await page.locator('#pw').fill('wrong-fixture-bearer');
  await page.locator('#go').click();
  await page.getByText('Incorrect passcode', { exact: false }).waitFor();
  await page.locator('#pw').fill(bearer);
  await page.locator('#go').click();
  await page.getByText('Cloud phone fixture', { exact: true }).waitFor();
  await page.locator('.listrow[data-id="cloud-phone-fixture"]').click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Cloud phone fixture'));

  const pulled = await fetch(`${url}/api/sync?op=pull`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  assert.equal(pulled.status, 200);
  const persisted = (await pulled.json()).results.find(result => result.id === 'cloud-phone-fixture');
  assert.equal(persisted.chosen, 'Approve');
});
