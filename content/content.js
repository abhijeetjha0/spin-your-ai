/**
 * Content script — runs on all pages (<all_urls>).
 * Handles:
 *   GET_CONTEXT  — extracts page text for AI context
 *   AGENT_ACTION — executes browser agent DOM actions on behalf of the AI
 */

// ── Page Context ──────────────────────────────────────────────────

function getPageContext() {
  const text = document.body.innerText || document.body.textContent;
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const truncatedText = cleanText.substring(0, 50000);
  return {
    url: window.location.href,
    title: document.title,
    text: truncatedText,
    isTruncated: cleanText.length > 50000
  };
}

// ── Agent Action Helpers ──────────────────────────────────────────

const SENSITIVE_PATTERNS = /password|passwd|pwd|api[_\-]?key|apikey|token|secret|auth|credential/i;

function isSensitiveField(el) {
  if (!el) return false;
  if (el.type === 'password') return true;
  const haystack = [el.name, el.id, el.placeholder, el.getAttribute('autocomplete')].join(' ');
  return SENSITIVE_PATTERNS.test(haystack);
}

function resolveElement(selector, text, label) {
  // 1. CSS selector
  if (selector) {
    try { const el = document.querySelector(selector); if (el) return el; } catch (_) {}
  }
  // 2. Label text / placeholder match (for inputs)
  if (label) {
    for (const lbl of document.querySelectorAll('label')) {
      if (lbl.textContent.trim().toLowerCase().includes(label.toLowerCase())) {
        if (lbl.htmlFor) { const el = document.getElementById(lbl.htmlFor); if (el) return el; }
        const input = lbl.querySelector('input, textarea, select');
        if (input) return input;
      }
    }
    const byPh = document.querySelector(
      `input[placeholder*="${CSS.escape(label)}" i], textarea[placeholder*="${CSS.escape(label)}" i]`
    );
    if (byPh) return byPh;
  }
  // 3. Visible text match (buttons / links)
  if (text) {
    for (const el of document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]')) {
      if (el.textContent.trim().toLowerCase().includes(text.toLowerCase())) return el;
    }
  }
  return null;
}

// ── Agent Actions ─────────────────────────────────────────────────

function agentClick(args) {
  const el = resolveElement(args.selector, args.text, null);
  if (!el) return { ok: false, error: `Element not found (selector: "${args.selector}", text: "${args.text}")` };
  el.focus();
  el.click();
  return { ok: true, result: `Clicked: ${el.tagName} "${el.textContent.trim().substring(0, 60)}"` };
}

function agentFill(args) {
  // Support both single input and batched inputs
  const inputs = Array.isArray(args.inputs) ? args.inputs : [args];
  const results = [];
  let allOk = true;

  for (const input of inputs) {
    if (!input.value && input.value !== '') continue; // skip empty definitions
    const el = resolveElement(input.selector, null, input.label);
    if (!el) {
      results.push(`❌ Input not found (selector: "${input.selector}", label: "${input.label}")`);
      allOk = false;
      continue;
    }
    if (isSensitiveField(el)) {
      results.push(`🚫 Blocked: field "${input.label || input.selector}" is a sensitive field.`);
      allOk = false;
      continue;
    }
    el.focus();
    // Use native setter to trigger React/Vue synthetic events
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) { setter.set.call(el, input.value); } else { el.value = input.value; }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    results.push(`✅ Filled "${input.label || input.selector}" with ${input.value.length} characters`);
  }

  return { ok: allOk, result: results.join('\n') };
}

function agentSelect(args) {
  const el = resolveElement(args.selector, null, args.label);
  if (!el || el.tagName !== 'SELECT') {
    return { ok: false, error: `<select> not found (selector: "${args.selector}", label: "${args.label}")` };
  }
  const opts = Array.from(el.options);
  const match = opts.find(o =>
    o.value.toLowerCase() === args.value.toLowerCase() ||
    o.text.toLowerCase().includes(args.value.toLowerCase())
  );
  if (!match) return { ok: false, error: `Option "${args.value}" not found. Available: ${opts.map(o => o.text).join(', ')}` };
  el.value = match.value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, result: `Selected "${match.text}" in dropdown` };
}

function agentScroll(args) {
  const amount = args.amount || 300;
  switch (args.direction) {
    case 'top':    window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'bottom': window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); break;
    case 'up':     window.scrollBy({ top: -amount, behavior: 'smooth' }); break;
    case 'down':   window.scrollBy({ top:  amount, behavior: 'smooth' }); break;
    default: return { ok: false, error: `Unknown scroll direction "${args.direction}"` };
  }
  return { ok: true, result: `Scrolled ${args.direction}` };
}

