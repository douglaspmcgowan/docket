// Ranked search across the item dataset. Pure + shared: the browser loads it via <script>, the test
// suite requires it. Weighted fields, token-AND, word-start boost, title-prefix boost.
(function (root) {
  // field -> weight. Title dominates; structural labels (tags/project/set) beat free text (body/desc).
  const FIELDS = [
    ['title', 10], ['tags', 6], ['project', 5], ['set', 5],
    ['source', 4], ['filepath', 4], ['description', 2], ['body', 2], ['sections', 2],
  ];

  function fieldTextOf(item) {
    return {
      title: item.title || '',
      tags: (item.tags || []).map(t => (t && t.text) || '').join(' '),
      project: item.project || '',
      set: item.set || '',
      source: item.source || '',
      filepath: item.filepath || item.src || '',
      description: item.description || '',
      body: item.body || '',
      sections: (item.sections || []).map(s => `${s.label || ''} ${s.text || ''}`).join(' '),
    };
  }

  function searchItems(items, query) {
    const q = String(query == null ? '' : query).toLowerCase().trim();
    if (!q) return (items || []).map(item => ({ item, score: 0, fields: [] }));
    const tokens = q.split(/\s+/).filter(Boolean);
    const out = [];
    for (const item of items || []) {
      const ft = fieldTextOf(item);
      let score = 0;
      const matched = new Set();
      let everyToken = true;
      for (const tok of tokens) {
        let tokMatched = false;
        for (const [f, w] of FIELDS) {
          const hay = ft[f].toLowerCase();
          if (!hay) continue;
          const idx = hay.indexOf(tok);
          if (idx < 0) continue;
          tokMatched = true;
          matched.add(f);
          // word-start match is worth more than a mid-word substring
          score += (idx === 0 || /\W/.test(hay[idx - 1])) ? w * 1.5 : w;
        }
        if (!tokMatched) { everyToken = false; break; }
      }
      if (!everyToken) continue;
      if (ft.title.toLowerCase().startsWith(q)) score += 15;   // whole-query title prefix
      out.push({ item, score, fields: [...matched] });
    }
    out.sort((a, b) => b.score - a.score || String(a.item.title || '').localeCompare(String(b.item.title || '')));
    return out;
  }

  root.searchItems = searchItems;
  if (typeof module !== 'undefined' && module.exports) module.exports = { searchItems };
})(typeof window !== 'undefined' ? window : globalThis);
