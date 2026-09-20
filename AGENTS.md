# Spin Your AI - Agent Rules & Guidelines

Welcome to **Spin Your AI**, a Chrome Extension (Manifest V3) designed to spin up AI models directly from the browser sidebar, supporting a wide range of cloud and local providers (OpenAI, Anthropic, Gemini, OpenRouter, OpenCode, MCP, etc.) with multimodality and page context awareness.

When contributing to this project, adhere to the following rules and design philosophies established by the user.

## 1. Design Language & UI/UX
- **Theme:** Strict Terminal / Hacker aesthetic. 
- **No Glassmorphism:** Avoid rounded corners, translucent backgrounds, or blurred backdrops. Use solid blocks, square corners, and sharp borders.
- **Typography:** Strictly use monospace fonts (`'Courier New', Courier, monospace`).
- **Color Palette (Monochrome Dark):**
  - **Main Background:** `#050505` (`--bg-color`)
  - **Panel/Header Background:** `#0a0a0a` (`--panel-bg`)
  - **Inputs/Dropdowns Background:** `#000`
  - **Borders:** `#333` (`--border-color`)
  - **Primary Text:** `#f8fafc` (`--text-main`)
  - **Muted Text:** `#94a3b8` (`--text-muted`)
- **Scrollbars:** Custom, dark, solid, and blocky. No `border-radius`. Thumb should be `#333`, track `#000`.
- **Loading States:** Use hacker-themed, randomized action phrases (e.g., "Bypassing mainframe...", "Synthesizing data...") during AI generation instead of static "Loading..." text.

## 2. Terminology & Copywriting
- **Proper Nouns:** Ensure all AI providers and services are capitalized correctly in the UI and toast notifications (e.g., "OpenAI", not "openai"; "OpenCode Zen", not "opencode_zen").
- **Reset vs. Delete:** Always use the term **"Reset"** instead of "Delete" when referring to clearing a configuration or deleting credentials.

## 3. Data Privacy & Security
- **Strictly Local:** Customer private keys and API credentials MUST never be leaked. All configuration data must be stored securely using `chrome.storage.local` (managed by `vault.js`). Do not use `chrome.storage.sync` or external endpoints to store credentials.

## 4. Architecture & Coding Practices
- **Vanilla Stack:** Use vanilla HTML, CSS, and JavaScript. Do not introduce Tailwind CSS or frontend frameworks (React, Vue, Next.js).
- **File Structure:**
  - `sidepanel/`: Contains the main Chat UI (`sidepanel.html`, `sidepanel.js`, `sidepanel.css`).
  - `options/`: Contains the Configuration UI. Follows standard entry file conventions (`index.html`, `index.js`, `index.css`).
  - `background/`: Contains the Service Worker (`background.js`) and provider logic (`providers/*.js`). Background script handles API streaming, connection testing, and MCP tool-calling (`tools.js`).
  - `content/`: Contains content scripts (`content.js`) for extracting webpage context.
- **Toasts:** Prevent toast notifications from stacking on top of each other. The UI should automatically clear any existing toasts before displaying a new one.
- **MCP Integration:** When adding tools or capabilities, use the dynamic Model Context Protocol (MCP) tool registry via `tools.js`. Ensure MCP configurations are stored as JSON in `vault.js`.

Follow these instructions whenever making modifications or adding new features to maintain the aesthetic integrity and security standards of the extension.
