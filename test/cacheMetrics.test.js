import test from 'node:test';
import assert from 'node:assert';
import { CacheMetricsService } from '../shared/cacheMetrics.js';

test('CacheMetricsService - OpenAI / OpenRouter format with cached_tokens', () => {
  const raw = {
    prompt_tokens: 1500,
    completion_tokens: 300,
    total_tokens: 1800,
    prompt_tokens_details: {
      cached_tokens: 1200
    }
  };

  const metrics = CacheMetricsService.normalizeUsage(raw, 'openai', 450);
  assert.ok(metrics);
  assert.strictEqual(metrics.inputTokens, 1500);
  assert.strictEqual(metrics.outputTokens, 300);
  assert.strictEqual(metrics.totalTokens, 1800);
  assert.strictEqual(metrics.cachedTokens, 1200);
  assert.strictEqual(metrics.savingsPercent, 80);
  assert.strictEqual(metrics.durationMs, 450);

  const label = CacheMetricsService.formatCacheLabel(metrics);
  assert.strictEqual(label, '1.2k cached (80% saved)');

  const tooltip = CacheMetricsService.formatTooltip(metrics);
  assert.ok(tooltip.includes('Input: 1,500'));
  assert.ok(tooltip.includes('Cached: 1,200'));
  assert.ok(tooltip.includes('Output: 300'));
  assert.ok(tooltip.includes('Latency: 450ms'));
});

test('CacheMetricsService - Anthropic format with cache_read and cache_creation', () => {
  const raw = {
    input_tokens: 200,
    output_tokens: 100,
    cache_creation_input_tokens: 500,
    cache_read_input_tokens: 1500
  };

  const metrics = CacheMetricsService.normalizeUsage(raw, 'anthropic');
  assert.ok(metrics);
  assert.strictEqual(metrics.inputTokens, 200);
  assert.strictEqual(metrics.outputTokens, 100);
  assert.strictEqual(metrics.cacheCreationTokens, 500);
  assert.strictEqual(metrics.cacheReadTokens, 1500);
  assert.strictEqual(metrics.cachedTokens, 1500);
  assert.strictEqual(metrics.savingsPercent, 90);

  const label = CacheMetricsService.formatCacheLabel(metrics);
  assert.strictEqual(label, '1.5k cached (90% saved)');

  const tooltip = CacheMetricsService.formatTooltip(metrics);
  assert.ok(tooltip.includes('Cache Write: 500'));
});

test('CacheMetricsService - Gemini format with cachedContentTokenCount', () => {
  const raw = {
    promptTokenCount: 2000,
    candidatesTokenCount: 400,
    totalTokenCount: 2400,
    cachedContentTokenCount: 1000
  };

  const metrics = CacheMetricsService.normalizeUsage(raw, 'gemini');
  assert.ok(metrics);
  assert.strictEqual(metrics.inputTokens, 2000);
  assert.strictEqual(metrics.outputTokens, 400);
  assert.strictEqual(metrics.totalTokens, 2400);
  assert.strictEqual(metrics.cachedTokens, 1000);
  assert.strictEqual(metrics.savingsPercent, 50);

  const label = CacheMetricsService.formatCacheLabel(metrics);
  assert.strictEqual(label, '1k cached (50% saved)');
});

test('CacheMetricsService - OpenRouter native_tokens_cached fallback', () => {
  const raw = {
    prompt_tokens: 1000,
    completion_tokens: 100,
    total_tokens: 1100,
    native_tokens_cached: 600
  };

  const metrics = CacheMetricsService.normalizeUsage(raw, 'openrouter');
  assert.ok(metrics);
  assert.strictEqual(metrics.cachedTokens, 600);
  assert.strictEqual(metrics.savingsPercent, 60);
});

test('CacheMetricsService - Zero cached tokens format', () => {
  const raw = {
    prompt_tokens: 450,
    completion_tokens: 50,
    total_tokens: 500
  };

  const metrics = CacheMetricsService.normalizeUsage(raw, 'openai');
  assert.ok(metrics);
  assert.strictEqual(metrics.cachedTokens, 0);
  assert.strictEqual(metrics.savingsPercent, undefined);

  const label = CacheMetricsService.formatCacheLabel(metrics);
  assert.strictEqual(label, '500 tokens');
});

test('CacheMetricsService - Invalid or empty usage payloads', () => {
  assert.strictEqual(CacheMetricsService.normalizeUsage(null, 'openai'), null);
  assert.strictEqual(CacheMetricsService.normalizeUsage(undefined, 'openai'), null);
  assert.strictEqual(CacheMetricsService.normalizeUsage({}, 'openai'), null);
  assert.strictEqual(CacheMetricsService.normalizeUsage('string', 'openai'), null);
});

test('CacheMetricsService - formatNumber compactness', () => {
  assert.strictEqual(CacheMetricsService.formatNumber(0), '0');
  assert.strictEqual(CacheMetricsService.formatNumber(999), '999');
  assert.strictEqual(CacheMetricsService.formatNumber(1000), '1k');
  assert.strictEqual(CacheMetricsService.formatNumber(1500), '1.5k');
  assert.strictEqual(CacheMetricsService.formatNumber(25400), '25k');
});
