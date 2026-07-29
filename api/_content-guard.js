const RESTRICTED_MARKERS = Object.freeze([
  /\bCUI\b/i,
  /\bCONTROLLED\s+UNCLASSIFIED\s+INFORMATION\b/i,
  /\bNASA[\s-]+INTERNAL(?:\s+USE\s+ONLY)?\b/i,
  /\bNASA[\s-]+SENSITIVE(?:\s+BUT\s+UNCLASSIFIED)?\b/i,
]);

function containsRestrictedMarker(value, seen = new Set()) {
  if (typeof value === 'string') {
    return RESTRICTED_MARKERS.some(pattern => pattern.test(value));
  }
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(entry => containsRestrictedMarker(entry, seen));
  return Object.entries(value).some(([key, entry]) =>
    containsRestrictedMarker(key, seen) || containsRestrictedMarker(entry, seen)
  );
}

function cloudAdmissible(item) {
  return Boolean(item) && item.sensitive !== true && !containsRestrictedMarker(item);
}

module.exports = {
  cloudAdmissible,
  containsRestrictedMarker,
};
