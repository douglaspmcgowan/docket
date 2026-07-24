// Pure resolution logic for POST /api/submit — decides the result record (or an error) for a
// submit body against its item. No I/O, so it is unit-testable. submit.js does the store reads/writes.
//   { id, chosen }            -> a decision   { id, chosen, notes, answered_at }
//   { id, notes } (no chosen) -> comment-only { id, chosen:null, comment:notes, answered_at }
//   { id, archived:true }     -> archive      { id, archived:true, answered_at }
//   { id, action:'more' }     -> "tell me more": resolves the card like any feedback; the recorded
//                                action tells the local agent to remake + expand it (as a new card).
function resolveResult(body, item, now) {
  const id = typeof body.id === 'string' ? body.id : '';
  const archived = body.archived === true;
  const more = body.action === 'more';
  const chosen = typeof body.chosen === 'string' ? body.chosen : '';
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 10000) : '';
  if (!id) return { error: 400, message: 'id required' };
  if (more) return { result: { id, action: 'more', notes, answered_at: now || new Date().toISOString() } };
  if (!archived && !chosen && !notes) return { error: 400, message: 'pick an option or leave a comment' };
  // Options may be strings (a review) or objects (a tradeoff's {id,label}); validate chosen against
  // the displayed label either way.
  const optLabels = Array.isArray(item.options)
    ? item.options.map(o => (typeof o === 'string' ? o : (o && (o.label || o.id)) || ''))
    : [];
  if (chosen && optLabels.length && !optLabels.includes(chosen)) {
    return { error: 400, message: 'chosen is not one of the options' };
  }
  const answered_at = now || new Date().toISOString();
  const result = archived ? { id, archived: true, answered_at }
    : chosen ? { id, chosen, notes, answered_at }
    : { id, chosen: null, comment: notes, answered_at };
  return { result };
}

module.exports = { resolveResult };
