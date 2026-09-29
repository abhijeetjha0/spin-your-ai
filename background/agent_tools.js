/**
 * agent_tools.js — Built-in browser agent tool definitions and executor.
 *
 * Design decisions:
 * - SAFE actions (fill, scroll, hover, get_dom_snapshot, get_interactive_elements): auto-execute, no confirmation.
 * - DESTRUCTIVE actions (click, select, drag_drop): require user confirmation via sidepanel banner.
 * - Tab is frozen at the time of the first agent action in a turn (tab switches don't affect execution).
 * - Sensitive fields (password, api_key, token, etc.) are blocked in browser_fill at the content-script level.
 * - Errors are reported to the user; no auto-retry.
 */

// Actions that require user confirmation before executing
const DESTRUCTIVE_ACTIONS = new Set(['click', 'select', 'drag_drop', 'navigate']);

// Pending confirmation promises keyed by a unique request ID
const pendingConfirmations = new Map();

/**
 * Tool definitions (JSON Schema) to inject into the LLM alongside MCP tools.
 */
export const BROWSER_AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'browser_get_dom_snapshot',
      description: 'Returns a simplified snapshot of the current page\'s DOM structure so you can identify elements to interact with. Call this first before performing any action on the page.',
      parameters: {
        type: 'object',
        properties: {
          depth: { type: 'integer', description: 'Max DOM depth to traverse. Default 4.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_interactive_elements',
      description: 'Returns all interactive elements (buttons, inputs, links, selects, textareas) visible on the current page with their selectors. Use this to understand what you can interact with before clicking or filling.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an element on the page. Provide either a CSS selector or the visible text of the element.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the element to click (e.g. "#submit-btn", "button.primary").' },
          text:     { type: 'string', description: 'Visible text label of the element (e.g. "Submit", "Sign In"). Used if selector is not provided.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_fill',
      description: 'Fill one or multiple input fields/textareas. Provide an array of inputs to fill out entire forms in a single tool call. Sensitive fields (password, API key, token) are blocked automatically.',
      parameters: {
        type: 'object',
        properties: {
          inputs: {
            type: 'array',
            description: 'List of fields to fill. You should batch multiple fields here whenever possible.',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: 'CSS selector of the input field.' },
                label:    { type: 'string', description: 'Label text or placeholder of the input. Used if selector is not provided.' },
                value:    { type: 'string', description: 'The text to type into the field.' }
              },
              required: ['value']
            }
          }
        },
        required: ['inputs']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_select',
      description: 'Select an option in a <select> dropdown element.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the <select> element.' },
          label:    { type: 'string', description: 'Label of the dropdown. Used if selector is not provided.' },
          value:    { type: 'string', description: 'The option value or visible text to select.' }
        },
        required: ['value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_scroll',
      description: 'Scroll the page in a given direction.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], description: 'Direction to scroll.' },
          amount:    { type: 'integer', description: 'Pixels to scroll. Ignored for "top" and "bottom". Default 300.' }
        },
        required: ['direction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_hover',
      description: 'Hover over an element to trigger hover states or reveal dropdown menus.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the element to hover.' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_drag_drop',
      description: 'Drag an element and drop it onto another element using HTML5 drag-and-drop.',
      parameters: {
        type: 'object',
        properties: {
          source_selector: { type: 'string', description: 'CSS selector of the element to drag.' },
          target_selector: { type: 'string', description: 'CSS selector of the drop target.' }
        },
        required: ['source_selector', 'target_selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Navigate the browser. Use this to go back, forward, reload, or jump to a specific URL.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['back', 'forward', 'reload', 'url'], description: 'The navigation action to perform.' },
          url:    { type: 'string', description: 'The URL to navigate to. Required if action is "url".' }
        },
        required: ['action']
      }
    }
  }
];

/**
 * Strips the "browser_" prefix and maps tool name to action type.
 */
