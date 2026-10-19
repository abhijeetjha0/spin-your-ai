import test from 'node:test';
import assert from 'node:assert';
import {
  PRESERVED_RECENT_TURNS,
  AUTO_COMPACT_MIN_TURNS,
  AUTO_COMPACT_TOKEN_THRESHOLD,
  estimateTokens,
  estimateHistoryTokens,
  generateDeterministicSummary,
  compactHistory
} from '../shared/contextCompactor.js';

test('ContextCompactor - Constants', () => {
  assert.strictEqual(PRESERVED_RECENT_TURNS, 4);
  assert.strictEqual(AUTO_COMPACT_MIN_TURNS, 10);
  assert.strictEqual(AUTO_COMPACT_TOKEN_THRESHOLD, 6000);
});

test('ContextCompactor - estimateTokens', () => {
  assert.strictEqual(estimateTokens(''), 0);
  assert.strictEqual(estimateTokens(null), 0);
  assert.strictEqual(estimateTokens(undefined), 0);
  assert.strictEqual(estimateTokens('test'), 1);
  assert.strictEqual(estimateTokens('12345678'), 2);
  assert.strictEqual(estimateTokens('12345'), 2);
});

test('ContextCompactor - estimateHistoryTokens', () => {
  assert.strictEqual(estimateHistoryTokens(null), 0);
  assert.strictEqual(estimateHistoryTokens(undefined), 0);
  assert.strictEqual(estimateHistoryTokens('not an array'), 0);
  assert.strictEqual(estimateHistoryTokens([]), 0);

  const history = [
    { role: 'user', text: '1234' }, // 1 token
    { role: 'assistant', text: '12345678' } // 2 tokens
  ];
  assert.strictEqual(estimateHistoryTokens(history), 3);
});

test('ContextCompactor - generateDeterministicSummary with complex items', () => {
  const items = [
    {
      role: 'user',
      text: 'What does this API do?\nURL: https://example.com/api\nHere is the context of the webpage Some data [Content was truncated due to length]\n```javascript\nconsole.log("hello");\n```'
    },
    {
      role: 'assistant',
      text: '# Overview of API\n## Endpoints\nThis API provides status and health check endpoints.'
    },
    {
      role: 'user',
      text: 'A'.repeat(200) // Truncation test > 140 chars
    },
    {
      role: 'assistant',
      text: '> quote line\n\nDirect answer here without headers.'
    },
    {
      role: 'user',
      text: '' // Empty text test
    },
    {
      role: 'system',
      text: 'System instruction text'
    }
  ];

  const summary = generateDeterministicSummary(items);
  assert.ok(summary.includes('[COMPACTED CONTEXT SUMMARY - 6 EARLIER TURNS]'));
  assert.ok(summary.includes('[END COMPACTED CONTEXT SUMMARY]'));
  assert.ok(summary.includes('Webpages referenced earlier: `https://example.com/api`'));
  assert.ok(summary.includes('- User queried/instructed: "What does this API do?"'));
  assert.ok(summary.includes('Assistant addressed: Overview of API; Endpoints'));
  assert.ok(summary.includes('Assistant outcome: "Direct answer here without headers...."'));
  assert.ok(summary.includes('...')); // from truncation of the 200 char user message
});

test('ContextCompactor - compactHistory with short or empty history', async () => {
  // Empty history
  const resEmpty = await compactHistory([]);
  assert.strictEqual(resEmpty.compactedCount, 0);
  assert.strictEqual(resEmpty.summary, '');
  assert.strictEqual(resEmpty.savedTokens, 0);
  assert.deepStrictEqual(resEmpty.remainingHistory, []);

  // Null history
  const resNull = await compactHistory(null);
  assert.strictEqual(resNull.compactedCount, 0);

  // Exactly PRESERVED_RECENT_TURNS items
  const history4 = [
    { role: 'user', text: 'msg 1' },
    { role: 'assistant', text: 'msg 2' },
    { role: 'user', text: 'msg 3' },
    { role: 'assistant', text: 'msg 4' }
  ];
  const res4 = await compactHistory(history4);
  assert.strictEqual(res4.compactedCount, 0);
  assert.strictEqual(res4.remainingHistory.length, 4);
});

