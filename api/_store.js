// Storage layer over Vercel Blob (private store). Two aggregate JSON blobs:
//   items.json   -> { <id>: item }    written only by the laptop sync push
//   results.json -> { <id>: result }  written only by phone submits
// Splitting writers this way means the laptop push and a phone submit never write the
// same blob, so neither can clobber the other. (Two phone submits racing read-modify-write
// on results.json is possible but it's one human tapping — effectively serial.)
// ponytail: aggregate-blob store, split by writer. Move to per-key blobs only if the card
// count or concurrent-writer count ever makes a whole-file rewrite too costly.
// Backend select: LOCAL_STORE_DIR set (the local mirror, local-server.js) -> plain JSON files on disk,
// which never leave the machine, so NASA-SENSITIVE content is safe here. Unset (Vercel) -> the Blob
// store. @vercel/blob is lazy-required only in the cloud branch, so the local mirror needs no install.
const LOCAL_DIR = process.env.LOCAL_STORE_DIR;

async function readJson(pathname) {
  if (LOCAL_DIR) {
    const fs = require('fs'), path = require('path');
    try {
      const v = JSON.parse(fs.readFileSync(path.join(LOCAL_DIR, pathname), 'utf8'));
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {}; // ENOENT on first-ever read, or bad JSON -> empty map
    }
  }
  const { get } = require('@vercel/blob');
  // useCache:false = read-after-write consistency (a push then immediate items read must be fresh).
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return {}; // 404 on first-ever read -> empty map
  const text = await new Response(r.stream).text();
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

async function writeJson(pathname, obj) {
  if (LOCAL_DIR) {
    const fs = require('fs'), path = require('path');
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    // write-to-temp + rename = atomic swap, so a crash mid-write can't leave a truncated store file.
    const dst = path.join(LOCAL_DIR, pathname), tmp = dst + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, dst);
    return;
  }
  const { put } = require('@vercel/blob');
  await put(pathname, JSON.stringify(obj), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

module.exports = {
  readItems: () => readJson('items.json'),
  writeItems: (o) => writeJson('items.json', o),
  readResults: () => readJson('results.json'),
  writeResults: (o) => writeJson('results.json', o),
  // tickets.json -> { <id>: {id,title,url,notes,requested_at} }: "tell me more" requests,
  // a separate channel from a review decision so it never consumes/overwrites a card's result.
  readTickets: () => readJson('tickets.json'),
  writeTickets: (o) => writeJson('tickets.json', o),
  // reads.json -> { <briefId>: iso }: cross-device brief read-state (a phone tap syncs to the laptop).
  readReads: () => readJson('reads.json'),
  writeReads: (o) => writeJson('reads.json', o),
};
