import { renderMarkdown } from '../shared/markdown.js';
import {
  filterSlashCommands,
  extractSlashQuery,
  deduplicateSlashCommands
} from '../shared/slashCommands.js';

const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const optionsBtn = document.getElementById('options-btn');
const exportChatBtn = document.getElementById('export-chat-btn');
const compactBtn = document.getElementById('compact-btn');
const reloadModelsBtn = document.getElementById('reload-models-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const contextToggle = document.getElementById('include-page-context');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const attachmentPreview = document.getElementById('attachment-preview');

// Slash commands elements & state
const slashPopover = document.getElementById('slash-commands-popover');
const slashList = document.getElementById('slash-commands-list');
let activeSlashIndex = 0;
let currentMatchingSlashCommands = [];
let currentSlashQueryMeta = null;

// Agent confirmation banner
const agentConfirmBanner = document.getElementById('agent-confirm-banner');
const agentConfirmToolName = document.getElementById('agent-confirm-tool-name');
const agentConfirmArgs = document.getElementById('agent-confirm-args');
const agentAllowBtn = document.getElementById('agent-allow-btn');
const agentDenyBtn = document.getElementById('agent-deny-btn');
let pendingAgentRequestId = null;

// Sub-agents monitor elements & state
const subagentsStatusBtn = document.getElementById('subagents-status-btn');
const subagentsCountText = document.getElementById('subagents-count-text');
const subagentsModal = document.getElementById('subagents-modal');
const closeSubagentsBtn = document.getElementById('close-subagents-btn');
const clearSubagentsBtn = document.getElementById('clear-subagents-btn');
const subagentsListContainer = document.getElementById('subagents-list-container');
let currentSubagents = [];
let activeSubagentsCount = 0;

// Agent permission mode modal & controls
const agentPermissionBtn = document.getElementById('agent-permission-btn');
const agentModeModal = document.getElementById('agent-mode-modal');
const closeAgentModeBtn = document.getElementById('close-agent-mode-btn');
const saveAgentModeBtn = document.getElementById('save-agent-mode-btn');
const agentBannerChangeModeBtn = document.getElementById('agent-banner-change-mode-btn');
const agentBannerModeLabel = document.getElementById('agent-banner-mode-label');
const rememberAgentMode = document.getElementById('remember-agent-mode');
let currentAgentMode = 'allow_some';
let pendingModeRequestId = null;

// Combobox elements
const modelCombobox = document.getElementById('model-combobox');
const modelTrigger = document.getElementById('model-trigger');
const modelDropdown = document.getElementById('model-dropdown');
const modelSearch = document.getElementById('model-search');
const modelList = document.getElementById('model-list');
const modelDisplayName = document.getElementById('model-display-name');

let isGenerating = false;
let currentMessageId = null;
let pendingAttachments = [];

const sessionsBtn = document.getElementById('sessions-btn');
const sessionsModal = document.getElementById('sessions-modal');
const closeSessionsBtn = document.getElementById('close-sessions-btn');
const sessionsList = document.getElementById('sessions-list');

let allSessions = [];
let currentSessionId = null;
let currentTabId = null;

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) return tab;
    const [lastTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return lastTab || null;
  } catch (e) {
    return null;
  }
}

function removeCompactedBadge() {
  const existing = document.getElementById('compact-badge');
  if (existing) {
    existing.remove();
  }
}

function clearChatUI() {
  chatContainer.innerHTML = '<div class="message system-msg">Welcome to Spin Your AI! Select a model and start chatting.</div>';
  removeCompactedBadge();
  currentSubagents = [];
  activeSubagentsCount = 0;
  updateSubagentsUI(0, []);
  if (isGenerating) {
    finishGeneration();
  }
  clearAttachments();
}

async function syncTabSession(tabId) {
  if (!tabId) return;
  currentTabId = tabId;

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'GET_TAB_SESSION',
      payload: { tabId }
    });

    if (!res) return;

    currentSessionId = res.sessionId; // null if clean tab

    if (res.sessionId && res.history && res.history.length > 0) {
      renderHistory(res.history);
      if (res.compactedCount) {
        renderCompactedBadge(res.compactedCount, res.savedTokens, true);
      } else {
        removeCompactedBadge();
      }

      if (res.isGenerating) {
        isGenerating = true;
        currentMessageId = res.generatingMessageId;
        currentAiText = res.generatingText || '';
        chatInput.disabled = true;
        attachBtn.disabled = true;
        chatInput.placeholder = "Processing...";
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');

        let aiMsgEl = document.getElementById(`msg-${currentMessageId}`);
        if (!aiMsgEl) {
          aiMsgEl = appendMessage('AI', '', 'ai-msg', currentMessageId);
        }
        if (currentAiText) {
          aiMsgEl.innerHTML = renderMarkdown(currentAiText, {
            subagents: currentSubagents,
            activeCount: activeSubagentsCount
          });
        } else {
          aiMsgEl.innerHTML = '<span class="typing-indicator">Establishing uplink...</span>';
        }
      } else if (isGenerating) {
        finishGeneration();
      }
    } else {
      // Clean tab: nothing entered or worked on yet!
      clearChatUI();
    }
  } catch (e) {
    // Graceful fallback
  }
}

// Combobox state
let allModels = [];         // [{providerId, providerName, modelId, modelName}]
let selectedModelValue = null; // 'providerId::modelId'

