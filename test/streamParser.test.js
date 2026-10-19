import test from 'node:test';
import assert from 'node:assert';
import { parseSSE } from '../shared/stream-parser.js';

test('parseSSE - parses valid streaming chunks and handles [DONE]', async () => {
  const chunks = [
    'data: {"choices": [{"delta": {"content": "Hello"}}]}\n\n',
    ': comment line\n\n',
    'data: {"choices": [{"delta": {"content": " world"}}]}\n\n',
    'data: [DONE]\n\n'
  ];

  let chunkIndex = 0;
  const mockResponse = {
    body: {
      getReader() {
        return {
          async read() {
            if (chunkIndex >= chunks.length) {
              return { done: true, value: undefined };
            }
            const encoder = new TextEncoder();
            const value = encoder.encode(chunks[chunkIndex++]);
            return { done: false, value };
          },
          releaseLock() {}
        };
      }
    }
  };

  const results = [];
  for await (const item of parseSSE(mockResponse)) {
    results.push(item);
  }

  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].choices[0].delta.content, 'Hello');
  assert.strictEqual(results[1].choices[0].delta.content, ' world');
});

test('parseSSE - handles invalid JSON gracefully', async () => {
  const chunks = [
    'data: {malformed json\n\n',
    'data: {"valid": true}\n\n'
  ];

  let chunkIndex = 0;
  const mockResponse = {
    body: {
      getReader() {
        return {
          async read() {
            if (chunkIndex >= chunks.length) {
              return { done: true, value: undefined };
            }
            const encoder = new TextEncoder();
            const value = encoder.encode(chunks[chunkIndex++]);
            return { done: false, value };
          },
          releaseLock() {}
        };
      }
    }
  };

  // Temporarily suppress expected console.error during invalid json parsing
  const origError = console.error;
  console.error = () => {};

  try {
    const results = [];
    for await (const item of parseSSE(mockResponse)) {
      results.push(item);
    }

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].valid, true);
  } finally {
    console.error = origError;
  }
});
