import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

type Finding = {
  file: string;
  line: number;
  target: string;
  reason: string;
};

type TechnicalDocSection =
  | 'operators'
  | 'app-developers'
  | 'architecture-security'
  | 'contributors';

const technicalDocumentSections: Record<string, TechnicalDocSection> = {
  'docs/self-hosting.md': 'operators',
  'docs/troubleshooting.md': 'operators',
  'docs/upgrade.md': 'operators',
  'docs/plugin-development.md': 'app-developers',
  'docs/plugin-database.md': 'app-developers',
  'docs/sdk-stability.md': 'app-developers',
  'docs/design-system.md': 'app-developers',
  'docs/architecture.md': 'architecture-security',
  'docs/security.md': 'architecture-security',
  'docs/repositories.md': 'architecture-security',
  'docs/architecture-rules.md': 'contributors',
  'docs/development-workflow.md': 'contributors',
  'docs/agent-first-documentation.md': 'contributors',
  'docs/testing-e2e.md': 'contributors',
  'docs/pwa-real-device-testing.md': 'contributors',
  'docs/documentation-structure.md': 'contributors',
};

const validDocumentTypes = new Set(['guide', 'reference', 'policy']);
const validAudiences = new Set(['user', 'operator', 'app-developer', 'contributor']);

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'data',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);

const docsRouteRewrites: Record<string, string> = {
  '/docs/': 'docs/guides/index.md',
  '/docs/users': 'docs/guides/users.md',
  '/docs/pwa': 'docs/guides/pwa.md',
  '/docs/operators': 'docs/guides/operators.md',
  '/docs/developers': 'docs/guides/developers.md',
  '/docs/architecture': 'docs/guides/architecture.md',
  '/docs/contributing': 'docs/guides/contributing.md',
};

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolutePath);
    return entry.isFile() && entry.name.endsWith('.md') ? [absolutePath] : [];
  });
}

function withoutCodeFences(content: string, stripInlineCode = true): string {
  let inFence = false;
  return content
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return '';
      }
      if (inFence) return '';
      return stripInlineCode
        ? line.replace(/(`+)[^`]*\1/g, (code) => ' '.repeat(code.length))
        : line;
    })
    .join('\n');
}

function slugifyHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, '$1')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '');
}

function slugifyVitePressHeading(heading: string): string {
  return heading
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('')
    .filter((character) => character.charCodeAt(0) > 0x1f)
    .join('')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

const anchorCache = new Map<string, Set<string>>();
function getAnchors(markdownFile: string): Set<string> {
  const cached = anchorCache.get(markdownFile);
  if (cached) return cached;

  const anchors = new Set<string>();
  const occurrences = new Map<string, number>();
  const content = withoutCodeFences(readFileSync(markdownFile, 'utf8'), false);
  for (const line of content.split('\n')) {
    const heading = /^(?:#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (!heading) continue;

    for (const baseSlug of [slugifyHeading(heading), slugifyVitePressHeading(heading)]) {
      const occurrence = occurrences.get(baseSlug) ?? 0;
      occurrences.set(baseSlug, occurrence + 1);
      anchors.add(occurrence === 0 ? baseSlug : `${baseSlug}-${occurrence}`);
    }
  }

  anchorCache.set(markdownFile, anchors);
  return anchors;
}

function extractTargets(content: string): Array<{ line: number; target: string }> {
  const targets: Array<{ line: number; target: string }> = [];
  const patterns = [
    /!?\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g,
    /^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm,
    /<(?:a|img)\s+[^>]*(?:href|src)=["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const target = match[1];
      if (!target || match.index === undefined) continue;
      targets.push({
        line: content.slice(0, match.index).split('\n').length,
        target: target.replaceAll('&amp;', '&'),
      });
    }
  }

  return targets;
}

function parseOwnershipMetadata(content: string): {
  docSection?: string;
  docType?: string;
  audiences: string[];
} {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  if (!frontmatter) return { audiences: [] };

  const metadata: { docSection?: string; docType?: string; audiences: string[] } = {
    audiences: [],
  };
  let readingAudiences = false;
  for (const line of frontmatter.split('\n')) {
    const scalar = /^(docSection|docType):\s*(\S+)\s*$/.exec(line);
    if (scalar?.[1] === 'docSection') metadata.docSection = scalar[2];
    if (scalar?.[1] === 'docType') metadata.docType = scalar[2];

    if (/^audiences:\s*$/.test(line)) {
      readingAudiences = true;
      continue;
    }
    const audience = readingAudiences ? /^\s+-\s+(\S+)\s*$/.exec(line)?.[1] : undefined;
    if (audience) {
      metadata.audiences.push(audience);
    } else if (readingAudiences && line.trim() !== '') {
      readingAudiences = false;
    }
  }

  return metadata;
}

function resolveLocalTarget(sourceFile: string, rawTarget: string): string | null {
  if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(rawTarget)) return null;

  const targetWithoutFragment = rawTarget.split('#', 1)[0]?.split('?', 1)[0] ?? '';
  if (!targetWithoutFragment) return null;

  if (targetWithoutFragment.startsWith('/')) {
    const normalizedRoute = targetWithoutFragment.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    const routeKey = normalizedRoute === '/docs' ? '/docs/' : normalizedRoute;
    const rewrittenSource = docsRouteRewrites[routeKey];
    if (rewrittenSource) return path.join(root, rewrittenSource);

    if (!sourceFile.startsWith(path.join(root, 'docs'))) return null;

    const docsCandidate = path.join(root, 'docs', normalizedRoute.slice(1));
    return resolveExistingVariant(docsCandidate);
  }

  return resolveExistingVariant(path.resolve(path.dirname(sourceFile), targetWithoutFragment));
}

function resolveRepositoryGitHubTarget(rawTarget: string): string | null {
  const url = new URL(rawTarget);
  if (url.hostname !== 'github.com') return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'sovereignfs' || parts[1] !== 'sovereign') return null;
  if (parts.length === 2) return path.join(root, 'README.md');
  if ((parts[2] === 'blob' || parts[2] === 'tree') && parts[3] === 'main') {
    return path.join(root, ...parts.slice(4));
  }
  return null;
}

