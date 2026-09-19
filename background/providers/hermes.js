import { OpenAIProvider } from './openai.js';

export class HermesProvider extends OpenAIProvider {
  constructor(config) {
    super(config);
    this.id = 'hermes';
    this.baseUrl = this.normalizeUrl(this.config.url || 'http://127.0.0.1:11434/v1');
    this.apiKey = 'dummy-key'; 
  }

  async getModels() {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!res.ok) throw new Error('Hermes not running');
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.id }));
    } catch (e) {
      console.warn('Hermes error:', e);
      return [];
    }
  }
}
