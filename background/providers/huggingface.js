import { OpenAIProvider } from './openai.js';

export class HuggingFaceProvider extends OpenAIProvider {
  constructor(config) {
    super(config);
    this.id = 'huggingface';
    // HF serverless inference exposes an OpenAI-compatible API at /v1
    this.baseUrl = 'https://api-inference.huggingface.co/v1';
  }
  
  async getModels() {
    if (!this.apiKey) return [];
    try {
      // Fetch the top 20 most downloaded text-generation models from HF Hub
      const res = await fetch(`https://huggingface.co/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=20`);
      if (!res.ok) throw new Error('Network error fetching HF models');
      const data = await res.json();
      return data.map(m => ({ id: m.id, name: m.id }));
    } catch (e) {
      console.warn('Hugging Face error:', e);
      return [];
    }
  }
}
