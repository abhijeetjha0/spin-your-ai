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
import { resolveConfirmation, resolveModeSelection, subagentManager, setCurrentActiveContext, resetTurnSubagentCount } from './tools.js';
import {
  compactHistory,
  PRESERVED_RECENT_TURNS,
  AUTO_COMPACT_MIN_TURNS,
  AUTO_COMPACT_TOKEN_THRESHOLD,
  estimateHistoryTokens
} from '../shared/contextCompactor.js';

// Setup side panel behavior to open on action click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

// Active generation controllers for cancelling
const activeGenerations = new Map();
let allSessions = [];
let currentSessionId = null;

vault.getSessions().then(s => allSessions = s);
vault.getCurrentSessionId().then(id => currentSessionId = id);

async function getCurrentHistory() {
  if (!currentSessionId) return [];
  const s = allSessions.find(s => s.id === currentSessionId);
  return s ? s.history : [];
}

async function saveSessions() {
  await vault.saveSessions(allSessions);
  await vault.saveCurrentSessionId(currentSessionId);
}

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
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
    currentSessionId = null;
    saveSessions();
    subagentManager.clearSubagents();
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'GET_SESSIONS') {
    sendResponse({ sessions: allSessions, currentSessionId });
    return true;
  }

  if (request.type === 'SWITCH_SESSION') {
    const { sessionId } = request.payload;
    if (allSessions.find(s => s.id === sessionId)) {
      currentSessionId = sessionId;
      saveSessions();
    }
    getCurrentHistory().then(history => sendResponse({ ok: true, history }));
    return true;
  }

  if (request.type === 'DELETE_SESSION') {
    const { sessionId } = request.payload;
    allSessions = allSessions.filter(s => s.id !== sessionId);
    if (currentSessionId === sessionId) {
      currentSessionId = allSessions.length > 0 ? allSessions[0].id : null;
    }
    saveSessions();
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'GET_HISTORY') {
    getCurrentHistory().then(history => {
      const s = allSessions.find(sess => sess.id === currentSessionId);
      sendResponse({
        history,
        compactedSummary: s?.compactedSummary,
        compactedCount: s?.compactedCount,
        savedTokens: s?.savedTokens
      });
    });
    return true;
  }

  if (request.type === 'COMPACT_CONTEXT') {
    handleCompactContext(request.payload).then(res => sendResponse(res));
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

  if (request.type === 'EXPORT_CHAT') {
    getCurrentHistory().then(history => sendResponse({ ok: true, messages: history }));
    return true;
  }

  if (request.type === 'AGENT_ACTION_RESPONSE') {
    // User approved or denied a destructive agent action from the sidepanel
    const { requestId, approved } = request.payload;
    resolveConfirmation(requestId, approved);
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'SET_AGENT_PERMISSION_MODE') {
    const { mode, remember, requestId } = request.payload;
    vault.setAgentPermissionMode(mode, remember !== false).then(() => {
      if (requestId) {
        resolveModeSelection(requestId, mode);
      }
      sendResponse({ ok: true, mode });
    });
    return true;
  }

  if (request.type === 'GET_AGENT_PERMISSION_MODE') {
    vault.getAgentPermissionMode().then(res => sendResponse(res));
    return true;
  }

  if (request.type === 'GET_SUBAGENTS') {
    sendResponse({
      activeCount: subagentManager.getActiveCount(),
      subagents: subagentManager.getSubagents()
    });
    return true;
  }

  if (request.type === 'TERMINATE_SUBAGENT') {
    const { subagentId } = request.payload || {};
    const success = subagentManager.terminateSubagent(subagentId);
    sendResponse({ ok: success });
    return true;
  }

  if (request.type === 'CLEAR_SUBAGENTS') {
    subagentManager.clearSubagents();
    sendResponse({ ok: true });
    return true;
  }
});

