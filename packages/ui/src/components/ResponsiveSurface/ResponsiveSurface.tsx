import type { ReactNode } from 'react';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

export interface ResponsiveSurfaceProps {
  web: ReactNode;
  mobile: ReactNode;
  breakpointPx?: number;
}

/**
 * ResponsiveSurface — thin JSX convenience wrapper around
 * `useResponsiveLayout` for the common two-tree case: render an entirely
 * different component tree below the breakpoint, not a CSS squeeze of the
 * same one. Renders only whichever side is active — the other tree is never
 * mounted.
 *
 * This does not replace a plugin's own shell component (e.g. a
 * `MobileAwareShell` that also threads plugin-specific props like a refresh
 * signal) — those stay a thin per-plugin wrapper around this.
 */
export function ResponsiveSurface({ web, mobile, breakpointPx }: ResponsiveSurfaceProps) {
  const { value } = useResponsiveLayout({ web, mobile, breakpointPx });
  return <>{value}</>;
}
