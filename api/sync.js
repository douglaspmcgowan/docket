// Sync endpoint for the local push/pull script.
//   POST /api/sync?op=push   body { items:[...] }  -> merge into items.json
//   GET  /api/sync?op=pull                          -> { results:[...] } every recorded decision
const { readItems, writeItems, readResults, readTickets, writeTickets, readReads, writeReads } = require('./_store');
const { listGroups, remapGroup } = require('./_groups');
const { toggleRead } = require('./_reads');
const authed = require('./_auth');

// Pure: may this item be stored on THIS board? The cloud (cloud=true) refuses sensitive cards; the
// local mirror (cloud=false) accepts everything. This is the load-bearing safety rule, kept testable.
const admissible = (item, cloud) => !(cloud && item && item.sensitive === true);

const handler = async function handler(req, res) {
  if (!authed(req, res)) return;
  const op = (req.query && req.query.op) || '';
  try {
    if (op === 'push' && req.method === 'POST') {
      const incoming = Array.isArray(req.body && req.body.items) ? req.body.items : [];
      // Safety guard (defense in depth): the CLOUD backend (no LOCAL_STORE_DIR) must never store a
      // card marked sensitive. Even a stray curl/agent that bypasses enqueue.js's client-side check
      // cannot land NASA-sensitive content off-box. The local mirror accepts everything.
      const CLOUD = !process.env.LOCAL_STORE_DIR;
      const items = await readItems();
      let pushed = 0, refused = 0;
      for (const it of incoming) {
        if (!it || typeof it.id !== 'string') continue;
        if (!admissible(it, CLOUD)) { refused++; continue; }
        items[it.id] = it;
        pushed++;
      }
      await writeItems(items);
      return res.status(200).json({ ok: true, pushed, ...(refused ? { refused, reason: 'sensitive cards are not allowed on the cloud board' } : {}) });
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
      const items = await readItems();
      const { changed } = remapGroup(items, spec);        // mutates the item objects in the map
      if (changed) await writeItems(items);
      return res.status(200).json({ ok: true, changed });
    }
    if (op === 'read' && req.method === 'POST') {
      const r = toggleRead(await readReads(), req.body || {});
      if (r.error) return res.status(r.error).json({ error: r.message });
      if (r.changed) await writeReads(r.reads);
      return res.status(200).json({ ok: true, changed: r.changed });
    }
    if (op === 'tickets' && req.method === 'GET') {
      // ?clear=1 drains the tickets after reading so Claude processes each request once.
      // ponytail: read-then-clear has a tiny race, but it's one human tapping — effectively serial.
      const tickets = await readTickets();
      if (req.query && req.query.clear) await writeTickets({});
      return res.status(200).json({ tickets: Object.values(tickets) });
    }
    return res.status(400).json({ error: 'bad op/method; use POST ?op=push|rename|read, or GET ?op=pull|tickets|groups' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

module.exports = handler;
module.exports.admissible = admissible;
