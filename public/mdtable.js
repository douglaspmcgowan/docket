// Rejoin hard-wrapped markdown table rows. Generators (and Obsidian) wrap long lines at ~80 cols;
// markdown-it needs each table row on ONE line, so a wrapped cell breaks the whole table. This walks
// the source, and inside a table block joins any row that doesn't end in `|` with the following
// line(s) until it does. Non-table text is returned byte-for-byte unchanged.
// ponytail: handles leading-pipe GFM tables (what the docket produces); loose no-leading-pipe tables
// aren't rejoined — add that only if a real brief needs it.
(function (root) {
  const isDelim = s => /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/.test(s);

  // Cells between the border pipes (escaped \| don't count as separators).
  function cellCount(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).length;
  }
  // A GFM row is complete only when it ends with a border pipe AND has the table's full column count.
  // A wrap breaks one of those: content spilling with no trailing pipe (row ends mid-cell), or an empty
  // trailing cell whose content moved to the next line (row is short a column).
  const complete = (line, ncol) => /\|\s*$/.test(line) && cellCount(line) >= ncol;

  function unwrapTableRows(mdText) {
    const src = String(mdText == null ? '' : mdText);
    const lines = src.split('\n');
    const out = [];
    let inTable = false, ncol = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!inTable) {
        // a table starts on a leading-pipe line immediately followed by a delimiter row
        if (/^\|/.test(trimmed) && i + 1 < lines.length && isDelim(lines[i + 1].trim())) {
          inTable = true; ncol = cellCount(lines[i + 1]);
        } else { out.push(line); continue; }
      }
      if (trimmed === '') { inTable = false; out.push(line); continue; }
      // pull in following lines until the row is a complete ncol-column row
      let row = line.replace(/\s+$/, '');
      while (!complete(row, ncol) && i + 1 < lines.length && lines[i + 1].trim() !== '' && !isDelim(lines[i + 1].trim())) {
        i++;
        row += ' ' + lines[i].trim();
      }
      out.push(row);
    }
    return out.join('\n');
  }

  root.unwrapTableRows = unwrapTableRows;
  if (typeof module !== 'undefined' && module.exports) module.exports = { unwrapTableRows };
})(typeof window !== 'undefined' ? window : globalThis);
