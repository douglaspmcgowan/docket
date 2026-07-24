// POST /api/submit { id, chosen, notes? }            -> record a decision into results.json.
// POST /api/submit { id, notes } (no chosen)          -> comment-only: resolve with a note, no option picked.
// POST /api/submit { id, archived:true }              -> archive (clear from the board without deciding).
// items.js filters out anything with a result, so any of these removes the card from the pending board.
const { readItems, readResults, writeResults } = require('./_store');
const { resolveResult } = require('./_resolve');
const authed = require('./_auth');

module.exports = async function handler(req, res) {
  if (!authed(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = req.body || {};
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const items = await readItems();
    const item = items[id];
    if (!item) return res.status(404).json({ error: 'unknown id' });
    const { error, message, result } = resolveResult(body, item);
    if (error) return res.status(error).json({ error: message });
    const results = await readResults();
    results[id] = result;
    await writeResults(results);
    res.status(200).json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
