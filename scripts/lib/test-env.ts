/**
 * The tests' environment, free of the repository they are run from.
 *
 * Git runs a hook with variables that name the repository (`GIT_DIR`, `GIT_INDEX_FILE`, …). In a worktree `GIT_DIR` is an
 * absolute path, so a test that runs `git` in a folder of its own, under the pre-push hook, acted on this repository instead: its
 * `git init` was ignored, its `git remote add` found `origin`, and it staged deletions in the worktree's index. Every test process
 * drops them first (`vitest.setup.ts`), so a spawned `git` sees only the folder it is run in.
 */

/** Git's own list, from `git rev-parse --local-env-vars`: what it clears itself before running a command in a submodule. */
export const REPOSITORY_VARIABLES = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
] as const;

/** Removes, in place, every variable that would point a spawned `git` at a repository other than its folder's. */
export function forgetRepository(env: NodeJS.ProcessEnv): void {
  for (const name of REPOSITORY_VARIABLES) Reflect.deleteProperty(env, name);
  // `GIT_CONFIG_COUNT` numbers `GIT_CONFIG_KEY_n` and `GIT_CONFIG_VALUE_n`; with the count gone they are read by nothing, but go too.
  for (const name of Object.keys(env))
    if (/^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(name)) Reflect.deleteProperty(env, name);
}
