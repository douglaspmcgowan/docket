#!/usr/bin/env node
// Push ONE review card into the phone board (https://vault-review-mobile.vercel.app), from any
// machine. Thin bearer-auth client over the existing POST /api/sync?op=push — it does not touch the
// Blob store or the merge logic (the server owns those); it just builds the card envelope and POSTs.
//
// Auth/target resolution (so a fresh clone on another machine works with minimal setup):
//   secret: broker-injected $REVIEW_SECRET
//   url:    --url  ->  $REVIEW_URL  ->  https://vault-review-mobile.vercel.app
//
// Usage:
//   node enqueue.js --title "Ship the thing?" --options "Ship,Hold" --source "myproj: decisions"
//   node enqueue.js --title "..." -d "longer text" --link https://x.y --blocking
//   echo '{"title":"...","options":["Keep","Discard"]}' | node enqueue.js --file -   # JSON on stdin
//   node enqueue.js --file card.json
//   node enqueue.js --selftest        # offline check of the envelope builder
//
// NOTE (SentinelOne): this uses a bearer credential and uploads content to an external host, which the NASA
// EDR flags as exfiltration and may quarantine this file. It lives in git — re-checkout if it vanishes.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cloudAdmissible } = require('./api/_content-guard');
const { requireReviewSecret } = require('./api/_review-secret');

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'card';
const hash8 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

const LOCAL_URL = 'http://127.0.0.1:8471';
const CLOUD_URL = 'https://vault-review-mobile.vercel.app';
// A board URL is local only when it points at loopback.
const isLocalUrl = u => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(String(u));

// Pure: read a brief's src file into an inline body (the cloud can't reach the local path), keeping
// the original filepath as copyable metadata and deriving the format from the extension. readFile is
// injected (a path -> string|null) so this stays testable. Inline-body briefs pass through untouched.
function resolveBriefBody(o, readFile) {
  if (o.body !== undefined) return { ...o };
  if (typeof o.src !== 'string' || !o.src) throw new Error('a brief needs a "body" or a "src" path');
  const content = readFile(o.src);
  if (content == null) throw new Error('brief src not found: ' + o.src);
  const format = path.extname(o.src).toLowerCase() === '.html' ? 'html' : 'md';
  const out = { ...o, body: content, format, filepath: o.src };
  delete out.src;
  return out;
}

// Pure: preserve an explicit legacy local-first marker. Personal Docket cards publish to the
// authenticated cloud by default. Precedence: explicit CLI arg > card field > default false.
function resolveSensitive(o, base) {
  if (o.sensitive != null) return o.sensitive !== false;
  if (base && base.sensitive != null) return base.sensitive !== false;
  return false;
}

