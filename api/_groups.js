// Pure project/set grouping helpers (no I/O), shared by the sync endpoint + tested directly.
// classifyItem mirrors the browser-side classify() in public/index.html — keep them in step.
function classifyItem(it) {
  const src = it.source || it.type || '';
  const pj = (it.project || '').trim(), st = (it.set || '').trim();
  const ci = src.indexOf(':');
  if (ci >= 0) return { project: pj || src.slice(0, ci).trim() || 'Ungrouped', set: st || src.slice(ci + 1).trim() || null };
  return { project: pj || src || 'Ungrouped', set: st || null };
}

function asArray(items) { return Array.isArray(items) ? items : Object.values(items || {}); }

// Distinct groups for surfacing canonical names before a docket (so near-dupes don't proliferate).
function listGroups(items) {
  const map = new Map();
  for (const it of asArray(items)) {
    const { project, set } = classifyItem(it);
    if (!map.has(project)) map.set(project, { project, sets: new Set(), count: 0 });
    const g = map.get(project); g.count++; if (set) g.sets.add(set);
  }
  return [...map.values()]
    .map(g => ({ project: g.project, sets: [...g.sets].sort(), count: g.count }))
    .sort((a, b) => a.project.localeCompare(b.project));
}

// Rename a project or a set. Writes explicit project/set fields onto every matching item, which also
// canonicalizes items that were only grouped via `source`. set==null => project scope (all its items).
// toSet:'' clears the set (moves items to project-level). Mutates items in place; returns { items, changed }.
function remapGroup(items, spec) {
  const arr = asArray(items);
  const { project, set = null, toProject = null, toSet = null } = spec || {};
  if (!project) return { items: arr, changed: 0 };
  let changed = 0;
  for (const it of arr) {
    const c = classifyItem(it);
    if (c.project !== project) continue;
    if (set != null && c.set !== set) continue;
    it.project = (toProject != null && toProject !== '') ? toProject : c.project;
    if (set != null) {
      if (toSet === '') delete it.set;
      else if (toSet != null) it.set = toSet;
      else if (c.set != null) it.set = c.set;
    } else if (c.set != null) {
      it.set = c.set; // project rename: pin the existing set name explicitly
    }
    changed++;
  }
  return { items: arr, changed };
}

module.exports = { classifyItem, listGroups, remapGroup };
