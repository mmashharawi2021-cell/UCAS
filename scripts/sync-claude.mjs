// Keep Claude Code's project configuration in step with its sources.
//   npm run sync:claude                                  mirror .agents/skills into .claude/skills
//                                                        and verify the pinned kit copies
//   npm run sync:claude -- --kit ../AI-DEVELOPMENT-KIT   also refresh .claude/ai-kit and the kit
//                                                        skills from that kit folder
// .agents/skills stays the source of truth for UCAS skills. .claude/ai-kit holds verbatim,
// hash-checked copies of the AI-DEVELOPMENT-KIT files UCAS uses; the kit itself is never edited.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const KIT_DIR = '.claude/ai-kit';
const KIT_FILES = [
  'VERSION',
  'CHANGELOG.md',
  'LICENSE-NOTICE.md',
  'AGENTS.md',
  '00-START-HERE/QUICK-START.md',
  '01-REPOSITORIES/CATALOG.json',
  '01-REPOSITORIES/CATALOG.md',
  '01-REPOSITORIES/SELECTION-POLICY.md',
  '01-REPOSITORIES/SHORTLIST.md',
  '02-AI-AGENTS/AGENT-CONTRACT.md',
  '02-AI-AGENTS/ORCHESTRATOR.md',
  '05-MCP-SERVERS/EXAMPLES.md',
  '05-MCP-SERVERS/REGISTRY.md',
  '05-MCP-SERVERS/mcp-registry.template.json',
  '06-SECURITY/INCIDENT-RESPONSE.md',
  '06-SECURITY/MCP-TRUST.md',
  '06-SECURITY/PROMPT-INJECTION.md',
  '06-SECURITY/SECURITY-POLICY.md',
  '06-SECURITY/THREAT-MODEL.template.md',
  '07-TESTING/LOAD-TEST-PLAN.template.md',
  '07-TESTING/QUALITY-GATES.md',
  '07-TESTING/REVIEW-REPORT.template.md',
  '07-TESTING/TEST-MATRIX.md',
  '08-UI-UX/DESIGN-SYSTEM.md',
  '08-UI-UX/RTL-ACCESSIBILITY.md',
  '10-PROJECT-CONFIG/ACCEPTANCE.template.md',
  '10-PROJECT-CONFIG/DECISION-LOG.template.md',
  '10-PROJECT-CONFIG/PROJECT-PROFILE.template.yml',
  '10-PROJECT-CONFIG/TASK.template.md',
];
// Kit skills UCAS installs; the others duplicate UCAS skills or Claude Code built-ins.
const KIT_SKILLS = ['architecture-review', 'database-rls', 'stack-selection'];

const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const sha256 = text => createHash('sha256').update(text).digest('hex');
const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const fail = message => {
  console.error('sync-claude: ' + message);
  process.exit(1);
};

const own = readdirSync('.agents/skills', { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);
const clash = own.filter(name => KIT_SKILLS.includes(name));
if (clash.length) fail(`skill names used by both .agents/skills and the kit: ${clash.join(', ')}`);
for (const name of own)
  for (const file of walk(join('.agents/skills', name)))
    write(join('.claude/skills', relative('.agents/skills', file)), read(file));

const at = process.argv.indexOf('--kit');
if (at > 0) {
  const kit = resolve(process.argv[at + 1] || '');
  if (!existsSync(join(kit, 'AGENTS.md')) || !existsSync(join(kit, 'VERSION')))
    fail(`not an AI-DEVELOPMENT-KIT folder: ${kit}`);
  const files = {};
  for (const rel of KIT_FILES) {
    const text = read(join(kit, rel));
    write(join(KIT_DIR, rel), text);
    files[rel] = sha256(text);
  }
  const skills = {};
  for (const name of KIT_SKILLS) {
    const text = read(join(kit, '04-SKILLS', name, 'SKILL.md'));
    write(join('.claude/skills', name, 'SKILL.md'), text);
    skills[name] = sha256(text);
  }
  const version = read(join(kit, 'VERSION')).trim();
  const manifest = { kit: 'AI-DEVELOPMENT-KIT', version, files, skills };
  write(join(KIT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

const manifest = JSON.parse(read(join(KIT_DIR, 'manifest.json')));
const differs = (path, hash) => !existsSync(path) || sha256(read(path)) !== hash;
const edited = [
  ...Object.entries(manifest.files)
    .filter(([rel, hash]) => differs(join(KIT_DIR, rel), hash))
    .map(([rel]) => `${KIT_DIR}/${rel}`),
  ...Object.entries(manifest.skills)
    .filter(([name, hash]) => differs(join('.claude/skills', name, 'SKILL.md'), hash))
    .map(([name]) => `.claude/skills/${name}`),
];
if (edited.length)
  fail(`kit copies differ from the manifest (edit the kit, then re-sync): ${edited.join(', ')}`);
console.log(
  `sync-claude: mirrored ${own.length} UCAS skills; ${Object.keys(manifest.files).length} kit files and ${Object.keys(manifest.skills).length} kit skills match AI-DEVELOPMENT-KIT ${manifest.version}`,
);
