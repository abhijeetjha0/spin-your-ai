import { renderMarkdown } from '../shared/markdown.js';

const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const modelSelector = document.getElementById('model-selector');
const optionsBtn = document.getElementById('options-btn');
const contextToggle = document.getElementById('include-page-context');

let isGenerating = false;
let currentMessageId = null;

// Initialize
async function init() {
  await loadProviders();
  
  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

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
  // Get from background script
  const res = await chrome.runtime.sendMessage({ type: 'GET_MODELS' });
  if (res && res.providers) {
    modelSelector.innerHTML = '<option value="" disabled>Select Model...</option>';
    
    for (const [providerId, data] of Object.entries(res.providers)) {
      if (data.models && data.models.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = data.name || providerId;
        
        data.models.sort((a, b) => a.name.localeCompare(b.name)).forEach(model => {
          const opt = document.createElement('option');
          opt.value = `${providerId}::${model.id}`;
          opt.textContent = model.name;
          optgroup.appendChild(opt);
        });
        
        modelSelector.appendChild(optgroup);
      }
    }
    
    // Set active model if any
    const active = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_MODEL' });
    if (active && active.providerId && active.modelId) {
      modelSelector.value = `${active.providerId}::${active.modelId}`;
    } else if (modelSelector.options.length > 1) {
      modelSelector.selectedIndex = 1; // Select first available
    }
  }
}

modelSelector.addEventListener('change', () => {
  if (modelSelector.value) {
    const [providerId, modelId] = modelSelector.value.split('::');
    chrome.runtime.sendMessage({ type: 'SET_ACTIVE_MODEL', payload: { providerId, modelId } });
  }
});

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isGenerating) return;

  const selectedModel = modelSelector.value;
  if (!selectedModel) {
    appendMessage('System', 'Please select a model first.', 'system-msg');
    return;
  }
  
  const [providerId, modelId] = selectedModel.split('::');

  // Reset input
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Add user message to UI
  appendMessage('You', text, 'user-msg');
  
  let pageContext = null;
  if (contextToggle.checked) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) {
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
          appendMessage('System', '⚠️ Cannot read page context on internal Chrome pages.', 'error');
        } else {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
          if (response && response.ok) {
            pageContext = response.payload;
          } else {
            appendMessage('System', '⚠️ Failed to read page context. Please refresh the page and try again.', 'error');
          }
        }
      }
    } catch(e) {
      // The content script isn't running on this tab (e.g. internal page or stale tab). 
      // Handled gracefully in UI, no need to log a scary console warning.
      appendMessage('System', '⚠️ Could not read page context. Ensure you are on a valid webpage and refresh it.', 'error');
    }
  }

  // Create empty AI message container
  currentMessageId = Date.now().toString();
  const aiMsgEl = appendMessage('AI', '', 'ai-msg', currentMessageId);
  aiMsgEl.innerHTML = '<span class="typing-indicator">Thinking...</span>';

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
      pageContext
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
    msgEl.innerHTML = `⚠️ Error: ${error}`;
    msgEl.style.color = '#ef4444';
    finishGeneration();
    return;
  }

  if (chunk) {
    // If it was just "Thinking...", clear it out
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
  isGenerating = false;
  currentMessageId = null;
  currentAiText = '';
  stopBtn.classList.add('hidden');
  sendBtn.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', init);
