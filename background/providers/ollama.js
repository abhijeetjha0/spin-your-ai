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
    let res;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: messages,
          stream: true
        }),
        signal
      });
    } catch (e) {
      throw new Error(`Failed to communicate with Ollama. Is it running? (${e.message})`);
    }

    if (!res.ok) {
      const text = await res.text();
      let errorMsg = text;
      try { errorMsg = JSON.parse(text).error || text; } catch (e) {}
      
      if (!errorMsg && res.status === 403) {
        errorMsg = "CORS error (403 Forbidden). You must set OLLAMA_ORIGINS='*' or allow your extension ID before starting Ollama.";
      } else if (!errorMsg) {
        errorMsg = `HTTP ${res.status}`;
      }
      
      throw new Error(`Ollama API Error: ${errorMsg}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.message?.content) {
              yield parsed.message.content;
            }
          } catch (e) {
            console.error('Ollama stream parse error:', e, line);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
