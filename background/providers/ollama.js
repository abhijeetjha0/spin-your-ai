import { BaseProvider } from './base.js';

export class OllamaProvider extends BaseProvider {
  constructor(config) {
    super('ollama', config);
    this.baseUrl = this.normalizeUrl(this.config.url || 'http://localhost:11434');
  }

  async getModels() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) throw new Error('Failed to fetch Ollama models');
      const data = await res.json();
      return data.models.map(m => ({ id: m.name, name: m.name }));
    } catch (e) {
      console.warn('Ollama not running or unreachable:', e);
      return [];
    }
  }

  async *chat(modelId, messages, signal) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: messages,
        stream: true
      }),
      signal
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama Error: ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              yield parsed.message.content;
            }
          } catch (e) {
            // ignore JSON parse errors on partial chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
