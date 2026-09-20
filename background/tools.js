import { vault } from './vault.js';

/**
 * Executes a tool based on the name and arguments provided by the LLM.
 * @param {string} toolName 
 * @param {object} args 
 * @returns {Promise<any>}
 */
export async function executeTool(toolName, args) {
  if (toolName.startsWith('mcp_')) {
    // Tool name format: mcp_serverKey__originalToolName
    const parts = toolName.split('__');
    const serverKey = parts[0].replace('mcp_', '');
    const originalToolName = parts.slice(1).join('__');

    const configData = await vault.getConfig('mcp');
    if (configData && configData.configJson && configData.enabled !== false) {
      try {
        const config = JSON.parse(configData.configJson);
        const serverConf = config.mcpServers?.[serverKey];
        
        if (serverConf) {
          const url = serverConf.url || serverConf.serverUrl;
          if (url && (serverConf.command === 'http' || serverConf.type === 'http' || !serverConf.command)) {
            const headers = { 
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/event-stream'
            };
            
            // Map env vars to headers (standard practice for simple HTTP MCP servers)
            if (serverConf.env) {
              for (const [k, v] of Object.entries(serverConf.env)) {
                headers[k] = v;
              }
            }
            if (serverConf.headers) {
              for (const [k, v] of Object.entries(serverConf.headers)) {
                headers[k] = v;
              }
            }

            const res = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify({ 
                jsonrpc: '2.0', 
                id: Date.now(), 
                method: 'tools/call',
                params: { name: originalToolName, arguments: args }
              })
            });

            if (!res.ok) {
              throw new Error(`HTTP ${res.status} from MCP Server`);
            }

            const contentType = res.headers.get('content-type') || '';
            let data;
            
            if (contentType.includes('text/event-stream')) {
              const text = await res.text();
              const match = text.match(/data:\s*({.*})/);
              if (match && match[1]) {
                data = JSON.parse(match[1]);
              } else {
                throw new Error('Invalid SSE response from MCP server');
              }
            } else {
              data = await res.json();
            }

            if (data.error) throw new Error(data.error.message || 'MCP Error');
            
            return data.result || data;
          }
        }
      } catch (err) {
        throw new Error(`Failed to execute MCP tool: ${err.message}`);
      }
    }
  }
  
  throw new Error(`Tool ${toolName} not found or MCP server not configured`);
}

/**
 * Returns the array of tool definitions (JSON Schema) to inject into the LLM payload.
 */
export async function getActiveTools() {
  const tools = [];
  
  const configData = await vault.getConfig('mcp');
  if (!configData || !configData.configJson || configData.enabled === false) return tools;

  try {
    const config = JSON.parse(configData.configJson);
    if (!config.mcpServers) return tools;

    for (const [serverKey, serverConf] of Object.entries(config.mcpServers)) {
      const url = serverConf.url || serverConf.serverUrl;
      if (url && (serverConf.command === 'http' || serverConf.type === 'http' || !serverConf.command)) {
        
        const headers = { 
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        };
        if (serverConf.env) {
          for (const [k, v] of Object.entries(serverConf.env)) {
            headers[k] = v;
          }
        }
        if (serverConf.headers) {
          for (const [k, v] of Object.entries(serverConf.headers)) {
            headers[k] = v;
          }
        }

        try {
          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
          });
          
          if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            let data;

            if (contentType.includes('text/event-stream')) {
              const text = await res.text();
              const match = text.match(/data:\s*({.*})/);
              if (match && match[1]) {
                data = JSON.parse(match[1]);
              } else {
                console.warn(`MCP Server ${serverKey} returned unparseable SSE:`, text);
                continue;
              }
            } else {
              data = await res.json();
            }

            if (data.result && data.result.tools) {
              for (const t of data.result.tools) {
                tools.push({
                  type: 'function',
                  function: {
                    // Prefix tool names to avoid cross-server collisions
                    name: `mcp_${serverKey}__${t.name}`,
                    description: t.description || '',
                    parameters: t.inputSchema || { type: 'object', properties: {} }
                  }
                });
              }
            }
          } else {
            const errText = await res.text();
            console.warn(`MCP Server ${serverKey} returned HTTP ${res.status} for tools/list:`, errText);
          }
        } catch (fetchErr) {
          console.warn(`Could not connect to MCP Server ${serverKey}:`, fetchErr);
        }
      }
    }
  } catch (e) {
    console.error('MCP getActiveTools JSON parsing error:', e);
  }

  return tools;
}
