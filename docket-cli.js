#!/usr/bin/env node
// Docket CLI — full CRUD over the Docket card store for any harness agent.
//
// The CLOUD board is the default target. The local SQLite store is the mirror/offline path.
//
//   node docket-cli.js list --target local
//   node docket-cli.js list                      # cloud (needs REVIEW_SECRET in the environment)
//
// Agents never hold the bearer. Cloud commands run through the pinned broker tuple:
//   & "$env:USERPROFILE\.agents\tools\Invoke-WithBitwardenSecret.ps1" -CommandId "docket-admin"
// which starts THIS file with the single fixed argument `--from-request`. The requested
// subcommand travels in <store>/cli-request.json, written by docket.ps1 before the broker runs.
// Request mode is deliberately narrower than argv mode: the cloud URL cannot be overridden there,
// so a tampered request file can never redirect the injected bearer to another host.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_CLOUD_URL = 'https://vault-review-mobile.vercel.app';
const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir();
const DEFAULT_STORE = path.join(HOME, '.docket-local');
const REQUEST_FILE = 'cli-request.json';
const RESPONSE_FILE = 'cli-response.json';

const COMMANDS = new Set([
  'list', 'get', 'create', 'update', 'delete', 'move', 'archive', 'unarchive',
  'answer', 'results', 'results-delete', 'groups', 'push', 'sync', 'prune', 'mirror',
  'export', 'import', 'help',
]);

class CliError extends Error {}

// ---------------------------------------------------------------- argument parsing

function parseArgs(argv) {
  const options = {
    command: null,
    ids: [],
    target: 'cloud',
    store: null,
    url: null,
    pretty: false,
    dryRun: false,
    withResults: false,
    orphans: false,
    idsOnly: false,
    all: false,
    resolved: false,
    archive: false,
    project: undefined,
    set: undefined,
    kind: null,
    blocking: null,
    file: null,
    out: null,
    outbox: null,
    against: 'local',
    to: 'local',
    comment: null,
    chosen: null,
    answeredAt: null,
    fields: null,
    limit: null,
    search: null,
    sets: {},
  };
  const needsValue = new Set([
    '--target', '--store', '--url', '--project', '--set', '--kind', '--file',
    '--out', '--outbox', '--against', '--to', '--comment', '--fields', '--limit', '--search',
    '--chosen', '--answered-at',
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('-')) {
      if (!options.command) options.command = token;
      else options.ids.push(token);
      continue;
    }
    if (token === '--field') {
      const pair = argv[++i];
      if (typeof pair !== 'string' || !pair.includes('=')) throw new CliError('--field expects key=value');
      const at = pair.indexOf('=');
      options.sets[pair.slice(0, at)] = pair.slice(at + 1);
      continue;
    }
    if (needsValue.has(token)) {
      const value = argv[++i];
      if (value === undefined) throw new CliError(`${token} expects a value`);
      const key = {
        '--target': 'target', '--store': 'store', '--url': 'url', '--project': 'project',
        '--set': 'set', '--kind': 'kind', '--file': 'file', '--out': 'out', '--outbox': 'outbox',
        '--against': 'against', '--to': 'to', '--comment': 'comment', '--fields': 'fields',
        '--limit': 'limit', '--search': 'search',
        '--chosen': 'chosen', '--answered-at': 'answeredAt',
      }[token];
      options[key] = value;
      continue;
    }
    switch (token) {
      case '--pretty': options.pretty = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--with-results': options.withResults = true; break;
      case '--orphans': options.orphans = true; break;
      case '--ids-only': options.idsOnly = true; break;
      case '--all': options.all = true; break;
      case '--resolved': options.resolved = true; break;
      case '--archive': options.archive = true; break;
      case '--blocking': options.blocking = true; break;
      case '--json': break; // JSON is always the output format; accepted for readability
      case '--local': options.target = 'local'; break;
      case '--cloud': options.target = 'cloud'; break;
      case '-h': case '--help': options.command = 'help'; break;
      default: throw new CliError(`unknown option: ${token}`);
    }
  }
  if (!options.command) options.command = 'help';
  if (!COMMANDS.has(options.command)) throw new CliError(`unknown command: ${options.command}`);
  if (!['cloud', 'local'].includes(options.target)) throw new CliError('--target must be cloud or local');
  if (!options.store) options.store = process.env.LOCAL_STORE_DIR || DEFAULT_STORE;
  if (options.limit !== null) {
    const n = Number(options.limit);
    if (!Number.isInteger(n) || n < 1) throw new CliError('--limit must be a positive integer');
    options.limit = n;
  }
  return options;
}

