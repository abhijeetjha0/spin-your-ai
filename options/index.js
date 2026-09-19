import { vault } from '../background/vault.js';

const PROVIDERS = [
  {
    category: 'Local Agents & Models',
    categoryId: 'local',
    providers: [
      { id: 'ollama', name: 'Ollama (Local)', fields: [{ key: 'url', label: 'Host URL', type: 'text', default: 'http://localhost:11434' }] },
      { id: 'openclaw', name: 'OpenClaw', fields: [{ key: 'url', label: 'Host URL', type: 'text', default: 'http://localhost:3141' }] },
      { id: 'hermes', name: 'Hermes Desktop', fields: [{ key: 'url', label: 'Host URL', type: 'text', default: 'http://localhost:8642/v1' }] },
    ]
  },
  {
    category: 'Cloud APIs',
    categoryId: 'cloud',
    providers: [
      { id: 'openai', name: 'OpenAI', fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }] },
      { id: 'anthropic', name: 'Anthropic', fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }] },
      { id: 'gemini', name: 'Google Gemini', fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }] },
      { id: 'ollama_cloud', name: 'Ollama Cloud', fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }] },
    ]
  },
  {
    category: 'Aggregators',
    categoryId: 'aggregators',
    providers: [
      { id: 'openrouter', name: 'OpenRouter', fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }] },
      { id: 'opencode_zen', name: 'OpenCode Zen', fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }] },
    ]
  },
  {
    category: 'Dev Platforms',
    categoryId: 'dev',
    providers: [
      {
        id: 'opencode', name: 'OpenCode', fields: [
          { key: 'url', label: 'Host URL', type: 'text', default: 'http://localhost:3000' },
          { key: 'username', label: 'Username', type: 'text', placeholder: 'Enter username...' },
          { key: 'password', label: 'Password', type: 'password' }
        ]
      }
    ]
  },
  {
    category: 'MCP Servers',
    categoryId: 'mcp',
    providers: [
      {
        id: 'mcp', name: 'MCP Server', fields: [
          { key: 'url', label: 'Server URL', type: 'text' },
          { key: 'authType', label: 'Auth Type', type: 'select', options: ['None', 'Bearer', 'API Key', 'Basic'] },
          { key: 'authToken', label: 'Token / Key', type: 'password' }
        ]
      }
    ]
  }
];

const container = document.getElementById('provider-cards-container');

async function renderCards() {
  const allConfigs = await vault.getAllConfigs();
  let html = '<div class="content-inner">';

  for (const group of PROVIDERS) {
    html += `<div class="category-section" id="${group.categoryId}">
      <h3>${group.category}</h3>`;

    for (const p of group.providers) {
      const config = allConfigs[p.id] || {};
      const isActive = !!(config.apiKey || config.url);

      html += `
        <div class="provider-card" id="card-${p.id}">
          <div class="provider-header">
            <div class="provider-name">${p.name} <span class="provider-status ${isActive ? 'active' : ''}">${isActive ? 'Configured' : 'Not Configured'}</span></div>
          </div>
          <form id="form-${p.id}">
      `;

      for (const field of p.fields) {
        let value = config[field.key] || field.default || '';

        html += `<div class="form-group">
          <label>${field.label}</label>
          <div class="input-row">`;

        if (field.type === 'select') {
          html += `<select name="${field.key}">`;
          field.options.forEach(opt => {
            html += `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`;
          });
          html += `</select>`;
        } else {
          if (field.type === 'password') {
            const isMasked = !!value;
            html += `<input type="password" 
                     name="${field.key}" 
                     value="${isMasked ? '' : ''}" 
                     data-real-value="${value}"
                     ${isMasked ? 'readonly' : ''}
                     placeholder="${isMasked ? '••••••••' + value.slice(-4) : 'sk-...'}">`;
            html += `<button type="button" class="icon-btn reveal-btn" title="Edit"><span class="material-symbols-outlined">edit</span></button>`;
            html += `<button type="button" class="icon-btn peek-btn" title="Show/Hide"><span class="material-symbols-outlined">visibility</span></button>`;
          } else {
            html += `<input type="${field.type}" 
                     name="${field.key}" 
                     value="${value}" 
                     placeholder="${field.placeholder || field.default || (field.key === 'url' ? 'http://...' : 'Enter value...')}">`;
          }
        }

        html += `</div></div>`;
      }

      html += `
            <div class="actions">
              <button type="button" class="btn btn-danger delete-btn" data-id="${p.id}">Reset</button>
              <button type="button" class="btn btn-secondary test-btn" data-id="${p.id}">Test Connection</button>
              <button type="submit" class="btn btn-primary" data-id="${p.id}">Save</button>
            </div>
          </form>
        </div>
      `;
    }
    html += `</div>`;
  }

  html += '</div>';
  container.innerHTML = html;
  attachEvents();
}

