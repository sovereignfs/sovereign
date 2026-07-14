import { describe, expect, it } from 'vitest';

import {
  getPrivateDocumentPaths,
  isPublicDocument,
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
    'roadmap.md',
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
    expect(exclusions.has('roadmap.md')).toBe(true);
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
});