// ---------------------------------------------------------------- adapters
// Both adapters expose the same six mutation primitives, so every command below is written once.

function localAdapter(storeDir) {
  process.env.LOCAL_STORE_DIR = storeDir;
  // Required lazily and after LOCAL_STORE_DIR is set: _store picks its backend at module load.
  const store = require('./api/_store');
  const sync = require('./api/sync');
  const asList = document => Object.values(document || {});
  return {
    name: 'local',
    location: storeDir,
    async readAll() {
      const all = await store.readAll();
      return {
        items: asList(all['items.json']),
        results: asList(all['results.json']),
        tickets: asList(all['tickets.json']),
        reads: all['reads.json'] || {},
      };
    },
    async upsertItems(items) {
      const { validateItem } = require('./api/_schema');
      const accepted = [];
      let refused = 0;
      for (const item of items) {
        try { validateItem(item); accepted.push(item); } catch { refused += 1; }
      }
      if (accepted.length) {
        await store.updateItems(document => {
          for (const item of accepted) document[item.id] = item;
          return document;
        });
      }
      return { pushed: accepted.length, refused };
    },
    async deleteItems(ids, withResults) {
      const outcome = await store.updateItems(document => ({
        document, result: sync.applyDelete(document, ids),
      }));
      let deletedResults = [];
      if (withResults) {
        const r = await store.updateResults(document => ({ document, result: sync.applyDelete(document, ids) }));
        deletedResults = r.result;
      }
      return { deleted: outcome.result, deletedResults };
    },
    async moveItems(ids, spec) {
      const outcome = await store.updateItems(document => ({
        document, result: sync.applyMove(document, ids, spec),
      }));
      return { moved: outcome.result };
    },
    async putResults(results) {
      const outcome = await store.updateResults(document => {
        for (const result of results) document[result.id] = result;
        return { document, result: results.map(r => r.id) };
      });
      return { written: outcome.result };
    },
    async deleteResults(ids) {
      const outcome = await store.updateResults(document => ({
        document, result: sync.applyDelete(document, ids),
      }));
      return { deleted: outcome.result };
    },
  };
}

