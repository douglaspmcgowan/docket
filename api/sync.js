// Authenticated synchronization and canonical-group endpoint.
// Every mutation delegates to an atomic compare-and-swap update in _store.
const {
  readItems,
  updateItems,
  readResults,
  updateResults,
  readTickets,
  updateTickets,
  readReads,
  updateReads,
} = require('./_store');
const { listGroups, remapGroup } = require('./_groups');
const { toggleRead } = require('./_reads');
const { validateItem } = require('./_schema');
const { cloudAdmissible } = require('./_content-guard');
const authed = require('./_auth');

// ---- pure admin helpers (kept testable and free of transport concerns) ----

// Normalise an id list from a request body. Returns [] for anything unusable so a malformed
// admin call can never be read as "affect everything".
function idList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) seen.add(entry.trim());
  }
  return [...seen];
}

function applyDelete(document, ids) {
  const removed = [];
  for (const id of ids) {
    if (Object.prototype.hasOwnProperty.call(document, id)) {
      delete document[id];
      removed.push(id);
    }
  }
  return removed;
}

// Regroup specific cards by id. An omitted field is left untouched; an explicit null clears it.
function applyMove(document, ids, spec) {
  const moved = [];
  for (const id of ids) {
    const item = document[id];
    if (!item || typeof item !== 'object') continue;
    let changed = false;
    for (const field of ['project', 'set']) {
      if (!Object.prototype.hasOwnProperty.call(spec, field)) continue;
      const next = spec[field];
      if (next === null || next === '') {
        if (item[field] !== undefined) { delete item[field]; changed = true; }
      } else if (typeof next === 'string' && item[field] !== next) {
        item[field] = next;
        changed = true;
      }
    }
    if (changed) moved.push(id);
  }
  return moved;
}

const admissible = (item, cloud = !process.env.LOCAL_STORE_DIR) => {
  try {
    validateItem(item);
    return !cloud || cloudAdmissible(item);
  } catch {
    return false;
  }
};

const handler = async function handler(req, res) {
  if (!authed(req, res)) return;
  const op = (req.query && req.query.op) || '';
  try {
    if (op === 'push' && req.method === 'POST') {
      const incoming = Array.isArray(req.body && req.body.items) ? req.body.items : [];
      const accepted = [];
      let refused = 0;
      const cloud = !process.env.LOCAL_STORE_DIR;
      for (const item of incoming) {
        if (!admissible(item, cloud)) refused++;
        else accepted.push(item);
      }
      if (accepted.length) {
        await updateItems(items => {
          for (const item of accepted) items[item.id] = item;
          return items;
        });
      }
      return res.status(200).json({
        ok: true,
        pushed: accepted.length,
        ...(refused ? { refused, reason: 'invalid, sensitive, or restricted-marker cards were refused' } : {}),
      });
    }
    if (op === 'pull' && req.method === 'GET') {
      const results = await readResults();
      return res.status(200).json({ results: Object.values(results) });
    }
    if (op === 'groups' && req.method === 'GET') {
      const items = await readItems();
      return res.status(200).json({ groups: listGroups(items) });
    }
    if (op === 'rename' && req.method === 'POST') {
      const spec = req.body || {};
      if (!spec.project) return res.status(400).json({ error: 'project required' });
      const outcome = await updateItems(items => {
        const { changed } = remapGroup(items, spec);
        return { document: items, result: changed };
      });
      return res.status(200).json({ ok: true, changed: outcome.result });
    }
    if (op === 'read' && req.method === 'POST') {
      const outcome = await updateReads(reads => {
        const result = toggleRead(reads, req.body || {});
        return { document: result.error ? reads : result.reads, result };
      });
      if (outcome.result.error) return res.status(outcome.result.error).json({ error: outcome.result.message });
      return res.status(200).json({ ok: true, changed: outcome.result.changed });
    }
    if (op === 'tickets' && req.method === 'GET') {
      if (req.query && req.query.clear) {
        const outcome = await updateTickets(tickets => ({
          document: {},
          result: Object.values(tickets),
        }));
        return res.status(200).json({ tickets: outcome.result });
      }
      const tickets = await readTickets();
      return res.status(200).json({ tickets: Object.values(tickets) });
    }
    // ---- full-CRUD admin surface (same bearer gate as every other op) ----
    if (op === 'list' && req.method === 'GET') {
      // The complete authoritative inventory, unfiltered. /api/items stays the phone's pending
      // view; this is the agent/CLI view that must be able to see resolved and orphaned records.
      const [items, results, tickets, reads] = await Promise.all([
        readItems(), readResults(), readTickets(), readReads(),
      ]);
      return res.status(200).json({
        items: Object.values(items),
        results: Object.values(results),
        tickets: Object.values(tickets),
        reads,
        counts: {
          items: Object.keys(items).length,
          results: Object.keys(results).length,
          tickets: Object.keys(tickets).length,
          reads: Object.keys(reads).length,
        },
      });
    }
    if (op === 'delete' && req.method === 'POST') {
      const ids = idList(req.body && req.body.ids);
      if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty string array' });
      const withResults = (req.body && req.body.withResults) === true;
      const outcome = await updateItems(items => ({ document: items, result: applyDelete(items, ids) }));
      let removedResults = [];
      if (withResults) {
        const r = await updateResults(results => ({ document: results, result: applyDelete(results, ids) }));
        removedResults = r.result;
      }
      return res.status(200).json({ ok: true, deleted: outcome.result, deletedResults: removedResults });
    }
    if (op === 'move' && req.method === 'POST') {
      const ids = idList(req.body && req.body.ids);
      if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty string array' });
      const spec = {};
      for (const field of ['project', 'set']) {
        if (req.body && Object.prototype.hasOwnProperty.call(req.body, field)) spec[field] = req.body[field];
      }
      if (!Object.keys(spec).length) return res.status(400).json({ error: 'project and/or set required' });
      const outcome = await updateItems(items => ({ document: items, result: applyMove(items, ids, spec) }));
      return res.status(200).json({ ok: true, moved: outcome.result });
    }
    if (op === 'results-put' && req.method === 'POST') {
      const incoming = Array.isArray(req.body && req.body.results) ? req.body.results : [];
      const accepted = incoming.filter(r => r && typeof r.id === 'string' && r.id.trim() &&
        typeof r.answered_at === 'string' && r.answered_at.trim());
      if (!accepted.length) return res.status(400).json({ error: 'results must carry id and answered_at' });
      const outcome = await updateResults(results => {
        for (const r of accepted) results[r.id] = r;
        return { document: results, result: accepted.map(r => r.id) };
      });
      return res.status(200).json({ ok: true, written: outcome.result });
    }
    if (op === 'results-delete' && req.method === 'POST') {
      const ids = idList(req.body && req.body.ids);
      if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty string array' });
      const outcome = await updateResults(results => ({ document: results, result: applyDelete(results, ids) }));
      return res.status(200).json({ ok: true, deleted: outcome.result });
    }
    return res.status(400).json({
      error: 'bad op/method; use POST ?op=push|rename|read|delete|move|results-put|results-delete, or GET ?op=pull|tickets|groups|list',
    });
  } catch (error) {
    res.status(500).json({ error: String((error && error.message) || error) });
  }
};

module.exports = handler;
module.exports.admissible = admissible;
module.exports.idList = idList;
module.exports.applyDelete = applyDelete;
module.exports.applyMove = applyMove;
