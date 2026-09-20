# Spin Your AI 🚀

A Manifest V3 Chrome Extension that lets you spin up AI models directly from your browser. Connect to local models, cloud APIs, developer platforms, and MCP servers — all while keeping your credentials entirely secure on your device.

## Features

- **Persistent Chat Interface:** Accessible anytime via the Chrome side panel.
- **Full Configuration:** Manage all your providers and API keys through a dedicated options page.
- **100% Privacy:** Your API keys are stored in `chrome.storage.local` and never leave your device.
- **Provider Auto-Discovery:** Automatically detects local agent frameworks like OpenClaw and Hermes Desktop.

## Supported Providers

- **Local:** Ollama, Hermes Desktop (Nous Research)
- **Cloud:** OpenAI, Anthropic (Claude), Google Gemini, Ollama Cloud
- **Aggregators:** OpenRouter, OpenCode Zen
- **Dev Platforms:** OpenCode

## Configuration

### Ollama (Local)
By default, the Ollama server rejects API requests from browser extensions due to strict CORS (Cross-Origin Resource Sharing) policies. To allow Spin Your AI to connect to your local Ollama instance, you must configure Ollama to allow all origins using the `OLLAMA_ORIGINS` environment variable.

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

## Future Opportunities

- **n8n Webhook Integration:** Trigger complex workflow automations directly from the extension.
- **GitHub Copilot Integration:** Via Native SDK or a lightweight agent bridge for developers.
- **Full MCP Integration:** Support for MCP servers with true tool-calling and agentic behavior.
- **Local History:** Fully persistent conversation history stored in the browser.

## License
MIT
