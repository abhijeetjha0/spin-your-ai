import test from 'node:test';
import assert from 'node:assert';
import { OllamaCloudProvider } from '../background/providers/ollama_cloud.js';
import { OllamaProvider } from '../background/providers/ollama.js';

test('OllamaCloudProvider - Config & Tool Capabilities', () => {
  const provider = new OllamaCloudProvider({ apiKey: 'test-key' });
  assert.strictEqual(provider.id, 'ollama_cloud');
  assert.strictEqual(provider.name, 'Ollama Cloud');
  assert.strictEqual(provider.supportsTools, true);
  assert.strictEqual(provider.baseUrl, 'https://ollama.com/v1');
  assert.strictEqual(provider.apiKey, 'test-key');
});

test('OllamaProvider (local) - Config & Tool Capabilities', () => {
  const provider = new OllamaProvider({ url: 'http://localhost:11434' });
  assert.strictEqual(provider.name, 'ollama');
  assert.strictEqual(provider.supportsTools, false);
  assert.strictEqual(provider.baseUrl, 'http://localhost:11434/v1');
});
