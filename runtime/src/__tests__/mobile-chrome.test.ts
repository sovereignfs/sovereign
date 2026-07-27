import { describe, expect, it } from 'vitest';
import type { MobileChromeOverride } from '../registry';
import { mobileFooterVisible, mobileHeaderVisible } from '../mobile-chrome';

/**
 * Direct coverage for the pure route-resolution logic `ClientShell` uses to
 * decide when a client-side navigation crosses a mobile-chrome visibility
 * boundary and must force `router.refresh()` (RFC 0075). Without this,
 * `(platform)/layout.tsx`'s shared-layout reuse would keep rendering the
 * previous route's header/footer state after a soft navigation — the same
 * class of staleness bug fixed for offline routes (RFC 0074).
 */

const config: MobileChromeOverride[] = [
  { routePrefix: '/canvas', mobileHeader: false, mobileFooter: false },
  { routePrefix: '/chat', mobileHeader: true, mobileFooter: false },
];

describe('mobileHeaderVisible', () => {
  it('defaults to true for a plugin with no override', () => {
    expect(mobileHeaderVisible('/launcher', config)).toBe(true);
  });

  it('defaults to true for a plugin with an override that omits mobileHeader', () => {
    expect(mobileHeaderVisible('/chat', config)).toBe(true);
  });

  it('resolves false for a plugin that hides its header', () => {
    expect(mobileHeaderVisible('/canvas', config)).toBe(false);
  });

  it('resolves for a nested route under the plugin prefix', () => {
    expect(mobileHeaderVisible('/canvas/doc/1', config)).toBe(false);
  });
});

describe('mobileFooterVisible', () => {
  it('defaults to true for a plugin with no override', () => {
    expect(mobileFooterVisible('/launcher', config)).toBe(true);
  });

  it('resolves false for a plugin that hides its footer only', () => {
    expect(mobileFooterVisible('/chat', config)).toBe(false);
  });

  it('resolves false for a plugin that hides both', () => {
    expect(mobileFooterVisible('/canvas', config)).toBe(false);
  });
});
