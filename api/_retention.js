const fs = require('node:fs');
const path = require('node:path');
const { createExport, verifyExport } = require('./_transfer');

function validateCount(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} retention must be a nonnegative integer`);
  }
}

function assertNoLinkedAncestors(candidate, label) {
  const absolute = path.resolve(candidate);
  const root = path.parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} crosses a linked or reparse-point path: ${current}`);
    }
  }
  return absolute;
}

function assertDirectChild(root, candidate) {
  const absoluteRoot = assertNoLinkedAncestors(root, 'snapshot root');
  const absolute = assertNoLinkedAncestors(candidate, 'snapshot entry');
  if (path.dirname(absolute) !== absoluteRoot) {
    throw new Error(`snapshot entry escapes its declared root: ${absolute}`);
  }
  return absolute;
}

function isoWeekKey(date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const isoYear = day.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((day - yearStart) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function addNewestBuckets(snapshots, count, keyOf, keep) {
  const buckets = new Set();
  for (const snapshot of snapshots) {
    const key = keyOf(snapshot.date);
    if (buckets.has(key)) continue;
    if (buckets.size >= count) break;
    buckets.add(key);
    keep.add(snapshot.path);
  }
}

function planRetention(snapshotRoot, { daily = 3, weekly = 4, monthly = 3 } = {}) {
  validateCount('daily', daily);
  validateCount('weekly', weekly);
  validateCount('monthly', monthly);
  const root = assertNoLinkedAncestors(snapshotRoot, 'snapshot root');
  if (!fs.existsSync(root)) return { root, keep: [], remove: [], protected: [] };
  if (!fs.statSync(root).isDirectory()) throw new Error(`snapshot root is not a directory: ${root}`);

  const verified = [];
  const protectedEntries = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = assertDirectChild(root, path.join(root, entry.name));
    if (entry.isSymbolicLink()) throw new Error(`snapshot entry is linked or a reparse point: ${candidate}`);
    if (!entry.isDirectory()) {
      protectedEntries.push({ path: candidate, reason: 'non-directory entry' });
      continue;
    }
    try {
      const result = verifyExport(candidate);
      const date = new Date(result.generatedAt);
      if (!Number.isFinite(date.getTime())) throw new Error('invalid generated_at');
      verified.push({ path: candidate, generatedAt: result.generatedAt, date });
    } catch (error) {
      protectedEntries.push({ path: candidate, reason: error.message });
    }
  }
  verified.sort((left, right) =>
    right.date.getTime() - left.date.getTime() || right.path.localeCompare(left.path)
  );

  const keepPaths = new Set();
  if (verified.length) keepPaths.add(verified[0].path);
  addNewestBuckets(verified, daily, date => date.toISOString().slice(0, 10), keepPaths);
  addNewestBuckets(verified, weekly, isoWeekKey, keepPaths);
  addNewestBuckets(verified, monthly, date => date.toISOString().slice(0, 7), keepPaths);

  return {
    root,
    keep: verified.filter(snapshot => keepPaths.has(snapshot.path)),
    remove: verified.filter(snapshot => !keepPaths.has(snapshot.path)),
    protected: protectedEntries,
  };
}

function applyRetention(plan, { dryRun = false } = {}) {
  const candidates = plan.remove.map(snapshot => {
    const safePath = assertDirectChild(plan.root, snapshot.path);
    const verification = verifyExport(safePath);
    if (verification.generatedAt !== snapshot.generatedAt) {
      throw new Error(`snapshot changed after retention planning: ${safePath}`);
    }
    return safePath;
  });
  if (dryRun) return { removed: [], wouldRemove: candidates };
  for (const candidate of candidates) fs.rmSync(candidate, { recursive: true });
  return { removed: candidates, wouldRemove: [] };
}

async function createSnapshot(store, snapshotRoot, options = {}) {
  const root = assertNoLinkedAncestors(snapshotRoot, 'snapshot root');
  fs.mkdirSync(root, { recursive: true });
  assertNoLinkedAncestors(root, 'snapshot root');
  planRetention(root, options);

  const generatedAt = options.generatedAt || new Date().toISOString();
  const generatedDate = new Date(generatedAt);
  if (!Number.isFinite(generatedDate.getTime())) throw new Error('generatedAt must be a valid timestamp');
  const snapshotName = generatedDate.toISOString().replace(/[:.]/g, '-');
  const snapshotPath = assertDirectChild(root, path.join(root, snapshotName));
  if (fs.existsSync(snapshotPath)) throw new Error(`snapshot already exists: ${snapshotPath}`);

  await createExport(store, snapshotPath, {
    generatedAt: generatedDate.toISOString(),
    maxSnapshotAttempts: options.maxSnapshotAttempts,
  });
  verifyExport(snapshotPath);
  const plan = planRetention(root, options);
  const pruning = applyRetention(plan, { dryRun: options.pruneDryRun === true });
  return {
    snapshotPath,
    generatedAt: generatedDate.toISOString(),
    retained: plan.keep.map(snapshot => snapshot.path),
    protected: plan.protected,
    pruning,
  };
}

module.exports = {
  applyRetention,
  createSnapshot,
  isoWeekKey,
  planRetention,
};
