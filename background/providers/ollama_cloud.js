import { OpenAIProvider } from './openai.js';

export class OllamaCloudProvider extends OpenAIProvider {
  constructor(config) {
    super(config);
    this.id = 'ollama_cloud';
    // Using standard OpenAI compatible endpoint logic for Ollama Cloud if applicable.
    this.baseUrl = 'https://ollama.com/v1'; 
  }

  async getModels() {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!res.ok) throw new Error('Invalid API Key or network error');
      const data = await res.json();
      
      // Return all models without OpenAI specific filtering
      return data.data.map(m => ({ id: m.id, name: m.id }));
    } catch (e) {
      console.warn('Ollama Cloud error:', e);
      return [];
    }
  }
}
