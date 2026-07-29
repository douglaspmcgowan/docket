const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ACTIVE_SOURCE_EXTENSIONS = new Set([
  '.bat', '.cjs', '.cmd', '.htm', '.html', '.js', '.json', '.jsx', '.mjs', '.ps1', '.psm1',
  '.py', '.sh', '.svelte', '.toml', '.ts', '.tsx', '.vbs', '.vue', '.yaml', '.yml',
]);

test('repository runtime code contains no plaintext passcode-file fallback', () => {
  const root = path.resolve(__dirname, '..');
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);
  const untracked = spawnSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' }
  );
  assert.equal(untracked.status, 0, untracked.stderr);
  const forbidden = '.passcode' + '.txt';
  const files = new Set(`${tracked.stdout}\0${untracked.stdout}`.split('\0').filter(Boolean));
  const offenders = [...files]
    .filter(Boolean)
    .filter(file =>
      !file.startsWith('test/') && ACTIVE_SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())
    )
    .filter(file => fs.readFileSync(path.join(root, file), 'utf8').includes(forbidden));
  assert.deepEqual(offenders, []);
});