function cloudAdapter(url) {
  const base = String(url).replace(/\/$/, '');
  const { requireReviewSecret } = require('./api/_review-secret');
  const secret = requireReviewSecret(); // throws with broker guidance when absent
  async function call(op, method, body) {
    const headers = { Authorization: `Bearer ${secret}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}/api/sync?op=${encodeURIComponent(op)}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) throw new CliError(`cloud ${op} failed ${response.status}: ${text.slice(0, 400)}`);
    try { return JSON.parse(text); } catch { throw new CliError(`cloud ${op} returned non-JSON`); }
  }
  return {
    name: 'cloud',
    location: base,
    call,
    async readAll() {
      try {
        const payload = await call('list', 'GET');
        return {
          items: payload.items || [],
          results: payload.results || [],
          tickets: payload.tickets || [],
          reads: payload.reads || {},
          complete: true,
        };
      } catch (error) {
        // A deployment older than the admin surface has no ?op=list. Reconstruct the inventory
        // from the two endpoints every deployment has always had, and say so in `complete`.
        if (!/failed 40[04]/.test(String(error.message))) throw error;
        const headers = { Authorization: `Bearer ${secret}` };
        const itemsResponse = await fetch(`${base}/api/items`, { headers });
        if (!itemsResponse.ok) throw new CliError(`cloud items failed ${itemsResponse.status}`);
        const itemsPayload = await itemsResponse.json();
        const pull = await call('pull', 'GET');
        const pending = itemsPayload.items || [];
        const answered = itemsPayload.answered || [];
        const pendingIds = new Set(pending.map(i => i.id));
        return {
          items: pending.concat(answered.filter(id => !pendingIds.has(id)).map(id => ({ id, _answeredOnly: true }))),
          results: pull.results || [],
          tickets: [],
          reads: Object.fromEntries((itemsPayload.reads || []).map(id => [id, true])),
          complete: false,
          legacyEndpoint: true,
        };
      }
    },
    async upsertItems(items) {
      if (!items.length) return { pushed: 0, refused: 0 };
      const r = await call('push', 'POST', { items });
      return { pushed: r.pushed || 0, refused: r.refused || 0 };
    },
    async deleteItems(ids, withResults) {
      const r = await call('delete', 'POST', { ids, withResults: withResults === true });
      return { deleted: r.deleted || [], deletedResults: r.deletedResults || [] };
    },
    async moveItems(ids, spec) {
      const r = await call('move', 'POST', { ids, ...spec });
      return { moved: r.moved || [] };
    },
    async putResults(results) {
      try {
        const r = await call('results-put', 'POST', { results });
        return { written: r.written || [] };
      } catch (error) {
        if (!/failed 40[04]/.test(String(error.message))) throw error;
        // Deployment older than the admin surface: /api/submit has always accepted an archive.
        const written = [];
        const failed = [];
        for (const result of results) {
          const response = await fetch(`${base}/api/submit`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: result.id, archived: true, ...(result.note ? { notes: result.note } : {}) }),
          });
          if (response.ok) written.push(result.id);
          else failed.push({ id: result.id, status: response.status });
        }
        return { written, failed, legacyEndpoint: true };
      }
    },
    async deleteResults(ids) {
      try {
        const r = await call('results-delete', 'POST', { ids });
        return { deleted: r.deleted || [] };
      } catch (error) {
        if (!/failed 40[04]/.test(String(error.message))) throw error;
        // The live vault-review-mobile deployment predates the admin surface and spells the same
        // clear-a-result operation `?op=unarchive`. It answers with a count plus the skipped ids,
        // so normalise back to the id list every caller here expects.
        const r = await call('unarchive', 'POST', { ids });
        const skipped = new Set((r.skipped || []).map(s => (s && s.id) || s));
        return {
          deleted: ids.filter(id => !skipped.has(id)),
          skipped: r.skipped || [],
          legacyEndpoint: true,
        };
      }
    },
  };
}

function makeAdapter(options) {
  return options.target === 'local'
    ? localAdapter(options.store)
    : cloudAdapter(options.url || process.env.REVIEW_URL || DEFAULT_CLOUD_URL);
}

// ---------------------------------------------------------------- helpers

function readJsonInput(options) {
  if (!options.file) throw new CliError('--file <path-to-json|jsonl|directory> is required');
  const target = path.resolve(options.file);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return fs.readdirSync(target)
      .filter(name => name.endsWith('.json'))
      .sort()
      .map(name => JSON.parse(fs.readFileSync(path.join(target, name), 'utf8')));
  }
  const raw = fs.readFileSync(target, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && !parsed.id) return Object.values(parsed);
  return [parsed];
}

function coerceFieldValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function selectItems(items, results, options) {
  const answered = new Set(results.map(r => r.id));
  let selected = items.filter(Boolean);
  if (!options.all) {
    selected = selected.filter(item => (options.resolved ? answered.has(item.id) : !answered.has(item.id)));
  }
  if (options.project !== undefined) selected = selected.filter(i => i.project === options.project);
  if (options.set !== undefined) selected = selected.filter(i => i.set === options.set);
  if (options.kind) selected = selected.filter(i => i.kind === options.kind);
  if (options.blocking === true) selected = selected.filter(i => i.blocking === true);
  if (options.search) {
    const needle = options.search.toLowerCase();
    selected = selected.filter(i => JSON.stringify(i).toLowerCase().includes(needle));
  }
  selected.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (options.limit) selected = selected.slice(0, options.limit);
  return selected;
}

function project(items, options) {
  if (options.idsOnly) return items.map(i => i.id);
  if (options.fields) {
    const fields = options.fields.split(',').map(f => f.trim()).filter(Boolean);
    return items.map(item => Object.fromEntries(fields.map(f => [f, item[f]])));
  }
  return items;
}

function requireIds(options) {
  if (!options.ids.length) throw new CliError('at least one card id is required');
  return options.ids;
}

const HELP = `docket-cli — full CRUD over the Docket board (cloud is the default target)

  list      [--all|--resolved] [--project P] [--set S] [--kind K] [--blocking]
            [--search TEXT] [--fields a,b] [--ids-only] [--limit N]
  get       <id...>
  create    --file <card.json|cards.json|dir>
  update    <id...> [--file patch.json] [--field key=value ...]
  delete    <id...> [--with-results]
  move      <id...> [--project P] [--set S]
  archive   <id...> [--comment TEXT]
  unarchive <id...>
  answer    <id...> --chosen "<option label>" [--comment TEXT] [--answered-at ISO]
  results   [--orphans]
  results-delete <id...>
  groups
  push                       upsert every unresolved local card to the cloud
  sync                       push, then pull cloud decisions into the local store
  prune     [--dry-run] [--archive]         reconcile cloud against local: delete (default) or
                                            archive (non-destructive) the cloud-only cards
  mirror    --to local|cloud [--dry-run]    make the destination match the source exactly
  export    --out <file>
  import    --outbox <dir>

Global: --target cloud|local (default cloud) | --local | --cloud
        --store <dir> --url <base> --pretty --dry-run
`;

// ---------------------------------------------------------------- commands

async function run(options) {
  if (options.command === 'help') return { help: HELP.trim() };

  const adapter = makeAdapter(options);
  const context = { target: adapter.name, location: adapter.location };

  switch (options.command) {
    case 'list': {
      const { items, results } = await adapter.readAll();
      const selected = selectItems(items, results, options);
      return { ...context, count: selected.length, total: items.length, items: project(selected, options) };
    }
    case 'get': {
      const ids = requireIds(options);
      const { items, results } = await adapter.readAll();
      const byId = new Map(items.map(i => [i.id, i]));
      const resultsById = new Map(results.map(r => [r.id, r]));
      return {
        ...context,
        items: ids.map(id => byId.get(id) || null),
        results: ids.map(id => resultsById.get(id) || null),
        missing: ids.filter(id => !byId.has(id)),
      };
    }
    case 'create': {
      const cards = readJsonInput(options);
      if (options.dryRun) return { ...context, dryRun: true, wouldCreate: cards.map(c => c.id) };
      return { ...context, ...(await adapter.upsertItems(cards)) };
    }
    case 'update': {
      const ids = requireIds(options);
      const patchFromFile = options.file ? readJsonInput(options)[0] : {};
      const patch = { ...patchFromFile };
      for (const [key, raw] of Object.entries(options.sets)) patch[key] = coerceFieldValue(raw);
      if (options.project !== undefined) patch.project = options.project;
      if (options.set !== undefined) patch.set = options.set;
      delete patch.id;
      const { items } = await adapter.readAll();
      const byId = new Map(items.map(i => [i.id, i]));
      const missing = ids.filter(id => !byId.has(id));
      const updated = ids.filter(id => byId.has(id)).map(id => ({ ...byId.get(id), ...patch, id }));
      if (options.dryRun) return { ...context, dryRun: true, wouldUpdate: updated.map(i => i.id), missing };
      const outcome = updated.length ? await adapter.upsertItems(updated) : { pushed: 0, refused: 0 };
      return { ...context, ...outcome, updated: updated.map(i => i.id), missing };
    }
    case 'delete': {
      const ids = requireIds(options);
      if (options.dryRun) return { ...context, dryRun: true, wouldDelete: ids };
      return { ...context, ...(await adapter.deleteItems(ids, options.withResults)) };
    }
    case 'move': {
      const ids = requireIds(options);
      const spec = {};
      if (options.project !== undefined) spec.project = options.project;
      if (options.set !== undefined) spec.set = options.set;
      if (!Object.keys(spec).length) throw new CliError('move requires --project and/or --set');
      if (options.dryRun) return { ...context, dryRun: true, wouldMove: ids, spec };
      return { ...context, ...(await adapter.moveItems(ids, spec)), spec };
    }
    case 'archive': {
      const ids = requireIds(options);
      const answeredAt = new Date().toISOString();
      const results = ids.map(id => ({
        id, archived: true, answered_at: answeredAt,
        ...(options.comment ? { note: options.comment } : {}),
      }));
      if (options.dryRun) return { ...context, dryRun: true, wouldArchive: ids };
      return { ...context, ...(await adapter.putResults(results)), answered_at: answeredAt };
    }
    case 'unarchive': {
      const ids = requireIds(options);
      if (options.dryRun) return { ...context, dryRun: true, wouldUnarchive: ids };
      return { ...context, ...(await adapter.deleteResults(ids)) };
    }
    case 'answer': {
      // Records a real answer, not an archive. This is the write path the Obsidian mirror needs:
      // a decision block Douglas ticks in the vault becomes a Docket result under the same id.
      const ids = requireIds(options);
      const chosen = typeof options.chosen === 'string' ? options.chosen.trim() : '';
      if (!chosen && !options.comment) throw new CliError('answer requires --chosen <option> and/or --comment <text>');
      const answeredAt = options.answeredAt || new Date().toISOString();
      if (Number.isNaN(Date.parse(answeredAt))) throw new CliError('--answered-at must be an ISO-8601 timestamp');
      const results = ids.map(id => (chosen
        ? { id, chosen, answered_at: answeredAt, ...(options.comment ? { comment: options.comment } : {}) }
        : { id, chosen: null, comment: options.comment, answered_at: answeredAt }));
      if (options.dryRun) return { ...context, dryRun: true, wouldAnswer: ids, chosen: chosen || null };
      return { ...context, ...(await adapter.putResults(results)), answered: ids, answered_at: answeredAt };
    }
    case 'results': {
      const { items, results } = await adapter.readAll();
      const known = new Set(items.map(i => i.id));
      const orphans = results.filter(r => !known.has(r.id));
      return options.orphans
        ? { ...context, count: orphans.length, orphans }
        : { ...context, count: results.length, orphanCount: orphans.length, results };
    }
    case 'results-delete': {
      const ids = requireIds(options);
      if (options.dryRun) return { ...context, dryRun: true, wouldDelete: ids };
      return { ...context, ...(await adapter.deleteResults(ids)) };
    }
    case 'groups': {
      const { items, results } = await adapter.readAll();
      const answered = new Set(results.map(r => r.id));
      const groups = {};
      for (const item of items) {
        const key = `${item.project || '(none)'} :: ${item.set || '(none)'}`;
        groups[key] = groups[key] || { project: item.project || null, set: item.set || null, total: 0, pending: 0 };
        groups[key].total += 1;
        if (!answered.has(item.id)) groups[key].pending += 1;
      }
      return { ...context, groups: Object.values(groups).sort((a, b) => b.total - a.total) };
    }
    case 'push': case 'sync': {
      const { syncOnce } = require('./sync-cloud');
      if (options.target === 'local') throw new CliError('sync/push always run local -> cloud; drop --target local');
      const outcome = await syncOnce();
      return { ...context, ...outcome };
    }
    case 'prune': {
      if (options.target !== 'cloud') throw new CliError('prune operates on the cloud board');
      const source = localAdapter(options.store);
      const local = await source.readAll();
      const cloud = await adapter.readAll();
      const localIds = new Set(local.items.map(i => i.id));
      const stale = cloud.items.filter(i => !localIds.has(i.id)).map(i => i.id);
      const cloudItemIds = new Set(cloud.items.map(i => i.id));
      const orphanResults = cloud.results
        .filter(r => !cloudItemIds.has(r.id) && !localIds.has(r.id))
        .map(r => r.id);
      if (options.dryRun) {
        return { ...context, dryRun: true, localCards: localIds.size, cloudCards: cloud.items.length, stale, orphanResults };
      }
      if (options.archive) {
        // Non-destructive reconciliation: archiving clears a card from the board (items.js filters
        // anything with a result) while every field of the card stays in the cloud store.
        const answeredAt = new Date().toISOString();
        const outcome = stale.length
          ? await adapter.putResults(stale.map(id => ({ id, archived: true, answered_at: answeredAt, note: options.comment || 'reconciled: absent from the local store' })))
          : { written: [] };
        return { ...context, mode: 'archive', localCards: localIds.size, cloudCardsBefore: cloud.items.length, staleCount: stale.length, ...outcome };
      }
      const deleted = stale.length ? await adapter.deleteItems(stale, false) : { deleted: [], deletedResults: [] };
      const removedResults = options.withResults && orphanResults.length
        ? (await adapter.deleteResults(orphanResults)).deleted
        : [];
      return { ...context, mode: 'delete', localCards: localIds.size, cloudCardsBefore: cloud.items.length, ...deleted, removedResults };
    }
    case 'mirror': {
      const toCloud = options.to === 'cloud';
      const source = toCloud ? localAdapter(options.store) : adapter;
      const destination = toCloud ? adapter : localAdapter(options.store);
      if (toCloud && options.target !== 'cloud') throw new CliError('--to cloud requires the cloud target');
      const from = await source.readAll();
      const into = await destination.readAll();
      const sourceIds = new Set(from.items.map(i => i.id));
      const extra = into.items.filter(i => !sourceIds.has(i.id)).map(i => i.id);
      if (options.dryRun) {
        return { ...context, dryRun: true, direction: `${source.name} -> ${destination.name}`, wouldUpsert: from.items.length, wouldDelete: extra };
      }
      const upserted = await destination.upsertItems(from.items);
      const deleted = extra.length ? await destination.deleteItems(extra, false) : { deleted: [] };
      return { ...context, direction: `${source.name} -> ${destination.name}`, ...upserted, ...deleted };
    }
    case 'export': {
      if (!options.out) throw new CliError('--out <file> is required');
      const all = await adapter.readAll();
      const out = path.resolve(options.out);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify({ exported_at: new Date().toISOString(), source: context, ...all }, null, 2));
      return { ...context, out, items: all.items.length, results: all.results.length };
    }
    case 'import': {
      if (!options.outbox) throw new CliError('--outbox <dir> is required');
      const { loadCards } = require('./import-outbox');
      const cards = loadCards(path.resolve(options.outbox));
      if (options.dryRun) return { ...context, dryRun: true, wouldImport: cards.map(c => c.id) };
      return { ...context, ...(await adapter.upsertItems(cards)), imported: cards.length };
    }
    default:
      throw new CliError(`unhandled command: ${options.command}`);
  }
}

// ---------------------------------------------------------------- request-file mode

function loadRequest(storeDir) {
  const file = path.join(storeDir, REQUEST_FILE);
  if (!fs.existsSync(file)) throw new CliError(`no broker request file at ${file}`);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const argv = Array.isArray(parsed) ? parsed : parsed && parsed.argv;
  if (!Array.isArray(argv) || argv.some(a => typeof a !== 'string')) {
    throw new CliError('broker request file must contain a string argument array');
  }
  // The bearer is injected into this process; a request file must never be able to aim it
  // at a host of its choosing.
  if (argv.includes('--url')) throw new CliError('--url is not permitted in broker request mode');
  return argv;
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const fromRequest = rawArgv.includes('--from-request');
  const storeDir = process.env.LOCAL_STORE_DIR || DEFAULT_STORE;
  let options;
  try {
    options = parseArgs(fromRequest ? loadRequest(storeDir) : rawArgv);
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n');
    process.exitCode = 1;
    return;
  }
  let payload;
  try {
    payload = { ok: true, command: options.command, ...(await run(options)) };
  } catch (error) {
    payload = { ok: false, command: options.command, error: String((error && error.message) || error) };
    process.exitCode = 1;
  }
  const text = JSON.stringify(payload, null, options.pretty || fromRequest ? 2 : 0);
  if (fromRequest) {
    // Large inventories exceed a comfortable stdout round-trip, so the response is also a file.
    try {
      fs.mkdirSync(storeDir, { recursive: true });
      fs.writeFileSync(path.join(storeDir, RESPONSE_FILE), text);
    } catch { /* stdout still carries the answer */ }
  }
  process.stdout.write(text + '\n');
}

if (require.main === module) {
  main().catch(error => {
    process.stdout.write(JSON.stringify({ ok: false, error: String((error && error.message) || error) }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { CliError, COMMANDS, parseArgs, run, selectItems, coerceFieldValue, localAdapter, cloudAdapter, loadRequest, HELP };
