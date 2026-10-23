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
import { resolveConfirmation, resolveModeSelection, cancelPendingAgentActions, subagentManager, setCurrentActiveContext, resetTurnSubagentCount } from './tools.js';
import {
  compactHistory,
  PRESERVED_RECENT_TURNS,
  AUTO_COMPACT_MIN_TURNS,
  AUTO_COMPACT_TOKEN_THRESHOLD,
  estimateHistoryTokens
} from '../shared/contextCompactor.js';
import { tabSessionManager } from '../shared/tabSessionManager.js';

// Setup side panel behavior to open on action click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

// Active generation controllers for cancelling
const activeGenerations = new Map();
const activeTabGenerations = new Map(); // tabId -> { messageId, controller, text }
let allSessions = [];
let currentSessionId = null;

Promise.all([
  vault.getSessions(),
  vault.getTabSessions(),
  vault.getCurrentSessionId()
]).then(([sessions, tabSessions, savedCurrentId]) => {
  tabSessionManager.loadState({ sessions, tabSessions });
  allSessions = tabSessionManager.getAllSessions();
  currentSessionId = savedCurrentId;
});

async function persistSessionState() {
  await vault.saveSessions(tabSessionManager.getAllSessions());
  await vault.saveTabSessions(tabSessionManager.getTabSessions());
  if (currentSessionId) {
    await vault.saveCurrentSessionId(currentSessionId);
  }
}

async function getCurrentHistory(tabId = null) {
  const session = tabId
    ? tabSessionManager.getSessionForTab(tabId)
    : (currentSessionId ? tabSessionManager.getAllSessions().find(s => s.id === currentSessionId) : null);
  return session ? session.history : [];
}

