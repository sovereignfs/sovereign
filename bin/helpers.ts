/**
 * Pure helpers for the `sv` CLI (see `bin/sv.ts`).
 *
 * Kept free of process orchestration so the branchy logic — plugin-id
 * resolution and the platform-plugin removal guard — is unit-testable in
 * isolation, mirroring the `scripts/install-plugins.ts` split.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCompatibility, validateManifest } from '@sovereignfs/manifest';

// ---------------------------------------------------------------------------
// Backup helpers
// ---------------------------------------------------------------------------

/** Parse the DATABASE_URL to decide the dialect. */
export function detectDialect(url: string): 'sqlite' | 'postgres' {
  return url.startsWith('postgres://') || url.startsWith('postgresql://') ? 'postgres' : 'sqlite';
}

/**
 * Build the default backup archive path:
 *   <cwd>/backups/sovereign-backup-<timestamp>-v<version>.tar.gz
 */
export function defaultArchivePath(workspaceRoot: string, version: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(workspaceRoot, 'backups', `sovereign-backup-${ts}-v${version}.tar.gz`);
}

/**
 * Directory names of the platform plugins that ship inside this monorepo. They
 * are committed (gitignore-allowlisted) and load-bearing — `sv plugin remove`
 * refuses to delete them. Matches the allowlist in the root `.gitignore`.
 */
export const PLATFORM_PLUGIN_DIRS = ['account', 'console', 'launcher'] as const;

/** Throw if `id` names a built-in platform plugin that must not be removed. */
export function assertRemovablePlugin(id: string): void {
  if ((PLATFORM_PLUGIN_DIRS as readonly string[]).includes(id)) {
    throw new Error(`"${id}" is a built-in platform plugin and cannot be removed.`);
  }
}

/** Read the platform version from the workspace root package.json. */
export function readPlatformVersion(workspaceRoot: string): string {
  try {
    const raw = readFileSync(join(workspaceRoot, 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Parse and validate a cloned plugin's `manifest.json` contents, check its
 * compatibility with the running platform, and return its declared `id` —
 * the directory name the plugin composes under. Throws on malformed JSON,
 * a manifest that fails validation, or a manifest that is incompatible with
 * the current platform version.
 */
export function resolvePluginIdFromManifest(
  rawManifestJson: string,
  workspaceRoot: string,
): string {
  let json: unknown;
  try {
    json = JSON.parse(rawManifestJson);
  } catch (error) {
    throw new Error(`manifest.json is not valid JSON: ${(error as Error).message}`);
  }
  const result = validateManifest(json);
  if (!result.valid) {
    throw new Error(`Invalid manifest.json:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  const platformVersion = readPlatformVersion(workspaceRoot);
  const compat = checkCompatibility(result.manifest, platformVersion);
  if (!compat.compatible) {
    throw new Error(
      `Cannot install plugin "${result.manifest.id}" — incompatible with this platform:\n  ${compat.reason}`,
    );
  }
  for (const w of compat.warnings) {
    console.warn(`Warning: ${w}`);
  }

  return result.manifest.id;
}

// ---------------------------------------------------------------------------
// Plugin scaffold helpers
// ---------------------------------------------------------------------------

export interface PluginScaffoldOptions {
  /** Reverse-DNS plugin ID, e.g. `io.example.my-plugin`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Short plugin description. */
  description: string;
  /** Route prefix, must start with `/`, e.g. `/my-plugin`. */
  routePrefix: string;
  /** Parent directory; the plugin is created at `<outDir>/<id>/`. */
  outDir: string;
  /**
   * When true, dependency references use `workspace:*` / `catalog:` (for use
   * inside the Sovereign monorepo). When false, `latest` is used so the
   * scaffold works in a standalone plugin repository.
   */
  workspaceDeps?: boolean;
}

/**
 * Scaffold the canonical plugin skeleton into `outDir/<id>/`.
 * Returns the absolute path of the created directory.
 * Throws if the directory already exists.
 */
export function scaffoldPlugin(opts: PluginScaffoldOptions): string {
  const dir = join(opts.outDir, opts.id);
  if (existsSync(dir)) {
    throw new Error(`Directory already exists: ${dir}`);
  }

  const slug = opts.id.split('.').pop() ?? opts.id;
  const useWorkspace = opts.workspaceDeps ?? false;
  const sdkRef = useWorkspace ? 'workspace:*' : 'latest';
  const uiRef = useWorkspace ? 'workspace:*' : 'latest';
  const tsconfigRef = useWorkspace ? 'workspace:*' : 'latest';
  const nextRef = useWorkspace ? 'catalog:' : 'latest';
  const reactRef = useWorkspace ? 'catalog:' : 'latest';
  const typesReactRef = useWorkspace ? 'catalog:' : 'latest';
  const tsRef = useWorkspace ? 'catalog:' : 'latest';

  mkdirSync(join(dir, 'app'), { recursive: true });

  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        id: opts.id,
        name: opts.name,
        version: '0.1.0',
        description: opts.description || undefined,
        type: 'sovereign',
        runtime: 'native',
        routePrefix: opts.routePrefix,
        shell: 'default',
        icon: 'icon.svg',
        permissions: ['auth:session'],
        repository: 'https://github.com/YOUR_ORG/YOUR_REPO',
        compatibility: {
          minPlatformVersion: '0.6.0',
        },
      },
      null,
      2,
    ) + '\n',
  );

  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: `sovereign-plugin-${slug}`,
        version: '0.1.0',
        private: true,
        type: 'module',
        dependencies: {
          '@sovereignfs/sdk': sdkRef,
          '@sovereignfs/ui': uiRef,
          next: nextRef,
          react: reactRef,
          'react-dom': reactRef,
        },
        devDependencies: {
          '@sovereignfs/tsconfig': tsconfigRef,
          '@types/react': typesReactRef,
          '@types/react-dom': typesReactRef,
          typescript: tsRef,
        },
      },
      null,
      2,
    ) + '\n',
  );

  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: '@sovereignfs/tsconfig/nextjs.json',
        compilerOptions: { baseUrl: '.' },
        include: ['app/**/*.ts', 'app/**/*.tsx', 'db/**/*.ts'],
      },
      null,
      2,
    ) + '\n',
  );

  writeFileSync(
    join(dir, 'icon.svg'),
    `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <rect width="18" height="18" x="3" y="3" rx="2" />
  <path d="M3 9h18" />
  <path d="M9 21V9" />
</svg>
`,
  );

  writeFileSync(
    join(dir, 'app', 'page.tsx'),
    `import { sdk } from '@sovereignfs/sdk';
import styles from './${slug}.module.css';

export default async function ${toPascalCase(slug)}Page() {
  const session = await sdk.auth.getSession();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>${opts.name}</h1>
      <p className={styles.lead}>
        {session ? \`Hello, \${session.user.name}!\` : 'Hello, world!'}
      </p>
    </div>
  );
}
`,
  );

  writeFileSync(
    join(dir, 'app', `${slug}.module.css`),
    `.page {
  padding: var(--sv-space-8) var(--sv-space-6);
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: var(--sv-space-6);
}

.title {
  font-size: var(--sv-font-size-2xl);
  font-weight: 600;
  color: var(--sv-color-text-primary);
  margin: 0;
}

.lead {
  font-size: var(--sv-font-size-md);
  color: var(--sv-color-text-muted);
  margin: 0;
}
`,
  );

  return dir;
}

/** Convert a kebab-case or dot-separated slug to PascalCase. */
function toPascalCase(slug: string): string {
  return slug
    .split(/[-.]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}
