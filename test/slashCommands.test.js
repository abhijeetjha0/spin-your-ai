import test from 'node:test';
import assert from 'node:assert';
import {
  BASE_SLASH_COMMANDS,
  getAllSlashCommands,
  filterSlashCommands,
  extractSlashQuery,
  deduplicateSlashCommands
} from '../shared/slashCommands.js';

test('Slash Commands - Base Registry and Structure', () => {
  const commands = getAllSlashCommands();
  assert.ok(Array.isArray(commands));
  assert.ok(commands.length >= 10);

  const names = commands.map(c => c.name);
  // Requested prompt commands
  assert.ok(names.includes('plan'), 'Includes /plan');
  assert.ok(names.includes('explain'), 'Includes /explain');
  assert.ok(names.includes('refactor'), 'Includes /refactor');
  assert.ok(names.includes('fix'), 'Includes /fix');
  assert.ok(names.includes('test'), 'Includes /test');
  assert.ok(names.includes('summarize'), 'Includes /summarize');
  assert.ok(names.includes('search'), 'Includes /search');
  assert.ok(names.includes('subagent'), 'Includes /subagent');

  // Scope command
  assert.ok(names.includes('page'), 'Includes /page');

  // Requested action commands
  assert.ok(names.includes('history'), 'Includes /history');
  assert.ok(names.includes('compact'), 'Includes /compact');
  assert.ok(names.includes('refresh'), 'Includes /refresh');
  assert.ok(names.includes('clear'), 'Includes /clear');
  assert.ok(names.includes('help'), 'Includes /help');
});

test('Slash Commands - filterSlashCommands with queries and relevance ranking', () => {
  // Prefix matching
  const planMatches = filterSlashCommands('plan');
  assert.ok(planMatches.some(c => c.name === 'plan'));

  const historyMatches = filterSlashCommands('/hist');
  assert.ok(historyMatches.some(c => c.name === 'history'));

  const refreshMatches = filterSlashCommands('/ref');
  assert.ok(refreshMatches.some(c => c.name === 'refresh'));
  assert.ok(refreshMatches.some(c => c.name === 'refactor'));

  // Case insensitivity
  const upperFix = filterSlashCommands('/FIX');
  assert.ok(upperFix.some(c => c.name === 'fix'));

  // Exact match /test ranks first
  const testFiltered = filterSlashCommands('/test');
  assert.strictEqual(testFiltered[0].command, '/test', 'Exact match /test must rank first');

  // Ensure zero duplicates in filtered results
  const counts = new Map();
  for (const cmd of testFiltered) {
    counts.set(cmd.command, (counts.get(cmd.command) || 0) + 1);
  }
  for (const [cmd, count] of counts.entries()) {
    assert.strictEqual(count, 1, `Command ${cmd} should not be duplicated`);
  }
});

test('Slash Commands - deduplicateSlashCommands helper', () => {
  const duplicates = [
    { name: 'test', command: '/test' },
    { name: 'test-dup', command: '/test' },
    { name: 'plan', command: '/plan' }
  ];
  const deduped = deduplicateSlashCommands(duplicates);
  assert.strictEqual(deduped.length, 2);
  assert.strictEqual(deduped[0].command, '/test');
  assert.strictEqual(deduped[1].command, '/plan');
});

test('Slash Commands - extractSlashQuery', () => {
  // Start of line
  const m1 = extractSlashQuery('/plan', 5);
  assert.strictEqual(m1.isMatch, true);
  assert.strictEqual(m1.query, 'plan');

  // After whitespace
  const m2 = extractSlashQuery('please /hist', 12);
  assert.strictEqual(m2.isMatch, true);
  assert.strictEqual(m2.query, 'hist');

  // Not a command trigger
  assert.strictEqual(extractSlashQuery('https://example.com/', 20).isMatch, false);
  assert.strictEqual(extractSlashQuery('', 0).isMatch, false);
});
