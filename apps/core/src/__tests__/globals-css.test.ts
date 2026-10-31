import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(__dirname, '../../app/globals.css'), 'utf8');

describe('the page where an installed app’s status bar lies over it', () => {
  // The status bar is translucent and the page runs under it (`viewport-fit: cover`). The body's padding keeps
  // what matters clear of it at rest, but it scrolls away with the page, so text slid under the clock.
  const strip = /body::before\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

  it('keeps a strip of the page’s colour fixed behind the status bar', () => {
    expect(strip).toMatch(/position:\s*fixed/);
    expect(strip).toMatch(/top:\s*0/);
    expect(strip).toMatch(/height:\s*env\(safe-area-inset-top, 0px\)/);
    expect(strip).toMatch(/background:\s*var\(--sv-color-surface\)/);
  });

  it('lets a touch through it, and lies below a sticky header', () => {
    expect(strip).toMatch(/pointer-events:\s*none/);
    const zIndex = Number(/z-index:\s*(\d+)/.exec(strip)?.[1]);
    // The design system's MobileHeader is sticky at 101 and pads for the safe area itself.
    expect(zIndex).toBeGreaterThan(0);
    expect(zIndex).toBeLessThan(101);
  });
});
