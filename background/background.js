import { vault } from './vault.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { OllamaCloudProvider } from './providers/ollama_cloud.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { OpenCodeZenProvider } from './providers/opencode_zen.js';
import { OpenCodeProvider } from './providers/opencode.js';
import { OpenClawProvider } from './providers/openclaw.js';
import { HermesProvider } from './providers/hermes.js';
import { MCPProvider } from './providers/mcp.js';

// Setup side panel behavior to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Active generation controllers for cancelling
const activeGenerations = new Map();
let conversationHistory = [];

async function getProviderInstance(providerId, passedConfig = null) {
  const config = passedConfig || await vault.getConfig(providerId);
  switch (providerId) {
    case 'ollama': return new OllamaProvider(config);
    case 'openai': return new OpenAIProvider(config);
    case 'anthropic': return new AnthropicProvider(config);
    case 'gemini': return new GeminiProvider(config);
    case 'ollama_cloud': return new OllamaCloudProvider(config);
    case 'openrouter': return new OpenRouterProvider(config);
    case 'opencode_zen': return new OpenCodeZenProvider(config);
    case 'opencode': return new OpenCodeProvider(config);
    case 'openclaw': return new OpenClawProvider(config);
    case 'hermes': return new HermesProvider(config);
    case 'mcp': return new MCPProvider(config);
    default: return null;
  }
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_MODELS') {
    handleGetModels().then(sendResponse);
    return true;
  }
  
  if (request.type === 'TEST_CONNECTION') {
    getProviderInstance(request.payload.providerId, request.payload.config)
      .then(provider => provider ? provider.testConnection() : { ok: false, error: 'Provider not found' })
      .then(sendResponse);
    return true;
  }

  if (request.type === 'GET_ACTIVE_MODEL') {
    vault.getActiveModel().then(sendResponse);
    return true;
  }

  if (request.type === 'SET_ACTIVE_MODEL') {
    const { providerId, modelId } = request.payload;
    vault.setActiveModel(providerId, modelId).then(sendResponse);
    return true;
  }

  if (request.type === 'SEND_CHAT') {
    handleSendChat(request.payload);
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'CLEAR_HISTORY') {
    conversationHistory = [];
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'STOP_GENERATION') {
    const { messageId } = request.payload;
    if (activeGenerations.has(messageId)) {
      activeGenerations.get(messageId).abort();
      activeGenerations.delete(messageId);
    }
    sendResponse({ ok: true });
    return true;
  }
});

async function handleGetModels() {
  const allConfigs = await vault.getAllConfigs();
  const providers = {};
  
  const providerNames = {
    'ollama': 'Ollama (Local)',
    'openai': 'OpenAI',
    'anthropic': 'Anthropic',
    'gemini': 'Google Gemini',
    'ollama_cloud': 'Ollama Cloud',
    'openrouter': 'OpenRouter',
    'opencode_zen': 'OpenCode Zen',
    'opencode': 'OpenCode (Local)',
    'openclaw': 'OpenClaw (Local)',
    'hermes': 'Hermes Desktop',
    'mcp': 'MCP Server'
  };
  
  // We probe all of them in parallel
  const promises = Object.keys(providerNames).map(async (id) => {
    // Only check if they are configured, EXCEPT local auto-discover ones
    const config = allConfigs[id] || {};
    const isAutoDiscover = ['ollama', 'opencode', 'openclaw', 'hermes'].includes(id);
    
    // Auto-discover ones are probed even if no explicit config exists
    if (!config.apiKey && !config.url && !isAutoDiscover) return;
    
    const instance = await getProviderInstance(id);
    if (!instance) return;
    
    try {
      const models = await instance.getModels();
      if (models && models.length > 0) {
        providers[id] = {
          name: providerNames[id],
          models
        };
      }
    } catch(e) {
      // Ignored - probably not running or invalid key
    }
  });
  
  await Promise.all(promises);
  return { providers };
}

async function handleSendChat(payload) {
  const { messageId, providerId, modelId, text, pageContext } = payload;
  const provider = await getProviderInstance(providerId);
  if (!provider) {
    emitStreamChunk(messageId, null, true, 'Provider not configured.');
    return;
  }

  const controller = new AbortController();
  activeGenerations.set(messageId, controller);
  
  // Build messages array: system context + full conversation history + new user message
  const messages = [];
  
  if (pageContext) {
    let contextStr = `Here is the context of the webpage the user is currently viewing:\nURL: ${pageContext.url}\nTitle: ${pageContext.title}\n\nContent:\n${pageContext.text}`;
    if (pageContext.isTruncated) {
      contextStr += '\n\n[Content was truncated because it was too long]';
    }
    messages.push({ role: 'system', content: contextStr });
  }

  // Append full conversation history for multi-turn context
  messages.push(...conversationHistory);
  
  // Add the new user message
  messages.push({ role: 'user', content: text });
  
  // Track the user message in history
  conversationHistory.push({ role: 'user', content: text });

  let fullResponse = '';

  try {
    const generator = provider.chat(modelId, messages, controller.signal);
    for await (const chunk of generator) {
      if (controller.signal.aborted) break;
      fullResponse += chunk;
      emitStreamChunk(messageId, chunk, false);
    }
    // Track the AI response in history
    if (fullResponse) {
      conversationHistory.push({ role: 'assistant', content: fullResponse });
    }
    emitStreamChunk(messageId, null, true);
  } catch (err) {
    if (err.name !== 'AbortError') {
      emitStreamChunk(messageId, null, true, err.message);
    }
  } finally {
    activeGenerations.delete(messageId);
  }
}

function emitStreamChunk(messageId, chunk, done, error = null) {
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { messageId, chunk, done, error }
  }).catch(() => {
    // Port might be closed if UI is closed
  });
}
