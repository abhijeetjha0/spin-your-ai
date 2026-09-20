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
import { HuggingFaceProvider } from './providers/huggingface.js';

// Setup side panel behavior to open on action click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

// Active generation controllers for cancelling
const activeGenerations = new Map();
let conversationHistory = [];

async function getProviderInstance(providerId, passedConfig = null) {
  const config = passedConfig || await vault.getConfig(providerId);
  if (config && config.enabled === false) return null;
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
    case 'huggingface': return new HuggingFaceProvider(config);
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
    const { providerId, config } = request.payload;
    
    if (providerId === 'mcp') {
      handleMCPTest(config).then(sendResponse);
      return true;
    }

    getProviderInstance(providerId, config)
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

async function handleMCPTest(config) {
  try {
    if (!config.configJson) return { ok: false, error: 'Config is empty', serverStatuses: {} };
    const parsed = JSON.parse(config.configJson);
    if (!parsed || !parsed.mcpServers) return { ok: false, error: 'Missing mcpServers object in JSON', serverStatuses: {} };
    
    const servers = Object.entries(parsed.mcpServers);
    if (servers.length === 0) return { ok: false, error: 'No MCP servers defined', serverStatuses: {} };

    const serverStatuses = {};
    let successCount = 0;

    for (const [key, s] of servers) {
      const url = s.url || s.serverUrl;
      if (url && (s.command === 'http' || s.type === 'http' || !s.command)) {
        const headers = { 
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        };
        if (s.env) Object.assign(headers, s.env);
        if (s.headers) Object.assign(headers, s.headers);
        
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
          });
          if (res.ok) {
            successCount++;
            serverStatuses[key] = { status: 'connected' };
          } else {
            const errText = await res.text();
            serverStatuses[key] = { status: 'error', error: `HTTP ${res.status}: ${errText}` };
          }
        } catch (e) {
          serverStatuses[key] = { status: 'error', error: e.message };
        }
      } else {
        serverStatuses[key] = { status: 'error', error: 'Invalid HTTP endpoint configuration' };
      }
    }
    
    const ok = successCount > 0;
    return { ok, error: ok ? undefined : 'Some servers failed to connect', serverStatuses };
  } catch (err) {
    return { ok: false, error: 'Invalid JSON config: ' + err.message, serverStatuses: {} };
  }
}

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
    'huggingface': 'Hugging Face Inference'
  };
  
  // We probe all of them in parallel
  const promises = Object.keys(providerNames).map(async (id) => {
    const config = allConfigs[id] || {};
    const isAutoDiscover = ['ollama', 'opencode', 'openclaw', 'hermes'].includes(id);
    
    // If explicitly disabled by toggle, skip it
    if (config.enabled === false) return;

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
  const { messageId, providerId, modelId, text, pageContext, attachments } = payload;
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
  
  // Build the new user message with attachments
  const userMessage = { role: 'user' };
  
  if (attachments && attachments.length > 0) {
    // Multimodal content: array of parts
    const parts = [];
    for (const att of attachments) {
      parts.push({
        type: att.type.startsWith('image/') ? 'image' : 'file',
        mimeType: att.type,
        data: att.data,
        name: att.name
      });
    }
    parts.push({ type: 'text', text });
    userMessage.content = parts;
  } else {
    userMessage.content = text;
  }
  
  messages.push(userMessage);
  
  // Track the user message in history (text only for history)
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
