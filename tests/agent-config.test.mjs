import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

const frontmatter = text => text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? null;
const field = (fm, key) => fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1].trim() ?? '';
const yamlList = (fm, key) =>
  (fm.match(new RegExp(`^${key}:\\n((?:[ \\t]+- .*\\n?)+)`, 'm'))?.[1] ?? '')
    .split('\n')
    .map(line =>
      line
        .replace(/^\s*-\s*/, '')
        .replace(/^"|"$/g, '')
        .trim(),
    )
    .filter(Boolean);
const files = dir =>
  readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap(e =>
    e.name === 'node_modules' || e.name === '.git'
      ? []
      : e.isDirectory()
        ? files(`${dir}/${e.name}`)
        : [`${dir}/${e.name}`.replace(/^\.\//, '')],
  );
const sha256 = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
// Glob shape used by .claude/rules `paths` (no brace expansion needed here).
const globRe = glob =>
  new RegExp(
    '^' +
      glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(//g, '(?:.*/)?')
        .replace(//g, '.*') +
      '$',
  );
const AGENTS = [
  'ucas-academic-ai',
  'ucas-backend-supabase',
  'ucas-frontend',
  'ucas-moodle-integration',
  'ucas-performance',
  'ucas-qa',
  'ucas-release',
  'ucas-security',
];
// Subagents never get Agent (no nested delegation) or MCP tools.
const TOOLS = new Set(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'PowerShell']);

test('Claude Code subagents have valid frontmatter, least-privilege tools and installed skills', () => {
  const found = readdirSync(resolve(root, '.claude/agents'))
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .sort();
  assert.deepEqual(found, AGENTS);
  for (const name of AGENTS) {
    const text = read(`.claude/agents/${name}.md`);
    const fm = frontmatter(text);
    assert.ok(fm, name);
    assert.equal(field(fm, 'name'), name);
    assert.ok(field(fm, 'description').length > 60, `${name}: description`);
    for (const tool of field(fm, 'tools')
      .split(',')
      .map(t => t.trim()))
      assert.ok(TOOLS.has(tool), `${name}: tool ${tool}`);
    const model = field(fm, 'model');
    if (model)
      assert.ok(
        ['sonnet', 'opus', 'haiku', 'fable', 'inherit'].includes(model),
        `${name}: ${model}`,
      );
    const skills = yamlList(fm, 'skills');
    assert.ok(skills.length >= 1 && skills.length <= 2, `${name}: preload one or two skills`);
    for (const skill of skills)
      assert.ok(
        existsSync(resolve(root, '.claude/skills', skill, 'SKILL.md')),
        `${name}: ${skill}`,
      );
    for (const [, path] of text.matchAll(
      /`((?:\.github\/agents|\.claude\/(?:ai-kit|skills))\/[^`]+)`/g,
    ))
      assert.ok(existsSync(resolve(root, path)), `${name}: ${path}`);
  }
  for (const reviewer of ['ucas-security', 'ucas-academic-ai'])
    assert.doesNotMatch(
      field(frontmatter(read(`.claude/agents/${reviewer}.md`)), 'tools'),
      /Edit|Write|Bash|PowerShell/,
    );
  // Owner decision: review roles run on Sonnet; implementers inherit the session model.
  for (const reviewer of [
    'ucas-security',
    'ucas-academic-ai',
    'ucas-qa',
    'ucas-release',
    'ucas-performance',
  ])
    assert.equal(field(frontmatter(read(`.claude/agents/${reviewer}.md`)), 'model'), 'sonnet');
});

test('Claude Code skills mirror .agents/skills plus the pinned kit skills', () => {
  const own = readdirSync(resolve(root, '.agents/skills'));
  const kit = Object.keys(JSON.parse(read('.claude/ai-kit/manifest.json')).skills);
  assert.deepEqual(readdirSync(resolve(root, '.claude/skills')).sort(), [...own, ...kit].sort());
  for (const name of own)
    assert.equal(
      read(`.claude/skills/${name}/SKILL.md`),
      read(`.agents/skills/${name}/SKILL.md`),
      `${name}: run npm run sync:claude`,
    );
  for (const name of [...own, ...kit]) {
    const fm = frontmatter(read(`.claude/skills/${name}/SKILL.md`));
    assert.equal(field(fm, 'name'), name);
    assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const description = field(fm, 'description');
    assert.ok(description.length > 20 && description.length <= 1024, name);
  }
  // A project skill named like a built-in command would replace that command.
  for (const builtIn of ['security-review', 'code-review', 'review', 'simplify', 'init'])
    assert.ok(!existsSync(resolve(root, '.claude/skills', builtIn)), builtIn);
});

test('pinned AI-DEVELOPMENT-KIT copies match their manifest', () => {
  const manifest = JSON.parse(read('.claude/ai-kit/manifest.json'));
  assert.equal(manifest.kit, 'AI-DEVELOPMENT-KIT');
  assert.equal(read('.claude/ai-kit/VERSION').trim(), manifest.version);
  assert.ok(Object.keys(manifest.files).length >= 20);
  for (const [rel, hash] of Object.entries(manifest.files))
    assert.equal(sha256(read(`.claude/ai-kit/${rel}`)), hash, `${rel}: edit the kit, then re-sync`);
  for (const [name, hash] of Object.entries(manifest.skills))
    assert.equal(sha256(read(`.claude/skills/${name}/SKILL.md`)), hash, name);
});

test('CLAUDE.md imports, path-scoped rules and project settings resolve', () => {
  const claude = read('CLAUDE.md');
  assert.match(claude, /^@AGENTS\.md\n/);
  const prose = claude.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const imports = [...prose.matchAll(/(?:^|\s)@(\S+)/g)].map(m => m[1]);
  assert.ok(imports.length >= 5);
  for (const path of imports) assert.ok(existsSync(resolve(root, path)), path);
  for (const agent of AGENTS) assert.ok(claude.includes('`' + agent + '`'), `routing: ${agent}`);
  const all = files('.');
  const skills = readdirSync(resolve(root, '.claude/skills'));
  const rules = readdirSync(resolve(root, '.claude/rules')).filter(f => f.endsWith('.md'));
  assert.ok(rules.length >= 5);
  for (const rule of rules) {
    const text = read(`.claude/rules/${rule}`);
    const paths = yamlList(frontmatter(text), 'paths');
    assert.ok(paths.length, rule);
    for (const glob of paths)
      assert.ok(
        all.some(f => globRe(glob).test(f)),
        `${rule}: ${glob} matches no file`,
      );
    for (const [, name] of text.matchAll(/`(ucas-[a-z-]+)`/g))
      assert.ok(AGENTS.includes(name) || skills.includes(name), `${rule}: ${name}`);
  }
  const settings = JSON.parse(read('.claude/settings.json'));
  assert.ok(settings.permissions.deny.includes('Read(.env)'));
  assert.ok(settings.permissions.ask.includes('Bash(git push *)'));
  assert.equal(settings.enableAllProjectMcpServers, false);
  assert.ok(!existsSync(resolve(root, '.mcp.json')), 'project MCP servers need owner approval');
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
