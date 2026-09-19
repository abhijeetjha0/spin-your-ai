import { BaseProvider } from './base.js';
import { parseSSE } from '../../shared/stream-parser.js';

export class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super('openai', config);
    this.apiKey = this.config.apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async getModels() {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!res.ok) throw new Error('Invalid API Key or network error');
      const data = await res.json();
      // Filter for chat models roughly
      return data.data
        .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1-'))
        .map(m => ({ id: m.id, name: m.id }));
    } catch (e) {
      console.warn('OpenAI error:', e);
      return [];
    }
  }

  async *chat(modelId, messages, signal) {
    if (!this.apiKey) throw new Error('OpenAI API Key is not configured.');

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: messages,
        stream: true
      }),
      signal
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI Error: ${res.status}`);
    }

    for await (const data of parseSSE(res)) {
      if (data.choices && data.choices[0]?.delta?.content) {
        yield data.choices[0].delta.content;
      }
    }
  }
}
