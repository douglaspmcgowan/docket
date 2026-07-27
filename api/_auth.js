// Single shared-passcode gate for every endpoint. APP_SECRET is set as a Vercel env var.
// The mobile UI sends it as `Authorization: Bearer <secret>`; the local sync script sends the same.
// This is the only thing standing between the public URL and NASA-internal card content, so a
// missing/short secret is a hard fail rather than a soft default.
const LOCAL_REQUEST = Symbol.for('docket.localRequest');

module.exports = function authed(req, res) {
  // local-server.js binds to loopback and adds this in-process Symbol after checking
  // the socket address. Network headers cannot construct or spoof the marker.
  if (req[LOCAL_REQUEST] === true) return true;

  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 8) {
    res.status(500).json({ error: 'server misconfigured: APP_SECRET unset or too short' });
    return false;
  }
  const hdr = req.headers.authorization || '';
  const got = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  // Length-guarded equality — not constant-time, but a 40-char random secret over HTTPS makes
  // timing attacks irrelevant next to just requiring a long secret.
  if (got.length !== secret.length || got !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
};