// Initialize
async function init() {
  await loadProviders();
  
  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  const helpBtn = document.getElementById('help-btn');
  helpBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('help/index.html') });
  });

  const exportChatBtn = document.getElementById('export-chat-btn');
  exportChatBtn.addEventListener('click', exportChat);

  compactBtn?.addEventListener('click', async () => {
    if (isGenerating) return;
    const [providerId, modelId] = (selectedModelValue || '').split('::');
    const res = await chrome.runtime.sendMessage({
      type: 'COMPACT_CONTEXT',
      payload: { providerId, modelId, tabId: currentTabId }
    });
    if (res && res.ok) {
      renderCompactedBadge(res.compactedCount, res.savedTokens);
    } else if (res && res.error) {
      showToast(res.error);
    }
  });

  const reloadModelsBtn = document.getElementById('reload-models-btn');
  reloadModelsBtn.addEventListener('click', () => {
    loadProviders();
    const icon = reloadModelsBtn.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.style.animation = 'spin 1s linear infinite';
      setTimeout(() => icon.style.animation = '', 1000);
    }
  });

  // Agent permission mode handlers
  agentPermissionBtn?.addEventListener('click', () => showAgentModeModal());
  closeAgentModeBtn?.addEventListener('click', () => hideAgentModeModal());
  saveAgentModeBtn?.addEventListener('click', saveAgentPermissionMode);
  agentBannerChangeModeBtn?.addEventListener('click', () => showAgentModeModal());

  // Fetch initial agent permission mode
  chrome.runtime.sendMessage({ type: 'GET_AGENT_PERMISSION_MODE' }).then(res => {
    if (res && res.mode) {
      updateModeLabels(res.mode);
    }
  });

  // Delegated event handling for interactive Subagent UI inside Mid-Process Analysis
  chatContainer?.addEventListener('click', async (e) => {
    // 1. Toggle context viewer
    const toggleBtn = e.target.closest('.subagent-context-toggle');
    if (toggleBtn) {
      const card = toggleBtn.closest('.subagent-card');
      const viewer = card?.querySelector('.subagent-context-viewer');
      if (viewer) {
        const isHidden = viewer.classList.toggle('hidden');
        toggleBtn.textContent = isHidden ? 'View Context' : 'Hide Context';
      }
      return;
    }

    // 2. Terminate single subagent
    const termBtn = e.target.closest('.subagent-terminate-btn');
    if (termBtn) {
      const subagentId = termBtn.dataset.subagentId;
      if (subagentId) {
        termBtn.disabled = true;
        termBtn.textContent = 'Stopping...';
        await chrome.runtime.sendMessage({
          type: 'TERMINATE_SUBAGENT',
          payload: { subagentId }
        });
        const res = await chrome.runtime.sendMessage({ type: 'GET_SUBAGENTS' });
        if (res) updateSubagentsUI(res.activeCount, res.subagents);
      }
      return;
    }

    // 3. Reset inactive subagents
    const resetBtn = e.target.closest('.subagent-reset-btn');
    if (resetBtn) {
      resetBtn.disabled = true;
      await chrome.runtime.sendMessage({ type: 'CLEAR_SUBAGENTS' });
      const res = await chrome.runtime.sendMessage({ type: 'GET_SUBAGENTS' });
      if (res) updateSubagentsUI(res.activeCount, res.subagents);
      return;
    }

    // 4. Force kill all subagents
    const killAllBtn = e.target.closest('.subagents-kill-all-btn');
    if (killAllBtn) {
      killAllBtn.disabled = true;
      killAllBtn.textContent = 'Stopping all...';
      await chrome.runtime.sendMessage({ type: 'TERMINATE_ALL_SUBAGENTS' });
      const res = await chrome.runtime.sendMessage({ type: 'GET_SUBAGENTS' });
      if (res) updateSubagentsUI(res.activeCount, res.subagents);
      return;
    }
  });

  // Subagents handlers
  const terminateAllSubagentsBtn = document.getElementById('terminate-all-subagents-btn');
  terminateAllSubagentsBtn?.addEventListener('click', async () => {
    terminateAllSubagentsBtn.disabled = true;
    await chrome.runtime.sendMessage({ type: 'TERMINATE_ALL_SUBAGENTS' });
    const res = await chrome.runtime.sendMessage({ type: 'GET_SUBAGENTS' });
    if (res) updateSubagentsUI(res.activeCount, res.subagents);
    terminateAllSubagentsBtn.disabled = false;
  });

  subagentsStatusBtn?.addEventListener('click', () => {
    subagentsModal?.classList.remove('hidden');
    renderSubagentsList();
  });
  closeSubagentsBtn?.addEventListener('click', () => {
    subagentsModal?.classList.add('hidden');
  });
  clearSubagentsBtn?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_SUBAGENTS' });
    const res = await chrome.runtime.sendMessage({ type: 'GET_SUBAGENTS' });
    if (res) updateSubagentsUI(res.activeCount, res.subagents);
  });

  // Fetch initial subagents state
  chrome.runtime.sendMessage({ type: 'GET_SUBAGENTS' }).then(res => {
    if (res) {
      updateSubagentsUI(res.activeCount, res.subagents);
    }
  }).catch(() => {});

  newChatBtn.addEventListener('click', clearChat);

  // Slash commands popover rendering & handling
  function renderSlashPopover(commands) {
    if (!slashList || !slashPopover) return;
    const deduped = deduplicateSlashCommands(commands);
    currentMatchingSlashCommands = deduped;
    slashList.innerHTML = '';

    if (deduped.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'slash-command-item';
      emptyItem.style.color = 'var(--text-muted, #94a3b8)';
      emptyItem.style.cursor = 'default';
      emptyItem.style.padding = '8px 10px';
      emptyItem.textContent = 'No matching commands';
      slashList.appendChild(emptyItem);
      slashPopover.classList.remove('hidden');
      return;
    }

    if (activeSlashIndex >= deduped.length) {
      activeSlashIndex = 0;
    }

    deduped.forEach((cmd, idx) => {
      const item = document.createElement('div');
      item.className = `slash-command-item ${idx === activeSlashIndex ? 'active' : ''}`;
      item.dataset.index = idx;

      const catClass = cmd.category === 'Skill' ? 'cat-skill' : (cmd.category === 'Action' ? 'cat-action' : '');

      item.innerHTML = `
        <span class="material-symbols-outlined slash-command-icon">${cmd.icon || 'terminal'}</span>
        <div class="slash-command-info">
          <div class="slash-command-title">
            <span>${cmd.command}</span>
            <span class="slash-command-badge ${catClass}">${cmd.category}</span>
          </div>
          <div class="slash-command-desc">${cmd.description || ''}</div>
        </div>
      `;

      item.addEventListener('mouseenter', () => {
        activeSlashIndex = idx;
        updateSlashSelection();
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        executeSlashCommand(cmd);
      });

      slashList.appendChild(item);
    });

    slashPopover.classList.remove('hidden');
    scrollSlashActiveIntoView();
  }

  function updateSlashSelection() {
    if (!slashList) return;
    const items = slashList.querySelectorAll('.slash-command-item');
    items.forEach((item, idx) => {
      if (idx === activeSlashIndex) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    scrollSlashActiveIntoView();
  }

  function scrollSlashActiveIntoView() {
    if (!slashList) return;
    const activeItem = slashList.children[activeSlashIndex];
    if (activeItem && activeItem.scrollIntoView) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  function hideSlashPopover() {
    if (slashPopover) {
      slashPopover.classList.add('hidden');
    }
    currentMatchingSlashCommands = [];
    currentSlashQueryMeta = null;
    activeSlashIndex = 0;
  }

  function executeSlashCommand(cmd) {
    if (!cmd) return;

    if (cmd.type === 'action') {
      if (currentSlashQueryMeta && currentSlashQueryMeta.isMatch) {
        const val = chatInput.value;
        const prefix = val.slice(0, currentSlashQueryMeta.slashIndex);
        const suffix = val.slice(currentSlashQueryMeta.endIndex);
        chatInput.value = (prefix + suffix).trim();
      } else {
        chatInput.value = '';
      }
      chatInput.style.height = 'auto';
      hideSlashPopover();

      if (cmd.actionId === 'history') {
        sessionsBtn?.click();
      } else if (cmd.actionId === 'compact') {
        compactBtn?.click();
      } else if (cmd.actionId === 'refresh') {
        reloadModelsBtn?.click();
        showToast('Refreshed models');
      } else if (cmd.actionId === 'clear') {
        clearChat();
        showToast('Chat cleared');
      } else if (cmd.actionId === 'help') {
        document.getElementById('help-btn')?.click();
      } else if (cmd.actionId === 'togglePage') {
        if (contextToggle) {
          contextToggle.checked = !contextToggle.checked;
          showToast(contextToggle.checked ? 'Page context included' : 'Page context excluded');
        }
      }
      chatInput.focus();
      return;
    }

    const templateToInsert = cmd.template || `${cmd.command} `;
    if (currentSlashQueryMeta && currentSlashQueryMeta.isMatch) {
      const val = chatInput.value;
      const prefix = val.slice(0, currentSlashQueryMeta.slashIndex);
      const suffix = val.slice(currentSlashQueryMeta.endIndex);
      chatInput.value = prefix + templateToInsert + suffix;
      const newCursorPos = (prefix + templateToInsert).length;
      chatInput.setSelectionRange(newCursorPos, newCursorPos);
    } else {
      chatInput.value = templateToInsert;
    }

    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
    hideSlashPopover();
    chatInput.focus();
  }

  chatInput.addEventListener('keydown', (e) => {
    if (slashPopover && !slashPopover.classList.contains('hidden') && currentMatchingSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSlashIndex = (activeSlashIndex + 1) % currentMatchingSlashCommands.length;
        updateSlashSelection();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSlashIndex = (activeSlashIndex - 1 + currentMatchingSlashCommands.length) % currentMatchingSlashCommands.length;
        updateSlashSelection();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        executeSlashCommand(currentMatchingSlashCommands[activeSlashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideSlashPopover();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';

    const cursorPos = chatInput.selectionStart;
    const queryMeta = extractSlashQuery(chatInput.value, cursorPos);
    if (queryMeta.isMatch) {
      currentSlashQueryMeta = queryMeta;
      const filtered = filterSlashCommands(queryMeta.query);
      activeSlashIndex = 0;
      renderSlashPopover(filtered);
    } else {
      hideSlashPopover();
    }
  });

  document.addEventListener('click', (e) => {
    if (slashPopover && !slashPopover.contains(e.target) && e.target !== chatInput) {
      hideSlashPopover();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  // Attach file button
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  
  stopBtn.addEventListener('click', () => {
    // FORCE KILL: immediately stop generation in UI and notify background
    if (isGenerating || currentMessageId) {
      const msgIdToStop = currentMessageId;

      // Notify background to abort LLM requests and force-terminate all sub-agents
      chrome.runtime.sendMessage({ 
        type: 'STOP_GENERATION', 
        payload: { messageId: msgIdToStop, tabId: currentTabId } 
      }).catch(() => {});

      // Append [Aborted by user] if message container exists
      if (msgIdToStop) {
        const msgEl = document.getElementById(`msg-${msgIdToStop}`);
        if (msgEl) {
          if (!currentAiText) {
            msgEl.innerHTML = '';
          }
          currentAiText += '\n\n**[Aborted by user]**';
          msgEl.innerHTML = renderMarkdown(currentAiText, {
            subagents: currentSubagents,
            activeCount: 0
          });
        }
      }

      // Immediately restore UI state to allow user to continue chatting
      finishGeneration();
    }
  });

  // Setup sessions modal
  sessionsBtn.addEventListener('click', () => {
    sessionsModal.classList.remove('hidden');
    chrome.runtime.sendMessage({ 
      type: 'GET_SESSIONS',
      payload: { tabId: currentTabId }
    }).then(res => {
      if (res) {
        allSessions = res.sessions || [];
        currentSessionId = res.currentSessionId;
        renderSessionsList();
      }
    });
  });

  closeSessionsBtn.addEventListener('click', () => {
    sessionsModal.classList.add('hidden');
  });

  sessionsModal.addEventListener('click', (e) => {
    if (e.target === sessionsModal) {
      sessionsModal.classList.add('hidden');
    }
  });

  // Restore history and session by matching active tab
  const activeTab = await getActiveTab();
  if (activeTab) {
    await syncTabSession(activeTab.id);
  } else {
    clearChatUI();
  }

  // Pre-load all sessions for modal
  chrome.runtime.sendMessage({ 
    type: 'GET_SESSIONS', 
    payload: { tabId: currentTabId } 
  }).then(res => {
    if (res) {
      allSessions = res.sessions || [];
      if (res.currentSessionId) {
        currentSessionId = res.currentSessionId;
      }
    }
  });

  // Listen for tab switching to reflect the active tab's session
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      if (activeInfo && activeInfo.tabId !== currentTabId) {
        await syncTabSession(activeInfo.tabId);
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.windows && chrome.windows.onFocusChanged) {
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) return;
      const tab = await getActiveTab();
      if (tab && tab.id !== currentTabId) {
        await syncTabSession(tab.id);
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onReplaced) {
    chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
      if (removedTabId === currentTabId) {
        await syncTabSession(addedTabId);
      }
    });
  }

  // Listen for active model changes, stream chunks, session updates, and agent confirmations
  chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
    if (msg.type === 'CHAT_STREAM' && msg.payload.messageId === currentMessageId) {
      handleStreamChunk(msg.payload.chunk, msg.payload.done, msg.payload.error);
    } else if (msg.type === 'PROVIDERS_UPDATED') {
      loadProviders();
    } else if (msg.type === 'CONTEXT_COMPACTED') {
      if (!msg.payload.tabId || msg.payload.tabId === currentTabId) {
        renderCompactedBadge(msg.payload.compactedCount, msg.payload.savedTokens);
      }
    } else if (msg.type === 'UPDATE_SESSIONS') {
      allSessions = msg.payload.sessions || [];
      if (!msg.payload.tabId || msg.payload.tabId === currentTabId) {
        currentSessionId = msg.payload.currentSessionId;
      }
      renderSessionsList();
    } else if (msg.type === 'AGENT_CONFIRM_ACTION') {
      showAgentConfirmBanner(msg.payload);
    } else if (msg.type === 'PROMPT_AGENT_MODE') {
      showAgentModeModal(msg.payload.requestId);
    } else if (msg.type === 'SUBAGENT_STATUS_UPDATE') {
      updateSubagentsUI(msg.payload.activeCount, msg.payload.subagents);
    }
  });
}

async function loadProviders() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_MODELS' });
  if (!res || !res.providers) return;

  allModels = [];
  for (const [providerId, data] of Object.entries(res.providers)) {
    if (data.models && data.models.length > 0) {
      const sorted = [...data.models].sort((a, b) => a.name.localeCompare(b.name));
      for (const m of sorted) {
        allModels.push({
          providerId,
          providerName: data.name || providerId,
          modelId: m.id,
          modelName: m.name,
          value: `${providerId}::${m.id}`
        });
      }
    }
  }

  // Restore active model
  const active = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_MODEL' });
  let match = null;
  if (active && active.providerId && active.modelId) {
    const val = `${active.providerId}::${active.modelId}`;
    match = allModels.find(m => m.value === val);
  }
  
  if (match) {
    selectModel(match, false);
  } else if (allModels.length > 0) {
    selectModel(allModels[0], false);
  } else {
    // No models available at all
    selectedModelValue = null;
    modelDisplayName.textContent = 'No models available';
    chrome.runtime.sendMessage({ type: 'SET_ACTIVE_MODEL', payload: { providerId: null, modelId: null } });
  }

  renderModelList('');
}

// --- Combobox logic ---

function renderModelList(query) {
  const q = query.toLowerCase();
  const filtered = allModels.filter(m =>
    m.modelName.toLowerCase().includes(q) ||
    m.providerName.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    modelList.innerHTML = '<div class="model-no-results">No models found</div>';
    return;
  }

  // Group by provider
  const groups = {};
  for (const m of filtered) {
    if (!groups[m.providerName]) groups[m.providerName] = [];
    groups[m.providerName].push(m);
  }

  let html = '';
  for (const [providerName, models] of Object.entries(groups)) {
    html += `<div class="model-group-label">${providerName}</div>`;
    for (const m of models) {
      const isSelected = m.value === selectedModelValue;
      html += `<div class="model-item${isSelected ? ' selected' : ''}" data-value="${m.value}" data-name="${m.modelName}">${m.modelName}</div>`;
    }
  }
  modelList.innerHTML = html;

  modelList.querySelectorAll('.model-item').forEach(el => {
    el.addEventListener('click', () => {
      const m = allModels.find(m => m.value === el.dataset.value);
      if (m) selectModel(m, true);
      closeDropdown();
    });
  });
}

function selectModel(m, notify) {
  selectedModelValue = m.value;
  modelDisplayName.textContent = m.modelName;
  if (notify) {
    const [providerId, ...rest] = m.value.split('::');
    const modelId = rest.join('::');
    chrome.runtime.sendMessage({ type: 'SET_ACTIVE_MODEL', payload: { providerId, modelId } });
  }
}

function openDropdown() {
  modelDropdown.classList.remove('hidden');
  modelTrigger.classList.add('open');
  modelSearch.value = '';
  renderModelList('');
  modelSearch.focus();
}

function closeDropdown() {
  modelDropdown.classList.add('hidden');
  modelTrigger.classList.remove('open');
}

modelTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  modelDropdown.classList.contains('hidden') ? openDropdown() : closeDropdown();
});

modelSearch.addEventListener('input', () => renderModelList(modelSearch.value));

modelSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDropdown();
});