test('ContextCompactor - compactHistory deterministic mode', async () => {
  const history = [
    { role: 'user', text: 'Turn 1 user request with detailed requirements.' },
    { role: 'assistant', text: 'Turn 1 assistant answer.' },
    { role: 'user', text: 'Turn 2 user inquiry.' },
    { role: 'assistant', text: 'Turn 2 assistant answer.' },
    { role: 'user', text: 'Turn 3 recent user' },
    { role: 'assistant', text: 'Turn 3 recent assistant' },
    { role: 'user', text: 'Turn 4 recent user' },
    { role: 'assistant', text: 'Turn 4 recent assistant' }
  ];

  const result = await compactHistory(history);
  assert.strictEqual(result.compactedCount, 4);
  assert.strictEqual(result.remainingHistory.length, 4);
  assert.ok(result.summary.includes('[COMPACTED CONTEXT SUMMARY - 4 EARLIER TURNS]'));
  assert.ok(result.savedTokens >= 0);
});

test('ContextCompactor - compactHistory AI mode success', async () => {
  const history = [
    { role: 'user', text: 'First user message' },
    { role: 'assistant', text: 'First assistant reply' },
    { role: 'user', text: 'Second user message' },
    { role: 'assistant', text: 'Second assistant reply' },
    { role: 'user', text: 'Recent 1' },
    { role: 'assistant', text: 'Recent 2' },
    { role: 'user', text: 'Recent 3' },
    { role: 'assistant', text: 'Recent 4' }
  ];

  const mockProvider = {
    async *streamChat(_messages, _modelId, _signal) {
      yield { text: '- Summarized key goal: Building unit tests' };
      yield { text: '\n- Outcome: Verified successfully' };
    }
  };

  const result = await compactHistory(history, mockProvider, 'test-model');
  assert.strictEqual(result.compactedCount, 4);
  assert.ok(result.summary.includes('Summarized key goal: Building unit tests'));
  assert.ok(result.summary.includes('[COMPACTED CONTEXT SUMMARY - 4 EARLIER TURNS]'));
});

test('ContextCompactor - compactHistory AI mode fallback on error', async () => {
  const history = [
    { role: 'user', text: 'User question' },
    { role: 'assistant', text: 'Assistant answer' },
    { role: 'user', text: 'Second question' },
    { role: 'assistant', text: 'Second answer' },
    { role: 'user', text: 'R1' },
    { role: 'assistant', text: 'R2' },
    { role: 'user', text: 'R3' },
    { role: 'assistant', text: 'R4' }
  ];

  const failingProvider = {
    async *streamChat() {
      throw new Error('Network error during compaction');
    }
  };

  const result = await compactHistory(history, failingProvider, 'test-model');
  assert.strictEqual(result.compactedCount, 4);
  assert.ok(result.summary.includes('[COMPACTED CONTEXT SUMMARY - 4 EARLIER TURNS]'));
  assert.ok(result.summary.includes('User queried/instructed: "User question"'));
});

test('ContextCompactor - compactHistory AI mode fallback on empty summary', async () => {
  const history = [
    { role: 'user', text: 'User question' },
    { role: 'assistant', text: 'Assistant answer' },
    { role: 'user', text: 'Second question' },
    { role: 'assistant', text: 'Second answer' },
    { role: 'user', text: 'R1' },
    { role: 'assistant', text: 'R2' },
    { role: 'user', text: 'R3' },
    { role: 'assistant', text: 'R4' }
  ];

  const emptyProvider = {
    async *streamChat() {
      yield { text: '   ' };
    }
  };

  const result = await compactHistory(history, emptyProvider, 'test-model');
  assert.strictEqual(result.compactedCount, 4);
  assert.ok(result.summary.includes('User queried/instructed: "User question"'));
});
