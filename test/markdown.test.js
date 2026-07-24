// Locks the markdown reflow fix: hard-wrapped source paragraphs must reflow (no <br>, joined),
// while lists / headings / wrapped list-item continuations are preserved. This is the fix for the
// "random newlines" — pre-wrap used to keep every 80-col source newline.
const { test } = require('node:test');
const assert = require('node:assert');
const MarkdownIt = require('../public/markdown-it.min.js');

// same config the app uses (public/index.html: html:false, linkify:true, breaks:false)
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

test('a hard-wrapped paragraph reflows into one <p> with no <br>', () => {
  const src = [
    'This is a paragraph that the generator hard-wrapped at roughly eighty',
    'columns, so the source has a newline here and another one here even',
    'though it is one logical paragraph.',
  ].join('\n');
  const out = md.render(src);
  const paras = out.match(/<p>/g) || [];
  assert.equal(paras.length, 1, 'should be exactly one paragraph');
  assert.ok(!out.includes('<br'), 'must not insert <br> at soft wraps');
});

test('a wrapped list-item continuation stays in the same <li>', () => {
  const src = [
    '- A list item that itself wraps across two source lines because it',
    '  ran past the column limit and kept going onto the next line.',
    '- Second item.',
  ].join('\n');
  const out = md.render(src);
  const lis = out.match(/<li>/g) || [];
  assert.equal(lis.length, 2, 'two items, not a stray paragraph from the continuation');
});

test('headings, bold and links survive the reflow', () => {
  const out = md.render('## A heading\n\nText with **bold** and https://example.com here.');
  assert.ok(out.includes('<h2>'), 'heading preserved');
  assert.ok(out.includes('<strong>bold</strong>'), 'bold preserved');
  assert.ok(out.includes('href="https://example.com"'), 'link autolinked');
});

test('a blank line still separates two paragraphs', () => {
  const out = md.render('First para.\n\nSecond para.');
  assert.equal((out.match(/<p>/g) || []).length, 2);
});
