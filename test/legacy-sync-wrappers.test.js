const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('legacy sync wrappers fail with the approved BWS broker command', () => {
  const root = path.resolve(__dirname, '..');
  for (const file of ['_sync_once.cmd', 'sync-review.cmd']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /Invoke-WithBitwardenSecret\.ps1/);
    assert.match(source, /-CommandId "docket-sync"/);
    assert.match(source, /docket-sync authorizes sync-cloud\.js only/);
    assert.match(source, /exit \/b 2/);
    assert.doesNotMatch(source, /node\s+"%~dp0sync\.js"/i);
    if (process.platform === 'win32') {
      const result = spawnSync('cmd.exe', ['/d', '/c', file], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 2);
      assert.match(`${result.stdout}\n${result.stderr}`, /Invoke-WithBitwardenSecret\.ps1.*docket-sync/s);
    }
  }
});
