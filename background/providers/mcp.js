import { BaseProvider } from './base.js';

export class MCPProvider extends BaseProvider {
  constructor(config) {
    super('mcp', config);
    this.baseUrl = this.normalizeUrl(this.config.url);
    this.authType = this.config.authType || 'None';
    this.authToken = this.config.authToken || '';
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.authType === 'Bearer' && this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    } else if (this.authType === 'API Key' && this.authToken) {
      headers['x-api-key'] = this.authToken;
    } else if (this.authType === 'Basic' && this.authToken) {
      headers['Authorization'] = `Basic ${btoa(this.authToken)}`;
    }
    return headers;
  }

  async getModels() {
    if (!this.baseUrl) return [];
    try {
      // JSON-RPC to tools/list to verify connection
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {}
        })
      });
      if (!res.ok) throw new Error('Failed to connect to MCP server');
      
      return [{ id: 'mcp-server', name: 'MCP Server' }];
    } catch (e) {
      console.warn('MCP server not running or unreachable:', e);
      return [];
    }
  }

  async *chat(modelId, messages, signal) {
    if (!this.baseUrl) throw new Error('MCP server URL is not configured.');

    const prompt = messages[messages.length - 1].content;
    
    // Sending a generic eval/prompt request to the MCP server.
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "prompts/list", // Standard MCP method or any custom method for chat
        params: { message: prompt }
      }),
      signal
    });

    if (!res.ok) {
      throw new Error(`MCP Error: ${res.status}`);
    }
    
    const data = await res.json();
    if (data.error) throw new Error(`MCP JSON-RPC Error: ${data.error.message}`);
    
    yield JSON.stringify(data.result || data);
  }
}