// Clean up tab session mappings when a tab is closed in Chrome
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((closedTabId) => {
    tabSessionManager.removeTab(closedTabId);
    activeTabGenerations.delete(closedTabId);
    vault.saveTabSessions(tabSessionManager.getTabSessions());
  });
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
    const tabId = request.payload?.tabId;
    if (tabId) {
      tabSessionManager.clearTabSession(tabId);
      vault.saveTabSessions(tabSessionManager.getTabSessions());
    }
    currentSessionId = null;
    subagentManager.clearSubagents();
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'GET_SESSIONS') {
    const tabId = request.payload?.tabId;
    const tabSession = tabId ? tabSessionManager.getSessionForTab(tabId) : null;
    sendResponse({
      sessions: tabSessionManager.getAllSessions(),
      currentSessionId: tabSession ? tabSession.id : currentSessionId
    });
    return true;
  }

  if (request.type === 'SWITCH_SESSION') {
    const { sessionId, tabId } = request.payload || {};
    const session = tabSessionManager.getAllSessions().find(s => s.id === sessionId);
    if (session) {
      currentSessionId = sessionId;
      if (tabId) {
        tabSessionManager.setTabSession(tabId, sessionId);
      }
      persistSessionState();
    }
    sendResponse({
      ok: true,
      history: session ? session.history : [],
      compactedCount: session?.compactedCount,
      savedTokens: session?.savedTokens
    });
    return true;
  }

  if (request.type === 'DELETE_SESSION') {
    const { sessionId } = request.payload || {};
    tabSessionManager.deleteSession(sessionId);
    if (currentSessionId === sessionId) {
      currentSessionId = null;
    }
    persistSessionState();
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'GET_TAB_SESSION') {
    const { tabId } = request.payload || {};
    const session = tabId ? tabSessionManager.getSessionForTab(tabId) : null;
    const activeGen = tabId ? activeTabGenerations.get(tabId) : null;

    sendResponse({
      tabId,
      sessionId: session ? session.id : null,
      history: session ? session.history : [],
      compactedSummary: session?.compactedSummary,
      compactedCount: session?.compactedCount,
      savedTokens: session?.savedTokens,
      isGenerating: !!activeGen,
      generatingMessageId: activeGen?.messageId || null,
      generatingText: activeGen?.text || '',
      generatingUsage: activeGen?.usage || null
    });
    return true;
  }

  if (request.type === 'GET_HISTORY') {
    const tabId = request.payload?.tabId;
    const session = tabId
      ? tabSessionManager.getSessionForTab(tabId)
      : (currentSessionId ? tabSessionManager.getAllSessions().find(s => s.id === currentSessionId) : null);
    sendResponse({
      history: session ? session.history : [],
      compactedSummary: session?.compactedSummary,
      compactedCount: session?.compactedCount,
      savedTokens: session?.savedTokens,
      sessionId: session ? session.id : null
    });
    return true;
  }

  if (request.type === 'COMPACT_CONTEXT') {
    handleCompactContext(request.payload).then(res => sendResponse(res));
    return true;
  }

  if (request.type === 'STOP_GENERATION') {
    const { messageId, tabId } = request.payload || {};
    if (messageId && activeGenerations.has(messageId)) {
      activeGenerations.get(messageId).abort();
      activeGenerations.delete(messageId);
    } else {
      for (const [id, ctrl] of activeGenerations.entries()) {
        try { ctrl.abort(); } catch (_) {}
      }
      activeGenerations.clear();
    }
    if (tabId) {
      activeTabGenerations.delete(tabId);
    } else {
      activeTabGenerations.clear();
    }
    // Force terminate all active subagents immediately
    subagentManager.terminateAll();
    // Cancel any pending user confirmations
    cancelPendingAgentActions();

    if (messageId) {
      emitStreamChunk(messageId, '\n\n**[Aborted by user]**', true);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'TERMINATE_ALL_SUBAGENTS') {
    const count = subagentManager.terminateAll();
    sendResponse({ ok: true, terminatedCount: count });
    return true;
  }

  if (request.type === 'EXPORT_CHAT') {
    const tabId = request.payload?.tabId;
    getCurrentHistory(tabId).then(history => sendResponse({ ok: true, messages: history }));
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
  const sessionId = payload.tabId ? tabSessionManager.getSessionForTab(payload.tabId)?.id : currentSessionId;
  if (!sessionId) return { ok: false, error: 'No active session' };
  const session = tabSessionManager.getAllSessions().find(s => s.id === sessionId);
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
  const controller = new AbortController();
  activeGenerations.set(messageId, controller);

  setCurrentActiveContext({
    provider,
    modelId,
    attachments: attachments || [],
    pageContext,
    signal: controller.signal
  });

  // Freeze the active tab at the moment the user sends the message.
  // Agent actions will always target this tab, even if the user switches tabs.
  let resolvedTabId = payload.tabId || frozenTabId;
  if (!resolvedTabId) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && !tab.url?.startsWith('chrome://') && !tab.url?.startsWith('chrome-extension://')) {
        resolvedTabId = tab.id;
      }
    } catch (_) {}
  }

  // Get or create session for this tabId (clean tabs create session ONLY upon user input)
  const session = tabSessionManager.getOrCreateSessionForTab(resolvedTabId, text);
  currentSessionId = session.id;
  await persistSessionState();

  chrome.runtime.sendMessage({
    type: 'UPDATE_SESSIONS',
    payload: {
      sessions: tabSessionManager.getAllSessions(),
      currentSessionId: session.id,
      tabId: resolvedTabId
    }
  }).catch(() => {});

  if (resolvedTabId) {
    activeTabGenerations.set(resolvedTabId, { messageId, controller, text: '' });
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

  const rawHistory = session.history || [];

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
      session.compactedSummary = compaction.summary;
      session.compactedCount = compaction.compactedCount;
      session.savedTokens = compaction.savedTokens;
      await persistSessionState();

      messages.push({ role: 'system', content: compaction.summary });
      const uncompacted = rawHistory.slice(compaction.compactedCount);
      messages.push(...uncompacted.map(h => ({ role: h.role, content: h.text })));

      chrome.runtime.sendMessage({
        type: 'CONTEXT_COMPACTED',
        payload: {
          compactedCount: compaction.compactedCount,
          savedTokens: compaction.savedTokens,
          summary: compaction.summary,
          tabId: resolvedTabId
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
  
  // Track the user message in this tab's session history
  session.history.push({ role: 'user', text, attachments: attachments || [] });
  await persistSessionState();

  let fullResponse = '';
  let lastUsage = null;

  try {
    const generator = provider.chat(modelId, messages, controller.signal, resolvedTabId);
    for await (const chunk of generator) {
      if (controller.signal.aborted) break;
      let textChunk = '';
      let usageChunk = null;
      if (typeof chunk === 'object' && chunk !== null) {
        textChunk = chunk.text || '';
        usageChunk = chunk.usage || null;
      } else {
        textChunk = chunk || '';
      }
      if (usageChunk) {
        lastUsage = usageChunk;
      }
      fullResponse += textChunk;
      const activeGen = resolvedTabId ? activeTabGenerations.get(resolvedTabId) : null;
      if (activeGen) {
        activeGen.text = fullResponse;
        if (lastUsage) {
          activeGen.usage = lastUsage;
        }
      }
      emitStreamChunk(messageId, textChunk, false, null, usageChunk);
    }
    // Track the AI response in history
    if (fullResponse) {
      session.history.push({ role: 'assistant', text: fullResponse, usage: lastUsage });
      await persistSessionState();
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      emitStreamChunk(messageId, null, true, err.message, lastUsage);
    }
  } finally {
    if (controller.signal.aborted) {
      emitStreamChunk(messageId, '\n\n**[Aborted by user]**', true, null, lastUsage);
    } else {
      emitStreamChunk(messageId, null, true, null, lastUsage);
    }
    activeGenerations.delete(messageId);
    if (resolvedTabId) {
      activeTabGenerations.delete(resolvedTabId);
    }
  }
}

function emitStreamChunk(messageId, chunk, done, error = null, usage = null) {
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { messageId, chunk, done, error, usage }
  }).catch(() => {
    // Port might be closed if UI is closed
  });
}
