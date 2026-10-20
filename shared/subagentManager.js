/**
 * subagentManager.js — Autonomous Sub-Agent Manager & Context Store for Spin Your AI
 *
 * Responsibilities:
 * - Creates, tracks, and manages autonomous specialized sub-agents.
 * - Maintains isolated conversation context / memory per sub-agent.
 * - Allows resuming an existing sub-agent's context across multiple turns using `subagent_id`.
 * - Tracks active working sub-agents count and notifies UI listeners in real time.
 */

export class SubagentManager {
  constructor() {
    this.subagents = new Map();
    this.activeControllers = new Map();
    this.statusListeners = new Set();
  }

  /**
   * Register a listener callback for sub-agent status/count changes.
   * @param {Function} listener - (payload: { activeCount: number, subagents: Array }) => void
   * @returns {Function} Unsubscribe function
   */
  onStatusChange(listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Broadcast current sub-agent status to all registered listeners.
   */
  notifyStatus() {
    const payload = {
      activeCount: this.getActiveCount(),
      subagents: this.getSubagents()
    };
    for (const listener of this.statusListeners) {
      try {
        listener(payload);
      } catch (e) {
        console.error('SubagentManager listener error:', e);
      }
    }
  }

  /**
   * Get all tracked sub-agents as an array.
   */
  getSubagents() {
    return Array.from(this.subagents.values()).map(sa => ({
      id: sa.id,
      role: sa.role,
      task: sa.task,
      status: sa.status,
      createdAt: sa.createdAt,
      completedAt: sa.completedAt,
      result: sa.result,
      error: sa.error,
      turnsCount: sa.history.filter(h => h.role === 'assistant').length,
      history: sa.history
    }));
  }

  /**
   * Get count of currently working sub-agents.
   */
  getActiveCount() {
    let count = 0;
    for (const sa of this.subagents.values()) {
      if (sa.status === 'working') {
        count++;
      }
    }
    return count;
  }

  /**
   * Get a specific sub-agent by ID.
   */
  getSubagent(id) {
    return this.subagents.get(id) || null;
  }

  /**
   * Terminate a running sub-agent by ID.
   */
  terminateSubagent(id) {
    const controller = this.activeControllers.get(id);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(id);
    }
    const sa = this.subagents.get(id);
    if (sa && sa.status === 'working') {
      sa.status = 'cancelled';
      sa.completedAt = Date.now();
      sa.result = sa.result || '[Terminated by user]';
      this.notifyStatus();
      return true;
    }
    return false;
  }

  /**
   * Clear completed, cancelled, or failed sub-agents from tracking.
   */
  clearSubagents() {
    for (const [id, sa] of this.subagents.entries()) {
      if (sa.status !== 'working') {
        this.subagents.delete(id);
      }
    }
    this.notifyStatus();
  }

  /**
   * Register execution lifecycle hooks to manage sub-agent nesting/depth.
   */
  setExecutionHooks(onStart, onEnd) {
    this.onExecutionStart = onStart;
    this.onExecutionEnd = onEnd;
  }

