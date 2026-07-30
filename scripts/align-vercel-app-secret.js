const { spawnSync } = require('node:child_process');

function alignVercelAppSecret({
  environment = process.env,
  spawnSync: run = spawnSync,
} = {}) {
  const value = String(environment.REVIEW_SECRET || '').trim();
  if (!value) {
    throw new Error('The broker-injected REVIEW_SECRET is required.');
  }

  const childEnvironment = { ...environment };
  for (const name of ['REVIEW_SECRET', 'APP_SECRET', 'BWS_ACCESS_TOKEN', 'BW_SESSION']) {
    delete childEnvironment[name];
  }

  try {
    const result = run(
      'vercel.cmd',
      [
        'env', 'add', 'APP_SECRET', 'production',
        '--force', '--sensitive', '--yes', '--no-color',
      ],
      {
        cwd: process.cwd(),
        env: childEnvironment,
        input: `${value}\n`,
        encoding: 'utf8',
        windowsHide: true,
        shell: true,
      },
    );
    if (result.error || result.status !== 0) {
      throw new Error('Vercel APP_SECRET update failed.');
    }
    return { status: 'configured', environment: 'production' };
  } finally {
    delete environment.REVIEW_SECRET;
  }
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(alignVercelAppSecret())}\n`);
}

module.exports = { alignVercelAppSecret };