document.addEventListener('click', (e) => {
  if (modelCombobox && !modelCombobox.contains(e.target)) closeDropdown();
});

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isGenerating) return;

  if (!selectedModelValue) {
    appendMessage('System', 'Please select a model first.', 'system-msg');
    return;
  }
  
  const [providerId, ...rest] = selectedModelValue.split('::');
  const modelId = rest.join('::');

  // Reset input
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Collect attachments
  const attachments = [...pendingAttachments];
  clearAttachments();

  // Build user message HTML with attachment previews
  let userMsgHtml = '';
  if (attachments.length > 0) {
    userMsgHtml += '<div class="msg-attachments">';
    for (const att of attachments) {
      if (att.type.startsWith('image/')) {
        userMsgHtml += `<img src="data:${att.type};base64,${att.data}" alt="${att.name}">`;
      } else {
        const icon = getFileIcon(att.type);
        userMsgHtml += `<span class="file-badge"><span class="material-symbols-outlined">${icon}</span> ${att.name}</span>`;
      }
    }
    userMsgHtml += '</div>';
  }
  userMsgHtml += renderMarkdown(text);

  // Add user message to UI
  const userEl = appendMessage('You', '', 'user-msg');
  userEl.innerHTML = userMsgHtml;
  
  let pageContext = null;
  if (contextToggle.checked) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) {
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
          appendMessage('System', '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;color:#ef4444">warning</span> Cannot read page context on internal Chrome pages.', 'error');
        } else {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
          if (response && response.ok) {
            pageContext = response.payload;
          } else {
            appendMessage('System', '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;color:#ef4444">warning</span> Failed to read page context. Please refresh the page and try again.', 'error');
          }
        }
      }
    } catch(e) {
      // The content script isn't running on this tab (e.g. internal page or stale tab). 
      // Handled gracefully in UI, no need to log a scary console warning.
      appendMessage('System', '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;color:#ef4444">warning</span> Could not read page context. Ensure you are on a valid webpage and refresh it.', 'error');
    }
  }

  // Create empty AI message container
  currentMessageId = Date.now().toString();
  const aiMsgEl = appendMessage('AI', '', 'ai-msg', currentMessageId);
  aiMsgEl.innerHTML = '<span class="typing-indicator">Establishing uplink...</span>';

  const THINKING_PHRASES = [
    "Bypassing mainframe...",
    "Decrypting neural pathways...",
    "Synthesizing data...",
    "Analyzing context...",
    "Compiling token stream...",
    "Querying local agents...",
    "Reticulating splines...",
    "Injecting prompt variables...",
    "Breaching firewall...",
    "Parsing quantum states...",
    "Routing via proxy node...",
    "Calculating inference vectors...",
    "Accessing knowledge graph...",
    "Simulating edge cases...",
    "Initializing cognitive core...",
    "Loading LLM weights...",
    "Ping-sweeping latent space...",
    "Optimizing heuristics...",
    "Compiling tensor operations...",
    "Synchronizing data hashes..."
  ];

  if (window.thinkingInterval) clearInterval(window.thinkingInterval);
  window.thinkingInterval = setInterval(() => {
    const indicator = aiMsgEl.querySelector('.typing-indicator');
    if (indicator) {
      indicator.textContent = THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
    } else {
      clearInterval(window.thinkingInterval);
    }
  }, 500);

  isGenerating = true;
  chatInput.disabled = true;
  attachBtn.disabled = true;
  chatInput.placeholder = "Processing...";
  sendBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');

  if (!currentTabId) {
    const tab = await getActiveTab();
    if (tab) currentTabId = tab.id;
  }

  // Send to background
  chrome.runtime.sendMessage({
    type: 'SEND_CHAT',
    payload: {
      messageId: currentMessageId,
      providerId,
      modelId,
      text,
      pageContext,
      attachments,
      tabId: currentTabId,
      frozenTabId: currentTabId
    }
  });
}

