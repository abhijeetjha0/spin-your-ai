import { BaseProvider } from './base.js';
import { parseSSE } from '../../shared/stream-parser.js';

export class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super('anthropic', config);
    this.apiKey = this.config.apiKey;
    this.baseUrl = 'https://api.anthropic.com/v1';
    
    // Anthropic models are currently hardcoded as their /models endpoint isn't fully standard yet
    this.defaultModels = [
      { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
    ];
  }

  async getModels() {
    if (!this.apiKey) return [];
    return this.defaultModels;
  }

  async *chat(modelId, messages, signal) {
    if (!this.apiKey) throw new Error('Anthropic API Key is not configured.');

    // Anthropic Messages API expects system prompt separate from messages array
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages.filter(m => m.role !== 'system');

    const formattedMessages = chatMessages.map(m => {
      const role = m.role === 'user' ? 'user' : 'assistant';
      
      if (Array.isArray(m.content)) {
        return {
          role,
          content: m.content.map(part => {
            if (part.type === 'text') return { type: 'text', text: part.text };
            if (part.type === 'image') {
              return { type: 'image', source: { type: 'base64', media_type: part.mimeType, data: part.data } };
            }
            return { type: 'text', text: `[Attached file: ${part.name} (${part.mimeType})]` };
          })
        };
      }
      
      return { role, content: m.content };
    });

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' // Required for client-side CORS
      },
      body: JSON.stringify({
        model: modelId,
        system: systemMessage,
        messages: formattedMessages,
        stream: true,
        max_tokens: 4096
      }),
      signal
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Anthropic Error: ${res.status}`);
    }

    for await (const data of parseSSE(res)) {
      if (data.type === 'content_block_delta' && data.delta?.text) {
        yield data.delta.text;
      }
    }
  }
}
