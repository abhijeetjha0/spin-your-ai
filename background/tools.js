import { vault } from './vault.js';
import { BROWSER_AGENT_TOOLS, executeAgentTool, resolveConfirmation, resolveModeSelection } from './agent_tools.js';
import { subagentManager } from '../shared/subagentManager.js';

export { resolveConfirmation, resolveModeSelection, subagentManager };

export const MAX_SUBAGENTS_PER_TURN = 5;

let currentActiveContext = {
  provider: null,
  modelId: 'default',
  attachments: [],
  pageContext: null,
  turnSubagentCount: 0
};

export function setCurrentActiveContext(ctx = {}) {
  currentActiveContext = { ...currentActiveContext, ...ctx };
}

export function resetTurnSubagentCount() {
  currentActiveContext.turnSubagentCount = 0;
}

// Track execution depth to prevent recursive sub-agent nesting
let subagentRunningDepth = 0;
subagentManager.setExecutionHooks(
  () => { subagentRunningDepth++; },
  () => { subagentRunningDepth = Math.max(0, subagentRunningDepth - 1); }
);

// Subagent tool schema
export const SUBAGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'spin_subagent',
      description: 'Spin up a specialized, autonomous sub-agent to handle a focused subtask (e.g. image/diagram inspection, isolated code analysis, DOM parsing, data extraction, or deep research). Maintains its own isolated context and returns a comprehensive result. Specify subagent_id to resume an existing sub-agent. IMPORTANT: Only spin the exact number of sub-agents requested by the user. Do not spawn recursive or redundant sub-agents. Once all requested sub-agents complete, synthesize their results and directly answer the user.',
      parameters: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            description: 'The specialized role/persona of the sub-agent (e.g., "Multimodal Vision Analyst", "Code Inspector", "DOM Analyst", "Research Specialist").'
          },
          task: {
            type: 'string',
            description: 'The exact task, question, or goal the sub-agent must execute.'
          },
          context: {
            type: 'string',
            description: 'Optional background context, data, code, or details necessary for the sub-agent.'
          },
          subagent_id: {
            type: 'string',
            description: 'Optional ID of a previously spun sub-agent to continue its existing conversation context.'
          }
        },
        required: ['role', 'task']
      }
    }
  }
];

// Broadcast sub-agent status changes to UI
subagentManager.onStatusChange((payload) => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'SUBAGENT_STATUS_UPDATE',
      payload
    }).catch(() => {});
  }
});

/**
 * Executes a tool based on the name and arguments provided by the LLM.
 * @param {string} toolName 
 * @param {object} args 
 * @param {number} frozenTabId
 * @returns {Promise<any>}
 */
export async function executeTool(toolName, args, frozenTabId) {
  // Built-in autonomous subagent tool
  if (toolName === 'spin_subagent') {
    // 1. Strict Recursion Guard: Sub-agents are leaf agents and cannot spawn nested sub-agents
    if (subagentRunningDepth > 0) {
      return {
        error: 'Action blocked: Sub-agents are leaf agents and cannot spawn nested sub-agents. Please perform your assigned task directly.'
      };
    }

    // 2. Turn safety limit: Prevent infinite loop or over-delegation beyond limit
    if ((currentActiveContext.turnSubagentCount || 0) >= MAX_SUBAGENTS_PER_TURN) {
      return {
        error: `Turn sub-agent limit reached (maximum ${MAX_SUBAGENTS_PER_TURN} sub-agents per turn). Do not spin any more sub-agents. Synthesize the findings from the sub-agents above and provide your final response to the user now.`
      };
    }
    currentActiveContext.turnSubagentCount = (currentActiveContext.turnSubagentCount || 0) + 1;

    return await subagentManager.spinSubagent({
      role: args.role,
      task: args.task,
      context: args.context,
      subagentId: args.subagent_id,
      provider: currentActiveContext.provider,
      modelId: currentActiveContext.modelId,
      attachments: currentActiveContext.attachments,
      pageContext: currentActiveContext.pageContext,
      frozenTabId
    });
  }

  // Built-in browser agent tools
  if (toolName.startsWith('browser_')) {
    return await executeAgentTool(toolName, args, frozenTabId);
  }

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
              const match = text.match(/data:\s*({[\s\S]*})/);
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
export async function getActiveTools(options = {}) {
  // Never expose spin_subagent to sub-agents to strictly prevent recursive spawning
  const isSub = options.isSubagent || subagentRunningDepth > 0;
  const tools = isSub ? [...BROWSER_AGENT_TOOLS] : [...BROWSER_AGENT_TOOLS, ...SUBAGENT_TOOLS];
  
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
              const match = text.match(/data:\s*({[\s\S]*})/);
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