function appendMessage(_sender, text, className, id = null) {
  const div = document.createElement('div');
  div.className = `message ${className}`;
  if (id) div.id = `msg-${id}`;
  div.innerHTML = text ? renderMarkdown(text) : '';
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    chatContainer.innerHTML = '<div class="message system-msg">Welcome to Spin Your AI! Select a model and start chatting.</div>';
    return;
  }

  chatContainer.innerHTML = '';
  for (const item of history) {
    if (item.role === 'user') {
      let userMsgHtml = '';
      if (item.attachments && item.attachments.length > 0) {
        userMsgHtml += '<div class="msg-attachments">';
        for (const att of item.attachments) {
          if (att.type.startsWith('image/')) {
            userMsgHtml += `<img src="data:${att.type};base64,${att.data}" alt="${att.name}">`;
          } else {
            const icon = getFileIcon(att.type);
            userMsgHtml += `<span class="file-badge"><span class="material-symbols-outlined">${icon}</span> ${att.name}</span>`;
          }
        }
        userMsgHtml += '</div>';
      }
      userMsgHtml += renderMarkdown(item.text);
      const userEl = appendMessage('You', '', 'user-msg');
      userEl.innerHTML = userMsgHtml;
    } else if (item.role === 'assistant') {
      const aiEl = appendMessage('AI', item.text, 'ai-msg');
      aiEl.innerHTML = renderMarkdown(item.text);
    } else {
      appendMessage('System', item.text, 'system-msg');
    }
  }
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

