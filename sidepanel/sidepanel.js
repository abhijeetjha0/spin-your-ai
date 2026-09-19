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
      finishGeneration();
    }
  });

  // Listen for active model changes and stream chunks
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CHAT_STREAM' && msg.payload.messageId === currentMessageId) {
      handleStreamChunk(msg.payload.chunk, msg.payload.done, msg.payload.error);
    } else if (msg.type === 'PROVIDERS_UPDATED') {
      loadProviders();
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
  if (active && active.providerId && active.modelId) {
    const val = `${active.providerId}::${active.modelId}`;
    const match = allModels.find(m => m.value === val);
    if (match) selectModel(match, false);
  } else if (allModels.length > 0) {
    selectModel(allModels[0], false);
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
    clearChat();
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
  if (!modelCombobox.contains(e.target)) closeDropdown();
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

function appendMessage(sender, text, className, id = null) {
  const div = document.createElement('div');
  div.className = `message ${className}`;
  if (id) div.id = `msg-${id}`;
  div.innerHTML = text ? renderMarkdown(text) : '';
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
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
    chatContainer.scrollTop = chatContainer.scrollHeight;
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
  currentMessageId = null;
  currentAiText = '';
  stopBtn.classList.add('hidden');
  sendBtn.classList.remove('hidden');
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

document.addEventListener('DOMContentLoaded', init);
