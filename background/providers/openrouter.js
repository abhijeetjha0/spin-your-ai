import { OpenAIProvider } from './openai.js';

export class OpenRouterProvider extends OpenAIProvider {
  constructor(config) {
    super(config);
    this.id = 'openrouter';
    this.baseUrl = 'https://openrouter.ai/api/v1';
  }
  
  async getModels() {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!res.ok) throw new Error('Invalid API Key or network error');
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.name || m.id }));
    } catch (e) {
      console.warn('OpenRouter error:', e);
      return [];
    }
  }
}
