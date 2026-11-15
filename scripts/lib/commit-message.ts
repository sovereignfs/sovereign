/**
 * The agent trailers a commit may carry (AGENTS.md, "Commits"): each agent's is model-agnostic, so a trailer that names a model —
 * `Co-Authored-By: Claude Sonnet 5.5 <…>` — is refused, whatever a harness suggests.
 */
export const AGENT_TRAILERS = [
  'Co-Authored-By: Claude Code <noreply@anthropic.com>',
  'Co-Authored-By: Codex <noreply@openai.com>',
] as const;

const AGENT_ADDRESSES = ['noreply@anthropic.com', 'noreply@openai.com'];

/** What is wrong with a commit message's agent trailers; empty when nothing is. */
export function checkCommitMessage(message: string): string[] {
  const problems: string[] = [];
  const lines = message.split('\n').filter((line) => !line.startsWith('#'));
  for (const raw of lines) {
    const line = raw.trim();
    if (!/^co-authored-by:/i.test(line)) continue;
    if (!AGENT_ADDRESSES.some((address) => line.toLowerCase().includes(address))) continue;
    if (!(AGENT_TRAILERS as readonly string[]).includes(line)) {
      problems.push(
        `"${line}" is not an agent trailer; use one of:\n    ${AGENT_TRAILERS.join('\n    ')}`,
      );
    }
  }
  return problems;
}
