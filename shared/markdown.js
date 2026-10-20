/**
 * A complete markdown to HTML renderer for chat messages.
 * Supports: headings, bold, italic, strikethrough, code blocks, inline code,
 * ordered/unordered lists, blockquotes, tables, horizontal rules, and links.
 */
function escapeSubagentHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateSubagentsHtml(subagents, activeCount = 0) {
  if (!subagents || subagents.length === 0) return '';

  const isWorking = activeCount > 0;
  const countLabel = isWorking ? `${activeCount} Working` : `${subagents.length} Agent${subagents.length === 1 ? '' : 's'}`;
  const pulseHtml = isWorking ? '<span class="subagent-pulse-dot"></span>' : '';

  const cardsHtml = subagents.map(sa => {
    const statusClass = sa.status || 'completed';
    const isWorkingSa = statusClass === 'working';
    const turns = sa.turnsCount || (sa.history ? sa.history.filter(h => h.role === 'assistant').length : 0);
    const idShort = (sa.id || '').length > 18 ? `${sa.id.slice(0, 18)}...` : sa.id;

    let contextContent = '';
    if (sa.history && sa.history.length > 0) {
      contextContent = sa.history
        .map(h => `[${(h.role || 'unknown').toUpperCase()}]\n${typeof h.content === 'string' ? h.content : JSON.stringify(h.content, null, 2)}`)
        .join('\n\n---\n\n');
    } else if (sa.result) {
      contextContent = `[RESULT]\n${sa.result}`;
    } else {
      contextContent = '(No context turns recorded)';
    }

    const termBtnHtml = isWorkingSa 
      ? `<button type="button" class="subagent-terminate-btn" data-subagent-id="${escapeSubagentHtml(sa.id)}" title="Force Kill Sub-Agent"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">close</span>Terminate</button>` 
      : '';

    return `
      <div class="subagent-card ${statusClass}">
        <div class="subagent-card-header">
          <span class="subagent-role">${escapeSubagentHtml(sa.role || 'Specialist')}</span>
          <span class="subagent-status-tag ${statusClass}">${statusClass}</span>
        </div>
        <div class="subagent-task">${escapeSubagentHtml(sa.task || '')}</div>
        <div class="subagent-meta">
          <span>ID: <code>${escapeSubagentHtml(idShort)}</code> | Turns: ${turns}</span>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="subagent-context-toggle">View Context</button>
            ${termBtnHtml}
          </div>
        </div>
        <div class="subagent-context-viewer hidden">${escapeSubagentHtml(contextContent)}</div>
      </div>
    `;
  }).join('');

  const killAllBtnHtml = isWorking 
    ? `<button type="button" class="subagents-kill-all-btn" title="Force Kill All Sub-Agents" style="color:#ef4444;background:#1a0000;border:1px solid #7f1d1d;padding:2px 8px;font-family:inherit;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;"><span class="material-symbols-outlined" style="font-size:13px;">cancel</span> Kill All</button>` 
    : '';

  return `
    <div class="midprocess-subagents-block">
      <div class="midprocess-subagents-header">
        <div class="subagents-title-group">
          <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-ai,#7dd3fc);vertical-align:middle;margin-right:6px;">hub</span>
          <strong>Autonomous Sub-Agents</strong>
          <span class="subagents-count-badge ${isWorking ? 'working' : ''}">${countLabel}</span>
          ${pulseHtml}
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          ${killAllBtnHtml}
          <button type="button" class="subagent-reset-btn" title="Reset Inactive Sub-Agents">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">delete_sweep</span> Reset
          </button>
        </div>
      </div>
      <div class="midprocess-subagents-list">
        ${cardsHtml}
      </div>
    </div>
  `;
}

