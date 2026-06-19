import { createInterface } from 'node:readline/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function print(msg: string): void {
  process.stdout.write(msg + '\n');
}

function toPascalCase(slug: string): string {
  return slug
    .split(/[-.]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function deriveSlug(id: string): string {
  return id.split('.').pop() ?? id;
}

function deriveRoutPrefix(slug: string): string {
  return `/${slug}`;
}

function deriveDisplayName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function prompt(
  rl: Awaited<ReturnType<typeof createInterface>>,
  question: string,
  fallback?: string,
): Promise<string> {
  const suffix = fallback ? ` ${DIM}(${fallback})${RESET} ` : ' ';
  const answer = await rl.question(`${question}${suffix}`);
  return answer.trim() || fallback || '';
}

function scaffoldFile(dir: string, relPath: string, content: string): void {
  const parts = relPath.split('/');
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content);
}

async function main(): Promise<void> {
  print('');
  print(`${BOLD}Create Sovereign Plugin${RESET}`);
  print(`${DIM}Scaffold a new plugin for your Sovereign instance.${RESET}`);
  print(
    `${DIM}Docs: https://github.com/sovereignfs/sovereign/blob/main/docs/plugin-development.md${RESET}`,
  );
  print('');

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  let id: string;
  for (;;) {
    id = await prompt(rl, `${BOLD}Plugin ID${RESET} (reverse-DNS, e.g. com.example.my-plugin):`);
    if (id) break;
    print('  Plugin ID is required.');
  }

  const slug = deriveSlug(id);
  const defaultName = deriveDisplayName(slug);
  const defaultRoute = deriveRoutPrefix(slug);

  const name = await prompt(rl, `${BOLD}Display name${RESET}:`, defaultName);
  const description = await prompt(rl, `${BOLD}Description${RESET} (optional):`);
  const routePrefix = await prompt(rl, `${BOLD}Route prefix${RESET}:`, defaultRoute);

  rl.close();

  const outDir = resolve(process.cwd());
  const dir = join(outDir, id);

  if (existsSync(dir)) {
    print(`\n  Error: directory already exists: ${dir}`);
    process.exit(1);
  }

  mkdirSync(join(dir, 'app'), { recursive: true });

  // manifest.json
  scaffoldFile(
    dir,
    'manifest.json',
    JSON.stringify(
      {
        schemaVersion: 1,
        id,
        name,
        version: '0.1.0',
        description: description || undefined,
        type: 'sovereign',
        runtime: 'native',
        routePrefix,
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

  // package.json
  scaffoldFile(
    dir,
    'package.json',
    JSON.stringify(
      {
        name: `sovereign-plugin-${slug}`,
        version: '0.1.0',
        private: true,
        type: 'module',
        dependencies: {
          '@sovereignfs/sdk': 'latest',
          '@sovereignfs/ui': 'latest',
          next: 'latest',
          react: 'latest',
          'react-dom': 'latest',
        },
        devDependencies: {
          '@sovereignfs/tsconfig': 'latest',
          '@types/react': 'latest',
          '@types/react-dom': 'latest',
          typescript: 'latest',
        },
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.json
  scaffoldFile(
    dir,
    'tsconfig.json',
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

  // icon.svg
  scaffoldFile(
    dir,
    'icon.svg',
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

  // app/page.tsx
  scaffoldFile(
    dir,
    'app/page.tsx',
    `import { sdk } from '@sovereignfs/sdk';
import styles from './${slug}.module.css';

export default async function ${toPascalCase(slug)}Page() {
  const session = await sdk.auth.getSession();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>${name}</h1>
      <p className={styles.lead}>
        {session ? \`Hello, \${session.user.name}!\` : 'Hello, world!'}
      </p>
    </div>
  );
}
`,
  );

  // app/<slug>.module.css
  scaffoldFile(
    dir,
    `app/${slug}.module.css`,
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

  print('');
  print(`${GREEN}✓${RESET} Scaffolded ${BOLD}${id}${RESET} → ${dir}`);
  print('');
  print('Next steps:');
  print(
    `  ${CYAN}1.${RESET} Update ${BOLD}repository${RESET} in manifest.json with your repo URL.`,
  );
  print(`  ${CYAN}2.${RESET} Install the plugin in a Sovereign checkout:`);
  print(`       pnpm sv plugin add <repo-url>`);
  print(`     or add it to sovereign.plugins.json and run pnpm install:plugins`);
  print(`  ${CYAN}3.${RESET} Run ${BOLD}pnpm dev${RESET} to start the development server.`);
  print('');
  print(
    `${DIM}Docs: https://github.com/sovereignfs/sovereign/blob/main/docs/plugin-development.md${RESET}`,
  );
  print('');
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${String(err)}\n`);
  process.exit(1);
});
