import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const docsRoot = fileURLToPath(new URL('../../../docs/', import.meta.url));
const rfcsDir = path.join(docsRoot, 'rfcs');

export const publicGuideRewrites = {
  'guides/index.md': 'docs/index.md',
  'guides/users.md': 'docs/users.md',
  'guides/pwa.md': 'docs/pwa.md',
  'guides/operators.md': 'docs/operators.md',
  'guides/developers.md': 'docs/developers.md',
  'guides/architecture.md': 'docs/architecture.md',
  'guides/contributing.md': 'docs/contributing.md',
} as const;

/**
 * Local-doc-link routes that resolve through a rewrite rather than a direct
 * `docs/<path>.md` file. Derived from publicGuideRewrites (the rewrite VitePress
 * itself applies) so the link checker and the site can never drift apart.
 */
export function getDocsRouteRewrites(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(publicGuideRewrites).map(([source, destination]) => {
      const destinationWithoutExt = destination.replace(/\.md$/, '');
      const route = destinationWithoutExt.endsWith('/index')
        ? `/${destinationWithoutExt.slice(0, -'index'.length)}`
        : `/${destinationWithoutExt}`;
      return [route, `docs/${source}`];
    }),
  );
}

const publicDirectories = new Set(['get-started', 'guides', 'plugins', 'product', 'rfcs']);

const publicRootDocuments = new Set([
  'agent-first-documentation.md',
  'architecture-rules.md',
  'architecture.md',
  'design-system.md',
  'documentation-structure.md',
  'development-workflow.md',
  'index.md',
  'instances.md',
  'plugin-database.md',
  'plugin-development.md',
  'product-roadmap.md',
  'pwa-real-device-testing.md',
  'repositories.md',
  'sdk-stability.md',
  'security.md',
  'self-hosting.md',
  'testing-e2e.md',
  'troubleshooting.md',
  'upgrade.md',
]);

const explicitlyPrivateDocuments = new Set(['rfcs/TEMPLATE.md']);

function listMarkdownFiles(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listMarkdownFiles(absolutePath, relativePath);
    }

    return entry.isFile() && entry.name.endsWith('.md') ? [relativePath] : [];
  });
}

export function isPublicDocument(relativePath: string): boolean {
  if (explicitlyPrivateDocuments.has(relativePath)) return false;

  const topLevelEntry = relativePath.split('/')[0] ?? relativePath;
  return publicDirectories.has(topLevelEntry) || publicRootDocuments.has(relativePath);
}

/**
 * VitePress treats every Markdown file under srcDir as publishable by default.
 * Generate exact exclusions so adding an internal plan, epic, or review note can
 * never expose it through a route or local search without an explicit policy edit.
 */
export function getPrivateDocumentPaths(): string[] {
  return listMarkdownFiles(docsRoot).filter((relativePath) => !isPublicDocument(relativePath));
}

function extractRfcTitle(absoluteFile: string): string {
  const content = readFileSync(absoluteFile, 'utf8');
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  const frontmatterTitle = frontmatter
    ? /^title:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim()
    : undefined;
  if (frontmatterTitle) return frontmatterTitle.replace(/^['"]|['"]$/g, '');

  const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
  if (heading) return heading.replace(/^RFC\s+\d+\s*[—-]\s*/, '');

  return path.basename(absoluteFile, '.md');
}

/**
 * RFCs are numbered documents added continuously; hand-maintaining a sidebar
 * entry per file drifts as soon as someone forgets to add one. Discover them
 * from docs/rfcs/ instead, the same way getPrivateDocumentPaths discovers
 * private docs.
 */
export function getRfcSidebarItems(): Array<{ text: string; link: string }> {
  return readdirSync(rfcsDir)
    .filter((name) => /^\d{4}-.+\.md$/.test(name))
    .sort()
    .map((name) => {
      const number = name.slice(0, 4);
      const title = extractRfcTitle(path.join(rfcsDir, name));
      return {
        text: `RFC ${number} — ${title}`,
        link: `/rfcs/${name.replace(/\.md$/, '')}`,
      };
    });
}