let currentAiText = '';

function handleStreamChunk(chunk, done, error) {
  if (!isGenerating) return;
  
  const msgEl = document.getElementById(`msg-${currentMessageId}`);
  if (!msgEl) return;

  if (error) {
    msgEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;color:#ef4444">warning</span> Error: ${error}`;
    msgEl.style.color = '#ef4444';
    finishGeneration();
    return;
  }

  if (chunk) {
    if (window.thinkingInterval) {
      clearInterval(window.thinkingInterval);
      window.thinkingInterval = null;
    }
    // If it was just the typing indicator, clear it out
    if (currentAiText === '') {
        msgEl.innerHTML = '';
    }
    currentAiText += chunk;
    msgEl.innerHTML = renderMarkdown(currentAiText, {
      subagents: currentSubagents,
      activeCount: activeSubagentsCount
    });
    
    // Smart scroll: only auto-scroll if user is near the bottom
    const threshold = 150;
    const isNearBottom = chatContainer.scrollHeight - chatContainer.clientHeight - chatContainer.scrollTop < threshold;
    if (isNearBottom) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  if (done) {
    finishGeneration();
  }
}

function finishGeneration() {
  if (window.thinkingInterval) {
    clearInterval(window.thinkingInterval);
    window.thinkingInterval = null;
  }
  isGenerating = false;
  chatInput.disabled = false;
  attachBtn.disabled = false;
  chatInput.placeholder = "Ask anything... (/ for commands & skills)";
  currentMessageId = null;
  currentAiText = '';
  stopBtn.classList.add('hidden');
  sendBtn.classList.remove('hidden');
  
  // Focus input automatically after generation finishes
  setTimeout(() => chatInput.focus(), 100);
}

function clearChat() {
  clearChatUI();
  chrome.runtime.sendMessage({ 
    type: 'CLEAR_HISTORY',
    payload: { tabId: currentTabId }
  });
  chrome.runtime.sendMessage({ type: 'CLEAR_SUBAGENTS' });
  currentSessionId = null;
}

// --- File attachment handling ---

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  for (const file of files) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      pendingAttachments.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: base64
      });
      renderAttachmentPreviews();
    };
    reader.readAsDataURL(file);
  }
  // Reset file input so the same file can be re-selected
  fileInput.value = '';
}

