import { OpenAIProvider } from './openai.js';

export class OllamaProvider extends OpenAIProvider {
  constructor(config) {
    super(config);
    this.name = 'ollama';
    this.config.apiKeyRequired = false;
    this.supportsTools = false;
    let url = this.normalizeUrl(this.config.url || 'http://localhost:11434');
    this.baseUrl = url.endsWith('/v1') ? url : `${url.replace(/\/$/, '')}/v1`;
  }

  async getModels() {
    try {
      // Use original Ollama tags endpoint to list models
      const tagsUrl = this.baseUrl.replace(/\/v1\/?$/, '') + '/api/tags';
      const res = await fetch(tagsUrl);
      if (!res.ok) throw new Error('Failed to fetch Ollama models');
      const data = await res.json();
      return data.models.map(m => ({ id: m.name, name: m.name }));
    } catch (e) {
      console.warn('Ollama not running or unreachable:', e);
      return [];
    }
  }
}