function toolNameToActionType(toolName) {
  return toolName.replace(/^browser_/, '');
}

/**
 * Executes a browser agent tool.
 * @param {string} toolName  - e.g. "browser_click"
 * @param {object} args      - tool arguments from the LLM
 * @param {number} frozenTabId - tab ID frozen at the start of the chat turn
 * @returns {Promise<any>}   - result to feed back to the LLM
 */
export async function executeAgentTool(toolName, args, frozenTabId) {
  const actionType = toolNameToActionType(toolName);

  // Verify tab still exists
  let tab;
  try {
    tab = await chrome.tabs.get(frozenTabId);
  } catch (_) {
    return { ok: false, error: `Tab ${frozenTabId} no longer exists. The page may have been closed.` };
  }

  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
    return { ok: false, error: 'Cannot perform browser actions on internal Chrome pages.' };
  }

  // Destructive actions require user confirmation
  if (DESTRUCTIVE_ACTIONS.has(actionType)) {
    const allowed = await requestConfirmation(toolName, args);
    if (!allowed) {
      return { ok: false, error: 'Action denied by user.' };
    }
  }

  // Execute navigation directly via background API
  if (actionType === 'navigate') {
    return new Promise((resolve) => {
      const { action, url } = args;
      if (action === 'back') {
         chrome.tabs.goBack(frozenTabId).then(() => resolve({ok:true, result:'Navigated back'})).catch(e => resolve({ok:false, error:e.message}));
      } else if (action === 'forward') {
         chrome.tabs.goForward(frozenTabId).then(() => resolve({ok:true, result:'Navigated forward'})).catch(e => resolve({ok:false, error:e.message}));
      } else if (action === 'reload') {
         chrome.tabs.reload(frozenTabId).then(() => resolve({ok:true, result:'Page reloaded'})).catch(e => resolve({ok:false, error:e.message}));
      } else if (action === 'url' && url) {
         chrome.tabs.update(frozenTabId, {url}).then(() => resolve({ok:true, result:`Navigated to ${url}`})).catch(e => resolve({ok:false, error:e.message}));
      } else {
         resolve({ok:false, error:'Invalid navigate action or missing url'});
      }
    });
  }

  // Execute via the persistent content script (already injected on all_urls).
  // This avoids needing host_permissions for chrome.scripting.executeScript().
  try {
    const action = { type: actionType, ...args };
    const result = await chrome.tabs.sendMessage(frozenTabId, {
      type: 'AGENT_ACTION',
      action
    });
    return result ?? { ok: false, error: 'No response from content script. Try refreshing the page.' };
  } catch (err) {
    return { ok: false, error: `Could not reach content script on this tab: ${err.message}. Try refreshing the page.` };
  }
}

/**
 * Sends a confirmation request to the sidepanel and waits for the user's response.
 * Returns true if approved, false if denied/timed-out.
 */
function requestConfirmation(toolName, args) {
  return new Promise((resolve) => {
    const requestId = `confirm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    pendingConfirmations.set(requestId, resolve);

    chrome.runtime.sendMessage({
      type: 'AGENT_CONFIRM_ACTION',
      payload: { requestId, toolName, args }
    }).catch(() => {
      // Sidepanel may not be open; auto-deny
      pendingConfirmations.delete(requestId);
      resolve(false);
    });

    // Auto-deny after 60 seconds if no response
    setTimeout(() => {
      if (pendingConfirmations.has(requestId)) {
        pendingConfirmations.delete(requestId);
        resolve(false);
      }
    }, 60000);
  });
}

/**
 * Called by background.js when the sidepanel sends back an approval/denial.
 * @param {string} requestId
 * @param {boolean} approved
 */
export function resolveConfirmation(requestId, approved) {
  if (pendingConfirmations.has(requestId)) {
    pendingConfirmations.get(requestId)(approved);
    pendingConfirmations.delete(requestId);
  }
}
