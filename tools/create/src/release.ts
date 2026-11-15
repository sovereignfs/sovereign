/**
 * Releasing an app (research 0007, the one release model): a promotion pull request from `develop` into `main` is titled with the app's
 * version, `vX.Y.Z` (or `<prefix>vX.Y.Z` for an app in a folder of a larger repository, such as fjord's `web-vX.Y.Z`), and starts with
 * `Release` when merging it is to tag and publish that version. This is the logic the shared workflows run, through
 * `npm create @sovereignfs release …`; it is the one-package form of this repository's own `pnpm release:check`.
 */

export type TitleCheck = {
  /** Whether the title starts with `Release`. */
  release: boolean;
  /** The tag this version is released under: `v1.2.0`, or `web-v1.2.0`. */
  tag: string;
  problems: string[];
};

const PREFIX = /^(?:[a-z][a-z0-9-]*-)?$/;

/** The tag of a version: the prefix, then `v` and the version. */
export const tagOf = (prefix: string, version: string) => `${prefix}v${version}`;

/** Whether a tag prefix can be used: empty, or lower-case words ending in `-`. */
export const isPrefix = (prefix: string) => PREFIX.test(prefix);

/**
 * Checks a promotion title against the app's version. The title names exactly that version's tag, optionally after `Release`; GitHub's
 * ` (#35)` suffix is ignored. A `Release` title is refused when the tag exists already (Release is for a version this promotion will tag)
 * or when the changelog has no section for the version (its notes are the GitHub release's).
 */
export function checkTitle(
  title: string,
  facts: { version: string; prefix: string; tagged: boolean; hasNotes: boolean },
): TitleCheck {
  const text = title.trim().replace(/\s+\(#\d+\)$/, '');
  const release = /^Release(\s|$)/.test(text);
  const named = (release ? text.replace(/^Release\s*/, '') : text).trim();
  const tag = tagOf(facts.prefix, facts.version);
  const problems: string[] = [];
  if (named !== tag) {
    problems.push(
      named === ''
        ? `The title names no version; it should be ${tag}, or Release ${tag}.`
        : `The title names ${named}, but the app is at ${facts.version}: it should be ${tag}, or Release ${tag}.`,
    );
  } else if (release) {
    if (facts.tagged)
      problems.push(
        `${tag} is tagged already; Release names only a version this promotion will tag.`,
      );
    if (!facts.hasNotes)
      problems.push(
        `CHANGELOG.md has no section for ${facts.version}, which would be the release's notes.`,
      );
  }
  return { release, tag, problems };
}

/** The section of a Keep a Changelog file for one version, without its heading; undefined when it has none or it is empty. */
export function changelogSection(text: string, version: string): string | undefined {
  const lines = text.split('\n');
  // A plain prefix, never a pattern made from the version, which can come from the command line.
  const heading = `## [${version}]`;
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body === '' ? undefined : body;
}

/** The agent trailers a commit may carry: each agent's own, model-agnostic. The same rule as this repository's commit-msg hook. */
export const AGENT_TRAILERS = [
  'Co-Authored-By: Claude Code <noreply@anthropic.com>',
  'Co-Authored-By: Codex <noreply@openai.com>',
] as const;

const AGENT_ADDRESSES = ['noreply@anthropic.com', 'noreply@openai.com'];

/** What is wrong with a commit message's agent trailers: a trailer at an agent's address that is not that agent's own. */
export function trailerProblems(message: string): string[] {
  const problems: string[] = [];
  for (const raw of message.split('\n')) {
    if (raw.startsWith('#')) continue;
    const line = raw.trim();
    if (!/^co-authored-by:/i.test(line)) continue;
    if (!AGENT_ADDRESSES.some((address) => line.toLowerCase().includes(address))) continue;
    if (!(AGENT_TRAILERS as readonly string[]).includes(line)) {
      problems.push(`"${line}" is not an agent trailer; use one of: ${AGENT_TRAILERS.join(', ')}`);
    }
  }
  return problems;
}
