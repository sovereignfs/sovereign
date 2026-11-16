/**
 * Under the pre-push hook in a worktree, git's absolute `GIT_DIR` reached the tests' own `git` and made it act on this repository:
 * 200 tests failed and the worktree's index was emptied. The tests' setup now drops the variables that name a repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { forgetRepository } from '../lib/test-env';

const folders: string[] = [];
const folder = () => {
  // Its real path: macOS reaches its temporary folder through a link, and git answers with where it really is.
  const made = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'sv-test-env-')));
  folders.push(made);
  return made;
};
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
});

const gitDir = (cwd: string, env: NodeJS.ProcessEnv) =>
  execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd, env, encoding: 'utf8' }).trim();

describe('the tests’ environment', () => {
  it('has no variable that names a repository when a test starts', () => {
    expect(process.env.GIT_DIR).toBeUndefined();
    expect(process.env.GIT_INDEX_FILE).toBeUndefined();
    expect(process.env.GIT_WORK_TREE).toBeUndefined();
  });

  it('lets a git in a folder of its own find that folder, not the repository a hook named', () => {
    const outer = folder();
    execFileSync('git', ['init', '--quiet', outer]);
    const own = folder();
    execFileSync('git', ['init', '--quiet', own]);
    // What a hook run in a worktree hands its children.
    const hooked = {
      ...process.env,
      GIT_DIR: path.join(outer, '.git'),
      GIT_INDEX_FILE: path.join(outer, '.git', 'index'),
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.bare',
      GIT_CONFIG_VALUE_0: 'false',
    };
    expect(gitDir(own, hooked)).toBe(path.join(outer, '.git'));
    forgetRepository(hooked);
    expect(
      Object.keys(hooked).filter((name) => /^GIT_(DIR|INDEX_FILE|CONFIG_)/.test(name)),
    ).toEqual([]);
    expect(gitDir(own, hooked)).toBe(path.join(own, '.git'));
  });
});
