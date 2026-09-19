/**
 * BaseProvider class that all providers extend.
 * Enforces a standard interface for the orchestrator to interact with different LLMs/agents.
 */
export class BaseProvider {
  constructor(providerId, config) {
    this.id = providerId;
    this.config = config || {};
  }

  /**
   * Fetch models available for this provider.
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  async getModels() {
    throw new Error('getModels() not implemented for provider ' + this.id);
  }

  /**
   * Send a chat message and return an async generator that yields text chunks.
   * @param {string} modelId 
   * @param {Array<{role: string, content: string}>} messages 
   * @param {AbortSignal} signal - Used to cancel generation
   * @returns {AsyncGenerator<string>}
   */
  async *chat(modelId, messages, signal) {
    throw new Error('chat() not implemented for provider ' + this.id);
  }
  
  /**
   * Test the connection to the provider. Used by the options page.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async testConnection() {
    try {
      const models = await this.getModels();
      if (!models || models.length === 0) {
        return { ok: false, error: 'No models found or missing configuration.' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Ensure URL doesn't have trailing slash
   */
  normalizeUrl(url) {
    if (!url) return '';
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }
}
