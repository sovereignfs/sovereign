import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const docsRoot = fileURLToPath(new URL('../../../docs/', import.meta.url));

export const publicGuideRewrites = {
  'guides/index.md': 'docs/index.md',
  'guides/users.md': 'docs/users.md',
  'guides/pwa.md': 'docs/pwa.md',
  'guides/operators.md': 'docs/operators.md',
  'guides/developers.md': 'docs/developers.md',
  'guides/architecture.md': 'docs/architecture.md',
  'guides/contributing.md': 'docs/contributing.md',
} as const;

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
