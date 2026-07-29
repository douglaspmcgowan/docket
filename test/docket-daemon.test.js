const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('the daemon delegates cloud synchronization to the approved BWS broker command', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'docket-daemon.js'), 'utf8');
  assert.match(source, /Invoke-WithBitwardenSecret\.ps1/);
  assert.match(source, /docket-sync/);
  assert.doesNotMatch(source, /require\(['"]\.\/sync-cloud['"]\)|\.passcode\.txt/);
});
