import { BaseProvider } from './base.js';
import { parseSSE } from '../../shared/stream-parser.js';
import { getActiveTools, executeTool } from '../tools.js';
import { smartTruncate } from '../../shared/toolCache.js';
import { CacheMetricsService } from '../cache_metrics.js';

export class GeminiProvider extends BaseProvider {
  constructor(config) {
    super('gemini', config);
    this.apiKey = this.config.apiKey;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    
    this.defaultModels = [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
    ];
  }

  async getModels() {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`);
      if (!res.ok) throw new Error('Invalid API Key or network error');
      const data = await res.json();
      
      return data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => {
          const id = m.name.replace('models/', '');
          return { id, name: m.displayName || id };
        });
    } catch (e) {
      console.warn('Gemini models error:', e);
      return this.defaultModels;
    }
  }

  async *chat(modelId, messages, signal, frozenTabId, options = {}) {
    if (!this.apiKey) throw new Error('Gemini API Key is not configured.');

    const mcpTools = await getActiveTools(options);
    const maxToolTurns = options.maxToolTurns || (options.isSubagent ? 12 : 35);

    // Convert standard format to Gemini format
    const contents = messages.filter(m => m.role !== 'system').map(m => {
      // the base format uses 'assistant', Gemini uses 'model'
      const role = m.role === 'assistant' ? 'model' : 'user';
      let parts;
      
      if (Array.isArray(m.content)) {
        parts = m.content.map(part => {
          if (part.type === 'text') return { text: part.text };
          // Gemini supports inline_data for images, audio, video, PDFs
          return { inline_data: { mime_type: part.mimeType, data: part.data } };
        });
      } else {
        parts = [{ text: m.content }];
      }
      
      return { role, parts };
    });
    
    const systemInstruction = messages.filter(m => m.role === 'system').map(m => m.content).filter(Boolean).join('\n\n');
    let currentContents = [...contents];
    let toolCallCount = 0;

    while (true) {
      if (signal?.aborted) break;

      const body = { contents: currentContents };
      
      if (systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      if (mcpTools.length > 0) {
        
        // Gemini's REST API uses a strict OpenAPI 3.0 schema subset and rejects standard JSON Schema keywords
        // like $schema, exclusiveMinimum, default, etc. We must sanitize the schema.
        const sanitizeSchema = (schema) => {
          if (!schema || typeof schema !== 'object') return schema;
          if (Array.isArray(schema)) return schema.map(s => sanitizeSchema(s));

          const clean = {};
          const allowed = ['type', 'format', 'description', 'nullable', 'enum', 'maxItems', 'minItems', 'properties', 'required', 'items'];
          for (const k of allowed) {
            if (schema[k] !== undefined) {
              if (k === 'properties') {
                clean[k] = {};
                for (const [propName, propVal] of Object.entries(schema[k])) {
                  clean[k][propName] = sanitizeSchema(propVal);
                }
              } else if (k === 'items') {
                clean[k] = sanitizeSchema(schema[k]);
              } else {
                clean[k] = schema[k];
              }
            }
          }
          
          if (clean.type) {
            if (Array.isArray(clean.type)) {
              const actualType = clean.type.find(t => typeof t === 'string' && t.toLowerCase() !== 'null');
              if (clean.type.some(t => typeof t === 'string' && t.toLowerCase() === 'null')) {
                clean.nullable = true;
              }
              clean.type = actualType ? actualType.toUpperCase() : 'STRING';
            } else if (typeof clean.type === 'string') {
              clean.type = clean.type.toUpperCase();
            }
          }
          
          return clean;
        };

        const sortedTools = [...mcpTools].sort((a, b) => (a.function?.name || '').localeCompare(b.function?.name || ''));
        body.tools = [{
          function_declarations: sortedTools.map(t => ({
            name: t.function.name,
            description: t.function.description || 'No description',
            parameters: sanitizeSchema(t.function.parameters)
          }))
        }];
      }

      // append &alt=sse to use standard SSE
      const res = await fetch(`${this.baseUrl}/models/${modelId}:streamGenerateContent?key=${this.apiKey}&alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Gemini Error: ${res.status}`);
      }

      let toolCallsBuffer = [];
      let modelParts = [];

      for await (const data of parseSSE(res)) {
        if (signal?.aborted) break;

        if (data.usageMetadata) {
          const normalized = CacheMetricsService.normalizeUsage(data.usageMetadata, 'gemini');
          if (normalized) {
            yield { text: '', usage: normalized };
          }
        }

        const parts = data.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        
        for (const part of parts) {
          // Push the exact part to preserve thought_signature and other opaque fields
          modelParts.push(part);
          if (part.text) {
            yield part.text;
          } else if (part.functionCall) {
            toolCallsBuffer.push(part.functionCall);
          }
        }
      }

      if (signal?.aborted) break;

      if (toolCallsBuffer.length > 0) {
        toolCallCount++;
        if (toolCallCount > maxToolTurns) {
          yield `\n\n> <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;color:#f59e0b">warning</span> *Tool turn limit reached (${maxToolTurns} turns). Stopping automated execution to synthesize final response.*`;
          break;
        }

        // Append the model's exact generated parts to our history
        currentContents.push({
          role: 'model',
          parts: modelParts
        });

        for (const tc of toolCallsBuffer) {
           yield `\n\n> <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;color:#a78bfa">settings</span> *Executing tool \`${tc.name}\`...*\n\n`;
        }

        const functionResponses = await Promise.all(
          toolCallsBuffer.map(async (tc) => {
            if (signal?.aborted) {
              return {
                functionResponse: {
                  name: tc.name,
                  response: { error: 'Aborted by user' }
                }
              };
            }
            try {
              const result = await executeTool(tc.name, tc.args, frozenTabId, signal);
              let responsePayload = typeof result === 'object' && result !== null ? result : { result };
              const strRep = JSON.stringify(responsePayload);
              if (strRep.length > 8000) {
                responsePayload = {
                  result: smartTruncate(strRep, 8000)
                };
              }
              return {
                functionResponse: {
                  name: tc.name,
                  response: responsePayload
                }
              };
            } catch (e) {
              return {
                functionResponse: {
                  name: tc.name,
                  response: { error: e.message }
                }
              };
            }
          })
        );
        
        if (signal?.aborted) break;

        currentContents.push({
          role: 'user',
          parts: functionResponses
        });
        
        continue;
      }

      // No tool calls, generation is done
      break;
    }
  }
}
