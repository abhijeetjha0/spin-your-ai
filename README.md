# Spin Your AI

[![Coverage](https://img.shields.io/badge/coverage-95%25%2B-brightgreen.svg)](#)
[![Tests](https://img.shields.io/badge/tests-54%2F54%20passing-brightgreen.svg)](#)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Manifest V3 Chrome Extension that lets you spin up AI models directly from your browser sidebar. Connect to local models, cloud APIs, developer platforms, and MCP servers — all with strict local security and a terminal/hacker UI.

## Features

- **Terminal Aesthetics & Persistent Chat Interface:** Accessible anytime via the Chrome side panel, featuring a dark monochrome terminal theme, streaming token responses, collapsible reasoning/thought blocks (`<think>...</think>`), code copy blocks, smart auto-scrolling, and multi-session conversation management.
- **Tab-Scoped Chat Isolation:** Each browser tab maintains its own isolated conversation session keyed by `tabId`. Opening or switching to a new tab starts with a clean, fresh chatbox without saving empty sessions until you send a message. Navigating back to any previously opened tab immediately restores that tab's session history, context compaction, and in-flight stream.
- **Browser Automation Agent:** The AI can autonomously navigate, click, scroll, extract text, and batch-fill forms on your behalf using native DOM integration, acting as an autonomous web agent. Safe read actions run automatically, while destructive actions (clicks, navigation) require explicit user approval via interactive prompt cards. Includes frozen-tab execution so you can switch tabs without breaking agent flow.
- **Multimodal Sub-Agent Architecture & Live Monitor:** Autonomously spin up specialized sub-agents (`spin_subagent`) for multimodal diagram/image analysis, isolated code inspection, or deep research with dedicated, preserved context. Includes a header counter badge (`N Working`), interactive Sub-Agents Monitor modal to inspect sub-agent reasoning, context snapshots, and individual or bulk force-termination.
- **Slash Commands & Dynamic Workspace Skills:** Quick keyboard-driven control triggered by typing `/` in the chat input. Features an interactive autocomplete popover with fuzzy filtering, category badges (System, Builtin, Skill), and dynamic discovery of workspace skills from `.agents/skills/**/SKILL.md` parsed via YAML frontmatter.
- **In-Memory Tool Caching & Smart Output Truncation:** Idempotent tool outputs (DOM reads, page text context) are cached in memory to eliminate redundant roundtrips. Any state mutation instantly invalidates the cache. Oversized tool results are safely preserved using head & tail line truncation with omission counters.
- **Chat & Context Compaction:** Condense verbose earlier turns into an executive summary on demand (via `/compact` or the UI badge) or automatically when exceeding turn or token thresholds, slashing token consumption and latency while preserving full conversation context.
- **100% Local Privacy:** Your API keys and configuration credentials are encrypted in `chrome.storage.local` and never leave your device.
- **Searchable Combobox & Provider Toggles:** Easily search and filter models across providers, attach multimodal files and images, and enable or disable individual providers to declutter your workflow.

## Supported Providers

- **Local:** Ollama, Hermes Desktop (Nous Research), OpenCode (with Basic Auth support), OpenClaw
- **Cloud:** OpenAI, Anthropic (Claude), Google Gemini (with reasoning models support), Ollama Cloud, Hugging Face
- **Aggregators:** OpenRouter, OpenCode Zen
- **MCP Servers:** Dynamic Model Context Protocol (HTTP/SSE) server integration with automated tool execution.

## Configuration

### Ollama (Local)
By default, the Ollama server rejects API requests from browser extensions due to strict Cross-Origin Resource Sharing (CORS) policies. To allow Spin Your AI to connect to your local Ollama instance, configure Ollama to allow all origins using the `OLLAMA_ORIGINS` environment variable.

**macOS / Linux (Terminal):**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

**macOS (Ollama App):**
1. Quit the Ollama application.
2. Run `launchctl setenv OLLAMA_ORIGINS "*"` in your terminal.
3. Restart the Ollama application.

**Windows:**
Set the `OLLAMA_ORIGINS` environment variable to `*` in your system environment variables before launching Ollama.

### Model Context Protocol (MCP)
Spin Your AI fully supports Tool Calling (Agentic mode) via the Model Context Protocol (MCP). 
When using capable models (e.g., **OpenAI**, **Gemini**, **Ollama Cloud**), the model autonomously discovers and executes tools from your MCP servers directly in the browser!

Currently, **HTTP/SSE based MCP Servers** (like the n8n MCP Server) are supported natively in the browser without requiring a native messaging host. The server must support `text/event-stream` for tool execution responses.

To configure MCP servers, provide a JSON configuration object in the Options page:
```json
{
  "mcpServers": {
    "n8n": {
      "command": "http",
      "url": "http://localhost:5678/api/v1/mcp",
      "env": {
        "N8N_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Local Agent Frameworks
- **Hermes Desktop:** Connects to `http://localhost:8642/v1`.
- **OpenCode:** Connects to `http://localhost:3000` or `http://localhost:4096` with optional Basic Authentication credentials.
- **OpenClaw:** Connects to `http://localhost:3141`.

## Development & Testing

### Prerequisites
- Node.js 18+
- npm

### Running Tests
Execute the unit test suite using Node's built-in test runner:
```bash
npm test
```

### Loading in Chrome
1. Navigate to `chrome://extensions/` in Chrome.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the extension repository root.
4. Open the Chrome side panel and select **Spin Your AI** to start chatting.

## License
MIT
