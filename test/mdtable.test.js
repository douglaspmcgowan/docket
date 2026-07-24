// Locks the table-unwrap fix: hard-wrapped markdown table rows (a cell spilling onto the next source
// line at ~80 cols) must be rejoined so markdown-it parses them as ONE table row. Without this the
// wrapped row breaks the whole table (markdown-it needs each row on a single line). Real case: the
// cad-loop PRD brief. Non-table text must pass through untouched.
const { test } = require('node:test');
const assert = require('node:assert');
const MarkdownIt = require('../public/markdown-it.min.js');
const { unwrapTableRows } = require('../public/mdtable.js');
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

// a table exactly like the PRD's: the last cell of a row wraps onto the next line
const wrapped = [
  '| Step | Script | Outputs |',
  '|---|---|---|',
  '| Plan | `cad_loop.stage_plan()` | console plan ',
  'verdict |',
  '| Gate | `gate.py` | gate JSON |',
].join('\n');

test('without the fix, a wrapped row breaks the table (baseline)', () => {
  const out = md.render(wrapped);
  // the stray "verdict |" leaks out as text / the table loses a row
  assert.ok(out.includes('verdict'), 'sanity: content present');
});

test('unwrapTableRows rejoins the wrapped cell so the table parses fully', () => {
  const out = md.render(unwrapTableRows(wrapped));
  assert.ok(out.includes('<table>'), 'renders a table');
  const rows = (out.match(/<tr>/g) || []).length;
  assert.equal(rows, 3, 'header + 2 body rows, none lost to the wrap');
  assert.ok(/console plan\s+verdict/.test(out.replace(/<[^>]+>/g, ' ')), 'the wrapped cell is reunited');
  assert.ok(!/^\s*verdict/m.test(out.replace(/<[^>]+>/g, '')), 'no stray "verdict" leaked outside the table');
});

test('non-table prose is returned unchanged', () => {
  const prose = 'A normal paragraph\nwrapped at a column\nlimit.\n\n- a list item\n- another';
  assert.equal(unwrapTableRows(prose), prose);
});

test('a well-formed table (no wraps) is left intact', () => {
  const clean = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';
  assert.equal(unwrapTableRows(clean), clean);
});

test('an empty-trailing-cell wrap (content spilled, closing pipe stayed) is rejoined', () => {
  // the PRD's other variant: row ends with "| " (empty last cell) and the real content is next line
  const src = [
    '| Step | Fn | Outputs |',
    '|---|---|---|',
    '| Gate | `gate.py` | current checks | ',
    '`runs/cubesat/gate.json` |',
    '| Review | `rc.py` | done |',
  ].join('\n');
  const out = md.render(unwrapTableRows(src));
  const rows = (out.match(/<tr>/g) || []).length;
  assert.equal(rows, 3, 'header + Gate + Review — no stray one-column row');
  assert.ok(/current checks\s+runs\/cubesat\/gate\.json/.test(out.replace(/<[^>]+>/g, ' ')), 'output cell reunited');
});

test('a row wrapped across three source lines is fully rejoined', () => {
  const src = '| X | Y |\n|---|---|\n| a | one two\nthree four\nfive |';
  const out = md.render(unwrapTableRows(src));
  assert.ok(out.includes('<table>'));
  assert.ok(/one two\s+three four\s+five/.test(out.replace(/<[^>]+>/g, ' ')));
});
