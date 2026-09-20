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
      { id: 'huggingface', name: 'Hugging Face', fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }] },
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
      },
      {
        id: 'mcp', name: 'MCP Servers', fields: [
          { 
            key: 'configJson', 
            label: 'mcp_config.json <span class="material-symbols-outlined" title="Only HTTP/SSE MCP endpoints are supported. Configure your servers as a JSON object. Use env to pass HTTP headers." style="font-size: 16px; cursor: help;">info</span>', 
            type: 'textarea', 
            placeholder: '{\n  "mcpServers": {\n    "n8n-mcp": {\n      "type": "http",\n      "url": "http://localhost:5678/mcp-server/http",\n      "headers": {\n        "Authorization": "Bearer YOUR_ACCESS_TOKEN_HERE"\n      }\n    }\n  }\n}' 
          }
        ]
      }
    ]
  }
];

const container = document.getElementById('provider-cards-container');

async function renderCards() {
  const allConfigs = await vault.getAllConfigs();
  let html = '<div class="content-inner">';

  const navContainer = document.getElementById('nav-links');
  if (navContainer) {
    let navHtml = '';
    for (const group of PROVIDERS) {
      navHtml += `<a href="#${group.categoryId}" class="nav-link">${group.category}</a>`;
    }
    navContainer.innerHTML = navHtml;
  }

  for (const group of PROVIDERS) {
    html += `<div class="category-section" id="${group.categoryId}">
      <h3>${group.category}</h3>`;

    for (const p of group.providers) {
      const config = allConfigs[p.id] || {};
      const isActive = !!(config.apiKey || config.url);

      html += `
        <div class="provider-card" id="card-${p.id}">
          <div class="provider-header">
            <div class="provider-name">
              ${p.name} 
              <span class="provider-status ${isActive ? 'active' : ''}">${isActive ? 'Configured' : 'Not Configured'}</span>
            </div>
            <label class="toggle-switch" title="Enable/Disable this provider">
              <input type="checkbox" class="provider-enable-toggle" data-id="${p.id}" ${config.enabled !== false ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>
          <form id="form-${p.id}" style="${config.enabled === false ? 'opacity: 0.5; pointer-events: none;' : ''}">
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
        } else if (field.type === 'textarea') {
          html += `<div style="display: flex; flex-direction: column; width: 100%;">`;
          html += `<textarea name="${field.key}" placeholder='${field.placeholder || ""}' rows="12" style="width: 100%; font-family: monospace; background: #000; color: #fff; border: 1px solid #333; padding: 8px; resize: vertical;">${value}</textarea>`;
          
          if (field.key === 'configJson' && value) {
            try {
              const parsed = JSON.parse(value);
              if (parsed && parsed.mcpServers) {
                const servers = Object.keys(parsed.mcpServers);
                if (servers.length > 0) {
                  html += `<div style="margin-top: 15px; color: #94a3b8;">
                    <strong style="font-size: 1.1em;">MCP Servers:</strong>
                    <ul style="margin: 8px 0 0 20px; padding: 0; list-style-type: none; font-size: 1.05em;" id="mcp-server-list">
                      ${servers.map(s => `<li id="mcp-server-${s}" style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span class="material-symbols-outlined mcp-status-icon" style="font-size: 14px; color: gray;">circle</span> 
                        ${s}
                      </li>`).join('')}
                    </ul>
                  </div>`;
                  html += `
                  <div id="mcp-error-wrapper" style="display: none; margin-top: 15px; padding: 12px; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                    <div style="font-weight: bold; margin-bottom: 12px; color: #ef4444; font-size: 1.1em; display: flex; align-items: center; gap: 6px;">
                      <span class="material-symbols-outlined" style="font-size: 16px;">error</span> 
                      Connection Errors
                    </div>
                    <div id="mcp-error-container" style="display: flex; flex-direction: column; gap: 5px;"></div>
                  </div>`;
                }
              }
            } catch(e) {
              html += `<div style="margin-top: 10px; font-size: 0.9em; color: #ef4444;">Invalid JSON configuration</div>`;
            }
          }
          html += `</div>`;
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
        const input = form.querySelector(`[name="${key}"]`);
        if (input.tagName === 'TEXTAREA') {
          config[key] = value.trim();
        } else if (input.readOnly && input.dataset.realValue) {
          config[key] = input.dataset.realValue;
        } else {
          config[key] = value.trim();
        }
      }
      
      const toggle = document.querySelector(`.provider-enable-toggle[data-id="${id}"]`);
      if (toggle) config.enabled = toggle.checked;

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

  // Enable/Disable toggles
  document.querySelectorAll('.provider-enable-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const config = (await vault.getAllConfigs())[id] || {};
      config.enabled = e.target.checked;
      await vault.saveConfig(id, config);
      showToast(`${config.enabled ? 'Enabled' : 'Disabled'} ${getProviderName(id)}`, 'success');
      chrome.runtime.sendMessage({ type: 'PROVIDERS_UPDATED' });
      
      const form = document.getElementById(`form-${id}`);
      if (form) {
        form.style.opacity = config.enabled ? '1' : '0.5';
        form.style.pointerEvents = config.enabled ? 'auto' : 'none';
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
        if (input.tagName === 'TEXTAREA') {
          config[key] = value.trim();
        } else if (input.readOnly && input.dataset.realValue) {
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
      
      if (res && res.serverStatuses) {
        const errorWrapper = document.getElementById('mcp-error-wrapper');
        const errorContainer = document.getElementById('mcp-error-container');
        if (errorContainer && errorWrapper) {
          errorContainer.innerHTML = '';
          
          let hasErrors = false;
          for (const [key, info] of Object.entries(res.serverStatuses)) {
            const li = document.getElementById(`mcp-server-${key}`);
            if (li) {
              const icon = li.querySelector('.mcp-status-icon');
              if (info.status === 'connected') {
                icon.style.color = '#22c55e';
              } else {
                icon.style.color = '#ef4444';
              }
            }
            
            if (info.status === 'error' && info.error) {
              hasErrors = true;
              const errDiv = document.createElement('div');
              errDiv.style.background = '#111';
              errDiv.style.border = '1px solid #333';
              errDiv.style.padding = '8px';
              errDiv.style.borderRadius = '4px';
              errDiv.style.display = 'flex';
              errDiv.style.justifyContent = 'space-between';
              errDiv.style.alignItems = 'flex-start';
              
              const errText = document.createElement('div');
              errText.style.fontFamily = 'monospace';
              errText.style.fontSize = '1em';
              errText.style.color = '#ef4444';
              errText.style.wordBreak = 'break-word';
              errText.textContent = `[${key}] ${info.error}`;
              
              const copyBtn = document.createElement('button');
              copyBtn.type = 'button';
              copyBtn.className = 'icon-btn';
              copyBtn.style.color = '#94a3b8';
              copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>';
              copyBtn.title = 'Copy error';
              copyBtn.onclick = () => {
                navigator.clipboard.writeText(`[${key}] ${info.error}`);
                copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">check</span>';
                setTimeout(() => {
                  copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>';
                }, 2000);
              };
              
              errDiv.appendChild(errText);
              errDiv.appendChild(copyBtn);
              errorContainer.appendChild(errDiv);
            }
          }
          if (hasErrors) {
            errorWrapper.style.display = 'block';
          } else {
            errorWrapper.style.display = 'none';
          }
        }
      }

      if (res && res.ok) {
        showToast(`✅ Connection successful`, 'success');
      } else {
        if (id === 'mcp') {
          showToast(`❌ MCP connection test failed`, 'error');
        } else {
          showToast(`❌ Failed: ${res?.error || 'Unknown error'}`, 'error');
        }
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
