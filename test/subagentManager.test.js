import test from 'node:test';
import assert from 'node:assert';
import { SubagentManager } from '../shared/subagentManager.js';

test('SubagentManager - Initial State', () => {
  const sm = new SubagentManager();
  assert.strictEqual(sm.getActiveCount(), 0);
  assert.deepStrictEqual(sm.getSubagents(), []);
});

test('SubagentManager - Validation: requires task', async () => {
  const sm = new SubagentManager();
  await assert.rejects(
    async () => {
      await sm.spinSubagent({ role: 'Test' });
    },
    /requires a task description/
  );
});

test('SubagentManager - Spin new subagent with mock provider', async () => {
  const sm = new SubagentManager();
  let statusEvents = [];
  sm.onStatusChange((event) => statusEvents.push(event));

  const mockProvider = {
    async *chat(modelId, messages, signal) {
      yield 'Analysis complete: ';
      yield 'No issues found.';
    }
  };

  const result = await sm.spinSubagent({
    role: 'Security Auditor',
    task: 'Audit the authentication flow',
    context: 'jwt secret is hardcoded',
    provider: mockProvider,
    modelId: 'test-model'
  });

  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.role, 'Security Auditor');
  assert.strictEqual(result.result, 'Analysis complete: No issues found.');
  assert.strictEqual(result.turns_completed, 1);
  assert.strictEqual(sm.getActiveCount(), 0);

  const subagents = sm.getSubagents();
  assert.strictEqual(subagents.length, 1);
  assert.strictEqual(subagents[0].id, result.subagent_id);
  assert.strictEqual(subagents[0].status, 'completed');

  // Verify status events fired during execution (at least working then completed)
  assert.ok(statusEvents.length >= 2);
  assert.strictEqual(statusEvents[0].activeCount, 1);
  assert.strictEqual(statusEvents[statusEvents.length - 1].activeCount, 0);
});

test('SubagentManager - Context Maintenance across multiple turns', async () => {
  const sm = new SubagentManager();

  const mockProvider = {
    async *chat(modelId, messages, signal) {
      const lastMsg = messages[messages.length - 1];
      yield `Response to: ${lastMsg.content.includes('Followup') ? 'Followup' : 'Initial'}`;
    }
  };

  // Turn 1: Spin new subagent
  const res1 = await sm.spinSubagent({
    role: 'Code Refactorer',
    task: 'Refactor UserService',
    provider: mockProvider
  });

  assert.strictEqual(res1.status, 'completed');
  const subagentId = res1.subagent_id;

  // Verify history after turn 1: system, user, assistant
  const sa1 = sm.getSubagent(subagentId);
  assert.strictEqual(sa1.history.length, 3);
  assert.strictEqual(sa1.history[0].role, 'system');
  assert.strictEqual(sa1.history[1].role, 'user');
  assert.strictEqual(sa1.history[2].role, 'assistant');

  // Turn 2: Resume existing subagent by subagent_id
  const res2 = await sm.spinSubagent({
    subagentId,
    task: 'Followup: optimize memory allocation',
    provider: mockProvider
  });

  assert.strictEqual(res2.subagent_id, subagentId);
  assert.strictEqual(res2.status, 'completed');
  assert.strictEqual(res2.turns_completed, 2);

  // History should now contain prior context + new turn: system, user1, assistant1, user2, assistant2
  const sa2 = sm.getSubagent(subagentId);
  assert.strictEqual(sa2.history.length, 5);
  assert.strictEqual(sa2.history[3].role, 'user');
  assert.strictEqual(sa2.history[4].role, 'assistant');
  assert.ok(sa2.history[3].content.includes('Followup: optimize memory allocation'));
});

test('SubagentManager - Multimodal Attachments handling', async () => {
  const sm = new SubagentManager();

  let receivedMessages = null;
  const mockProvider = {
    async *chat(modelId, messages) {
      receivedMessages = messages;
      yield 'Diagram reviewed: Flow starts at Login.';
    }
  };

  const attachments = [
    { name: 'diagram.png', type: 'image/png', data: 'base64data123' },
    { name: 'schema.json', type: 'application/json', data: 'eyJrZXkiOiJ2YWwifQ==' }
  ];

  const result = await sm.spinSubagent({
    role: 'Architecture Reviewer',
    task: 'Explain the architecture diagram',
    attachments,
    provider: mockProvider
  });

  assert.strictEqual(result.status, 'completed');
  assert.ok(receivedMessages);
  const userTurn = receivedMessages.find(m => m.role === 'user');
  assert.ok(Array.isArray(userTurn.content));
  assert.strictEqual(userTurn.content.length, 3); // 2 attachments + 1 text
  assert.strictEqual(userTurn.content[0].type, 'image');
  assert.strictEqual(userTurn.content[1].type, 'file');
  assert.strictEqual(userTurn.content[2].type, 'text');
});

test('SubagentManager - Terminate working subagent', async () => {
  const sm = new SubagentManager();

  const mockProvider = {
    async *chat(modelId, messages, signal) {
      yield 'Step 1...';
      await new Promise(r => setTimeout(r, 100));
      if (signal.aborted) return;
      yield 'Step 2...';
    }
  };

  const promise = sm.spinSubagent({
    role: 'Long Running Agent',
    task: 'Simulate long computation',
    provider: mockProvider
  });

  // Small delay to ensure it starts
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(sm.getActiveCount(), 1);

  const subagents = sm.getSubagents();
  const subagentId = subagents[0].id;
  const terminated = sm.terminateSubagent(subagentId);
  assert.strictEqual(terminated, true);

  const result = await promise;
  assert.strictEqual(result.status, 'cancelled');
  assert.strictEqual(sm.getActiveCount(), 0);
});

