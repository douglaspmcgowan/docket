const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadCards(outbox) {
  if (!fs.existsSync(outbox) || !fs.statSync(outbox).isDirectory()) {
    throw new Error(`Outbox directory is missing: ${outbox}`);
  }

  const cards = fs.readdirSync(outbox)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(outbox, name), 'utf8')));

  const ids = new Set();
  for (const card of cards) {
    if (!card || typeof card.id !== 'string' || !card.id.trim()) {
      throw new Error('Every outbox card must have a non-empty string id.');
    }
    if (ids.has(card.id)) {
      throw new Error(`Duplicate card id: ${card.id}`);
    }
    ids.add(card.id);
  }
  return cards;
}

function mergeCards(existing, cards) {
  const merged = { ...(existing || {}) };
  for (const card of cards) merged[card.id] = card;
  return merged;
}

async function importCards(store, cards) {
  return store.updateItems(existing => {
    const document = mergeCards(existing, cards);
    return { document, result: Object.keys(document).length };
  });
}

function parseArgs(argv) {
  const defaults = {
    outbox: path.join(os.homedir(), 'Data', 'Projects', 'agent-harness', 'docket-outbox', 'skills-audit'),
    store: path.join(os.homedir(), '.docket-local'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--outbox') defaults.outbox = argv[++i];
    else if (argv[i] === '--store') defaults.store = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return defaults;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cards = loadCards(options.outbox);
  process.env.LOCAL_STORE_DIR = options.store;
  const store = require('./api/_store');
  const imported = await importCards(store, cards);
  process.stdout.write(JSON.stringify({
    imported: cards.length,
    total: imported.result,
    store: options.store,
  }) + '\n');
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });
}

module.exports = { importCards, loadCards, mergeCards };
