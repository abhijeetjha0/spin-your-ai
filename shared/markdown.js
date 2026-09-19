/**
 * A simple regex-based markdown to HTML renderer for chat messages.
 */
export function renderMarkdown(text) {
  if (!text) return '';

  let html = text
    // Escape HTML to prevent XSS
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Code blocks (triple backticks)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
    return `<pre><code class="language-${lang || 'plaintext'}">${code}</code></pre>`;
  });

  // Inline code (single backtick)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (**text**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (*text*)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links ([text](url))
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Lists (- item)
  let inList = false;
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    if (line.trim().startsWith('- ')) {
      const content = line.trim().substring(2);
      if (!inList) {
        inList = true;
        return `<ul><li>${content}</li>`;
      }
      return `<li>${content}</li>`;
    } else {
      if (inList) {
        inList = false;
        return `</ul>\n${line}`;
      }
      return line;
    }
  });
  
  if (inList) {
    processedLines.push('</ul>');
  }

  html = processedLines.join('\n');

  // Paragraphs / Newlines - avoid breaking HTML tags like <pre> or <ul>
  // A naive replace could break multiline <pre>. Let's keep it simple for now, 
  // but protect <pre> blocks if needed. We'll just replace \n with <br/> for standard lines.
  // Actually, replacing \n with <br/> is safer after code blocks, but code blocks 
  // might already have \n which shouldn't be <br/>. Let's fix that.
  
  // A slightly safer way:
  let parts = html.split(/(<pre>[\s\S]*?<\/pre>)/g);
  for (let i = 0; i < parts.length; i++) {
      if (!parts[i].startsWith('<pre>')) {
          parts[i] = parts[i].replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
      }
  }
  return parts.join('');
}
