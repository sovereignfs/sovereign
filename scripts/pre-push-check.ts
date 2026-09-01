/**
 * Pre-push hook body — wired in via `simple-git-hooks`'s `pre-push` entry in
 * package.json (never edit `.git/hooks/pre-push` directly; it's regenerated
 * from that config by the root `prepare` script).
 *
 * Always runs the same checks as `pnpm verify:push`. Additionally runs the
 * Playwright e2e suite when the push includes a root platform version tag
 * (`vX.Y.Z` / `vX.Y.Z-*`) — the same pattern `publish-images.yml` triggers
 * on to run `e2e.yml` as its pre-publish gate. That gate only ever runs in
 * CI, on the tag push itself; e2e is otherwise never exercised (`ci.yml`
 * doesn't call it, per its own "reusable pre-publish gate for root release
 * tags" comment). Running it here too means a regression surfaces locally,
 * before the tag reaches GitHub, instead of only in that first CI run.
 * Package release tags (`sdk-vX.Y.Z`, `ui-vX.Y.Z`, `create-plugin-vX.Y.Z`)
 * are deliberately excluded — `publish.yml` doesn't gate those on e2e either.
 *
 * Git pipes the refs being pushed to the hook's stdin, one per line:
 * `<local ref> <local sha1> <remote ref> <remote sha1>`. Read it all
 * upfront, before running anything else, since a hook script losing stdin
 * (e.g. a child process that reads/closes it) is a classic way for this
 * detection to silently see nothing.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const VERSION_TAG_RE = /^refs\/tags\/v\d+\.\d+\.\d+(-.+)?$/;

function readRefUpdates(): string[] {
  try {
    return readFileSync(0, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // No stdin (e.g. invoked directly, not as a real git hook) — treat as
    // "nothing being pushed" rather than crashing the hook.
    return [];
  }
}

const pushesVersionTag = readRefUpdates().some((line) => {
  const [localRef] = line.split(' ');
  return localRef !== undefined && VERSION_TAG_RE.test(localRef);
});

function run(command: string): void {
  execSync(command, { stdio: 'inherit' });
}

run('pnpm verify:push');

if (pushesVersionTag) {
  console.log(
    '\n[pre-push] Version tag push detected — running the e2e suite (mirrors .github/workflows/e2e.yml)...\n',
  );
  run('pnpm test:e2e');
}