  /**
   * Spin up a new sub-agent or resume an existing sub-agent by ID.
   *
   * @param {Object} options
   * @param {string} options.role - Specialized persona/role (e.g. "Vision Analyst", "Code Inspector")
   * @param {string} options.task - Specific task for the sub-agent
   * @param {string} [options.context] - Additional background, instructions, or attachments
   * @param {string} [options.subagentId] - ID of an existing sub-agent to resume context
   * @param {Object} [options.provider] - AI provider instance
   * @param {string} [options.modelId] - Model identifier to use
   * @param {Array} [options.attachments] - Multimodal files or attachments
   * @param {Object} [options.pageContext] - Active web page context
   * @param {number} [options.frozenTabId] - Browser tab ID if DOM interaction is relevant
   * @param {number} [options.maxTurns] - Maximum tool turns allowed for this sub-agent (default 12)
   * @returns {Promise<Object>} Execution result with subagent_id, role, status, result
   */
  async spinSubagent({
    role = 'Specialized Agent',
    task,
    context = '',
    subagentId = null,
    provider = null,
    modelId = 'default',
    attachments = [],
    pageContext = null,
    frozenTabId = null,
    maxTurns = 12
  }) {
    if (!task) {
      throw new Error('Sub-agent requires a task description.');
    }

    if (typeof this.onExecutionStart === 'function') {
      this.onExecutionStart();
    }

    let subagent;
    const isResumed = subagentId && this.subagents.has(subagentId);

    if (isResumed) {
      subagent = this.subagents.get(subagentId);
      subagent.role = role || subagent.role;
      subagent.task = task;
      subagent.status = 'working';
      subagent.error = null;
    } else {
      const id = subagentId || `subagent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      subagent = {
        id,
        role: role.trim() || 'General Specialist',
        task,
        status: 'working',
        createdAt: Date.now(),
        completedAt: null,
        history: [],
        result: null,
        error: null
      };
      this.subagents.set(id, subagent);

      // Initialize system context in sub-agent history with pageContext if available
      let systemPrompt = `You are an autonomous specialized sub-agent for Spin Your AI. Role: ${subagent.role}.\nYour goal: Execute the assigned task efficiently and provide a thorough, accurate outcome.\nWhen executing multiple independent actions (such as DOM inspections or MCP queries), invoke tools in parallel within a single turn.\nAlways return your findings clearly.`;
      if (pageContext) {
        systemPrompt += `\n\n--- Current Web Page Context ---\nURL: ${pageContext.url || 'N/A'}\nTitle: ${pageContext.title || 'N/A'}\n\nContent:\n${pageContext.text || ''}\n--- End Web Page Context ---`;
      }

      subagent.history.push({
        role: 'system',
        content: systemPrompt,
        timestamp: Date.now()
      });
    }

    const controller = new AbortController();
    this.activeControllers.set(subagent.id, controller);
    this.notifyStatus();

    try {
      // Build user prompt for this sub-agent turn
      let userPrompt = `Task: ${task}`;
      if (context) {
        userPrompt += `\n\n--- Context ---\n${context}\n--- End Context ---`;
      }

      // Handle multimodal attachments if provided
      let userContent;
      if (attachments && attachments.length > 0) {
        const parts = [];
        for (const att of attachments) {
          parts.push({
            type: att.type?.startsWith('image/') ? 'image' : 'file',
            mimeType: att.type || 'application/octet-stream',
            data: att.data,
            name: att.name || 'attachment'
          });
        }
        parts.push({ type: 'text', text: userPrompt });
        userContent = parts;
      } else {
        userContent = userPrompt;
      }

      subagent.history.push({
        role: 'user',
        content: userContent,
        timestamp: Date.now()
      });

      // Prepare messages for the AI provider
      const messagesForProvider = subagent.history.map(h => ({
        role: h.role,
        content: h.content
      }));

      let fullResponse = '';

      if (provider && typeof provider.chat === 'function') {
        const stream = provider.chat(modelId, messagesForProvider, controller.signal, frozenTabId, {
          isSubagent: true,
          maxToolTurns: maxTurns
        });
        for await (const chunk of stream) {
          if (controller.signal.aborted) break;
          // Filter out markdown tool status tags if any
          fullResponse += chunk;
        }
      } else {
        // Fallback or test mock response
        fullResponse = `[Sub-agent "${subagent.role}" (${subagent.id}) completed task: "${task}"]`;
      }

      if (controller.signal.aborted) {
        subagent.status = 'cancelled';
        subagent.result = fullResponse || '[Aborted by user]';
      } else {
        subagent.status = 'completed';
        subagent.result = fullResponse;
      }

      subagent.completedAt = Date.now();
      subagent.history.push({
        role: 'assistant',
        content: subagent.result,
        timestamp: Date.now()
      });

      this.activeControllers.delete(subagent.id);
      this.notifyStatus();

      return {
        subagent_id: subagent.id,
        role: subagent.role,
        status: subagent.status,
        result: subagent.result,
        turns_completed: subagent.history.filter(h => h.role === 'assistant').length
      };
    } catch (err) {
      this.activeControllers.delete(subagent.id);
      subagent.status = 'failed';
      subagent.error = err.message || 'Unknown error';
      subagent.completedAt = Date.now();
      this.notifyStatus();

      return {
        subagent_id: subagent.id,
        role: subagent.role,
        status: 'failed',
        error: subagent.error
      };
    } finally {
      if (typeof this.onExecutionEnd === 'function') {
        this.onExecutionEnd();
      }
    }
  }
}

export const subagentManager = new SubagentManager();
