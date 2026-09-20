import { BaseProvider } from './base.js';
import { parseSSE } from '../../shared/stream-parser.js';
import { getActiveTools, executeTool } from '../tools.js';

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

  async *chat(modelId, messages, signal) {
    if (!this.apiKey) throw new Error('Gemini API Key is not configured.');

    const mcpTools = await getActiveTools();

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
    
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    let currentContents = [...contents];
    let toolCallCount = 0;

    while (true) {
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

        body.tools = [{
          function_declarations: mcpTools.map(t => ({
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

      if (toolCallsBuffer.length > 0) {
        toolCallCount++;
        if (toolCallCount > 5) {
          throw new Error('Too many sequential tool calls. The model is stuck in a loop.');
        }

        // Append the model's exact generated parts to our history
        currentContents.push({
          role: 'model',
          parts: modelParts
        });

        const functionResponses = [];
        for (const tc of toolCallsBuffer) {
           yield `\n\n> ⚙️ *Executing tool: ${tc.name}...*\n\n`;
           try {
             const result = await executeTool(tc.name, tc.args);
             const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result);
             
             functionResponses.push({
               functionResponse: {
                 name: tc.name,
                 response: typeof result === 'object' && result !== null ? result : { result }
               }
             });
           } catch(e) {
              yield `\n\n> ❌ *Tool error: ${e.message}*\n\n`;
              functionResponses.push({
               functionResponse: {
                 name: tc.name,
                 response: { error: e.message }
               }
             });
           }
        }
        
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
