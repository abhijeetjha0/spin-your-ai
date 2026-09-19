import { BaseProvider } from './base.js';
import { parseSSE } from '../../shared/stream-parser.js';

export class GeminiProvider extends BaseProvider {
  constructor(config) {
    super('gemini', config);
    this.apiKey = this.config.apiKey;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    
    this.defaultModels = [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
    ];
  }

  async getModels() {
    if (!this.apiKey) return [];
    return this.defaultModels;
  }

  async *chat(modelId, messages, signal) {
    if (!this.apiKey) throw new Error('Gemini API Key is not configured.');

    // Convert standard OpenAI format to Gemini format
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));
    
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const body = { contents };
    
    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    // append &alt=sse to use standard SSE
    const res = await fetch(`${this.baseUrl}/models/${modelId}:streamGenerateContent?key=${this.apiKey}&alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Gemini Error: ${res.status}`);
    }

    for await (const data of parseSSE(res)) {
      const parts = data.candidates?.[0]?.content?.parts;
      if (parts && parts[0]?.text) {
        yield parts[0].text;
      }
    }
  }
}
