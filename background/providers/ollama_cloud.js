import { OpenAIProvider } from './openai.js';

export class OllamaCloudProvider extends OpenAIProvider {
  constructor(config) {
    super(config);
    this.id = 'ollama_cloud';
    // Using standard OpenAI compatible endpoint logic for Ollama Cloud if applicable.
    this.baseUrl = 'https://ollama.com/api/v1'; 
  }
}
