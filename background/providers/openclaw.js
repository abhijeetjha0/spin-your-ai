import { BaseProvider } from './base.js';

export class OpenClawProvider extends BaseProvider {
  constructor(config) {
    super('openclaw', config);
    this.baseUrl = this.normalizeUrl(this.config.url || 'http://localhost:3141');
  }

  async getModels() {
    try {
      // Assuming a generic /health endpoint to check if it's running
      const res = await fetch(`${this.baseUrl}/health`);
      if (!res.ok) throw new Error('OpenClaw not running');
      
      return [{ id: 'agent', name: 'OpenClaw Agent' }];
    } catch (e) {
      console.warn('OpenClaw not running:', e);
      return [];
    }
  }

  async *chat(modelId, messages, signal) {
    const prompt = messages[messages.length - 1].content;
    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt }),
      signal
    });

    if (!res.ok) {
      throw new Error(`OpenClaw Error: ${res.status}`);
    }
    
    // Assuming simple text response for the local agent
    const text = await res.text();
    yield text;
  }
}