// Pure: turn options into a normalized card envelope matching the reviewer schema. No I/O.
function buildCard(o) {
  const base = o.card && typeof o.card === 'object' ? { ...o.card } : {};
  const title = o.title != null ? o.title : base.title;
  if (!title) throw new Error('a card needs a --title (or a "title" field in --file/stdin JSON)');
  const sensitive = resolveSensitive(o, base);

  // A brief is informational: no options, carries a rendered body (md/html) + its source filepath.
  const kind = o.kind || base.kind;
  if (kind === 'brief') {
    const submitted_at = base.submitted_at || o.now || new Date().toISOString();
    const source = o.source != null ? o.source : base.source || '';
    const brief = {
      kind: 'brief',
      title,
      body: o.body != null ? o.body : base.body || '',
      format: o.format || base.format || 'md',
      submitted_at,
      source,
      blocking: o.blocking != null ? o.blocking : !!base.blocking,
      origin: base.origin || { cwd: process.cwd() },
      id: o.id || base.id || (slug(title) + '--' + hash8(title + '|' + source + '|' + submitted_at)),
    };
    const filepath = o.filepath != null ? o.filepath : base.filepath;
    if (filepath) brief.filepath = filepath;
    if (o.project != null) brief.project = o.project; else if (base.project) brief.project = base.project;
    if (o.set != null) brief.set = o.set; else if (base.set) brief.set = base.set;
    if (Array.isArray(base.tags)) brief.tags = base.tags;
    brief.sensitive = sensitive;
    // FR-038: a brief may embed answerable review/decision cards, rendered + answered inline in the app.
    const embeds = Array.isArray(o.embeds) ? o.embeds : (Array.isArray(base.embeds) ? base.embeds : null);
    if (embeds && embeds.length) brief.embeds = embeds;
    return brief;
  }

  // A decision carries its type + that type's structural fields through to the store; only option-select
  // uses a plain options list. No forced Approve/Reject default (a tradeoff/tree/diff isn't a yes/no).
  if (kind === 'decision') {
    const submitted_at = base.submitted_at || o.now || new Date().toISOString();
    const source = o.source != null ? o.source : base.source || '';
    const pick = (k) => (o[k] !== undefined ? o[k] : base[k]);
    const d = {
      kind: 'decision',
      type: pick('type') || 'option-select',
      title,
      description: o.description != null ? o.description : base.description || '',
      submitted_at,
      source,
      blocking: o.blocking != null ? o.blocking : !!base.blocking,
      origin: base.origin || { cwd: process.cwd() },
      id: o.id || base.id || (slug(title) + '--' + hash8(title + '|' + source + '|' + submitted_at)),
    };
    for (const k of ['options', 'criteria', 'cells', 'door', 'cost_to_reverse', 'consequences',
                     'before', 'after', 'lang', 'nodes', 'artifact']) {
      const v = pick(k);
      if (v !== undefined) d[k] = v;
    }
    if (pick('project') != null) d.project = pick('project');
    if (pick('set') != null) d.set = pick('set');
    if (Array.isArray(base.tags)) d.tags = base.tags;
    d.sensitive = sensitive;
    return d;
  }

  const submitted_at = base.submitted_at || o.now || new Date().toISOString();
  const source = o.source != null ? o.source : base.source || '';
  const options = o.options && o.options.length ? o.options
    : (Array.isArray(base.options) && base.options.length ? base.options : ['Approve', 'Reject']);
  const sections = Array.isArray(base.sections) ? base.sections.slice() : [];
  if (o.link) sections.unshift({ label: 'Source', text: o.link });
  const card = {
    type: o.type || base.type || 'reviewer',
    title,
    description: o.description != null ? o.description : base.description || '',
    options,
    submitted_at,
    blocking: o.blocking != null ? o.blocking : !!base.blocking,
    source,
    sections,
    origin: base.origin || { cwd: process.cwd() },
    id: o.id || base.id || (slug(title) + '--' + hash8(title + '|' + source + '|' + submitted_at)),
  };
  if (o.project != null) card.project = o.project; else if (base.project) card.project = base.project;
  if (o.set != null) card.set = o.set; else if (base.set) card.set = base.set;
  if (Array.isArray(base.tags)) card.tags = base.tags;
  if (base.image) card.image = base.image;
  card.sensitive = sensitive;
  return card;
}

// Pure: one-line outcome label for a pulled result (Douglas's decision on a card).
function outcomeOf(r) {
  if (r.archived) return 'archived';
  if (r.action === 'more') return 'MORE — remake fuller';
  if (r.chosen) return 'chose: ' + r.chosen;
  if (r.comment != null) return 'comment only';
  return 'answered';
}

// Pure: keep results whose id contains the filter substring (case-insensitive); no filter -> all.
// Newest answered first, so a receiver sees the latest decisions on top. No I/O.
function filterResults(results, filter) {
  const f = typeof filter === 'string' ? filter.toLowerCase() : null;
  return (results || [])
    .filter(r => r && (!f || String(r.id).toLowerCase().includes(f)))
    .sort((a, b) => String(b.answered_at || '').localeCompare(String(a.answered_at || '')));
}

