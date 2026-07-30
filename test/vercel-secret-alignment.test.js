const test = require('node:test');
const assert = require('node:assert/strict');

let alignVercelAppSecret;
try {
  ({ alignVercelAppSecret } = require('../scripts/align-vercel-app-secret'));
} catch {
  alignVercelAppSecret = undefined;
}

test('streams the brokered review secret to Vercel stdin without arguments or inherited secret variables', () => {
  assert.equal(typeof alignVercelAppSecret, 'function', 'alignment helper is missing');
  const value = 'fixture-review-value';
  const environment = {
    REVIEW_SECRET: value,
    BWS_ACCESS_TOKEN: 'unrelated-bootstrap-fixture',
    BW_SESSION: 'unrelated-session-fixture',
    APP_SECRET: 'unrelated-app-fixture',
    USERPROFILE: 'C:\\Users\\fixture',
  };
  let invocation;
  const result = alignVercelAppSecret({
    environment,
    spawnSync(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stdout: `configured ${value}`, stderr: '' };
    },
  });

  assert.equal(invocation.command, 'vercel.cmd');
  assert.deepEqual(invocation.args, [
    'env', 'add', 'APP_SECRET', 'production',
    '--force', '--sensitive', '--yes', '--no-color',
  ]);
  assert.equal(invocation.options.input, `${value}\n`);
  assert.equal(invocation.options.shell, true);
  assert.equal(invocation.args.join(' ').includes(value), false);
  for (const name of ['REVIEW_SECRET', 'APP_SECRET', 'BWS_ACCESS_TOKEN', 'BW_SESSION']) {
    assert.equal(Object.hasOwn(invocation.options.env, name), false);
  }
  assert.equal(Object.hasOwn(environment, 'REVIEW_SECRET'), false);
  assert.deepEqual(result, { status: 'configured', environment: 'production' });
  assert.equal(JSON.stringify(result).includes(value), false);
});

test('fails before invoking Vercel when the broker did not inject a review secret', () => {
  assert.equal(typeof alignVercelAppSecret, 'function', 'alignment helper is missing');
  let invoked = false;
  assert.throws(
    () => alignVercelAppSecret({
      environment: {},
      spawnSync() {
        invoked = true;
      },
    }),
    /broker-injected REVIEW_SECRET is required/,
  );
  assert.equal(invoked, false);
});

test('redacts a failed Vercel process and clears the brokered source variable', () => {
  assert.equal(typeof alignVercelAppSecret, 'function', 'alignment helper is missing');
  const value = 'fixture-failed-review-value';
  const environment = { REVIEW_SECRET: value };
  assert.throws(
    () => alignVercelAppSecret({
      environment,
      spawnSync() {
        return { status: 1, stdout: '', stderr: `provider rejected ${value}` };
      },
    }),
    (error) => {
      assert.equal(error.message.includes(value), false);
      assert.match(error.message, /Vercel APP_SECRET update failed/);
      return true;
    },
  );
  assert.equal(Object.hasOwn(environment, 'REVIEW_SECRET'), false);
});
