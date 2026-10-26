/**
 * The task-lifecycle skills are shared between Claude Code (`.claude/skills/`)
 * and Codex (`.agents/skills/`) as real copies, not symlinks, so each harness
 * reads its own tree. This test is what stops the two copies from drifting:
 * every skill directory must exist in both trees, and every file inside it
 * must be byte-identical — except `agents/openai.yaml`, which is Codex-only
 * UI metadata with no Claude Code equivalent.
 *
 * To change a skill: edit it under `.agents/skills/`, then copy the file to
 * the same path under `.claude/skills/` (or the other way round — direction
 * doesn't matter, only equality does).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const CLAUDE = join(root, '.claude', 'skills');
const AGENTS = join(root, '.agents', 'skills');
const CODEX_ONLY = new Set(['agents/openai.yaml']);

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? listFiles(full, base)
      : [relative(base, full).split('\\').join('/')];
  });
}

function skillDirs(tree: string): string[] {
  return readdirSync(tree)
    .filter((name) => statSync(join(tree, name)).isDirectory())
    .sort();
}

describe('agent skills stay in sync', () => {
  const claudeSkills = skillDirs(CLAUDE);
  const agentSkills = skillDirs(AGENTS);

  it('both trees contain the same set of skills', () => {
    expect(claudeSkills).toEqual(agentSkills);
    expect(claudeSkills.length).toBeGreaterThan(0);
  });

  it.each(agentSkills)('%s is byte-identical in both trees', (skill) => {
    const agentFiles = listFiles(join(AGENTS, skill)).filter((f) => !CODEX_ONLY.has(f));
    const claudeFiles = listFiles(join(CLAUDE, skill));
    expect(claudeFiles.sort()).toEqual(agentFiles.sort());
    for (const file of agentFiles) {
      const a = readFileSync(join(AGENTS, skill, file), 'utf8');
      const c = readFileSync(join(CLAUDE, skill, file), 'utf8');
      expect(c, `${skill}/${file} differs between .claude/skills and .agents/skills`).toBe(a);
    }
  });

  it.each(agentSkills)(
    '%s declares the shared-skill note and a name matching its directory',
    (skill) => {
      const body = readFileSync(join(AGENTS, skill, 'SKILL.md'), 'utf8');
      expect(body).toMatch(new RegExp(`^name: ${skill}$`, 'm'));
      expect(body).toContain('Shared skill');
    },
  );
});
