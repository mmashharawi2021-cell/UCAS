import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = p => readFileSync(resolve(root, p), 'utf8');

test('repository agent instructions and custom profiles are present', () => {
  assert.ok(existsSync(resolve(root, 'AGENTS.md')));
  const roles = ['orchestrator', 'frontend', 'academic-ai', 'security', 'qa', 'release'];
  for (const role of roles) {
    const path = '.github/agents/ucas-' + role + '.agent.md';
    const content = read(path);
    assert.match(content, /^---\nname: /);
    assert.match(content, /\ndescription: /);
    assert.match(content, /\n---\n/);
  }
});

test('all Premium skill definitions have compatible metadata and safety rules', () => {
  const names = [
    'ucas-design-system',
    'academic-source-validator',
    'lecture-processing',
    'exam-quality-audit',
    'supabase-rls-audit',
    'pwa-offline-regression',
    'load-performance-audit',
    'release-readiness',
  ];
  for (const name of names) {
    const content = read('.agents/skills/' + name + '/SKILL.md');
    assert.ok(content.startsWith('---\nname: ' + name + '\n'));
    assert.match(content, /\ndescription: /);
    assert.match(content, /\n---\n/);
    assert.match(content, /# Workflow/);
  }
  assert.match(read('AGENTS.md'), /offline/);
  assert.match(read('AGENTS.md'), /secrets|keys/);
});
