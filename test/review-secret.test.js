const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { requireReviewSecret } = require('../api/_review-secret');

test('review clients accept only an injected REVIEW_SECRET', () => {
  assert.equal(requireReviewSecret({ REVIEW_SECRET: '  injected-fixture  ' }), 'injected-fixture');
  assert.throws(
    () => requireReviewSecret({ REVIEW_SECRET: '  ' }),
    /Invoke-WithBitwardenSecret\.ps1.*CommandId.*approved-command-id/i
  );
  assert.throws(
    () => requireReviewSecret({}),
    /docket-sync.*sync-cloud\.js only/i
  );
});

test('every active review client uses the shared injected-secret boundary', () => {
  const root = path.resolve(__dirname, '..');
  for (const file of [
    'cleanup-data.js',
    'consolidate-projects.js',
    'enqueue.js',
    'migrate-local.js',
    'sync-cloud.js',
    'sync.js',
  ]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /requireReviewSecret/);
    assert.doesNotMatch(source, /process\.env\.REVIEW_SECRET/);
  }
});
