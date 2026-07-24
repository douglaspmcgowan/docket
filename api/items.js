// GET /api/items -> { items: [...pending] }, oldest first (same order the local board uses).
const { readItems, readResults, readReads } = require('./_store');
const authed = require('./_auth');

module.exports = async function handler(req, res) {
  if (!authed(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const [items, results, reads] = await Promise.all([readItems(), readResults(), readReads()]);
    const pending = Object.values(items).filter((it) => it && !results[it.id]);
    pending.sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
    // answered ids let embedded brief cards (FR-038) show their answered state across devices
    res.status(200).json({ items: pending, reads: Object.keys(reads), answered: Object.keys(results) });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