function agentHover(args) {
  const el = resolveElement(args.selector, null, null);
  if (!el) return { ok: false, error: `Element not found (selector: "${args.selector}")` };
  el.dispatchEvent(new MouseEvent('mouseover',   { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseenter',  { bubbles: true }));
  return { ok: true, result: `Hovered over ${el.tagName}` };
}

function agentDragDrop(args) {
  const src = resolveElement(args.source_selector, null, null);
  const tgt = resolveElement(args.target_selector, null, null);
  if (!src) return { ok: false, error: `Drag source not found (selector: "${args.source_selector}")` };
  if (!tgt) return { ok: false, error: `Drop target not found (selector: "${args.target_selector}")` };
  const dt = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  tgt.dispatchEvent(new DragEvent('dragover',  { bubbles: true, dataTransfer: dt }));
  tgt.dispatchEvent(new DragEvent('drop',      { bubbles: true, dataTransfer: dt }));
  src.dispatchEvent(new DragEvent('dragend',   { bubbles: true, dataTransfer: dt }));
  return { ok: true, result: `Dragged "${args.source_selector}" → "${args.target_selector}"` };
}

function agentGetDomSnapshot(args) {
  const maxDepth = args.depth || 4;
  function traverse(node, depth) {
    if (depth > maxDepth || !node) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      return t ? { text: t.substring(0, 80) } : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) return null;
    const obj = { tag };
    if (node.id)   obj.id    = node.id;
    if (node.className && typeof node.className === 'string') obj.class = node.className.trim().substring(0, 60);
    const role = node.getAttribute('role');        if (role) obj.role = role;
    const type = node.getAttribute('type');        if (type) obj.type = type;
    const name = node.getAttribute('name');        if (name) obj.name = name;
    const ph   = node.getAttribute('placeholder'); if (ph)   obj.placeholder = ph;
    const href = node.getAttribute('href');        if (href) obj.href = href.substring(0, 80);
    const al   = node.getAttribute('aria-label');  if (al)   obj.ariaLabel = al;
    const leafTags = ['button','a','input','textarea','select','label','h1','h2','h3','h4','p','span','li'];
    if (leafTags.includes(tag)) {
      const text = (node.innerText || '').trim().substring(0, 80);
      if (text) obj.text = text;
    }
    const children = Array.from(node.childNodes).map(c => traverse(c, depth + 1)).filter(Boolean);
    if (children.length) obj.children = children;
    return obj;
  }
  return { ok: true, result: traverse(document.body, 0) };
}

function agentGetInteractiveElements() {
  const sels = 'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"]';
  const result = Array.from(document.querySelectorAll(sels))
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.disabled;
    })
    .slice(0, 100)
    .map(el => {
      const item = { tag: el.tagName.toLowerCase() };
      if (el.id)          item.id          = `#${el.id}`;
      if (el.name)        item.name        = el.name;
      if (el.type)        item.type        = el.type;
      if (el.placeholder) item.placeholder = el.placeholder;
      const lbl = el.getAttribute('aria-label') || el.getAttribute('title');
      if (lbl) item.label = lbl;
      const text = (el.innerText || el.value || '').trim().substring(0, 60);
      if (text) item.text = text;
      // Best-guess selector
      if (el.id) item.selector = `#${el.id}`;
      else if (el.name) item.selector = `${el.tagName.toLowerCase()}[name="${el.name}"]`;
      return item;
    });
  return { ok: true, result };
}

function dispatchAgentAction(action) {
  try {
    switch (action.type) {
      case 'click':                    return agentClick(action);
      case 'fill':                     return agentFill(action);
      case 'select':                   return agentSelect(action);
      case 'scroll':                   return agentScroll(action);
      case 'hover':                    return agentHover(action);
      case 'drag_drop':                return agentDragDrop(action);
      case 'get_dom_snapshot':         return agentGetDomSnapshot(action);
      case 'get_interactive_elements': return agentGetInteractiveElements();
      default: return { ok: false, error: `Unknown agent action type: "${action.type}"` };
    }
  } catch (err) {
    return { ok: false, error: `Agent runtime error: ${err.message}` };
  }
}

// ── Message Listener ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'GET_CONTEXT') {
    sendResponse({ ok: true, payload: getPageContext() });
  } else if (request.type === 'AGENT_ACTION') {
    // Execute a browser agent action dispatched by background/agent_tools.js
    const result = dispatchAgentAction(request.action);
    sendResponse(result);
  }
});
