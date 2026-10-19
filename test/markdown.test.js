import test from 'node:test';
import assert from 'node:assert';
import { renderMarkdown } from '../shared/markdown.js';

test('renderMarkdown - empty or null input', () => {
  assert.strictEqual(renderMarkdown(''), '');
  assert.strictEqual(renderMarkdown(null), '');
  assert.strictEqual(renderMarkdown(undefined), '');
});

test('renderMarkdown - code blocks with language and escaping', () => {
  const md = '```javascript\nconst a = 1 < 2 && 3 > 2;\n```';
  const html = renderMarkdown(md);
  assert.ok(html.includes('<pre><code class="language-javascript">'));
  assert.ok(html.includes('&lt;'));
  assert.ok(html.includes('&amp;&amp;'));
  assert.ok(html.includes('&gt;'));
});

test('renderMarkdown - think tags and thinking process', () => {
  const closedThink = '<think>Let me reason about this problem</think>Here is the answer.';
  const htmlClosed = renderMarkdown(closedThink);
  assert.ok(htmlClosed.includes('Mid-Process Analysis'));
  assert.ok(htmlClosed.includes('Thought Process:'));
  assert.ok(htmlClosed.includes('Let me reason about this problem'));
  assert.ok(htmlClosed.includes('Here is the answer.'));

  const openThink = '<thinking>Streaming active thought';
  const htmlOpen = renderMarkdown(openThink);
  assert.ok(htmlOpen.includes('Mid-Process Analysis'));
  assert.ok(htmlOpen.includes('Thinking...'));
  assert.ok(htmlOpen.includes('open'));
});

test('renderMarkdown - tool execution and material symbols', () => {
  const md = [
    '> <span class="material-symbols-outlined">settings</span> *Executing MCP tool `browser_click`...*',
    '<span class="material-symbols-outlined" style="color:red">check</span>'
  ].join('\n\n');

  const html = renderMarkdown(md);
  assert.ok(html.includes('Executing Tool: <code>browser_click</code>'));
  assert.ok(html.includes('<span class="material-symbols-outlined" style="color:red">check</span>'));
});

test('renderMarkdown - headings, lists, bold, italics, links, strikethrough', () => {
  const md = [
    '# Heading 1',
    '## Heading 2',
    '### Heading 3',
    '***bold italic*** and **bold text** and *italic text* and _other italic_ and ~~strike~~',
    '- Item 1\n- Item 2',
    '1. First\n2. Second',
    '> Quote block',
    '[Google](https://google.com)'
  ].join('\n\n');

  const html = renderMarkdown(md);
  assert.ok(html.includes('<h1>Heading 1</h1>'));
  assert.ok(html.includes('<h2>Heading 2</h2>'));
  assert.ok(html.includes('<h3>Heading 3</h3>'));
  assert.ok(html.includes('<strong><em>bold italic</em></strong>'));
  assert.ok(html.includes('<strong>bold text</strong>'));
  assert.ok(html.includes('<em>italic text</em>'));
  assert.ok(html.includes('<em>other italic</em>'));
  assert.ok(html.includes('<s>strike</s>'));
  assert.ok(html.includes('<ul><li>Item 1</li><li>Item 2</li></ul>'));
  assert.ok(html.includes('<ol><li>First</li><li>Second</li></ol>'));
  assert.ok(html.includes('<blockquote>Quote block</blockquote>'));
  assert.ok(html.includes('<a href="https://google.com" target="_blank" rel="noopener noreferrer">Google</a>'));
});

test('renderMarkdown - tables and horizontal rules', () => {
  const md = [
    '| Col 1 | Col 2 |',
    '|---|---|',
    '| Val A | Val B |',
    '',
    '---'
  ].join('\n');

  const html = renderMarkdown(md);
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('<th>Col 1</th>'));
  assert.ok(html.includes('<td>Val A</td>'));
  assert.ok(html.includes('<hr>'));
});
