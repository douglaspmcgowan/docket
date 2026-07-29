const AUTHORITATIVE_DOCUMENTS = Object.freeze([
  'items.json',
  'results.json',
  'tickets.json',
  'reads.json',
]);

const DECISION_TYPES = new Set([
  'option-select',
  'tradeoff',
  'reversibility',
  'reasoning-tree',
  'diff',
  'critique',
]);

class DocumentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

function fail(message) {
  throw new DocumentValidationError(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    fail(`${label} must be a ${allowEmpty ? '' : 'non-empty '}string`);
  }
}

function validateOptions(options, label, { min = 1, max = Infinity } = {}) {
  if (!Array.isArray(options) || options.length < min || options.length > max) {
    fail(`${label} must contain ${min}${Number.isFinite(max) ? `-${max}` : '+'} options`);
  }
  for (const [index, option] of options.entries()) {
    if (typeof option === 'string') {
      requireString(option, `${label}[${index}]`);
    } else if (isRecord(option)) {
      const value = option.label || option.id;
      requireString(value, `${label}[${index}].label`);
    } else {
      fail(`${label}[${index}] must be a string or option object`);
    }
  }
}

function validateDecision(item) {
  const type = item.type || 'option-select';
  if (!DECISION_TYPES.has(type)) fail(`decision ${item.id} has unsupported type ${type}`);
  if (type === 'option-select') validateOptions(item.options, `decision ${item.id}.options`, { min: 2 });
  if (type === 'tradeoff') {
    validateOptions(item.options, `decision ${item.id}.options`, { min: 2, max: 5 });
    if (!Array.isArray(item.criteria) || !item.criteria.length) fail(`decision ${item.id}.criteria must be a non-empty array`);
    if (!Array.isArray(item.cells)) fail(`decision ${item.id}.cells must be an array`);
  }
  if (type === 'reversibility') {
    if (!['one-way', 'two-way'].includes(item.door)) fail(`decision ${item.id}.door must be one-way or two-way`);
    requireString(item.cost_to_reverse, `decision ${item.id}.cost_to_reverse`);
    if (!Array.isArray(item.consequences) || !item.consequences.length) {
      fail(`decision ${item.id}.consequences must be a non-empty array`);
    }
  }
  if (type === 'reasoning-tree') {
    if (!Array.isArray(item.nodes) || !item.nodes.length) fail(`decision ${item.id}.nodes must be a non-empty array`);
  }
  if (type === 'diff') {
    requireString(item.before, `decision ${item.id}.before`, { allowEmpty: true });
    requireString(item.after, `decision ${item.id}.after`, { allowEmpty: true });
  }
  if (type === 'critique' && !isRecord(item.artifact)) {
    fail(`decision ${item.id}.artifact must be an object`);
  }
}

function validateItem(item) {
  if (!isRecord(item)) fail('item must be an object');
  requireString(item.id, 'item.id');
  requireString(item.title, `item ${item.id}.title`);
  if (item.kind !== undefined && !['review', 'brief', 'decision'].includes(item.kind)) {
    fail(`item ${item.id}.kind is unsupported`);
  }
  if (item.kind === 'brief') {
    const hasBody = typeof item.body === 'string';
    const hasSource = typeof item.src === 'string' && item.src.trim().length > 0;
    if (hasBody === hasSource) fail(`brief ${item.id} must carry exactly one of body or src`);
    if (item.format !== undefined && !['md', 'html'].includes(item.format)) {
      fail(`brief ${item.id}.format must be md or html`);
    }
    if (item.embeds !== undefined && !Array.isArray(item.embeds)) fail(`brief ${item.id}.embeds must be an array`);
  } else if (item.kind === 'decision') {
    validateDecision(item);
  } else if (item.options !== undefined) {
    validateOptions(item.options, `item ${item.id}.options`);
  }
  return item;
}

function validateResult(result) {
  if (!isRecord(result)) fail('result must be an object');
  requireString(result.id, 'result.id');
  requireString(result.answered_at, `result ${result.id}.answered_at`);
  const archived = result.archived === true;
  const more = result.action === 'more';
  const chosen = typeof result.chosen === 'string' && result.chosen.trim().length > 0;
  const commented = result.chosen === null && typeof result.comment === 'string' && result.comment.length > 0;
  if ([archived, more, chosen, commented].filter(Boolean).length !== 1) {
    fail(`result ${result.id} must contain exactly one recognized outcome`);
  }
  return result;
}

function validateTicket(ticket) {
  if (!isRecord(ticket)) fail('ticket must be an object');
  requireString(ticket.id, 'ticket.id');
  requireString(ticket.requested_at, `ticket ${ticket.id}.requested_at`);
  if (ticket.title !== undefined) requireString(ticket.title, `ticket ${ticket.id}.title`, { allowEmpty: true });
  if (ticket.notes !== undefined) requireString(ticket.notes, `ticket ${ticket.id}.notes`, { allowEmpty: true });
  return ticket;
}

function validateDocument(name, document) {
  if (!AUTHORITATIVE_DOCUMENTS.includes(name)) fail(`unknown authoritative document: ${name}`);
  if (!isRecord(document)) fail(`${name} must be an object map`);
  for (const [key, value] of Object.entries(document)) {
    requireString(key, `${name} key`);
    if (name === 'reads.json') {
      requireString(value, `reads.json timestamp for ${key}`);
      continue;
    }
    const validated = name === 'items.json' ? validateItem(value)
      : name === 'results.json' ? validateResult(value)
      : validateTicket(value);
    if (validated.id !== key) fail(`${name} key ${key} does not match record id ${validated.id}`);
  }
  return document;
}

module.exports = {
  AUTHORITATIVE_DOCUMENTS,
  DECISION_TYPES,
  DocumentValidationError,
  validateDocument,
  validateItem,
};
