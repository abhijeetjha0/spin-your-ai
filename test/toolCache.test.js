import test from 'node:test';
import assert from 'node:assert';
import { ToolCache, toolCache, smartTruncate } from '../shared/toolCache.js';

test('ToolCache - isIdempotent classification', () => {
  const cache = new ToolCache();
  assert.strictEqual(cache.isIdempotent('browser_get_dom_snapshot'), true);
  assert.strictEqual(cache.isIdempotent('browser_get_interactive_elements'), true);
  assert.strictEqual(cache.isIdempotent('browser_click'), false);
  assert.strictEqual(cache.isIdempotent('browser_fill'), false);
  assert.strictEqual(cache.isIdempotent('browser_navigate'), false);
  assert.strictEqual(cache.isIdempotent('unknown_tool'), false);
});

test('ToolCache - get, set and invalidate behavior', () => {
  const cache = new ToolCache();
  const toolName = 'browser_get_dom_snapshot';
  const args = { depth: 3 };
  const mockResult = { ok: true, dom: '<html><body>Hello</body></html>' };

  // Initial miss
  assert.strictEqual(cache.get(toolName, args), null);

  // Set and hit
  cache.set(toolName, args, mockResult);
  const cached = cache.get(toolName, args);
  assert.deepStrictEqual(cached, mockResult);

  // Non-idempotent tool should never be cached
  cache.set('browser_click', { selector: '#btn' }, { ok: true });
  assert.strictEqual(cache.get('browser_click', { selector: '#btn' }), null);

  // Invalidate
  cache.invalidate();
  assert.strictEqual(cache.get(toolName, args), null);
});

test('ToolCache - singleton export exists', () => {
  assert.ok(toolCache instanceof ToolCache);
});

test('smartTruncate - short content returns intact', () => {
  const shortText = 'Small response within limits';
  assert.strictEqual(smartTruncate(shortText, 100), shortText);
  assert.strictEqual(smartTruncate(null), null);
  assert.strictEqual(smartTruncate(undefined), undefined);
});

test('smartTruncate - short line count fallback', () => {
  // 10 lines, total length exceeds 50 chars
  const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}: Some content here`);
  const fullText = lines.join('\n');
  const result = smartTruncate(fullText, 50);

  assert.ok(result.length <= 100);
  assert.ok(result.includes('... [Remaining output truncated]'));
});

test('smartTruncate - preserves top and bottom lines for large output', () => {
  const lines = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}: DOM node description with extra padding text ${i}`);
  const fullText = lines.join('\n');

  const truncated = smartTruncate(fullText, 2000);

  // Verifies head is preserved
  assert.ok(truncated.includes('Line 1:'));
  assert.ok(truncated.includes('Line 2:'));

  // Verifies tail is preserved
  assert.ok(truncated.includes('Line 149:'));
  assert.ok(truncated.includes('Line 150:'));

  // Verifies omitted banner
  assert.ok(truncated.includes('Omitted'));
  assert.ok(truncated.includes('intermediate lines to protect context window'));
});