function parseArgs(argv) {
  const o = { options: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--title': o.title = next(); break;
      case '--description': case '-d': o.description = next(); break;
      case '--options': o.options = next().split(',').map(s => s.trim()).filter(Boolean); break;
      case '--option': (o.options = o.options || []).push(next()); break;
      case '--source': o.source = next(); break;
      case '--project': o.project = next(); break;
      case '--set': o.set = next(); break;
      case '--id': o.id = next(); break;             // reuse an existing id -> UPDATE that card in place
      case '--list':                                 // list cards (optionally filtered to a project) to find an id
        o.list = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? next() : true; break;
      case '--pull':                                 // RECEIVE Douglas's decisions (op=pull), optionally filtered by id substring
        o.pull = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? next() : true; break;
      case '--archive':
        if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('--archive needs a card id');
        o.archive = next(); break;
      case '--link': o.link = next(); break;
      case '--type': o.type = next(); break;
      case '--kind': o.kind = next(); break;
      case '--blocking': o.blocking = true; break;
      case '--public': o.sensitive = false; break;   // non-sensitive -> may go to the cloud
      case '--sensitive': o.sensitive = true; break; // explicit legacy local-first marker
      case '--url': o.url = next(); break;
      case '--file': o.file = next(); break;
      case '--groups': o.groups = true; break;
      case '--selftest': o.selftest = true; break;
      case '--help': case '-h': o.help = true; break;
      default: throw new Error('unknown arg: ' + a);
    }
  }
  return o;
}

function resolveSecret(environment = process.env) {
  return requireReviewSecret(environment);
}

async function push(card, url, secret) {
  const r = await fetch(url.replace(/\/$/, '') + '/api/sync?op=push', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [card] }),
  });
  if (!r.ok) throw new Error('push failed ' + r.status + ' ' + await r.text());
  return r.json();
}

async function archiveCard(id, url, secret, fetchFn = fetch) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('--archive needs a card id');
  const cardId = id.trim();
  const r = await fetchFn(url.replace(/\/$/, '') + '/api/submit', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: cardId, archived: true }),
  });
  if (!r.ok) throw new Error('archive failed ' + r.status + ' ' + await r.text());
  const body = await r.json();
  const result = body && body.result;
  if (!body || body.ok !== true || !result || result.id !== cardId ||
      result.archived !== true || typeof result.answered_at !== 'string' || !result.answered_at) {
    throw new Error('archive acknowledgement did not match ' + cardId);
  }
  return result;
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

