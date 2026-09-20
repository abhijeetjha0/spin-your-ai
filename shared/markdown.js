/**
 * A complete markdown to HTML renderer for chat messages.
 * Supports: headings, bold, italic, strikethrough, code blocks, inline code,
 * ordered/unordered lists, blockquotes, tables, horizontal rules, and links.
 */
export function renderMarkdown(text) {
  if (!text) return '';

  // --- Step 1: Extract and protect code blocks from further processing ---
  const protectedBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const idx = protectedBlocks.length;
    protectedBlocks.push(`<pre><code class="language-${lang || 'plaintext'}">${escaped}</code></pre>`);
    return `\x00BLOCK${idx}\x00`;
  });

  // --- Step 1.5: Protect Material Symbol Spans ---
  text = text.replace(/<span class="material-symbols-outlined"(.*?)>([^<]+)<\/span>/g, (match, attrs, content) => {
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
