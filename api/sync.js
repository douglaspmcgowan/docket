// Authenticated synchronization and canonical-group endpoint.
// Every mutation delegates to an atomic compare-and-swap update in _store.
const {
  readItems,
  updateItems,
  readResults,
  readTickets,
  updateTickets,
  updateReads,
} = require('./_store');
const { listGroups, remapGroup } = require('./_groups');
const { toggleRead } = require('./_reads');
const { validateItem } = require('./_schema');
const authed = require('./_auth');

const admissible = item => {
  try {
    validateItem(item);
    return true;
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
      for (const item of incoming) {
        if (!admissible(item)) refused++;
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
        ...(refused ? { refused, reason: 'invalid cards were refused' } : {}),
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
    return res.status(400).json({ error: 'bad op/method; use POST ?op=push|rename|read, or GET ?op=pull|tickets|groups' });
  } catch (error) {
    res.status(500).json({ error: String((error && error.message) || error) });
  }
};

module.exports = handler;
module.exports.admissible = admissible;
