const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, describe, it } = require('node:test');

const temporaryRoots = [];
function temporaryStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-cli-'));
  temporaryRoots.push(dir);
  return dir;
}

// api/_store binds its backend at module load and the cloud backend needs @vercel/blob, which is a
// deploy-time dependency. Point every require in this file at a disposable local store first.
process.env.LOCAL_STORE_DIR = temporaryStore();

const sync = require('../api/sync');
const cli = require('../docket-cli');
after(() => {
  for (const dir of temporaryRoots) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function card(id, extra = {}) {
  return { id, kind: 'review', title: `Card ${id}`, description: 'body', project: 'P', set: 'S', ...extra };
}

// A single store directory is reused per describe block because api/_store binds its backend at
// module load; the CLI's local adapter re-points LOCAL_STORE_DIR at the same directory each time.
const STORE = process.env.LOCAL_STORE_DIR;
const local = args => cli.run(cli.parseArgs(['--target', 'local', '--store', STORE, ...args]));

describe('api/sync admin helpers', () => {
  it('idList refuses anything that is not a usable string array', () => {
    assert.deepEqual(sync.idList(['a', ' b ', '', 3, null, 'a']), ['a', 'b']);
    assert.deepEqual(sync.idList('a'), []);
    assert.deepEqual(sync.idList(undefined), []);
  });

  it('applyDelete removes only the ids present and reports them', () => {
    const document = { a: card('a'), b: card('b') };
    assert.deepEqual(sync.applyDelete(document, ['a', 'missing']), ['a']);
    assert.deepEqual(Object.keys(document), ['b']);
  });

  it('applyMove regroups by id, leaves omitted fields alone, and clears on empty', () => {
    const document = { a: card('a'), b: card('b') };
    assert.deepEqual(sync.applyMove(document, ['a'], { project: 'Q' }), ['a']);
    assert.equal(document.a.project, 'Q');
    assert.equal(document.a.set, 'S', 'an omitted field must not be touched');
    assert.equal(document.b.project, 'P', 'an unnamed card must not move');
    sync.applyMove(document, ['a'], { set: '' });
    assert.equal('set' in document.a, false, 'an empty value clears the grouping');
    assert.deepEqual(sync.applyMove(document, ['a'], { project: 'Q' }), [], 'a no-op move reports nothing');
  });
});

describe('docket-cli argument parsing', () => {
  it('defaults to the cloud target', () => {
    assert.equal(cli.parseArgs(['list']).target, 'cloud');
    assert.equal(cli.parseArgs(['list', '--local']).target, 'local');
    assert.equal(cli.parseArgs(['list', '--target', 'local']).target, 'local');
  });

  it('rejects unknown commands, unknown flags, and bad targets', () => {
    assert.throws(() => cli.parseArgs(['nope']), /unknown command/);
    assert.throws(() => cli.parseArgs(['list', '--bogus']), /unknown option/);
    assert.throws(() => cli.parseArgs(['list', '--target', 'mars']), /cloud or local/);
  });

  it('coerces --field values to JSON scalars', () => {
    assert.equal(cli.coerceFieldValue('true'), true);
    assert.equal(cli.coerceFieldValue('12'), 12);
    assert.equal(cli.coerceFieldValue('null'), null);
    assert.deepEqual(cli.coerceFieldValue('["a"]'), ['a']);
    assert.equal(cli.coerceFieldValue('resolved-2026-08-05'), 'resolved-2026-08-05');
  });
});

describe('docket-cli broker request mode', () => {
  it('reads a string argv array and refuses a redirected cloud URL', () => {
    const dir = temporaryStore();
    fs.writeFileSync(path.join(dir, 'cli-request.json'), JSON.stringify({ argv: ['list', '--ids-only'] }));
    assert.deepEqual(cli.loadRequest(dir), ['list', '--ids-only']);

    fs.writeFileSync(path.join(dir, 'cli-request.json'), JSON.stringify({ argv: ['list', '--url', 'https://evil.example'] }));
    assert.throws(() => cli.loadRequest(dir), /--url is not permitted/);

    fs.writeFileSync(path.join(dir, 'cli-request.json'), JSON.stringify({ argv: ['list', 7] }));
    assert.throws(() => cli.loadRequest(dir), /string argument array/);
  });
});

describe('docket-cli CRUD against the local mirror', () => {
  it('creates, reads, updates, moves, archives, unarchives, and deletes', async () => {
    const seed = path.join(STORE, 'seed.json');
    fs.writeFileSync(seed, JSON.stringify([card('c1'), card('c2'), card('c3', { blocking: true })]));

    const created = await local(['create', '--file', seed]);
    assert.equal(created.pushed, 3);

    const listed = await local(['list', '--ids-only']);
    assert.deepEqual(listed.items, ['c1', 'c2', 'c3']);
    assert.equal(listed.total, 3);

    const got = await local(['get', 'c1', 'nope']);
    assert.equal(got.items[0].title, 'Card c1');
    assert.deepEqual(got.missing, ['nope']);

    const updated = await local(['update', 'c1', '--field', 'title=Renamed', '--field', 'blocking=true']);
    assert.deepEqual(updated.updated, ['c1']);
    const afterUpdate = await local(['get', 'c1']);
    assert.equal(afterUpdate.items[0].title, 'Renamed');
    assert.equal(afterUpdate.items[0].blocking, true);
    assert.equal(afterUpdate.items[0].description, 'body', 'update must patch, not replace');

    const moved = await local(['move', 'c2', '--project', 'Q', '--set', 'T']);
    assert.deepEqual(moved.moved, ['c2']);
    assert.equal((await local(['get', 'c2'])).items[0].project, 'Q');

    const filtered = await local(['list', '--project', 'Q', '--ids-only']);
    assert.deepEqual(filtered.items, ['c2']);
    const blocking = await local(['list', '--blocking', '--ids-only']);
    assert.deepEqual(blocking.items.sort(), ['c1', 'c3']);
    const searched = await local(['list', '--search', 'Renamed', '--ids-only']);
    assert.deepEqual(searched.items, ['c1']);

    const archived = await local(['archive', 'c3']);
    assert.deepEqual(archived.written, ['c3']);
    assert.deepEqual((await local(['list', '--ids-only'])).items, ['c1', 'c2'], 'archived cards leave the pending board');
    assert.deepEqual((await local(['list', '--resolved', '--ids-only'])).items, ['c3']);
    assert.deepEqual((await local(['list', '--all', '--ids-only'])).items, ['c1', 'c2', 'c3']);

    await local(['unarchive', 'c3']);
    assert.deepEqual((await local(['list', '--ids-only'])).items, ['c1', 'c2', 'c3']);

    // `answer` is the Obsidian mirror's write path: a real chosen option, not an archive.
    await assert.rejects(() => local(['answer', 'c3']), /requires --chosen/);
    await assert.rejects(
      () => local(['answer', 'c3', '--chosen', 'Yes', '--answered-at', 'not-a-date']),
      /ISO-8601/,
    );
    const dryAnswer = await local(['answer', 'c3', '--chosen', 'Yes', '--dry-run']);
    assert.deepEqual(dryAnswer.wouldAnswer, ['c3']);
    assert.deepEqual((await local(['results'])).results.filter(r => r.id === 'c3'), [], 'a dry run must not mutate');

    const answered = await local([
      'answer', 'c3', '--chosen', 'Yes', '--comment', 'because', '--answered-at', '2026-08-06T12:00:00.000Z',
    ]);
    assert.deepEqual(answered.answered, ['c3']);
    const c3Result = (await local(['get', 'c3'])).results[0];
    assert.equal(c3Result.chosen, 'Yes');
    assert.equal(c3Result.comment, 'because');
    assert.equal(c3Result.answered_at, '2026-08-06T12:00:00.000Z');
    assert.equal(c3Result.archived, undefined, 'an answer is not an archive');
    assert.deepEqual((await local(['list', '--ids-only'])).items, ['c1', 'c2'], 'an answered card leaves the pending board');

    // A comment with no chosen option is a legitimate outcome too.
    await local(['answer', 'c3', '--comment', 'thinking about it']);
    assert.equal((await local(['get', 'c3'])).results[0].chosen, null);

    await local(['unarchive', 'c3']);
    assert.deepEqual((await local(['list', '--ids-only'])).items, ['c1', 'c2', 'c3']);

    const groups = await local(['groups']);
    assert.equal(groups.groups.find(g => g.project === 'Q').total, 1);

    const dry = await local(['delete', 'c2', '--dry-run']);
    assert.deepEqual(dry.wouldDelete, ['c2']);
    assert.deepEqual((await local(['list', '--ids-only'])).items, ['c1', 'c2', 'c3'], 'a dry run must not mutate');

    const deleted = await local(['delete', 'c2']);
    assert.deepEqual(deleted.deleted, ['c2']);
    assert.deepEqual((await local(['list', '--ids-only'])).items, ['c1', 'c3']);

    const exported = path.join(STORE, 'export.json');
    const exportOutcome = await local(['export', '--out', exported]);
    assert.equal(exportOutcome.items, 2);
    assert.equal(JSON.parse(fs.readFileSync(exported, 'utf8')).items.length, 2);
  });

  it('refuses destructive commands without ids', async () => {
    await assert.rejects(local(['delete']), /card id is required/);
    await assert.rejects(local(['move', 'c1']), /requires --project/);
  });
});

describe('docket-cli cloud adapter contract', () => {
  const originalFetch = global.fetch;
  after(() => { global.fetch = originalFetch; });

  function stubFetch(routes) {
    const calls = [];
    global.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, auth: (init.headers || {}).Authorization });
      const route = Object.keys(routes).find(key => String(url).includes(key));
      if (!route) return { ok: false, status: 400, text: async () => 'bad op' };
      return routes[route];
    };
    return calls;
  }
  const json = payload => ({ ok: true, status: 200, text: async () => JSON.stringify(payload), json: async () => payload });

  it('sends the bearer as a header only and never in the URL', async () => {
    process.env.REVIEW_SECRET = 'test-secret-value-1234567890';
    const calls = stubFetch({ 'op=list': json({ items: [card('a')], results: [], tickets: [], reads: {} }) });
    const adapter = cli.cloudAdapter('https://example.invalid');
    const all = await adapter.readAll();
    assert.equal(all.items.length, 1);
    assert.equal(all.complete, true);
    assert.equal(calls[0].auth, 'Bearer test-secret-value-1234567890');
    assert.equal(calls[0].url.includes('test-secret'), false, 'the bearer must never enter a URL');
    delete process.env.REVIEW_SECRET;
  });

  it('falls back to /api/items when a deployment has no ?op=list', async () => {
    process.env.REVIEW_SECRET = 'test-secret-value-1234567890';
    stubFetch({
      'op=list': { ok: false, status: 400, text: async () => 'bad op' },
      '/api/items': json({ items: [card('a')], answered: ['z'], reads: [] }),
      'op=pull': json({ results: [{ id: 'z', archived: true, answered_at: '2026-01-01T00:00:00Z' }] }),
    });
    const all = await cli.cloudAdapter('https://example.invalid').readAll();
    assert.equal(all.complete, false);
    assert.deepEqual(all.items.map(i => i.id), ['a', 'z']);
    assert.equal(all.results.length, 1);
    delete process.env.REVIEW_SECRET;
  });

  it('falls back to /api/submit when a deployment has no ?op=results-put', async () => {
    process.env.REVIEW_SECRET = 'test-secret-value-1234567890';
    const calls = stubFetch({
      'op=results-put': { ok: false, status: 400, text: async () => 'bad op' },
      '/api/submit': json({ ok: true }),
    });
    const outcome = await cli.cloudAdapter('https://example.invalid')
      .putResults([{ id: 'a', archived: true, answered_at: '2026-01-01T00:00:00Z' }]);
    assert.deepEqual(outcome.written, ['a']);
    assert.equal(outcome.legacyEndpoint, true);
    assert.equal(calls.at(-1).body.archived, true);
    delete process.env.REVIEW_SECRET;
  });

  it('requires the broker-injected secret', () => {
    delete process.env.REVIEW_SECRET;
    assert.throws(() => cli.cloudAdapter('https://example.invalid'), /Invoke-WithBitwardenSecret/);
  });

  // The three fallbacks below cover the live vault-review-mobile deployment, which spells several
  // sync ops (or their bodies/responses) differently than the admin surface this CLI was written
  // against. Verified live against the deployment too; these lock the behavior in for CI.

  it('replays a chosen answer through /api/submit instead of collapsing it into an archive', async () => {
    process.env.REVIEW_SECRET = 'test-secret-value-1234567890';
    const calls = stubFetch({
      'op=results-put': { ok: false, status: 400, text: async () => 'bad op' },
      '/api/submit': json({ ok: true }),
    });
    const outcome = await cli.cloudAdapter('https://example.invalid')
      .putResults([{ id: 'a', chosen: 'yes', comment: 'note', answered_at: '2026-01-01T00:00:00Z' }]);
    assert.deepEqual(outcome.written, ['a']);
    assert.equal(outcome.legacyEndpoint, true);
    assert.equal(calls.at(-1).body.chosen, 'yes');
    assert.equal(calls.at(-1).body.notes, 'note');
    assert.equal(calls.at(-1).body.archived, undefined);
    delete process.env.REVIEW_SECRET;
  });

  it('falls back to toProject/toSet when a deployment rejects project/set on ?op=move', async () => {
    process.env.REVIEW_SECRET = 'test-secret-value-1234567890';
    // Two different responses for the same op: first call (project/set) fails, second (toProject/
    // toSet) succeeds. stubFetch only supports one response per route, so drive it by hand instead.
    const calls = [];
    let attempt = 0;
    global.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
      attempt += 1;
      if (attempt === 1) return { ok: false, status: 400, text: async () => 'toProject or toSet required' };
      return json({ ok: true, moved: ['a'] });
    };
    const outcome = await cli.cloudAdapter('https://example.invalid').moveItems(['a'], { project: 'P', set: 'S' });
    assert.deepEqual(outcome.moved, ['a']);
    assert.equal(outcome.legacyEndpoint, true);
    assert.equal(calls[0].body.project, 'P');
    assert.equal(calls[1].body.toProject, 'P');
    assert.equal(calls[1].body.toSet, 'S');
    delete process.env.REVIEW_SECRET;
  });

  it('cascades delete --with-results itself when a deployment reports deleted as a count', async () => {
    process.env.REVIEW_SECRET = 'test-secret-value-1234567890';
    const calls = stubFetch({
      'op=delete': json({ ok: true, deleted: 1, removed: [{ id: 'a' }] }),
      'op=results-delete': { ok: false, status: 400, text: async () => 'bad op' },
      'op=unarchive': json({ ok: true, unarchived: 1, skipped: [] }),
    });
    const outcome = await cli.cloudAdapter('https://example.invalid').deleteItems(['a'], true);
    assert.deepEqual(outcome.deleted, ['a']);
    assert.deepEqual(outcome.deletedResults, ['a']);
    assert.equal(calls.some(c => c.url.includes('op=unarchive')), true);
    delete process.env.REVIEW_SECRET;
  });
});