function attachEvents() {
  // Edit buttons - unlock the field for editing but keep it masked
  document.querySelectorAll('.reveal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const inputRow = e.target.closest('.input-row');
      const input = inputRow.querySelector('input');
      input.readOnly = false;
      input.value = input.dataset.realValue || '';
      input.placeholder = 'Enter new value...';
      input.focus();
    });
  });

  // Peek buttons - toggle password visibility temporarily
  document.querySelectorAll('.peek-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const inputRow = e.target.closest('.input-row');
      const input = inputRow.querySelector('input');
      // If the field is masked and empty, show the stored value temporarily
      const realValue = input.dataset.realValue || '';
      if (input.type === 'password') {
        input.type = 'text';
        if (input.readOnly && !input.value) input.value = realValue;
        e.target.innerHTML = '<span class="material-symbols-outlined">visibility_off</span>';
      } else {
        input.type = 'password';
        if (input.readOnly) { input.value = ''; }
        e.target.innerHTML = '<span class="material-symbols-outlined">visibility</span>';
      }
    });
  });

  // Save forms
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = e.submitter.dataset.id;
      const formData = new FormData(form);
      const config = {};

      for (let [key, value] of formData.entries()) {
        // If it's a masked password that wasn't edited, grab real value
        const input = form.querySelector(`[name="${key}"]`);
        if (input.readOnly && input.dataset.realValue) {
          config[key] = input.dataset.realValue;
        } else {
          config[key] = value.trim();
        }
      }

      await vault.saveConfig(id, config);
      showToast(`Saved ${getProviderName(id)} configuration`, 'success');

      // Notify background script to refresh models
      chrome.runtime.sendMessage({ type: 'PROVIDERS_UPDATED' });

      renderCards(); // Re-render to show masked state and active badge
    });
  });

  // Reset buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm('Reset this configuration?')) {
        const id = e.target.dataset.id;
        await vault.deleteConfig(id);
        showToast(`Reset ${getProviderName(id)}`, 'success');
        chrome.runtime.sendMessage({ type: 'PROVIDERS_UPDATED' });
        renderCards();
      }
    });
  });

  // Test buttons
  document.querySelectorAll('.test-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const form = document.getElementById(`form-${id}`);

      const formData = new FormData(form);
      const config = {};

      for (let [key, value] of formData.entries()) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input.readOnly && input.dataset.realValue) {
          config[key] = input.dataset.realValue;
        } else {
          config[key] = value.trim();
        }
      }

      showToast(`Testing ${getProviderName(id)}...`, 'info');
      const res = await chrome.runtime.sendMessage({
        type: 'TEST_CONNECTION',
        payload: { providerId: id, config }
      });
      if (res && res.ok) {
        showToast(`✅ Connection successful`, 'success');
      } else {
        showToast(`❌ Failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    });
  });
}

function getProviderName(id) {
  for (const cat of PROVIDERS) {
    const provider = cat.providers.find(p => p.id === id);
    if (provider) return provider.name;
  }
  return id;
}

function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  // Clear any existing toasts so they don't stack
  container.innerHTML = '';

  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);

  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => {
      if (t.parentElement) t.remove();
    }, 300);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', renderCards);
