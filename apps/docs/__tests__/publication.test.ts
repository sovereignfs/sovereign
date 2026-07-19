import { describe, expect, it } from 'vitest';

import {
  getDocsRouteRewrites,
  getPrivateDocumentPaths,
  getRfcSidebarItems,
  isPublicDocument,
  pagePath,
  publicGuideRewrites,
} from '../.vitepress/publication';

describe('docs publication policy', () => {
  it.each([
    'index.md',
    'product/features.md',
    'get-started/operators.md',
    'guides/developers.md',
    'self-hosting.md',
    'rfcs/0067-product-led-docs-site.md',
  ])('publishes %s', (document) => {
    expect(isPublicDocument(document)).toBe(true);
  });

  it.each([
    'task-history.md',
    'sovereign-proposal-plan-srs.md',
    'epics/infrastructure.md',
    'adhoc/ios-pwa-inspection-findings.md',
    'rfcs/TEMPLATE.md',
    'docs/developers.md',
    'future-unclassified-plan.md',
  ])('keeps %s private', (document) => {
    expect(isPublicDocument(document)).toBe(false);
  });

  it('excludes every current private example from VitePress', () => {
    const exclusions = new Set(getPrivateDocumentPaths());

    expect(exclusions.size).toBeGreaterThan(0);
    expect(exclusions.has('epics/infrastructure.md')).toBe(true);
    expect(exclusions.has('adhoc/ios-pwa-inspection-findings.md')).toBe(true);
  });

  it('preserves every audience guide under the existing /docs URL space', () => {
    expect(publicGuideRewrites).toEqual({
      'guides/index.md': 'docs/index.md',
      'guides/users.md': 'docs/users.md',
      'guides/pwa.md': 'docs/pwa.md',
      'guides/operators.md': 'docs/operators.md',
      'guides/developers.md': 'docs/developers.md',
      'guides/architecture.md': 'docs/architecture.md',
      'guides/contributing.md': 'docs/contributing.md',
    });
  });

  it('derives docs route rewrites from publicGuideRewrites without drifting', () => {
    expect(getDocsRouteRewrites()).toEqual({
      '/docs/': 'docs/guides/index.md',
      '/docs/users': 'docs/guides/users.md',
      '/docs/pwa': 'docs/guides/pwa.md',
      '/docs/operators': 'docs/guides/operators.md',
      '/docs/developers': 'docs/guides/developers.md',
      '/docs/architecture': 'docs/guides/architecture.md',
      '/docs/contributing': 'docs/guides/contributing.md',
    });
  });

  it('discovers every RFC file with a non-empty title and a matching link', () => {
    const items = getRfcSidebarItems();

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.text).toMatch(/^RFC \d{4} — .+/);
      expect(item.link).toMatch(/^\/rfcs\/\d{4}-/);
    }

    const links = items.map((item) => item.link);
    expect(new Set(links).size).toBe(links.length);
  });

  it.each([
    ['index.md', '/'],
    ['self-hosting.md', '/self-hosting'],
    ['product/index.md', '/product/'],
    ['product/why-sovereign.md', '/product/why-sovereign'],
    ['get-started/developers.md', '/get-started/developers'],
  ])('resolves %s to route %s', (relativePath, expected) => {
    expect(pagePath(relativePath)).toBe(expected);
  });
});
