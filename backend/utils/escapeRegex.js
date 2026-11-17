/**
 * Escapes user input so it can be safely embedded in a RegExp.
 * Prevents regex injection / ReDoS through the `search` query parameter.
 */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = escapeRegex;
