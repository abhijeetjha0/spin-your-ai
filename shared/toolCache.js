/**
 * toolCache.js — In-memory caching for idempotent browser inspection tools
 * and structured smart truncation to protect LLM context windows.
 */

export class ToolCache {
  constructor() {
    this.cache = new Map();
    this.idempotentTools = new Set([
      'browser_get_dom_snapshot',
      'browser_get_interactive_elements'
    ]);
  }

  /**
   * Checks whether a tool is idempotent and safe to cache.
   * @param {string} toolName
   * @returns {boolean}
   */
  isIdempotent(toolName) {
    return this.idempotentTools.has(toolName);
  }

  /**
   * Retrieves a cached tool execution result if available.
   * @param {string} toolName
   * @param {object} args
   * @returns {any|null}
   */
  get(toolName, args = {}) {
    if (!this.isIdempotent(toolName)) return null;
    const key = `${toolName}:${JSON.stringify(args || {})}`;
    return this.cache.get(key) ?? null;
  }

  /**
   * Caches a tool execution result.
   * @param {string} toolName
   * @param {object} args
   * @param {any} result
   */
  set(toolName, args = {}, result) {
    if (!this.isIdempotent(toolName)) return;
    const key = `${toolName}:${JSON.stringify(args || {})}`;
    this.cache.set(key, result);
  }

  /**
   * Invalidates the cache (called when DOM-mutating tools execute).
   */
  invalidate() {
    this.cache.clear();
  }

  /**
   * Resets the entire cache.
   */
  reset() {
    this.cache.clear();
  }
}

export const toolCache = new ToolCache();

/**
 * Smart structured truncation preserving document head (structure, metadata, top elements)
 * and tail (conclusions, status) rather than naive end-chopping.
 *
 * @param {string} contentStr - The raw tool output
 * @param {number} maxChars - Maximum characters allowed before truncating (default 8000)
 * @returns {string} Truncated content with omitted summary banner
 */
export function smartTruncate(contentStr, maxChars = 8000) {
  if (typeof contentStr !== 'string' || contentStr.length <= maxChars) {
    return contentStr;
  }

  const lines = contentStr.split('\n');
  if (lines.length <= 60) {
    return contentStr.slice(0, maxChars) + '\n... [Remaining output truncated]';
  }

  const headCount = Math.min(100, Math.floor(lines.length * 0.4));
  const tailCount = Math.min(40, Math.floor(lines.length * 0.2));
  const omittedCount = lines.length - headCount - tailCount;

  if (omittedCount <= 10) {
    return contentStr.slice(0, maxChars) + '\n... [Remaining output truncated]';
  }

  const head = lines.slice(0, headCount).join('\n');
  const tail = lines.slice(lines.length - tailCount).join('\n');
  const summary = `\n\n... [Omitted ${omittedCount} intermediate lines to protect context window. Target specific elements or sections if needed] ...\n\n`;

  const truncated = head + summary + tail;
  if (truncated.length > maxChars) {
    return head.slice(0, Math.floor(maxChars * 0.7)) + summary + tail.slice(-Math.floor(maxChars * 0.25));
  }

  return truncated;
}