async function handleCompactContext(payload = {}) {
  if (!currentSessionId) return { ok: false, error: 'No active session' };
  const session = allSessions.find(s => s.id === currentSessionId);
  if (!session || !session.history || session.history.length <= PRESERVED_RECENT_TURNS) {
    return { ok: false, error: `Need at least ${PRESERVED_RECENT_TURNS + 1} messages to compact context.` };
  }

  const provider = payload.providerId ? await getProviderInstance(payload.providerId) : null;
  const result = await compactHistory(session.history, provider, payload.modelId);

  if (result.compactedCount > 0) {
    session.compactedSummary = result.summary;
    session.compactedCount = result.compactedCount;
    session.savedTokens = result.savedTokens;
    await saveSessions();

    return {
      ok: true,
      compactedCount: result.compactedCount,
      savedTokens: result.savedTokens,
      summary: result.summary
    };
  }
  return { ok: false, error: 'Compaction produced no summary' };
}

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
  const { messageId, providerId, modelId, text, pageContext, attachments, frozenTabId } = payload;
  const provider = await getProviderInstance(providerId);
  if (!provider) {
    emitStreamChunk(messageId, null, true, 'Provider not configured.');
    return;
  }

  resetTurnSubagentCount();
  setCurrentActiveContext({
    provider,
    modelId,
    attachments: attachments || [],
    pageContext
  });

  const controller = new AbortController();
  activeGenerations.set(messageId, controller);

  // Freeze the active tab at the moment the user sends the message.
  // Agent actions will always target this tab, even if the user switches tabs.
  let resolvedTabId = frozenTabId;
  if (!resolvedTabId) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && !tab.url?.startsWith('chrome://') && !tab.url?.startsWith('chrome-extension://')) {
        resolvedTabId = tab.id;
      }
    } catch (_) {}
  }
  
  // Build messages array: system context + full conversation history + new user message
  const messages = [];

  const baseSystemDirective = 'You are Spin Your AI, an autonomous multimodal AI assistant. When you need to execute multiple independent actions (such as inspecting page elements, invoking MCP tools, or spawning sub-agents), invoke them together in parallel within a single turn rather than executing them one at a time.';
  messages.push({ role: 'system', content: baseSystemDirective });
  
  if (pageContext) {
    let contextStr = `Here is the context of the webpage the user is currently viewing:\nURL: ${pageContext.url}\nTitle: ${pageContext.title}\n\nContent:\n${pageContext.text}`;
    if (pageContext.isTruncated) {
      contextStr += '\n\n[Content was truncated because it was too long]';
    }
    messages.push({ role: 'system', content: contextStr });
  }

  const rawHistory = await getCurrentHistory();
  const session = allSessions.find(s => s.id === currentSessionId);

  // Context Compaction: check if session has compacted summary or threshold exceeded
  if (session?.compactedSummary && session.compactedCount) {
    messages.push({ role: 'system', content: session.compactedSummary });
    const uncompacted = rawHistory.slice(session.compactedCount);
    messages.push(...uncompacted.map(h => ({ role: h.role, content: h.text })));
  } else if (
    rawHistory.length >= AUTO_COMPACT_MIN_TURNS ||
    estimateHistoryTokens(rawHistory) >= AUTO_COMPACT_TOKEN_THRESHOLD
  ) {
    const compaction = await compactHistory(rawHistory);
    if (compaction.compactedCount > 0) {
      if (session) {
        session.compactedSummary = compaction.summary;
        session.compactedCount = compaction.compactedCount;
        session.savedTokens = compaction.savedTokens;
        await saveSessions();
      }
      messages.push({ role: 'system', content: compaction.summary });
      const uncompacted = rawHistory.slice(compaction.compactedCount);
      messages.push(...uncompacted.map(h => ({ role: h.role, content: h.text })));

      chrome.runtime.sendMessage({
        type: 'CONTEXT_COMPACTED',
        payload: {
          compactedCount: compaction.compactedCount,
          savedTokens: compaction.savedTokens,
          summary: compaction.summary
        }
      }).catch(() => {});
    } else {
      messages.push(...rawHistory.map(h => ({ role: h.role, content: h.text })));
    }
  } else {
    messages.push(...rawHistory.map(h => ({ role: h.role, content: h.text })));
  }
  
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
  if (!currentSessionId) {
    currentSessionId = Date.now().toString();
    const title = text.trim();
    allSessions.push({
      id: currentSessionId,
      title: title.length > 25 ? title.substring(0, 25) + '...' : title,
      createdAt: Date.now(),
      history: []
    });
    chrome.runtime.sendMessage({ type: 'UPDATE_SESSIONS', payload: { sessions: allSessions, currentSessionId } }).catch(() => {});
  }

  const activeHistory = await getCurrentHistory();
  activeHistory.push({ role: 'user', text, attachments: attachments || [] });
  saveSessions();

  let fullResponse = '';

  try {
    const generator = provider.chat(modelId, messages, controller.signal, resolvedTabId);
    for await (const chunk of generator) {
      if (controller.signal.aborted) break;
      fullResponse += chunk;
      emitStreamChunk(messageId, chunk, false, null, null);
    }
    // Track the AI response in history
    if (fullResponse) {
      const activeHistory = await getCurrentHistory();
      activeHistory.push({ role: 'assistant', text: fullResponse });
      saveSessions();
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      emitStreamChunk(messageId, null, true, err.message);
    }
  } finally {
    if (controller.signal.aborted) {
      emitStreamChunk(messageId, '\n\n**[Aborted by user]**', true);
    } else {
      emitStreamChunk(messageId, null, true);
    }
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
