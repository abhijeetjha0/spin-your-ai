import { BaseProvider } from './base.js';

export class OpenCodeProvider extends BaseProvider {
  constructor(config) {
    super('opencode', config);
    this.baseUrl = this.normalizeUrl(this.config.url || 'http://localhost:3000');
    this.username = this.config.username || '';
    this.password = this.config.password || '';
  }

  getAuthHeader() {
    if (!this.username || !this.password) return null;
    return `Basic ${btoa(this.username + ':' + this.password)}`;
  }

  async getModels() {
    try {
      const headers = {};
      const authHeader = this.getAuthHeader();
      if (authHeader) headers['Authorization'] = authHeader;
      
      const res = await fetch(`${this.baseUrl}/api/health`, { headers });
      if (!res.ok) throw new Error('OpenCode not running');
      
      return [{ id: 'opencode-default', name: 'OpenCode Session' }];
    } catch (e) {
      console.warn('OpenCode error:', e);
      return [];
    }
  }

  async *chat(modelId, messages, signal) {
    const headers = { 'Content-Type': 'application/json' };
    const authHeader = this.getAuthHeader();
    if (authHeader) headers['Authorization'] = authHeader;

    // OpenCode's API only accepts a single 'message' string.
    // If there is a system message (like page context), we must prepend it to the user prompt.
    let fullPrompt = '';
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg) {
      fullPrompt += systemMsg.content + '\n\n---\n\n';
    }
    const userMsg = messages.filter(m => m.role === 'user').pop();
    fullPrompt += userMsg ? userMsg.content : '';

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: fullPrompt }),
      signal
    });

    if (!res.ok) {
      throw new Error(`OpenCode Error: ${res.status}`);
    }
    
    const text = await res.text();
    yield text;
  }
}
