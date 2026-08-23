'use client';

import { ResponsiveSurface } from '@sovereignfs/ui';
import { MobileStackedDemo } from './MobileStackedDemo';
import { ThreeColumnDemo } from './ThreeColumnDemo';

/**
 * ThreeColumnLayout has no responsive behavior of its own by design — it's
 * a plain positional layout, not a mobile-aware shell. Fitting a fixed
 * sidebar + fixed detail column on a phone-width screen isn't something the
 * primitive can solve by squeezing itself; it's the consuming plugin's
 * decision how to present the same data at that width. ResponsiveSurface is
 * the established pattern for that fork (see docs/design-system.md's
 * "Mobile carousel & responsive fork") — only one side is ever mounted, no
 * CSS squeeze of the desktop tree.
 */
export function LayoutDemo() {
  return <ResponsiveSurface web={<ThreeColumnDemo />} mobile={<MobileStackedDemo />} />;
}
