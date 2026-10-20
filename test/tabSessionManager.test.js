import { test } from 'node:test';
import assert from 'node:assert';
import { TabSessionManager } from '../shared/tabSessionManager.js';

test('TabSessionManager - Initial State', () => {
  const manager = new TabSessionManager();
  assert.deepStrictEqual(manager.getAllSessions(), []);
  assert.deepStrictEqual(manager.getTabSessions(), {});
  assert.strictEqual(manager.getSessionForTab(101), null);
});

test('TabSessionManager - New tab returns null and creates no session', () => {
  const manager = new TabSessionManager();
  
  // Tab 101 opens
  const session1 = manager.getSessionForTab(101);
  assert.strictEqual(session1, null);
  // Nothing was entered, so allSessions remains empty
  assert.strictEqual(manager.getAllSessions().length, 0);

  // Tab 102 opens
  const session2 = manager.getSessionForTab(102);
  assert.strictEqual(session2, null);
  assert.strictEqual(manager.getAllSessions().length, 0);
});

test('TabSessionManager - getOrCreateSessionForTab creates session only upon input', () => {
  const manager = new TabSessionManager();
  
  // Tab 101 sends first message
  const session = manager.getOrCreateSessionForTab(101, 'How does quantum computing work?');
  assert.ok(session.id);
  assert.strictEqual(session.title, 'How does quantum computin...');
  assert.strictEqual(session.tabId, 101);
  assert.strictEqual(manager.getAllSessions().length, 1);
  assert.strictEqual(manager.getTabSessions()[101], session.id);

  // Subsequent call for tab 101 returns the existing session
  const sameSession = manager.getOrCreateSessionForTab(101, 'Another message');
  assert.strictEqual(sameSession.id, session.id);
  assert.strictEqual(manager.getAllSessions().length, 1);
});

test('TabSessionManager - Multiple tabs maintain distinct sessions', () => {
  const manager = new TabSessionManager();

  // Tab 101 works on React
  const s1 = manager.getOrCreateSessionForTab(101, 'Learn React Hooks');
  // Tab 102 works on Vue
  const s2 = manager.getOrCreateSessionForTab(102, 'Learn Vue Composition API');

  assert.notStrictEqual(s1.id, s2.id);
  assert.strictEqual(manager.getAllSessions().length, 2);

  // Navigating to tab 101 reflects s1
  assert.strictEqual(manager.getSessionForTab(101).id, s1.id);
  // Navigating to tab 102 reflects s2
  assert.strictEqual(manager.getSessionForTab(102).id, s2.id);

  // Tab 103 is a brand new tab, reflects null
  assert.strictEqual(manager.getSessionForTab(103), null);
  assert.strictEqual(manager.getAllSessions().length, 2);
});

test('TabSessionManager - clearTabSession resets tab without deleting session from history', () => {
  const manager = new TabSessionManager();
  const s1 = manager.getOrCreateSessionForTab(101, 'Existing Session');
  assert.strictEqual(manager.getAllSessions().length, 1);

  // User clicks New Chat on tab 101
  manager.clearTabSession(101);
  assert.strictEqual(manager.getSessionForTab(101), null);
  // Session is still retained in history modal!
  assert.strictEqual(manager.getAllSessions().length, 1);
  assert.strictEqual(manager.getAllSessions()[0].id, s1.id);
});

test('TabSessionManager - setTabSession switches active session for tab', () => {
  const manager = new TabSessionManager();
  const s1 = manager.getOrCreateSessionForTab(101, 'Session 1');
  const s2 = manager.getOrCreateSessionForTab(102, 'Session 2');

  // Switch tab 101 to session 2
  manager.setTabSession(101, s2.id);
  assert.strictEqual(manager.getSessionForTab(101).id, s2.id);
});

test('TabSessionManager - deleteSession removes session and cleans up references', () => {
  const manager = new TabSessionManager();
  const s1 = manager.getOrCreateSessionForTab(101, 'Session to delete');
  assert.strictEqual(manager.getSessionForTab(101).id, s1.id);

  manager.deleteSession(s1.id);
  assert.strictEqual(manager.getAllSessions().length, 0);
  assert.strictEqual(manager.getSessionForTab(101), null);
});

test('TabSessionManager - removeTab cleans up tab mapping when tab is closed', () => {
  const manager = new TabSessionManager();
  const s1 = manager.getOrCreateSessionForTab(101, 'Tab to close');

  manager.removeTab(101);
  assert.strictEqual(manager.getTabSessions()[101], undefined);
  // History is still intact
  assert.strictEqual(manager.getAllSessions().length, 1);
});

test('TabSessionManager - loadState restores persisted sessions and tab mappings', () => {
  const manager = new TabSessionManager();
  const persistedSessions = [{ id: 's1', title: 'Test', history: [] }];
  const persistedTabSessions = { 205: 's1', 207: 'non-existent' };

  manager.loadState({ sessions: persistedSessions, tabSessions: persistedTabSessions });
  assert.strictEqual(manager.getAllSessions().length, 1);
  assert.strictEqual(manager.getSessionForTab(205).id, 's1');
  assert.strictEqual(manager.getSessionForTab(206), null);
  // Stale or deleted session referenced by tab returns null safely
  assert.strictEqual(manager.getSessionForTab(207), null);
});

test('TabSessionManager - Edge Cases: non-existent tab/session operations do not throw', () => {
  const manager = new TabSessionManager();
  
  // Safe calls on empty manager
  assert.doesNotThrow(() => manager.clearTabSession(999));
  assert.doesNotThrow(() => manager.removeTab(999));
  assert.doesNotThrow(() => manager.deleteSession('non-existent'));
  assert.doesNotThrow(() => manager.setTabSession(999, 'non-existent'));
  assert.strictEqual(manager.getSessionForTab(999), null);
});

test('TabSessionManager - Title formatting with empty and long inputs', () => {
  const manager = new TabSessionManager();

  const s1 = manager.getOrCreateSessionForTab(101, '   ');
  assert.strictEqual(s1.title, 'Chat Session');

  const s2 = manager.getOrCreateSessionForTab(102, 'A'.repeat(50));
  assert.strictEqual(s2.title, 'A'.repeat(25) + '...');
});