function resolveExistingVariant(candidate: string): string {
  if (existsSync(candidate)) return candidate;
  if (existsSync(`${candidate}.md`)) return `${candidate}.md`;
  if (candidate.endsWith('.html') && existsSync(`${candidate.slice(0, -5)}.md`)) {
    return `${candidate.slice(0, -5)}.md`;
  }
  if (existsSync(path.join(candidate, 'index.md'))) return path.join(candidate, 'index.md');
  return candidate;
}

const findings: Finding[] = [];
const externalTargets = new Set<string>();

for (const [relativeFile, expectedSection] of Object.entries(technicalDocumentSections)) {
  const metadata = parseOwnershipMetadata(readFileSync(path.join(root, relativeFile), 'utf8'));
  if (metadata.docSection !== expectedSection) {
    findings.push({
      file: relativeFile,
      line: 1,
      target: 'docSection',
      reason: `expected ${expectedSection}, found ${metadata.docSection ?? 'none'}`,
    });
  }
  if (!metadata.docType || !validDocumentTypes.has(metadata.docType)) {
    findings.push({
      file: relativeFile,
      line: 1,
      target: 'docType',
      reason: `expected guide, reference, or policy; found ${metadata.docType ?? 'none'}`,
    });
  }
  if (
    metadata.audiences.length === 0 ||
    metadata.audiences.some((audience) => !validAudiences.has(audience))
  ) {
    findings.push({
      file: relativeFile,
      line: 1,
      target: 'audiences',
      reason: `invalid or empty audience list: ${metadata.audiences.join(', ') || 'none'}`,
    });
  }
}

for (const absoluteFile of walk(root)) {
  const relativeFile = path.relative(root, absoluteFile);
  const content = withoutCodeFences(readFileSync(absoluteFile, 'utf8'));

  for (const { line, target } of extractTargets(content)) {
    const repositoryTarget = /^https?:/i.test(target)
      ? resolveRepositoryGitHubTarget(target)
      : null;
    if (/^https?:/i.test(target) && !repositoryTarget) {
      externalTargets.add(target);
      continue;
    }

    const resolvedTarget = repositoryTarget ?? resolveLocalTarget(absoluteFile, target);
    if (!resolvedTarget) continue;

    if (!existsSync(resolvedTarget)) {
      findings.push({
        file: relativeFile,
        line,
        target,
        reason: `missing ${path.relative(root, resolvedTarget)}`,
      });
      continue;
    }

    const fragment = target.includes('#')
      ? target.slice(target.indexOf('#') + 1).split('?', 1)[0]
      : '';
    if (!fragment || !resolvedTarget.endsWith('.md')) continue;

    const decodedFragment = decodeURIComponent(fragment).toLowerCase();
    if (getAnchors(resolvedTarget).has(decodedFragment)) continue;

    findings.push({
      file: relativeFile,
      line,
      target,
      reason: `missing #${decodedFragment} in ${path.relative(root, resolvedTarget)}`,
    });
  }
}

if (process.argv.includes('--list-external')) {
  console.log([...externalTargets].sort().join('\n'));
} else if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.target} (${finding.reason})`);
  }
  console.error(`\n${findings.length} broken local documentation link(s).`);
  process.exitCode = 1;
} else {
  console.log('All local documentation links and ownership metadata are valid.');
}
