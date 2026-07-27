const test = require('node:test');
const assert = require('node:assert/strict');

const authed = require('../api/_auth');
const LOCAL_REQUEST = Symbol.for('docket.localRequest');

function response() {
  return {
    statusCode: undefined,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test('cloud-style requests still fail closed when APP_SECRET is absent', () => {
  const previous = process.env.APP_SECRET;
  delete process.env.APP_SECRET;
  try {
    const res = response();
    assert.equal(authed({ headers: {} }, res), false);
    assert.equal(res.statusCode, 500);
  } finally {
    if (previous === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = previous;
  }
});

test('an HTTP header cannot spoof the local-server trust marker', () => {
  const previous = process.env.APP_SECRET;
  delete process.env.APP_SECRET;
  try {
    const res = response();
    assert.equal(authed({ headers: { 'x-docket-local': 'true' } }, res), false);
    assert.equal(res.statusCode, 500);
  } finally {
    if (previous === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = previous;
  }
});

test('the in-process loopback marker bypasses cloud passcode auth', () => {
  const previous = process.env.APP_SECRET;
  delete process.env.APP_SECRET;
  try {
    const req = { headers: {}, [LOCAL_REQUEST]: true };
    assert.equal(authed(req, response()), true);
  } finally {
    if (previous === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = previous;
  }
});
