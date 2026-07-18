/**
 * install-plugins — clones the declared plugins into `plugins/<id>/` and wires
 * them into the runtime.
 *
 * Reads `sovereign.plugins.json` at the repo root:
 *
 *   {
 *     "plugins": [
 *       // whole-repo plugin (each in its own repository):
 *       { "id": "fs.example.tasks", "repository": "https://github.com/org/tasks" },
 *       // monorepo subdir, pinned to a commit for reproducible builds:
 *       {
 *         "id": "example-basic",
 *         "repository": "https://github.com/org/examples",
 *         "ref": "<commit-sha-or-tag>",
 *         "subdir": "examples/example-basic"
 *       },
 *       // private repo, authenticated via a personal access token held in an
 *       // env var — the token name is committed, never the token itself:
 *       {
 *         "id": "com.acme.crm",
 *         "repository": "https://github.com/acme/sovereign-crm",
 *         "tokenEnv": "ACME_CRM_PLUGIN_TOKEN"
 *       }
 *     ]
 *   }
 *
 * For each entry it materialises `plugins/<id>/`, skipping any that already
 * exist, then runs `pnpm generate` to compose them:
 *
 *   - No `ref`/`subdir` → shallow `git clone` of the repo straight into
 *     `plugins/<id>` (keeps `.git`; the historical behaviour).
 *   - `ref` and/or `subdir` present → clone once per unique repo+ref into a temp
 *     dir at the pinned ref, then copy `subdir` (or the whole tree minus `.git`)
 *     into `plugins/<id>`. Entries sharing a repo+ref are cloned a single time.
 *   - `tokenEnv` (either shape above) → the named env var's value authenticates
 *     the clone via a short-lived git credential-store file (mode 0600, deleted
 *     immediately after), never as an embedded URL passed on argv. Only needed
 *     the first time a private plugin is cloned — once `plugins/<id>/` exists
 *     on disk it's skipped on every later run, so ordinary version upgrades
 *     (`git pull` in the same checkout, then rebuild) never need the token
 *     again. Requires an `https://` repository URL.
 *
 * Platform plugins (console/launcher/account) live in this repo and are not
 * listed here; cloned plugins are gitignored (they have their own repositories).
 *
 * See: docs/roadmap.md — Task 0.5.00 and Task 12.2 (example plugin extraction).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PluginEntry {
  id: string;
  repository: string;
  /** Optional commit SHA, tag, or branch to pin the clone to (reproducible builds). */
  ref?: string;
  /** Optional path within the repository to copy into `plugins/<id>` (monorepo sources). */
  subdir?: string;
  /**
   * Optional name of an environment variable holding a personal access token
   * for cloning a private repository. The token itself never lives here —
   * only the variable name — so this file stays safe to commit. Requires an
   * `https://` `repository` URL; SSH URLs authenticate via the invoking
   * shell's own SSH key/agent instead.
   */
  tokenEnv?: string;
}

export interface PluginsConfig {
  plugins: PluginEntry[];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'sovereign.plugins.json');
const PLUGINS_DIR = join(ROOT, 'plugins');

/** Parse and validate `sovereign.plugins.json` content. Throws on malformed input. */
export function parsePluginsConfig(raw: string): PluginsConfig {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`sovereign.plugins.json is not valid JSON: ${(error as Error).message}`);
  }
  if (
    typeof json !== 'object' ||
    json === null ||
    !Array.isArray((json as { plugins?: unknown }).plugins)
  ) {
    throw new Error('sovereign.plugins.json must be an object with a "plugins" array.');
  }
  const entries = (json as { plugins: unknown[] }).plugins;
  const seen = new Set<string>();
  return {
    plugins: entries.map((entry, i) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(`plugins[${String(i)}] must be an object.`);
      }
      const { id, repository, ref, subdir, tokenEnv } = entry as Record<string, unknown>;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(`plugins[${String(i)}].id must be a non-empty string.`);
      }
      if (typeof repository !== 'string' || repository.length === 0) {
        throw new Error(`plugins[${String(i)}].repository must be a non-empty string.`);
      }
      if (ref !== undefined && (typeof ref !== 'string' || ref.length === 0)) {
        throw new Error(`plugins[${String(i)}].ref must be a non-empty string when present.`);
      }
      if (subdir !== undefined && (typeof subdir !== 'string' || subdir.length === 0)) {
        throw new Error(`plugins[${String(i)}].subdir must be a non-empty string when present.`);
      }
      if (tokenEnv !== undefined && (typeof tokenEnv !== 'string' || tokenEnv.length === 0)) {
        throw new Error(`plugins[${String(i)}].tokenEnv must be a non-empty string when present.`);
      }
      if (typeof tokenEnv === 'string' && !repository.startsWith('https://')) {
        throw new Error(
          `plugins[${String(i)}].tokenEnv requires an "https://" repository URL (got "${repository}").`,
        );
      }
      if (seen.has(id)) {
        throw new Error(`Duplicate plugin id "${id}" in sovereign.plugins.json.`);
      }
      seen.add(id);
      const parsed: PluginEntry = { id, repository };
      if (ref !== undefined) parsed.ref = ref;
      if (subdir !== undefined) parsed.subdir = subdir;
      if (tokenEnv !== undefined) parsed.tokenEnv = tokenEnv as string;
      return parsed;
    }),
  };
}

