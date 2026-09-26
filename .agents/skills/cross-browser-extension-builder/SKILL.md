---
name: cross-browser-extension-builder
description: >-
  Guides the creation and development of cross-browser web extensions
  (Chrome, Firefox, Safari, Edge) using Manifest V3 and industry standards
  like webextension-polyfill.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.0.0"
---

# 📝 Skill: cross-browser-extension-builder

Use this skill whenever asked to create, update, or debug a cross-browser extension targeting modern browsers (Chrome, Firefox, Edge, Safari).

---

## 📌 Core Rules & Workflow for AI Agents

### 1. Architecture & Setup

- **Manifest Version**: STRICTLY enforce **Manifest V3**. Do not use Manifest V2 unless explicitly maintaining an old legacy extension.
- **Cross-Browser Compatibility**:
  - Recommend using `webextension-polyfill` (by Mozilla) to standardize the API namespace to `browser.*` and use Promises instead of callbacks (the default `chrome.*` API behavior in older Chrome APIs).
  - Use conditional logic or build tools (like Vite/Webpack) to handle browser-specific manifest differences (e.g., Firefox requires `browser_specific_settings.gecko.id`, Chrome does not).
- **Scaffolding**: Recommend modern build chains. E.g., using Vite with a plugin like `@crxjs/vite-plugin` or similar boilerplates.

### 2. Extension Components (Manifest V3 Specifics)

- **Service Workers (Background Scripts)**:
  - In Manifest V3, background pages are replaced by **Service Workers**.
  - **Crucial Rule**: Service workers are ephemeral. They can terminate at any time. **Do not use global variables to store state.** Use `chrome.storage.local` or `chrome.storage.session` for state persistence.
  - Must be registered in the manifest under `"background": { "service_worker": "background.js" }`.
- **Content Scripts**:
  - Used to interact with web pages.
  - They run in an isolated world. They cannot directly access the page's JavaScript context (variables/functions), only the DOM. Use `window.postMessage` to communicate with the page's execution environment if necessary.
- **Action (Popup)**:
  - Manifest V3 unifies `browser_action` and `page_action` into `"action"`.
- **Permissions**:
  - Adhere to the principle of least privilege. Only request what is strictly necessary.
  - Differentiate between `"permissions"` (API access) and `"host_permissions"` (URL matching).
  - Prefer `"activeTab"` over broad host permissions when possible to improve security and user trust.

### 3. Messaging

- Establish robust communication between extension components using `chrome.runtime.sendMessage` / `browser.runtime.sendMessage` and `chrome.runtime.onMessage.addListener`.
- **Warning**: Due to the ephemeral nature of Service Workers, ensure the background script is listening synchronously at the top level, and handle cases where the receiving end might not exist.

### 4. Storage & Data

- Avoid `localStorage`. It is not accessible in Service Workers.
- Use `chrome.storage.local` (or `browser.storage.local`) for persistent data.
- Use `chrome.storage.sync` for user settings that should sync across devices.
- Use `chrome.storage.session` (new in MV3) for in-memory data that should survive Service Worker restarts but not browser restarts.

### 5. Security & CSP

- Manifest V3 forbids remote code execution. You cannot load external JavaScript via `<script src="https://...">` in extension pages. All code must be bundled within the extension package.
- Inline scripts (`<script>...</script>`) and `eval()` are blocked by default in extension HTML pages. Use external script tags pointing to local files.

### 6. Development & Debugging

- **Chrome**: Load unpacked extensions via `chrome://extensions`. Inspect service workers by clicking "Service worker" on the extension card.
- **Firefox**: Load temporary add-ons via `about:debugging`.
- When generating code for debugging, remind the user to reload the extension after changes (unless using an HMR setup like CRXJS).

---

## 🚫 Anti-Patterns

- **Don't** generate Manifest V2 code.
- **Don't** use global variables in `background.js` (Service Worker) to hold state across events.
- **Don't** request `<all_urls>` permission if the extension only needs to operate on a specific domain or the currently active tab.
- **Don't** use `XMLHttpRequest` in Service Workers. Use `fetch()`.
