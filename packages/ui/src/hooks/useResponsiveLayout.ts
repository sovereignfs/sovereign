'use client';

import { useIsMobile } from './useIsMobile';

export interface UseResponsiveLayoutOptions<TWeb, TMobile> {
  web: TWeb;
  mobile: TMobile;
  breakpointPx?: number;
}

export interface UseResponsiveLayoutResult<TWeb, TMobile> {
  isMobile: boolean;
  value: TWeb | TMobile;
}

/**
 * useResponsiveLayout — picks between a `web` and `mobile` value for the
 * current viewport, built on `useIsMobile` (same breakpoint/SSR-safe-default
 * behavior, not reimplemented here). Generic over the value type so it works
 * for JSX (the common case — forking an entire component tree, not just a
 * class name) or any other per-breakpoint value a plugin wants to pick
 * without repeating the isMobile-ternary boilerplate every call site.
 *
 * This formalizes the `if (isMobile) return <mobile/>; return <web/>;` fork
 * plugins have hand-rolled per-plugin (e.g. a `MobileAwareShell` component
 * that swaps an entire routed page tree for a client-only mobile one) —
 * see `ResponsiveSurface` for the equivalent as a plain JSX component.
 */
export function useResponsiveLayout<TWeb, TMobile>({
  web,
  mobile,
  breakpointPx,
}: UseResponsiveLayoutOptions<TWeb, TMobile>): UseResponsiveLayoutResult<TWeb, TMobile> {
  const isMobile = useIsMobile(breakpointPx);
  return { isMobile, value: isMobile ? mobile : web };
}
