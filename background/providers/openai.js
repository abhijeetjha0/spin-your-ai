import { BaseProvider } from './base.js';
import { parseSSE } from '../../shared/stream-parser.js';
import { getActiveTools, executeTool } from '../tools.js';
import { smartTruncate } from '../../shared/toolCache.js';

export class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super('openai', config);
    this.apiKey = this.config.apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async getModels() {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!res.ok) throw new Error('Invalid API Key or network error');
      const data = await res.json();
      // Filter for chat models roughly
      return data.data
        .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1-'))
        .map(m => ({ id: m.id, name: m.id }));
    } catch (e) {
      console.warn('OpenAI error:', e);
      return [];
    }
  }

  async *chat(modelId, messages, signal, frozenTabId, options = {}) {
    if (this.config.apiKeyRequired !== false && !this.apiKey) {
      throw new Error(`${this.config.name || 'OpenAI'} API Key is not configured.`);
    }

    const tools = await getActiveTools(options);
    const maxToolTurns = options.maxToolTurns || (options.isSubagent ? 12 : 35);
    let toolTurns = 0;

    // Convert multimodal content to OpenAI format
    const formattedMessages = messages.map(m => {
      if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content.map(part => {
            if (part.type === 'text') return { type: 'text', text: part.text };
            if (part.type === 'image') {
              return { type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.data}` } };
            }
            return { type: 'text', text: `[Attached file: ${part.name} (${part.mimeType})]` };
          })
        };
      }
      return m;
    });

    let currentMessages = [...formattedMessages];

    while (true) {
      if (signal?.aborted) break;

      const payload = {
        model: modelId,
        messages: currentMessages,
        stream: true
      };
      
      if (this.supportsTools !== false && tools.length > 0) {
        payload.tools = tools;
      }

      const headers = { 'Content-Type': 'application/json' };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `OpenAI Error: ${res.status}`);
      }

      let toolCallsBuffer = {};

      for await (const data of parseSSE(res)) {
        if (signal?.aborted) break;
        if (!data.choices || data.choices.length === 0) continue;
        const delta = data.choices[0].delta;

        if (delta.content) {
          yield delta.content;
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallsBuffer[tc.index]) {
              toolCallsBuffer[tc.index] = { 
                id: tc.id, 
                type: 'function', 
                function: { name: tc.function?.name || '', arguments: '' } 
              };
            }
            if (tc.function?.arguments) {
              toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }
      }

      if (signal?.aborted) break;

      const toolCalls = Object.values(toolCallsBuffer);
      
      if (toolCalls.length > 0) {
        toolTurns++;
        if (toolTurns > maxToolTurns) {
          yield `\n\n> <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;color:#f59e0b">warning</span> *Tool turn limit reached (${maxToolTurns} turns). Stopping automated execution to synthesize final response.*`;
          break;
        }

        for (const tc of toolCalls) {
          yield `\n\n> <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;color:#a78bfa">settings</span> *Executing tool \`${tc.function.name}\`...*\n\n`;
        }
        
        currentMessages.push({
          role: 'assistant',
          tool_calls: toolCalls,
          content: null
        });

        const toolResults = await Promise.all(
          toolCalls.map(async (tc) => {
            if (signal?.aborted) {
              return {
                role: 'tool',
                tool_call_id: tc.id,
                content: 'Aborted by user'
              };
            }
            try {
              const args = JSON.parse(tc.function.arguments);
              const result = await executeTool(tc.function.name, args, frozenTabId, signal);
              let contentStr = typeof result === 'string' ? result : JSON.stringify(result);
              contentStr = smartTruncate(contentStr, 8000);
              return {
                role: 'tool',
                tool_call_id: tc.id,
                content: contentStr
              };
            } catch (err) {
              return {
                role: 'tool',
                tool_call_id: tc.id,
                content: `Error executing tool: ${err.message}`
              };
            }
          })
        );

        if (signal?.aborted) break;

        for (const tr of toolResults) {
          currentMessages.push(tr);
        }
        
        // Loop continues to send tool result back to the model
        continue;
      }

      // No tool calls, generation is done
      break;
    }
  }
}
