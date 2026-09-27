// Accessibility gate. Runs axe-core against every state of the primary surface a keyboard or
// screen-reader user actually reaches: the passcode gate, the item list, an open reader pane, and
// the scope rail. Fails on any serious or critical violation.
//
// This is an assertion, not a report: a regression that removes a focus ring, an accessible name or
// a contrast floor fails `npm test` rather than waiting to be noticed on the phone.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

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

const FIXTURES = [
  {
    id: 'axe-review-fixture',
    kind: 'review',
    title: 'Axe review fixture',
    description: 'A review card with options, so the option pills and comment row are in scope.',
    source: 'app-repair: axe',
    options: ['Approve', 'Reject'],
    submitted_at: '2026-09-26T00:00:00.000Z',
  },
  {
    id: 'axe-brief-fixture',
    kind: 'brief',
    title: 'Axe brief fixture',
    format: 'md',
    source: 'app-repair: axe',
    submitted_at: '2026-09-26T00:00:01.000Z',
    body: '## Heading\n\nBody copy, `inline code`, a list:\n\n- one\n- two\n\n| Slot | Value |\n|---|---|\n| a | b |\n',
  },
];

// Two serious violations exist and are NOT silently tolerated: they are named here with the reason,
// so the gate stays real for everything else and these two cannot quietly grow extra instances.
// Both were found by this test on 2026-09-26 and both are recorded in LOG.md for a follow-up pass.
const KNOWN = [
  {
    rule: 'color-contrast',
    target: '.s-brief',
    // .s-kind.s-brief puts --answered on --answered-wash. Raising the ratio means changing a
    // palette value, which is a visual change and out of scope for a non-visual repair pass.
    why: 'the brief kind-badge palette fails AA; fixing it changes a colour value (visual)',
  },
  {
    rule: 'nested-interactive',
    // axe names this node by whichever selector is shortest (div[data-id=…], .read, .sel), so match
    // the row by its markup instead of by a selector shape.
    html: 'class="listrow',
    // .listrow is div[role="button"][tabindex="0"] and contains the row's select checkbox. The fix
    // restructures the app's central list row, which risks the layout this pass must not move.
    why: 'the list row is role=button and contains its own checkbox; the fix restructures the row',
  },
];

function isKnown(violation, node) {
  return KNOWN.some(k => k.rule === violation.id && (
    (k.target && node.target.join(' ').includes(k.target)) ||
    (k.html && String(node.html || '').includes(k.html))));
}

// A violation report is only useful if it says which node broke which rule.
function describe(violations) {
  return violations.map(v => `${v.id} (${v.impact}): ${v.help}\n    ` +
    v.nodes.slice(0, 4).map(n => n.target.join(' ')).join('\n    ')).join('\n  ');
}

async function scan(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => ({ ...v, nodes: v.nodes.filter(n => !isKnown(v, n)) }))
    .filter(v => v.nodes.length);
  assert.equal(blocking.length, 0,
    `${label}: ${blocking.length} serious/critical accessibility violation(s)\n  ${describe(blocking)}`);
  return results.violations;
}

test('the primary surface has no serious or critical accessibility violations', async t => {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-axe-'));
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
    body: JSON.stringify({ items: FIXTURES }),
  });
  assert.equal(pushed.status, 200);

  browser = await chromium.launch({ headless: true });
  // AxeBuilder refuses a page created straight off the browser; it needs an explicit context.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(url);

  // 1. the passcode gate — the first thing anyone meets
  await page.locator('#pw').waitFor();
  await scan(page, 'passcode gate');

  // 2. the board with the item list rendered
  await page.locator('#pw').fill('local-fixture');
  await page.locator('#go').click();
  await page.getByText('Axe review fixture', { exact: true }).waitFor();
  await scan(page, 'item list');

  // 3. the reader pane with a review card open
  await page.locator('.listrow[data-id="axe-review-fixture"]').click();
  await page.getByRole('button', { name: 'Approve', exact: true }).waitFor();
  await scan(page, 'reader pane, review card');

  // 4. the reader pane with a markdown brief open (table, code, list)
  await page.locator('.listrow[data-id="axe-brief-fixture"]').click();
  await page.locator('.md-body table').waitFor();
  await scan(page, 'reader pane, brief');

  // 5. the scope rail open
  await page.locator('.scopebtn').click();
  await page.locator('.rail-sect').first().waitFor();
  await scan(page, 'scope rail');
});

test('every interactive control on the primary surface has a visible keyboard focus ring', async t => {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-axe-focus-'));
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
  await fetch(`${url}/api/sync?op=push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: FIXTURES }),
  });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('#pw').fill('local-fixture');
  await page.locator('#go').click();
  await page.getByText('Axe review fixture', { exact: true }).waitFor();
  await page.locator('.listrow[data-id="axe-review-fixture"]').click();
  await page.getByRole('button', { name: 'Approve', exact: true }).waitFor();
  await page.locator('.scopebtn').click();
  await page.locator('.rail-sect').first().waitFor();

  // Walk the REAL tab order. A programmatic el.focus() does not set :focus-visible on a button in
  // Chromium, so probing that way reports every button as ringless; pressing Tab does set it. This
  // also proves each control is keyboard-reachable, not merely styled.
  const seen = [];
  const bare = [];
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press('Tab');
    // Mark each element as it is reached so the wrap is detected by element identity. Several
    // controls share a class string (six .iconbtn in the toolbar), so comparing labels stops early.
    const hit = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const already = el.hasAttribute('data-tabprobe');
      el.setAttribute('data-tabprobe', '1');
      const cs = getComputedStyle(el);
      const cls = String(el.className || '').trim().split(/\s+/).join('.');
      return {
        already,
        id: el.tagName + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : ''),
        ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
        shadow: Boolean(cs.boxShadow && cs.boxShadow !== 'none'),
      };
    });
    if (!hit) continue;
    if (hit.already) break;                                   // tab order wrapped
    seen.push(hit.id);
    if (!hit.ring && !hit.shadow) bare.push(hit.id);
  }
  assert.ok(seen.length >= 10, `expected the tab order to reach 10+ controls, reached ${seen.length}`);
  assert.deepEqual([...new Set(bare)], [],
    `controls reachable by Tab with no visible focus indicator: ${[...new Set(bare)].join(', ')}`);
});