test('SubagentManager - Clear inactive subagents', async () => {
  const sm = new SubagentManager();

  await sm.spinSubagent({ role: 'A1', task: 'Task 1' });
  await sm.spinSubagent({ role: 'A2', task: 'Task 2' });

  assert.strictEqual(sm.getSubagents().length, 2);

  sm.clearSubagents();
  assert.strictEqual(sm.getSubagents().length, 0);
});

test('SubagentManager - Provider error handling', async () => {
  const sm = new SubagentManager();

  const failingProvider = {
    async *chat() {
      throw new Error('API connection timed out');
    }
  };

  const result = await sm.spinSubagent({
    role: 'Failing Agent',
    task: 'Do something',
    provider: failingProvider
  });

  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.error, 'API connection timed out');
  assert.strictEqual(sm.getActiveCount(), 0);
});

test('SubagentManager - PageContext auto-inheritance into system prompt', async () => {
  const sm = new SubagentManager();

  const mockProvider = {
    async *chat() {
      yield 'Page inspected.';
    }
  };

  const pageContext = {
    url: 'https://example.com/docs',
    title: 'Example Documentation',
    text: 'Key information: Feature X is released in version 2.0.'
  };

  const result = await sm.spinSubagent({
    role: 'Doc Reader',
    task: 'Find release version of Feature X',
    pageContext,
    provider: mockProvider
  });

  assert.strictEqual(result.status, 'completed');
  const sa = sm.getSubagent(result.subagent_id);
  assert.ok(sa);
  const systemTurn = sa.history.find(h => h.role === 'system');
  assert.ok(systemTurn.content.includes('https://example.com/docs'));
  assert.ok(systemTurn.content.includes('Example Documentation'));
  assert.ok(systemTurn.content.includes('Key information: Feature X is released'));
});

test('SubagentManager - Execution lifecycle hooks for nesting guard', async () => {
  const sm = new SubagentManager();
  let depth = 0;
  let maxDepthRecorded = 0;

  sm.setExecutionHooks(
    () => {
      depth++;
      if (depth > maxDepthRecorded) maxDepthRecorded = depth;
    },
    () => {
      depth = Math.max(0, depth - 1);
    }
  );

  const mockProvider = {
    async *chat() {
      yield 'Hook verified.';
    }
  };

  await sm.spinSubagent({
    role: 'Hook Test',
    task: 'Verify depth hooks',
    provider: mockProvider
  });

  assert.strictEqual(maxDepthRecorded, 1);
  assert.strictEqual(depth, 0);
});

test('SubagentManager - Force terminateAll active subagents', async () => {
  const sm = new SubagentManager();

  const hangingProvider = {
    async *chat(modelId, messages, signal) {
      yield 'Initial work...';
      await new Promise(r => setTimeout(r, 200));
      if (signal.aborted) return;
      yield 'More work...';
    }
  };

  const p1 = sm.spinSubagent({ role: 'Worker 1', task: 'Task 1', provider: hangingProvider });
  const p2 = sm.spinSubagent({ role: 'Worker 2', task: 'Task 2', provider: hangingProvider });

  await new Promise(r => setTimeout(r, 15));
  assert.strictEqual(sm.getActiveCount(), 2);

  const terminatedCount = sm.terminateAll();
  assert.strictEqual(terminatedCount, 2);
  assert.strictEqual(sm.getActiveCount(), 0);

  const res1 = await p1;
  const res2 = await p2;
  assert.strictEqual(res1.status, 'cancelled');
  assert.strictEqual(res2.status, 'cancelled');
});

test('SubagentManager - Parent signal abort chaining', async () => {
  const sm = new SubagentManager();
  const parentController = new AbortController();

  const slowProvider = {
    async *chat(modelId, messages, signal) {
      yield 'Processing step 1...';
      await new Promise(r => setTimeout(r, 200));
      if (signal.aborted) return;
      yield 'Processing step 2...';
    }
  };

  const p = sm.spinSubagent({
    role: 'Chained Worker',
    task: 'Chained Task',
    provider: slowProvider,
    signal: parentController.signal
  });

  await new Promise(r => setTimeout(r, 15));
  assert.strictEqual(sm.getActiveCount(), 1);

  // Abort from parent
  parentController.abort();

  const res = await p;
  assert.strictEqual(res.status, 'cancelled');
  assert.strictEqual(sm.getActiveCount(), 0);
});

test('SubagentManager - Pre-aborted parent signal returns cancelled immediately', async () => {
  const sm = new SubagentManager();
  const parentController = new AbortController();
  parentController.abort();

  const res = await sm.spinSubagent({
    role: 'Aborted Worker',
    task: 'Pre-aborted task',
    signal: parentController.signal
  });

  assert.strictEqual(res.status, 'cancelled');
  assert.strictEqual(res.result, '[Aborted by user]');
  assert.strictEqual(sm.getActiveCount(), 0);
});