function renderAttachmentPreviews() {
  if (pendingAttachments.length === 0) {
    attachmentPreview.classList.add('hidden');
    attachmentPreview.innerHTML = '';
    return;
  }
  attachmentPreview.classList.remove('hidden');
  attachmentPreview.innerHTML = pendingAttachments.map((att, i) => {
    const icon = getFileIcon(att.type);
    const thumb = att.type.startsWith('image/')
      ? `<img class="thumb" src="data:${att.type};base64,${att.data}" alt="${att.name}">`
      : `<span class="material-symbols-outlined">${icon}</span>`;
    return `<div class="attachment-chip">
      ${thumb}
      <span class="file-name">${att.name}</span>
      <button class="remove-attachment" data-index="${i}"><span class="material-symbols-outlined">close</span></button>
    </div>`;
  }).join('');

  // Wire remove buttons
  attachmentPreview.querySelectorAll('.remove-attachment').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      pendingAttachments.splice(idx, 1);
      renderAttachmentPreviews();
    });
  });
}

function clearAttachments() {
  pendingAttachments = [];
  attachmentPreview.classList.add('hidden');
  attachmentPreview.innerHTML = '';
}

function getFileIcon(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio_file';
  if (mimeType.startsWith('video/')) return 'video_file';
  if (mimeType === 'application/pdf') return 'picture_as_pdf';
  if (mimeType.startsWith('text/html')) return 'html';
  if (mimeType.startsWith('text/css')) return 'css';
  return 'draft';
}