const HELP = `enqueue.js — push one review card to the phone board.
  --title <t>        (required unless in --file/stdin JSON)
  -d, --description  card body
  --options "a,b"    comma list (or repeat --option); default: Approve,Reject
  --source "p: s"    "project: set" (drives grouping on the phone)
  --project / --set  explicit group overrides
  --id <id>          reuse an existing card's id -> UPDATE it in place (instead of adding a new card)
  --list [project]   list existing cards (id + kind + group + title) to find an id to --id-update
  --pull [idsub]     RECEIVE Douglas's decisions (op=pull), optionally filtered to ids containing <idsub>
  --archive <id>     archive one existing card and verify the returned result
  --link <url>       adds a Source section
  --blocking         mark as blocking
  --public           explicitly mark public (the default)
  --sensitive        legacy local-first marker; the authenticated bulk sync still publishes the card
  --type <t>         default: reviewer
  --file <path>      read a full JSON card (merged with generated id/submitted_at)
  --file -           read that JSON card from stdin
  --url <u>          override REVIEW_URL
  --groups           list existing projects/sets on the board (reuse before making new ones)
  --selftest         offline check, no network`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(HELP); return; }

  if (o.archive !== undefined) {
    const url = (o.url || process.env.REVIEW_URL || CLOUD_URL).replace(/\/$/, '');
    const result = await archiveCard(o.archive, url, resolveSecret());
    console.log('archived ' + result.id + '  @ ' + url);
    return;
  }

  // Surface the canonical project/set names already on the board, so a docket reuses them instead of
  // spawning near-duplicate groups. Read-only GET.
  if (o.groups) {
    const url = (o.url || process.env.REVIEW_URL || 'https://vault-review-mobile.vercel.app').replace(/\/$/, '');
    const r = await fetch(url + '/api/sync?op=groups', { headers: { 'Authorization': 'Bearer ' + resolveSecret() } });
    if (!r.ok) throw new Error('groups failed ' + r.status + ' ' + await r.text());
    const { groups } = await r.json();
    for (const g of groups) console.log(`${g.project}  (${g.count})${g.sets.length ? '\n  ' + g.sets.map(s => '• ' + s).join('\n  ') : ''}`);
    return;
  }

  // List existing cards (id + kind + group + title) so a docket can UPDATE one in place via --id instead
  // of pushing a near-duplicate. Optional value filters by project (case-insensitive substring). Read-only.
  if (o.list) {
    const url = (o.url || process.env.REVIEW_URL || 'https://vault-review-mobile.vercel.app').replace(/\/$/, '');
    const r = await fetch(url + '/api/items', { headers: { 'Authorization': 'Bearer ' + resolveSecret() } });
    if (!r.ok) throw new Error('list failed ' + r.status + ' ' + await r.text());
    const { items } = await r.json();
    const filt = typeof o.list === 'string' ? o.list.toLowerCase() : null;
    const kindOf = it => it.kind === 'brief' ? 'brief' : it.kind === 'decision' ? 'decision' : 'review';
    const grp = it => [it.project || (it.source || '').split(':')[0].trim() || 'Ungrouped', it.set].filter(Boolean).join(' / ');
    const rows = items.filter(it => !filt || grp(it).toLowerCase().includes(filt))
      .sort((a, b) => grp(a).localeCompare(grp(b)));
    for (const it of rows) console.log(`${kindOf(it).padEnd(8)} ${grp(it).padEnd(28)} ${it.id}\n         ${it.title || ''}`);
    console.log(`\n${rows.length} card(s)${filt ? ` matching "${o.list}"` : ''}. Update one: node enqueue.js --id <id> --title "..." ...`);
    return;
  }

  // RECEIVE: Douglas's decisions on docketed cards (op=pull). Symmetric with push — same env-var auth,
  // so it works from any machine whose approved broker injects REVIEW_SECRET into the child. A
  // pusher pulls back the result for the id it got at push time. Optional value filters by id substring.
  if (o.pull) {
    const url = (o.url || process.env.REVIEW_URL || 'https://vault-review-mobile.vercel.app').replace(/\/$/, '');
    const r = await fetch(url + '/api/sync?op=pull', { headers: { 'Authorization': 'Bearer ' + resolveSecret() } });
    if (!r.ok) throw new Error('pull failed ' + r.status + ' ' + await r.text());
    const { results } = await r.json();
    const rows = filterResults(results, o.pull);
    for (const it of rows) {
      const note = it.notes || it.comment || '';
      console.log(`${outcomeOf(it).padEnd(22)} ${it.id}${note ? '\n         ' + String(note).replace(/\s+/g, ' ').slice(0, 200) : ''}`);
    }
    const f = typeof o.pull === 'string' ? o.pull : null;
    console.log(`\n${rows.length} decision(s)${f ? ` matching "${o.pull}"` : ''}. action:'more' = remake that card fuller under a NEW id.`);
    return;
  }

  if (o.selftest) {
    const c = buildCard({ title: 'Ship the Thing?', options: ['Ship', 'Hold'], source: 'x: y', now: '2026-01-01T00:00:00.000Z' });
    const assert = (cond, msg) => { if (!cond) throw new Error('selftest FAILED: ' + msg); };
    assert(c.id === 'ship-the-thing--' + hash8('Ship the Thing?|x: y|2026-01-01T00:00:00.000Z'), 'id: ' + c.id);
    assert(buildCard({ title: 'Whatever', id: 'fixed-id-123', now: '2026-01-01T00:00:00.000Z' }).id === 'fixed-id-123', '--id must override the generated id (update-in-place)');
    assert(buildCard({ kind: 'brief', title: 'B', body: 'x', id: 'brief-fixed', now: '2026-01-01T00:00:00.000Z' }).id === 'brief-fixed', '--id must override for briefs too');
    assert(c.options.length === 2 && c.options[0] === 'Ship', 'options');
    assert(c.type === 'reviewer', 'type');
    assert(buildCard({ card: { title: 'A' } }).options[0] === 'Approve', 'default options');
    let threw = false; try { buildCard({}); } catch { threw = true; }
    assert(threw, 'missing-title must throw');
    // --pull receive helpers
    assert(filterResults([{ id: 'a', answered_at: '2' }, { id: 'b', answered_at: '1' }], null).length === 2, 'pull: no filter -> all');
    assert(filterResults([{ id: 'abc' }, { id: 'xyz' }], 'AB')[0].id === 'abc', 'pull: filter by id substring, case-insensitive');
    assert(filterResults([{ id: 'a', answered_at: '1' }, { id: 'b', answered_at: '2' }], null)[0].id === 'b', 'pull: newest answered first');
    assert(outcomeOf({ action: 'more' }).startsWith('MORE'), 'pull: more outcome label');
    assert(outcomeOf({ chosen: 'Ship' }) === 'chose: Ship', 'pull: chosen outcome label');
    // Personal Docket publishes by default while preserving explicit legacy local-first markers.
    assert(c.sensitive === false, 'default card must publish');
    assert(buildCard({ title: 'T', sensitive: false }).sensitive === false, '--public/sensitive:false must mark non-sensitive');
    assert(buildCard({ kind: 'brief', title: 'B', body: 'x' }).sensitive === false, 'brief publishes by default');
    assert(buildCard({ kind: 'decision', title: 'D', sensitive: false }).sensitive === false, 'decision honors sensitive:false');
    assert(buildCard({ card: { title: 'A', sensitive: false } }).sensitive === false, 'card-field sensitive:false respected');
    assert(isLocalUrl('http://127.0.0.1:8471') && isLocalUrl('http://localhost:8471/'), 'loopback urls are local');
    assert(!isLocalUrl('https://vault-review-mobile.vercel.app') && !isLocalUrl('http://127.0.0.1.evil.com'), 'cloud / spoofed host is NOT local');
    console.log('selftest OK');
    return;
  }

  // Read stdin ONLY when explicitly asked (--file -). Auto-reading fd 0 hangs when a caller (agent,
  // scheduled job) invokes with no TTY and no pipe, so it must be opt-in.
  let card = { ...o };
  if (o.file === '-') card.card = JSON.parse(readStdin());
  else if (o.file) card.card = JSON.parse(fs.readFileSync(o.file, 'utf8'));

  // A brief with a src path: read the file into an inline body before pushing (the cloud can't reach
  // the local path). Keeps the filepath as copyable metadata. readFile returns null on ENOENT so
  // resolveBriefBody can throw a clean "src not found".
  const kind = (card.card && card.card.kind) || card.kind;
  if (kind === 'brief') {
    const readFile = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
    const briefIn = card.card ? card.card : card;
    const resolved = resolveBriefBody(briefIn, readFile);
    if (card.card) card.card = resolved; else card = { ...resolved, card: undefined };
  }

  const envelope = buildCard(card);

  // Personal cards publish to the authenticated cloud by default. The explicit legacy
  // local-first marker remains confined to a loopback board.
  const explicitUrl = o.url || process.env.REVIEW_URL;
  const url = explicitUrl || (envelope.sensitive ? LOCAL_URL : CLOUD_URL);
  if (envelope.sensitive && !isLocalUrl(url)) {
    throw new Error('refusing to push a SENSITIVE card to a non-local board (' + url + '). Sensitive '
      + 'cards live only on the local mirror (http://127.0.0.1:8471). Mark it --public if it is NOT sensitive.');
  }
  if (!isLocalUrl(url) && !cloudAdmissible(envelope)) {
    throw new Error('refusing to push a card containing a sensitive flag or restricted CUI/NASA marker to the shared board');
  }
  const secret = resolveSecret();
  const res = await push(envelope, url, secret);
  console.log('pushed ' + (res.pushed || 0) + ' ' + (envelope.sensitive ? 'SENSITIVE' : 'public') + ' card -> ' + envelope.id + '  @ ' + url);

  // Public cards also mirror to the local board so it stays the full superset (local = everything,
  // cloud = the non-sensitive subset). Best-effort: a downed local server must not fail the cloud push.
  if (!envelope.sensitive && !isLocalUrl(url)) {
    try { const m = await push(envelope, LOCAL_URL, secret); console.log('  mirrored to local (' + (m.pushed || 0) + ')'); }
    catch (e) { console.log('  local mirror skipped: ' + String(e.message).split('\n')[0]); }
  }
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { buildCard, resolveBriefBody, slug, hash8, filterResults, outcomeOf, resolveSensitive, isLocalUrl, archiveCard };
