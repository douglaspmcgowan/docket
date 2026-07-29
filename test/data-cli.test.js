const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const cli = path.join(repo, 'scripts', 'docket-data.js');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, BLOB_READ_WRITE_TOKEN: '' },
  });
}

function seed(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'items.json'), JSON.stringify({
    x: { id: 'x', title: 'Card', options: ['Approve', 'Reject'] },
  }));
  fs.writeFileSync(path.join(root, 'results.json'), '{}');
  fs.writeFileSync(path.join(root, 'tickets.json'), '{}');
  fs.writeFileSync(path.join(root, 'reads.json'), '{}');
}

test('the data CLI exports, verifies, and restores all documents into a disposable local target', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-cli-'));
  const source = path.join(root, 'source');
  const output = path.join(root, 'export');
  const target = path.join(root, 'target');
  seed(source);

  const exported = run(['export', '--backend', 'local', '--store-dir', source, '--output', output]);
  assert.equal(exported.status, 0, exported.stderr);
  assert.match(exported.stdout, /"items\.json":1/);

  const verified = run(['verify', '--output', output]);
  assert.equal(verified.status, 0, verified.stderr);

  const dry = run(['restore', '--backend', 'local', '--store-dir', target, '--output', output]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(fs.existsSync(path.join(target, 'items.json')), false);

  const restored = run(['restore', '--backend', 'local', '--store-dir', target, '--output', output, '--disposable']);
  assert.equal(restored.status, 0, restored.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target, 'items.json'), 'utf8')), {
    x: { id: 'x', title: 'Card', options: ['Approve', 'Reject'] },
  });
});

test('the data CLI refuses a cloud restore command', () => {
  const result = run(['restore', '--backend', 'cloud', '--output', 'unused', '--disposable']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cloud restore is disabled/i);
});