async function exportChat() {
  const res = await chrome.runtime.sendMessage({ 
    type: 'EXPORT_CHAT',
    payload: { tabId: currentTabId }
  });
  if (!res || !res.ok || !res.messages || res.messages.length === 0) {
    showToast('No chat history to export.');
    return;
  }

  const exportData = {
    metadata: {
      format: 'openai_messages',
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'spin-your-ai-chrome',
      message_count: res.messages.length
    },
    messages: res.messages
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat_export_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderSessionsList() {
  if (!sessionsList) return;
  sessionsList.innerHTML = '';
  if (allSessions.length === 0) {
    sessionsList.innerHTML = '<div style="padding: 10px; color: var(--text-muted);">No sessions yet</div>';
    return;
  }
  
  // Sort by createdAt desc
  const sorted = [...allSessions].sort((a, b) => b.createdAt - a.createdAt);
  
  sorted.forEach(session => {
    const item = document.createElement('div');
    item.className = 'model-item' + (session.id === currentSessionId ? ' selected' : '');
    item.style = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; cursor: pointer;';
    
    const titleSpan = document.createElement('span');
    titleSpan.textContent = session.title || 'Chat Session';
    titleSpan.style = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;';
    
    item.appendChild(titleSpan);
    
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'material-symbols-outlined';
    deleteBtn.textContent = 'delete';
    deleteBtn.style = 'font-size: 16px; cursor: pointer; color: var(--text-muted); padding: 2px; border-radius: 4px;';
    deleteBtn.title = 'Reset Session';
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'DELETE_SESSION', payload: { sessionId: session.id } }).then(() => {
        allSessions = allSessions.filter(s => s.id !== session.id);
        if (currentSessionId === session.id) {
          currentSessionId = null;
          clearChatUI();
        }
        renderSessionsList();
      });
    });
    
    deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.color = '#ff4444');
    deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.color = 'var(--text-muted)');
    
    item.appendChild(deleteBtn);
    
    item.addEventListener('click', () => {
      chrome.runtime.sendMessage({ 
        type: 'SWITCH_SESSION', 
        payload: { sessionId: session.id, tabId: currentTabId } 
      }).then(res => {
        if (res && res.history) {
          currentSessionId = session.id;
          renderHistory(res.history);
          if (res.compactedCount) {
            renderCompactedBadge(res.compactedCount, res.savedTokens, true);
          } else {
            removeCompactedBadge();
          }
          sessionsModal.classList.add('hidden');
        }
      });
    });
    
    sessionsList.appendChild(item);
  });
}

// ── Sub-Agents UI & Monitor ────────────────────────────────────────

function updateSubagentsUI(activeCount, subagents) {
  activeSubagentsCount = activeCount || 0;
  currentSubagents = subagents || [];

  // Update Mid-Process Analysis in current or latest AI message in the middle section
  const targetMsgEl = currentMessageId 
    ? document.getElementById(`msg-${currentMessageId}`)
    : chatContainer.querySelector('.message.ai-msg:last-of-type');

  if (targetMsgEl && (currentAiText || (currentSubagents && currentSubagents.length > 0))) {
    targetMsgEl.innerHTML = renderMarkdown(currentAiText, {
      subagents: currentSubagents,
      activeCount: activeSubagentsCount
    });
  }

  if (subagentsStatusBtn && subagentsCountText) {
    if (activeSubagentsCount > 0) {
      subagentsStatusBtn.classList.remove('hidden');
      subagentsStatusBtn.classList.add('working');
      subagentsCountText.textContent = `${activeSubagentsCount} Working`;
    } else if (currentSubagents.length > 0) {
      subagentsStatusBtn.classList.remove('hidden');
      subagentsStatusBtn.classList.remove('working');
      subagentsCountText.textContent = `${currentSubagents.length} Sub-Agent${currentSubagents.length === 1 ? '' : 's'}`;
    } else {
      subagentsStatusBtn.classList.add('hidden');
      subagentsStatusBtn.classList.remove('working');
    }
  }

  if (subagentsModal && !subagentsModal.classList.contains('hidden')) {
    renderSubagentsList();
  }
}

