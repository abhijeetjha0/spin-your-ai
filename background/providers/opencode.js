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
      
      const res = await fetch(`${this.baseUrl}/api/model`, { headers });
      if (!res.ok) throw new Error('OpenCode not running');
      
      const data = await res.json();
      const models = data?.data || [];
      
      if (models.length === 0) {
        return [{ id: 'default', name: 'OpenCode Default Model' }];
      }

      return models.map(m => ({
        id: `${m.providerID}::${m.id}`,
        name: `${m.providerID} / ${m.id}`
      }));
    } catch (e) {
      console.warn('OpenCode error:', e);
      return [];
    }
  }

  async *chat(_modelId, messages, signal) {
    const headers = { 'Content-Type': 'application/json' };
    const authHeader = this.getAuthHeader();
    if (authHeader) headers['Authorization'] = authHeader;

    let fullPrompt = '';
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg) {
      fullPrompt += systemMsg.content + '\n\n---\n\n';
    }
    const userMsg = messages.filter(m => m.role === 'user').pop();
    fullPrompt += userMsg ? userMsg.content : '';

    let modelRef = null;
    try {
      if (_modelId && _modelId !== 'default') {
        const parts = _modelId.split('::');
        if (parts.length === 2) {
          modelRef = { providerID: parts[0], id: parts[1] };
        }
      }
    } catch (e) {
      // ignore
    }

    const res = await fetch(`${this.baseUrl}/api/experimental/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        prompt: fullPrompt,
        ...(modelRef && { model: modelRef })
      }),
      signal
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`OpenCode Error: ${res.status} ${errorText}`);
    }
    
    const data = await res.json();
    yield data?.data?.text || '';
  }
}