/**
 * Partition declared plugins into those to clone and those already installed,
 * using the supplied predicate (kept pure so the decision is unit-testable).
 */
export function planInstall(
  config: PluginsConfig,
  isInstalled: (id: string) => boolean,
): { toClone: PluginEntry[]; toSkip: PluginEntry[] } {
  const toClone: PluginEntry[] = [];
  const toSkip: PluginEntry[] = [];
  for (const entry of config.plugins) {
    (isInstalled(entry.id) ? toSkip : toClone).push(entry);
  }
  return { toClone, toSkip };
}

export interface CloneGroup {
  repository: string;
  ref?: string;
  tokenEnv?: string;
  entries: PluginEntry[];
}

/**
 * Group entries by their (repository, ref) pair so a monorepo shared by several
 * plugins is cloned only once. Order is preserved by first appearance. Pure so
 * the grouping is unit-testable.
 */
export function groupClones(entries: PluginEntry[]): CloneGroup[] {
  const groups = new Map<string, CloneGroup>();
  for (const entry of entries) {
    const key = JSON.stringify([entry.repository, entry.ref ?? null]);
    let group = groups.get(key);
    if (!group) {
      group = {
        repository: entry.repository,
        ref: entry.ref,
        tokenEnv: entry.tokenEnv,
        entries: [],
      };
      groups.set(key, group);
    } else if (entry.tokenEnv !== group.tokenEnv) {
      throw new Error(
        `plugins sharing repository "${entry.repository}"${entry.ref ? ` @ ${entry.ref}` : ''} ` +
          `declare different "tokenEnv" values (${String(group.tokenEnv)} vs ${String(entry.tokenEnv)}) — ` +
          'they are cloned once and must agree.',
      );
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}

/** True when an entry is a plain whole-repo clone with the historical behaviour. */
function isLegacyWholeRepo(entry: PluginEntry): boolean {
  return entry.ref === undefined && entry.subdir === undefined;
}

/**
 * Read the token named by `tokenEnv` from `env`. Throws a clear error if the
 * variable is unset or empty rather than letting git fail opaquely later.
 * Returns `undefined` when `tokenEnv` itself is undefined (no auth needed).
 */
export function resolveToken(
  tokenEnv: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (tokenEnv === undefined) return undefined;
  const token = env[tokenEnv];
  if (!token) {
    throw new Error(
      `Environment variable "${tokenEnv}" is not set (or empty) — required to clone this ` +
        'private plugin repository. Set it to a personal access token before running install-plugins.',
    );
  }
  return token;
}

/**
 * Write a short-lived git credential-store file (mode 0600) authenticating
 * `repository` as `token`, run `fn` with the `-c` args that point git at it,
 * then delete the file. Keeps the token out of process argv (visible via
 * `ps`) and out of any logged URL — only ever written to a private temp file.
 */
export function withGitCredentials<T>(
  repository: string,
  token: string | undefined,
  fn: (credArgs: string[]) => T,
): T {
  if (token === undefined) return fn([]);

  const credDir = mkdtempSync(join(tmpdir(), 'sovereign-plugin-cred-'));
  const credFile = join(credDir, 'credentials');
  const credUrl = new URL(repository);
  credUrl.username = 'x-access-token';
  credUrl.password = token;
  writeFileSync(credFile, `${credUrl.toString()}\n`, { mode: 0o600 });
  try {
    // Clear any ambient credential.helper first so only our scoped file is
    // consulted, then point git at it.
    return fn(['-c', 'credential.helper=', '-c', `credential.helper=store --file=${credFile}`]);
  } finally {
    rmSync(credDir, { recursive: true, force: true });
  }
}

/** Shallow-clone a repository at an optional ref into `dest`. */
function cloneInto(
  repository: string,
  ref: string | undefined,
  dest: string,
  token?: string,
): void {
  withGitCredentials(repository, token, (credArgs) => {
    // Never let a failed/prompt-requiring auth hang the process waiting for
    // interactive input.
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    if (ref === undefined) {
      execFileSync('git', [...credArgs, 'clone', '--depth', '1', repository, dest], {
        stdio: 'inherit',
        env,
      });
      return;
    }
    // Fetch exactly the pinned ref (works for a SHA, tag, or branch on GitHub)
    // without downloading unrelated history.
    execFileSync('git', ['init', '--quiet', dest], { stdio: 'inherit', env });
    execFileSync('git', ['-C', dest, 'remote', 'add', 'origin', repository], {
      stdio: 'inherit',
      env,
    });
    execFileSync('git', [...credArgs, '-C', dest, 'fetch', '--depth', '1', 'origin', ref], {
      stdio: 'inherit',
      env,
    });
    execFileSync('git', ['-C', dest, 'checkout', '--quiet', 'FETCH_HEAD'], {
      stdio: 'inherit',
      env,
    });
  });
}

/** Copy a checked-out clone (optionally a subdir) into `dest`, dropping `.git`. */
function copyCheckout(cloneDir: string, subdir: string | undefined, dest: string): void {
  const src = subdir === undefined ? cloneDir : join(cloneDir, subdir);
  if (!existsSync(src)) {
    throw new Error(`subdir "${subdir ?? ''}" not found in the cloned repository`);
  }
  cpSync(src, dest, {
    recursive: true,
    filter: (from) => {
      const rel = relative(src, from);
      return rel !== '.git' && !rel.startsWith('.git' + sep);
    },
  });
}

/**
 * True when `plugins/<id>` already exists, OR when a `<id>.local` directory
 * does — the documented convention for a personal, gitignored dev-override
 * checkout (see docs/plugin-development.md). Without the `.local` check, a
 * fresh `pnpm dev`/`install:plugins` run reclones the real repo into
 * `plugins/<id>` alongside a developer's own `.local` checkout of the same
 * plugin — both declare the same manifest id, so the generated registry ends
 * up with two entries sharing one React key (`generate-registry.ts`'s
 * `duplicatePluginIds` check now also catches this at generate time, as a
 * second line of defense).
 */
export function isPluginInstalled(id: string, pluginsDir: string = PLUGINS_DIR): boolean {
  return existsSync(join(pluginsDir, id)) || existsSync(join(pluginsDir, `${id}.local`));
}

function main(): void {
  if (!existsSync(CONFIG_PATH)) {
    console.log(
      '[install-plugins] No sovereign.plugins.json at the repo root — nothing to install.',
    );
    return;
  }

  const config = parsePluginsConfig(readFileSync(CONFIG_PATH, 'utf8'));
  if (config.plugins.length === 0) {
    console.log('[install-plugins] No plugins declared in sovereign.plugins.json.');
    return;
  }

  const { toClone, toSkip } = planInstall(config, (id) => isPluginInstalled(id));

  for (const entry of toSkip) {
    console.log(`[install-plugins] ${entry.id} already present — skipping.`);
  }

  let cloned = 0;
  for (const group of groupClones(toClone)) {
    // Single whole-repo plugin → clone straight into place (keeps .git).
    const [firstEntry] = group.entries;
    if (firstEntry !== undefined && group.entries.length === 1 && isLegacyWholeRepo(firstEntry)) {
      const entry = firstEntry;
      const dest = join(PLUGINS_DIR, entry.id);
      console.log(`[install-plugins] cloning ${entry.id} from ${entry.repository} …`);
      try {
        const token = resolveToken(entry.tokenEnv);
        cloneInto(entry.repository, undefined, dest, token);
      } catch (error) {
        console.error(
          `[install-plugins] Failed to clone ${entry.repository}: ${(error as Error).message}`,
        );
        process.exit(1);
      }
      cloned += 1;
      continue;
    }

    // Shared monorepo and/or pinned ref → clone once into a temp dir, then copy
    // each entry's subdir into place.
    const pin = group.ref === undefined ? '' : ` @ ${group.ref}`;
    console.log(
      `[install-plugins] cloning ${group.repository}${pin} for ` +
        `${group.entries.map((e) => e.id).join(', ')} …`,
    );
    const tmp = mkdtempSync(join(tmpdir(), 'sovereign-plugins-'));
    try {
      const token = resolveToken(group.tokenEnv);
      cloneInto(group.repository, group.ref, tmp, token);
      for (const entry of group.entries) {
        copyCheckout(tmp, entry.subdir, join(PLUGINS_DIR, entry.id));
        cloned += 1;
      }
    } catch (error) {
      console.error(
        `[install-plugins] Failed to install from ${group.repository}: ${(error as Error).message}. ` +
          'Check the URL, ref, subdir, and (if private) tokenEnv are correct.',
      );
      process.exit(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  if (cloned > 0) {
    console.log('[install-plugins] composing plugins (pnpm generate) …');
    execFileSync('pnpm', ['generate'], { cwd: ROOT, stdio: 'inherit' });
  }

  console.log(
    `[install-plugins] done — ${String(cloned)} installed, ${String(toSkip.length)} already present.`,
  );
}

// Only run when invoked directly (e.g. `pnpm install:plugins`), not when the
// pure helpers above are imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
