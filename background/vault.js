export const vault = {
  /**
   * Saves a configuration to chrome.storage.local
   * @param {string} providerId - The ID of the provider (e.g., 'openai', 'ollama')
   * @param {object} config - The provider configuration (keys, urls, etc.)
   */
  async saveConfig(providerId, config) {
    const data = await chrome.storage.local.get('providers');
    const providers = data.providers || {};
    providers[providerId] = config;
    await chrome.storage.local.set({ providers });
  },

  /**
   * Retrieves a configuration from chrome.storage.local
   * @param {string} providerId
   * @returns {object|null}
   */
  async getConfig(providerId) {
    const data = await chrome.storage.local.get('providers');
    if (!data.providers) return null;
    return data.providers[providerId] || null;
  },

  /**
   * Retrieves all provider configurations
   * @returns {object}
   */
  async getAllConfigs() {
    const data = await chrome.storage.local.get('providers');
    return data.providers || {};
  },

  /**
   * Deletes a configuration from chrome.storage.local
   * @param {string} providerId 
   */
  async deleteConfig(providerId) {
    const data = await chrome.storage.local.get('providers');
    if (!data.providers) return;
    delete data.providers[providerId];
    await chrome.storage.local.set({ providers: data.providers });
  },
  
  /**
   * Get the active/selected model configuration
   */
  async getActiveModel() {
    const data = await chrome.storage.local.get('activeModel');
    return data.activeModel || null; // { providerId: 'openai', modelId: 'gpt-4o' }
  },
  
  /**
   * Set the active/selected model configuration
   */
  async setActiveModel(providerId, modelId) {
    await chrome.storage.local.set({ activeModel: { providerId, modelId } });
  }
};
