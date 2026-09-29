/**
 * agent.js — Browser Agent DOM executor.
 * Injected on-demand into the active tab via chrome.scripting.executeScript().
 * Each call passes an `action` object: { type, ...args }
 * Returns { ok: boolean, result?, error? }
 */

(function runAgentAction(action) {

  // --- Sensitive field guard ---
  const SENSITIVE_PATTERNS = /password|passwd|pwd|api[_\-]?key|apikey|token|secret|auth|credential/i;

  function isSensitiveField(el) {
    if (!el) return false;
    if (el.type === 'password') return true;
    const haystack = [el.name, el.id, el.placeholder, el.getAttribute('autocomplete')].join(' ');
    return SENSITIVE_PATTERNS.test(haystack);
  }

  // --- Element resolution ---
  function resolveElement(selector, text, label) {
    // 1. CSS selector
    if (selector) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (_) {}
    }
    // 2. Label text match (for inputs)
    if (label) {
      const labels = Array.from(document.querySelectorAll('label'));
      for (const lbl of labels) {
        if (lbl.textContent.trim().toLowerCase().includes(label.toLowerCase())) {
          if (lbl.htmlFor) {
            const el = document.getElementById(lbl.htmlFor);
            if (el) return el;
          }
          const input = lbl.querySelector('input, textarea, select');
          if (input) return input;
        }
      }
      // Placeholder match
      const byPlaceholder = document.querySelector(
        `input[placeholder*="${label}" i], textarea[placeholder*="${label}" i]`
      );
      if (byPlaceholder) return byPlaceholder;
    }
    // 3. Visible text match (for buttons/links)
    if (text) {
      const candidates = document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]');
      for (const el of candidates) {
        if (el.textContent.trim().toLowerCase().includes(text.toLowerCase())) return el;
      }
    }
    return null;
  }

  // --- Actions ---

  function doClick(args) {
    const el = resolveElement(args.selector, args.text, null);
    if (!el) return { ok: false, error: `Element not found (selector: "${args.selector}", text: "${args.text}")` };
    el.focus();
    el.click();
    return { ok: true, result: `Clicked: ${el.tagName} "${el.textContent.trim().substring(0, 60)}"` };
  }

  function doFill(args) {
    const el = resolveElement(args.selector, null, args.label);
    if (!el) return { ok: false, error: `Input not found (selector: "${args.selector}", label: "${args.label}")` };
    if (isSensitiveField(el)) return { ok: false, error: 'Blocked: target field is a sensitive field (password / API key / token). Fill this manually.' };
    el.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
                                   Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    if (nativeInputValueSetter && nativeInputValueSetter.set) {
      nativeInputValueSetter.set.call(el, args.value);
    } else {
      el.value = args.value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, result: `Filled "${args.label || args.selector}" with value (${args.value.length} chars)` };
  }

  function doSelect(args) {
    const el = resolveElement(args.selector, null, args.label);
    if (!el || el.tagName !== 'SELECT') return { ok: false, error: `Select element not found (selector: "${args.selector}", label: "${args.label}")` };
    const options = Array.from(el.options);
    const match = options.find(o =>
      o.value.toLowerCase() === args.value.toLowerCase() ||
      o.text.toLowerCase().includes(args.value.toLowerCase())
    );
    if (!match) return { ok: false, error: `Option "${args.value}" not found in select. Available: ${options.map(o => o.text).join(', ')}` };
    el.value = match.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, result: `Selected "${match.text}" in dropdown` };
  }

  function doScroll(args) {
    const amount = args.amount || 300;
    switch (args.direction) {
      case 'top':    window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'bottom': window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); break;
      case 'up':     window.scrollBy({ top: -amount, behavior: 'smooth' }); break;
      case 'down':   window.scrollBy({ top: amount, behavior: 'smooth' }); break;
      default: return { ok: false, error: `Unknown scroll direction "${args.direction}"` };
    }
    return { ok: true, result: `Scrolled ${args.direction}` };
  }

  function doHover(args) {
    const el = resolveElement(args.selector, null, null);
    if (!el) return { ok: false, error: `Element not found (selector: "${args.selector}")` };
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    return { ok: true, result: `Hovered over ${el.tagName}` };
  }

  function doDragDrop(args) {
    const src = resolveElement(args.source_selector, null, null);
    const tgt = resolveElement(args.target_selector, null, null);
    if (!src) return { ok: false, error: `Drag source not found (selector: "${args.source_selector}")` };
    if (!tgt) return { ok: false, error: `Drop target not found (selector: "${args.target_selector}")` };
    const dataTransfer = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    tgt.dispatchEvent(new DragEvent('dragover',  { bubbles: true, dataTransfer }));
    tgt.dispatchEvent(new DragEvent('drop',      { bubbles: true, dataTransfer }));
    src.dispatchEvent(new DragEvent('dragend',   { bubbles: true, dataTransfer }));
    return { ok: true, result: `Dragged from "${args.source_selector}" to "${args.target_selector}"` };
  }

  function doGetDomSnapshot(args) {
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
      if (node.id) obj.id = node.id;
      if (node.className && typeof node.className === 'string') obj.class = node.className.trim().substring(0, 60);
      if (node.getAttribute) {
        const role = node.getAttribute('role'); if (role) obj.role = role;
        const type = node.getAttribute('type'); if (type) obj.type = type;
        const name = node.getAttribute('name'); if (name) obj.name = name;
        const placeholder = node.getAttribute('placeholder'); if (placeholder) obj.placeholder = placeholder;
        const href = node.getAttribute('href'); if (href) obj.href = href.substring(0, 80);
        const ariaLabel = node.getAttribute('aria-label'); if (ariaLabel) obj.ariaLabel = ariaLabel;
      }
      const text = (node.innerText || '').trim().substring(0, 80);
      if (text && !['div', 'span', 'section', 'main', 'article', 'header', 'footer', 'nav', 'ul', 'ol', 'li', 'form'].includes(tag)) {
        obj.text = text;
      }
      const children = Array.from(node.childNodes)
        .map(c => traverse(c, depth + 1))
        .filter(Boolean);
      if (children.length) obj.children = children;
      return obj;
    }
    return { ok: true, result: traverse(document.body, 0) };
  }

  function doGetInteractiveElements() {
    const selectors = 'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
    const els = Array.from(document.querySelectorAll(selectors));
    const result = els
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !el.disabled;
      })
      .slice(0, 100) // cap at 100
      .map(el => {
        const item = { tag: el.tagName.toLowerCase() };
        if (el.id) item.id = `#${el.id}`;
        if (el.name) item.name = el.name;
        if (el.type) item.type = el.type;
        if (el.placeholder) item.placeholder = el.placeholder;
        const label = el.getAttribute('aria-label') || el.getAttribute('title');
        if (label) item.label = label;
        const text = (el.innerText || el.value || '').trim().substring(0, 60);
        if (text) item.text = text;
        // Build a best-guess selector
        if (el.id) {
          item.selector = `#${CSS.escape(el.id)}`;
        } else if (el.name) {
          item.selector = `${el.tagName.toLowerCase()}[name="${el.name}"]`;
        }
        return item;
      });
    return { ok: true, result };
  }

  // --- Dispatch ---
  try {
    switch (action.type) {
      case 'click':                   return doClick(action);
      case 'fill':                    return doFill(action);
      case 'select':                  return doSelect(action);
      case 'scroll':                  return doScroll(action);
      case 'hover':                   return doHover(action);
      case 'drag_drop':               return doDragDrop(action);
      case 'get_dom_snapshot':        return doGetDomSnapshot(action);
      case 'get_interactive_elements': return doGetInteractiveElements();
      default: return { ok: false, error: `Unknown action type: "${action.type}"` };
    }
  } catch (err) {
    return { ok: false, error: `Agent runtime error: ${err.message}` };
  }

})(AGENT_ACTION_PLACEHOLDER);
