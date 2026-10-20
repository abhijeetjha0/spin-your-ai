/**
 * tabSessionManager.js
 * Scopes chat sessions to browser tabs (tabId), ensuring new tabs show a clean chatbox
 * and navigating back to existing tabs restores their respective sessions.
 * Fresh tabs do not create or persist empty sessions until user input is submitted.
 */

export class TabSessionManager {
  /**
   * @param {Array} initialSessions
   * @param {Object} initialTabSessions - Map of tabId -> sessionId
   */
  constructor(initialSessions = [], initialTabSessions = {}) {
    this.allSessions = Array.isArray(initialSessions) ? initialSessions : [];
    this.tabSessions = initialTabSessions && typeof initialTabSessions === 'object' ? { ...initialTabSessions } : {};
  }

  /**
   * Rehydrates state from persistent storage
   */
  loadState({ sessions, tabSessions }) {
    if (Array.isArray(sessions)) {
      this.allSessions = sessions;
    }
    if (tabSessions && typeof tabSessions === 'object') {
      this.tabSessions = { ...tabSessions };
    }
  }

  /**
   * Returns the session associated with the tabId, if any
   * @param {number|string} tabId
   * @returns {Object|null}
   */
  getSessionForTab(tabId) {
    if (tabId === null || tabId === undefined) return null;
    const sessionId = this.tabSessions[tabId];
    if (!sessionId) return null;

    const session = this.allSessions.find(s => s.id === sessionId);
    if (!session) {
      delete this.tabSessions[tabId];
      return null;
    }
    return session;
  }

  /**
   * Gets existing session for tab or creates a new one when user sends a message.
   * Fresh tabs do NOT create sessions until this method is called.
   * @param {number|string} tabId
   * @param {string} firstMessageText
   * @returns {Object}
   */
  getOrCreateSessionForTab(tabId, firstMessageText = '') {
    if (tabId !== null && tabId !== undefined) {
      const existing = this.getSessionForTab(tabId);
      if (existing) return existing;
    }

    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const cleanText = (firstMessageText || '').trim();
    const title = cleanText.length > 25
      ? cleanText.substring(0, 25) + '...'
      : cleanText || 'Chat Session';

    const newSession = {
      id,
      title,
      createdAt: Date.now(),
      history: [],
      tabId: tabId || null
    };

    this.allSessions.push(newSession);
    if (tabId !== null && tabId !== undefined) {
      this.tabSessions[tabId] = id;
    }
    return newSession;
  }

  /**
   * Sets or switches the session associated with a tab
   * @param {number|string} tabId
   * @param {string} sessionId
   */
  setTabSession(tabId, sessionId) {
    if (tabId === null || tabId === undefined) return;
    if (sessionId) {
      const exists = this.allSessions.some(s => s.id === sessionId);
      if (exists) {
        this.tabSessions[tabId] = sessionId;
      }
    } else {
      delete this.tabSessions[tabId];
    }
  }

  /**
   * Disassociates a tab from its session (e.g. New Chat).
   * Does NOT delete the session from history.
   * @param {number|string} tabId
   */
  clearTabSession(tabId) {
    if (tabId === null || tabId === undefined) return;
    delete this.tabSessions[tabId];
  }

  /**
   * Deletes a session completely from allSessions and cleans up tab mappings
   * @param {string} sessionId
   */
  deleteSession(sessionId) {
    if (!sessionId) return;
    this.allSessions = this.allSessions.filter(s => s.id !== sessionId);
    for (const [tId, sId] of Object.entries(this.tabSessions)) {
      if (sId === sessionId) {
        delete this.tabSessions[tId];
      }
    }
  }

  /**
   * Removes tab from tracking when the browser tab is closed
   * @param {number|string} tabId
   */
  removeTab(tabId) {
    if (tabId === null || tabId === undefined) return;
    delete this.tabSessions[tabId];
  }

  getAllSessions() {
    return this.allSessions;
  }

  getTabSessions() {
    return this.tabSessions;
  }
}

export const tabSessionManager = new TabSessionManager();