function renderSubagentsList() {
  if (!subagentsListContainer) return;
  subagentsListContainer.innerHTML = '';

  if (currentSubagents.length === 0) {
    subagentsListContainer.innerHTML = '<div class="subagents-empty">No sub-agents currently spawned.</div>';
    return;
  }

  // Sort: working first, then most recently created
  const sorted = [...currentSubagents].sort((a, b) => {
    if (a.status === 'working' && b.status !== 'working') return -1;
    if (b.status === 'working' && a.status !== 'working') return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  for (const sa of sorted) {
    const card = document.createElement('div');
    card.className = `subagent-card ${sa.status}`;

    const header = document.createElement('div');
    header.className = 'subagent-card-header';

    const role = document.createElement('span');
    role.className = 'subagent-role';
    role.textContent = sa.role || 'Specialist';

    const statusTag = document.createElement('span');
    statusTag.className = `subagent-status-tag ${sa.status}`;
    statusTag.textContent = sa.status;

    header.appendChild(role);
    header.appendChild(statusTag);
    card.appendChild(header);

    const task = document.createElement('div');
    task.className = 'subagent-task';
    task.textContent = sa.task;
    card.appendChild(task);

    const meta = document.createElement('div');
    meta.className = 'subagent-meta';

    const turnsInfo = document.createElement('span');
    turnsInfo.textContent = `ID: ${sa.id.slice(0, 16)}... | Turns: ${sa.turnsCount || 0}`;
    meta.appendChild(turnsInfo);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';

    const toggleContextBtn = document.createElement('button');
    toggleContextBtn.className = 'subagent-context-toggle';
    toggleContextBtn.textContent = 'View Context';
    actions.appendChild(toggleContextBtn);

    if (sa.status === 'working') {
      const termBtn = document.createElement('button');
      termBtn.className = 'subagent-terminate-btn';
      termBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">close</span> Terminate';
      termBtn.title = 'Force Kill Sub-Agent';
      termBtn.addEventListener('click', async () => {
        termBtn.disabled = true;
        termBtn.textContent = 'Stopping...';
        await chrome.runtime.sendMessage({
          type: 'TERMINATE_SUBAGENT',
          payload: { subagentId: sa.id }
        });
        const res = await chrome.runtime.sendMessage({ type: 'GET_SUBAGENTS' });
        if (res) updateSubagentsUI(res.activeCount, res.subagents);
      });
      actions.appendChild(termBtn);
    }

    meta.appendChild(actions);
    card.appendChild(meta);

    const contextViewer = document.createElement('div');
    contextViewer.className = 'subagent-context-viewer hidden';

    const contextContent = (sa.history || [])
      .map(h => `[${(h.role || 'unknown').toUpperCase()}]\n${typeof h.content === 'string' ? h.content : JSON.stringify(h.content, null, 2)}`)
      .join('\n\n---\n\n');
    contextViewer.textContent = contextContent || '(No context turns recorded)';
    card.appendChild(contextViewer);

    toggleContextBtn.addEventListener('click', () => {
      const isHidden = contextViewer.classList.toggle('hidden');
      toggleContextBtn.textContent = isHidden ? 'View Context' : 'Hide Context';
    });

    subagentsListContainer.appendChild(card);
  }
}

// ── Agent Confirmation Banner & Permission Modes ───────────────────

function updateModeLabels(mode) {
  currentAgentMode = mode;
  const labels = {
    allow_some: 'Allow Some',
    allow_all: 'Allow All',
    allow_none: 'Allow None'
  };
  const label = labels[mode] || 'Allow Some';
  if (agentBannerModeLabel) {
    agentBannerModeLabel.textContent = label;
  }
  if (agentPermissionBtn) {
    agentPermissionBtn.title = `Agent Permission Mode: ${label}`;
  }
}

function showAgentModeModal(requestId = null) {
  pendingModeRequestId = requestId;
  const targetRadio = document.querySelector(`input[name="browser-agent-mode"][value="${currentAgentMode}"]`);
  if (targetRadio) {
    targetRadio.checked = true;
  }
  agentModeModal.classList.remove('hidden');
}

function hideAgentModeModal() {
  agentModeModal.classList.add('hidden');
  pendingModeRequestId = null;
}

async function saveAgentPermissionMode() {
  const selectedRadio = document.querySelector('input[name="browser-agent-mode"]:checked');
  const mode = selectedRadio ? selectedRadio.value : 'allow_some';
  const remember = rememberAgentMode ? rememberAgentMode.checked : true;

  updateModeLabels(mode);

  await chrome.runtime.sendMessage({
    type: 'SET_AGENT_PERMISSION_MODE',
    payload: {
      mode,
      remember,
      requestId: pendingModeRequestId
    }
  });

  hideAgentModeModal();
  showToast(`Agent Permission: ${mode === 'allow_all' ? 'Allow All' : mode === 'allow_none' ? 'Allow None' : 'Allow Some'}`);
}

function showAgentConfirmBanner({ requestId, toolName, args }) {
  pendingAgentRequestId = requestId;
  agentConfirmToolName.textContent = toolName;
  agentConfirmArgs.textContent = JSON.stringify(args, null, 2);
  updateModeLabels(currentAgentMode);
  agentConfirmBanner.classList.remove('hidden');
}

function hideAgentConfirmBanner() {
  agentConfirmBanner.classList.add('hidden');
  agentConfirmToolName.textContent = '';
  agentConfirmArgs.textContent = '';
  pendingAgentRequestId = null;
}

agentAllowBtn.addEventListener('click', () => {
  if (!pendingAgentRequestId) return;
  chrome.runtime.sendMessage({
    type: 'AGENT_ACTION_RESPONSE',
    payload: { requestId: pendingAgentRequestId, approved: true }
  });
  hideAgentConfirmBanner();
});

agentDenyBtn.addEventListener('click', () => {
  if (!pendingAgentRequestId) return;
  chrome.runtime.sendMessage({
    type: 'AGENT_ACTION_RESPONSE',
    payload: { requestId: pendingAgentRequestId, approved: false }
  });
  hideAgentConfirmBanner();
});

function renderCompactedBadge(compactedCount, savedTokens, isRestoring = false) {
  const existing = document.getElementById('compact-badge');
  if (existing) {
    existing.remove();
  }

  const badge = document.createElement('div');
  badge.id = 'compact-badge';
  badge.className = 'context-compact-badge';
  badge.innerHTML = `
    <span class="material-symbols-outlined compact-icon">compress</span>
    <span class="compact-text">Context Compacted: Condensed ${compactedCount} earlier turns (Saved ~${savedTokens} tokens)</span>
  `;

  chatContainer.appendChild(badge);
  if (!isRestoring) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function showToast(message) {
  let toast = document.getElementById('chat-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'chat-toast';
    toast.className = 'chat-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

document.addEventListener('DOMContentLoaded', init);