export function renderMarkdown(text, options = {}) {
  const subagents = options?.subagents || [];
  const activeSubagentsCount = options?.activeCount || 0;

  if (!text && (!subagents || subagents.length === 0)) return '';
  text = text || '';

  // --- Step 1: Extract and protect code blocks from further processing ---
  const protectedBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const idx = protectedBlocks.length;
    protectedBlocks.push(`<pre><code class="language-${lang || 'plaintext'}">${escaped}</code></pre>`);
    return `\x00BLOCK${idx}\x00`;
  });

  let midProcessItems = [];
  let hasOpenStream = false;

  // 1. Extract closed <think> tags
  text = text.replace(/<(think|thinking)>([\s\S]*?)<\/\1>/gi, (_match, _tag, content) => {
      const escapedContent = content.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      midProcessItems.push(`<div style="margin-bottom: 8px;"><strong>Thought Process:</strong><br>${escapedContent}</div>`);
      return '';
  });

  // 2. Extract unclosed <think> tag
  text = text.replace(/<(think|thinking)>([\s\S]*)$/i, (_match, _tag, content) => {
      hasOpenStream = true;
      const escapedContent = content.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      midProcessItems.push(`<div style="margin-bottom: 8px;"><strong>Thinking...</strong><br>${escapedContent}</div>`);
      return '';
  });

  // 3. Extract MCP/Agent Tool logs
  text = text.replace(/(?:\n\n)?>\s*<span[^>]*>settings<\/span>\s*\*Executing (?:MCP )?tool `([^`]+)`\.\.\.\*(?:\n\n)?/gi, (_match, toolName) => {
      if (toolName === 'spin_subagent') {
        if (!subagents || subagents.length === 0) {
          midProcessItems.push(`<div style="margin-bottom: 4px;"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px;color:var(--text-ai,#7dd3fc);">hub</span>Executing Tool: <code>spin_subagent</code></div>`);
        }
      } else {
        midProcessItems.push(`<div style="margin-bottom: 4px;"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px;">build</span>Executing Tool: <code>${toolName}</code></div>`);
      }
      return '';
  });

  // 4. Inject Sub-Agents block into Mid-Process Analysis if subagents are present
  if (subagents && subagents.length > 0) {
    if (activeSubagentsCount > 0) {
      hasOpenStream = true;
    }
    midProcessItems.push(generateSubagentsHtml(subagents, activeSubagentsCount));
  }

  if (midProcessItems.length > 0) {
      const combinedContent = midProcessItems.join('<hr style="border-color: #333; margin: 8px 0;">');
      const openAttr = hasOpenStream ? 'open' : '';
      const detailsHtml = `<details class="thinking-details" ${openAttr} style="margin: 0 0 16px 0; border: 1px solid var(--border-color); background: #000; padding: 8px;"><summary style="cursor: pointer; color: var(--text-muted); font-size: 0.9em; user-select: none; font-weight: bold;"><span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:6px;">psychology</span>Mid-Process Analysis (${midProcessItems.length})</summary><div class="details-content" style="padding-top:12px; font-size:0.9em; color:var(--text-muted);">${combinedContent}</div></details>`;
      
      const idx = protectedBlocks.length;
      protectedBlocks.push(detailsHtml);
      text = `\x00BLOCK${idx}\x00\n\n` + text.trimStart();
  }

  // --- Step 1.5: Protect Material Symbol Spans ---
  text = text.replace(/<span class="material-symbols-outlined"(.*?)>([^<]+)<\/span>/g, (_match, attrs, content) => {
    const idx = protectedBlocks.length;
    protectedBlocks.push(`<span class="material-symbols-outlined"${attrs}>${content}</span>`);
    return `\x00BLOCK${idx}\x00`;
  });

  // --- Step 2: Escape HTML in remaining text ---
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // --- Step 3: Inline code (single backtick) ---
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // --- Step 4: Block-level processing line by line ---
  const lines = text.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      output.push('<hr>');
      i++; continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      output.push(`<h${level}>${processInline(headingMatch[2])}</h${level}>`);
      i++; continue;
    }

    // Blockquote
    if (line.startsWith('&gt;')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith('&gt;')) {
        quoteLines.push(lines[i].slice(4).trim());
        i++;
      }
      output.push(`<blockquote>${processInline(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // Table (detect | ... | ... |)
    if (/^\|.+\|/.test(line) && i + 1 < lines.length && /^\|[-: |]+\|$/.test(lines[i + 1])) {
      const headers = line.split('|').slice(1, -1).map(h => `<th>${processInline(h.trim())}</th>`).join('');
      i += 2; // skip header and separator
      const rows = [];
      while (i < lines.length && /^\|.+\|/.test(lines[i])) {
        const cells = lines[i].split('|').slice(1, -1).map(c => `<td>${processInline(c.trim())}</td>`).join('');
        rows.push(`<tr>${cells}</tr>`);
        i++;
      }
      output.push(`<table><thead><tr>${headers}</tr></thead><tbody>${rows.join('')}</tbody></table>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        listItems.push(`<li>${processInline(lines[i].replace(/^[-*+]\s/, ''))}</li>`);
        i++;
      }
      output.push(`<ul>${listItems.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(`<li>${processInline(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
        i++;
      }
      output.push(`<ol>${listItems.join('')}</ol>`);
      continue;
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      output.push('<br>');
      i++; continue;
    }

    // Regular paragraph line
    output.push(`<p>${processInline(line)}</p>`);
    i++;
  }

  let html = output.join('');

  // --- Step 5: Restore protected blocks (code blocks & icons) ---
  html = html.replace(/\x00BLOCK(\d+)\x00/g, (_, idx) => protectedBlocks[idx]);

  return html;
}

function processInline(text) {
  // Bold + Italic (***text***)
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold (**text**)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic (*text* or _text_)
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');
  // Strikethrough (~~text~~)
  text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return text;
}
