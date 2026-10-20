/**
 * Slash Commands Registry and Helpers
 * Standardized multimodal slash commands for Chrome Extension.
 * Note: Browser extension runs without a local workspace, so workspace skill discovery
 * is not used here (workspace skills belong to the VS Code extension).
 */

export const BASE_SLASH_COMMANDS = [
  // Multimodal System Prompts
  {
    name: 'plan',
    command: '/plan',
    label: 'Plan',
    icon: 'architecture',
    category: 'Prompt',
    description: 'Generate a detailed, step-by-step implementation plan for a task',
    type: 'prompt',
    template: 'Please outline a comprehensive, step-by-step implementation plan for: '
  },
  {
    name: 'explain',
    command: '/explain',
    label: 'Explain',
    icon: 'psychology',
    category: 'Prompt',
    description: 'Explain active selection, code, or current webpage in depth',
    type: 'prompt',
    template: 'Please explain the following in detail:\n\n'
  },
  {
    name: 'refactor',
    command: '/refactor',
    label: 'Refactor',
    icon: 'auto_fix_high',
    category: 'Prompt',
    description: 'Refactor code or text for better readability, structure, and performance',
    type: 'prompt',
    template: 'Please refactor the following code for better readability and performance:\n\n'
  },
  {
    name: 'fix',
    command: '/fix',
    label: 'Fix',
    icon: 'bug_report',
    category: 'Prompt',
    description: 'Diagnose syntax, logic, or runtime issues and provide verified solutions',
    type: 'prompt',
    template: 'Please diagnose and fix the issue in the following:\n\n'
  },
  {
    name: 'test',
    command: '/test',
    label: 'Test',
    icon: 'science',
    category: 'Prompt',
    description: 'Generate unit tests, edge cases, and assertion suites',
    type: 'prompt',
    template: 'Please write comprehensive unit tests and edge cases for the following:\n\n'
  },
  {
    name: 'summarize',
    command: '/summarize',
    label: 'Summarize',
    icon: 'summarize',
    category: 'Prompt',
    description: 'Summarize the active document, webpage, or discussion concisely',
    type: 'prompt',
    template: 'Please provide a concise, structured summary of the current context:\n\n'
  },
  {
    name: 'search',
    command: '/search',
    label: 'Search',
    icon: 'search',
    category: 'Prompt',
    description: 'Search page elements, webpage data, or information',
    type: 'prompt',
    template: 'Please search the current context for: '
  },

  // Multi-Agent Orchestration
  {
    name: 'subagent',
    command: '/subagent',
    label: 'Subagent',
    icon: 'account_tree',
    category: 'Multi-Agent',
    description: 'Spin specialized autonomous sub-agent(s) with dedicated roles and tasks',
    type: 'prompt',
    template: 'Can you spin up specialized sub-agents from different perspectives to analyze: '
  },

  // Context Scope Commands
  {
    name: 'page',
    command: '/page',
    label: 'Page Content',
    icon: 'web',
    category: 'Scope',
    description: 'Toggle and include active browser tab page content in prompt',
    type: 'action',
    actionId: 'togglePage'
  },

  // Direct Platform Actions
  {
    name: 'history',
    command: '/history',
    label: 'Chat History',
    icon: 'history',
    category: 'Action',
    description: 'Open chat sessions and conversation history',
    type: 'action',
    actionId: 'history'
  },
  {
    name: 'compact',
    command: '/compact',
    label: 'Compact Context',
    icon: 'compress',
    category: 'Action',
    description: 'Trigger manual context compaction to compress history and save tokens',
    type: 'action',
    actionId: 'compact'
  },
  {
    name: 'refresh',
    command: '/refresh',
    label: 'Refresh Models',
    icon: 'refresh',
    category: 'Action',
    description: 'Reload available AI provider models',
    type: 'action',
    actionId: 'refresh'
  },
  {
    name: 'clear',
    command: '/clear',
    label: 'Clear Chat',
    icon: 'delete_sweep',
    category: 'Action',
    description: 'Reset conversation history and clear active sub-agents',
    type: 'action',
    actionId: 'clear'
  },
  {
    name: 'help',
    command: '/help',
    label: 'Help',
    icon: 'help',
    category: 'Action',
    description: 'Display commands reference manual and keyboard shortcuts',
    type: 'action',
    actionId: 'help'
  }
];

/**
 * Deduplicates slash commands by command string (e.g. /test).
 */
export function deduplicateSlashCommands(commands = []) {
  if (!Array.isArray(commands)) return [];
  const seen = new Set();
  const result = [];
  for (const cmd of commands) {
    if (!cmd || !cmd.command) continue;
    const key = cmd.command.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cmd);
    }
  }
  return result;
}

/**
 * Returns all available slash commands for the Chrome Extension.
 */
export function getAllSlashCommands() {
  return deduplicateSlashCommands([...BASE_SLASH_COMMANDS]);
}

/**
 * Filters all commands by a search query string.
 * Matches name, command, label, description, or category, sorted by relevance (exact match first, then prefix match).
 */
export function filterSlashCommands(query = '') {
  const all = getAllSlashCommands();
  const normalized = (query || '').replace(/^\//, '').trim().toLowerCase();
  if (!normalized) {
    return all;
  }

  const matches = all.filter(cmd => {
    return (
      (cmd.name && cmd.name.toLowerCase().includes(normalized)) ||
      (cmd.command && cmd.command.toLowerCase().includes(normalized)) ||
      (cmd.label && cmd.label.toLowerCase().includes(normalized)) ||
      (cmd.description && cmd.description.toLowerCase().includes(normalized)) ||
      (cmd.category && cmd.category.toLowerCase().includes(normalized))
    );
  });

  return matches.sort((a, b) => {
    const aCmd = (a.command || '').toLowerCase().replace(/^\//, '');
    const bCmd = (b.command || '').toLowerCase().replace(/^\//, '');
    const aExact = aCmd === normalized ? 0 : 1;
    const bExact = bCmd === normalized ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    const aStarts = aCmd.startsWith(normalized) ? 0 : 1;
    const bStarts = bCmd.startsWith(normalized) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    return aCmd.localeCompare(bCmd);
  });
}

/**
 * Analyzes the current text and cursor position to detect if a slash command is being typed.
 * Returns match metadata or { isMatch: false }.
 */
export function extractSlashQuery(text = '', cursorPos = 0) {
  if (typeof text !== 'string' || cursorPos <= 0) {
    return { isMatch: false };
  }

  const textBeforeCursor = text.slice(0, cursorPos);
  // Match a slash at the start of input or preceded by whitespace, followed by non-whitespace characters
  const match = textBeforeCursor.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);

  if (!match) {
    return { isMatch: false };
  }

  const query = match[1];
  const slashIndex = textBeforeCursor.lastIndexOf('/' + query);

  return {
    isMatch: true,
    query,
    slashIndex,
    endIndex: cursorPos
  };
}
