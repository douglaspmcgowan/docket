// POST /api/more { id, notes? } -> record a "tell me more" ticket into tickets.json.
// This is NOT a review decision: it leaves the card pending so it stays reviewable, and Claude
// picks the ticket up locally (sync op=tickets) to expand the card and re-push the fuller version.
const { readItems, updateTickets } = require('./_store');
const authed = require('./_auth');

module.exports = async function handler(req, res) {
  if (!authed(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = req.body || {};
  const id = typeof body.id === 'string' ? body.id : '';
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 10000) : '';
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const items = await readItems();
    const item = items[id];
    if (!item) return res.status(404).json({ error: 'unknown id' });
    const ticket = { id, title: item.title || '', url: item.url || '', notes, requested_at: new Date().toISOString() };
    const outcome = await updateTickets(tickets => {
      tickets[id] = ticket;
      return { document: tickets, result: ticket };
    });
    res.status(200).json({ ok: true, ticket: outcome.result });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
