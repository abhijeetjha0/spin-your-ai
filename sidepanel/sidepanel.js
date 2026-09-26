import { renderMarkdown } from '../shared/markdown.js';

const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const optionsBtn = document.getElementById('options-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const contextToggle = document.getElementById('include-page-context');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const attachmentPreview = document.getElementById('attachment-preview');

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

  const reloadModelsBtn = document.getElementById('reload-models-btn');
  reloadModelsBtn.addEventListener('click', () => {
    loadProviders();
    const icon = reloadModelsBtn.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.style.animation = 'spin 1s linear infinite';
      setTimeout(() => icon.style.animation = '', 1000);
    }
  });

  newChatBtn.addEventListener('click', clearChat);

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
  });

  sendBtn.addEventListener('click', sendMessage);

  // Attach file button
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  
  stopBtn.addEventListener('click', () => {
    if (isGenerating && currentMessageId) {
      chrome.runtime.sendMessage({ 
        type: 'STOP_GENERATION', 
        payload: { messageId: currentMessageId } 
      });
      // Do not call finishGeneration() here.
      // Wait for background worker to abort and send the final chunk.
    }
  });

  // Setup sessions modal
  sessionsBtn.addEventListener('click', () => {
    sessionsModal.classList.remove('hidden');
    chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }).then(res => {
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

  // Restore history and sessions
  chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }).then(res => {
    if (res) {
      allSessions = res.sessions || [];
      currentSessionId = res.currentSessionId;
    }
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }).then(h => {
      if (h && h.history) renderHistory(h.history);
    });
  });

  // Listen for active model changes and stream chunks
  chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
    if (msg.type === 'CHAT_STREAM' && msg.payload.messageId === currentMessageId) {
      handleStreamChunk(msg.payload.chunk, msg.payload.done, msg.payload.error);
    } else if (msg.type === 'PROVIDERS_UPDATED') {
      loadProviders();
    } else if (msg.type === 'UPDATE_SESSIONS') {
      allSessions = msg.payload.sessions || [];
      currentSessionId = msg.payload.currentSessionId;
      renderSessionsList();
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

  // Send to background
  chrome.runtime.sendMessage({
    type: 'SEND_CHAT',
    payload: {
      messageId: currentMessageId,
      providerId,
      modelId,
      text,
      pageContext,
      attachments
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
    msgEl.innerHTML = renderMarkdown(currentAiText);
    
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
  chatInput.placeholder = "Type your message...";
  currentMessageId = null;
  currentAiText = '';
  stopBtn.classList.add('hidden');
  sendBtn.classList.remove('hidden');
  
  // Focus input automatically after generation finishes
  setTimeout(() => chatInput.focus(), 100);
}

function clearChat() {
  chatContainer.innerHTML = '<div class="message system-msg">Welcome to Spin Your AI! Select a model and start chatting.</div>';
  chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
  isGenerating = false;
  currentMessageId = null;
  currentAiText = '';
  stopBtn.classList.add('hidden');
  sendBtn.classList.remove('hidden');
  clearAttachments();
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
  const res = await chrome.runtime.sendMessage({ type: 'EXPORT_CHAT' });
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
    deleteBtn.title = 'Delete Session';
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'DELETE_SESSION', payload: { sessionId: session.id } }).then(() => {
        allSessions = allSessions.filter(s => s.id !== session.id);
        if (currentSessionId === session.id) {
            currentSessionId = allSessions.length > 0 ? allSessions[0].id : null;
        }
        renderSessionsList();
        chrome.runtime.sendMessage({ type: 'GET_HISTORY' }).then(h => renderHistory(h ? h.history : []));
      });
    });
    
    deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.color = '#ff4444');
    deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.color = 'var(--text-muted)');
    
    item.appendChild(deleteBtn);
    
    item.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SWITCH_SESSION', payload: { sessionId: session.id } }).then(res => {
        if (res && res.history) {
          currentSessionId = session.id;
          renderHistory(res.history);
          sessionsModal.classList.add('hidden');
        }
      });
    });
    
    sessionsList.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', init);
