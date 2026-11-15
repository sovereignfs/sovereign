/** Commits carried model-specific agent trailers although AGENTS.md asks for model-agnostic ones; the commit-msg hook refuses them. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_TRAILERS, checkCommitMessage } from '../lib/commit-message';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const body = (trailer: string) => `fix(core): something\n\nWhy.\n\n${trailer}\n`;

describe('commit messages', () => {
  it('accept each agent’s own trailer, and a person’s', () => {
    for (const trailer of AGENT_TRAILERS) expect(checkCommitMessage(body(trailer))).toEqual([]);
    expect(checkCommitMessage(body('Co-Authored-By: A Person <a@example.org>'))).toEqual([]);
    expect(checkCommitMessage('docs: no trailer\n')).toEqual([]);
  });

  it('refuse a trailer that names a model', () => {
    for (const trailer of [
      'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>',
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
      'co-authored-by: GPT-6 <noreply@openai.com>',
    ]) {
      expect(checkCommitMessage(body(trailer)), trailer).toHaveLength(1);
    }
  });

  it('ignore comment lines git strips', () => {
    expect(
      checkCommitMessage(body('# Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')),
    ).toEqual([]);
  });

  it('are checked by the commit-msg hook, and the trailers match AGENTS.md', () => {
    const manifest = JSON.parse(read('package.json')) as {
      'simple-git-hooks': Record<string, string>;
    };
    expect(manifest['simple-git-hooks']['commit-msg']).toBe(
      'pnpm tsx scripts/check-commit-msg.ts $1',
    );
    const agents = read('AGENTS.md');
    expect(agents).toContain('`Co-Authored-By: Claude Code <noreply@anthropic.com>`');
    expect(agents).toContain('`Co-Authored-By: Codex <noreply@openai.com>`');
  });
});
