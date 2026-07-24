// Pure: apply a brief read/unread toggle to the reads map (id -> iso stamp when read). No I/O.
// read:false removes the id (unread). read:true adds a stamp, preserving an existing one (idempotent).
function toggleRead(reads, body, now) {
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return { error: 400, message: 'id required' };
  const out = { ...reads };
  if (body.read === false) {
    if (!(id in out)) return { reads: out, changed: false };
    delete out[id];
    return { reads: out, changed: true };
  }
  if (out[id]) return { reads: out, changed: false };
  out[id] = now || new Date().toISOString();
  return { reads: out, changed: true };
}
module.exports = { toggleRead };
