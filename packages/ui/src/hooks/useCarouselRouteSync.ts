'use client';

import { useEffect, useRef, useState } from 'react';

export interface UseCarouselRouteSyncOptions {
  /** Maps the current pathname to a slide index — the caller's own routing
   *  logic (e.g. special-casing a virtual "starred" slide), unchanged from
   *  whatever a plugin already has today. This hook has no idea what a
   *  plugin's routes look like, by design — it never imports a router. */
  indexForPathname: (pathname: string) => number;
  /** Inverse mapping — given a settled slide index, the path to navigate to. */
  pathForIndex: (index: number) => string;
  /** The current pathname. The caller reads this via their own router (e.g.
   *  `usePathname()` from `next/navigation`) and passes it in every render —
   *  this package stays framework-generic and has zero runtime dependencies. */
  pathname: string;
  /** Called when this hook wants to navigate — typically
   *  `(path) => router.replace(path, { scroll: false })`. */
  onNavigate: (path: string) => void;
}

export interface UseCarouselRouteSyncResult {
  /** Feed directly into SwipableMobileCarousel's `activeIndex` prop. */
  activeIndex: number;
  /** Feed directly into SwipableMobileCarousel's `onSettle` prop. */
  onSettle: (index: number) => void;
}

/**
 * useCarouselRouteSync — centralizes the pathname↔slide-index mapping and the
 * "was this pathname change our own settle, or an external navigation"
 * distinction that carousel-driving plugins otherwise hand-roll per plugin
 * (a tapped `<Link>`, browser back/forward, vs. this hook's own
 * `router.replace` after a swipe settles). Router-agnostic on purpose: the
 * caller owns the actual `usePathname()`/`router.replace()` calls and only
 * hands this hook plain values/callbacks.
 *
 * Deliberately does not own neighbor-prefetch (SwipableMobileCarousel's
 * `prefetchDistance`/mount-window covers that) or scroll mechanics (the
 * carousel component reacts to `activeIndex` changes itself) — this hook is
 * pathname↔index mapping only, keeping routing glue decoupled from
 * data-fetching and DOM scrolling.
 */
export function useCarouselRouteSync({
  indexForPathname,
  pathForIndex,
  pathname,
  onNavigate,
}: UseCarouselRouteSyncOptions): UseCarouselRouteSyncResult {
  // Kept in refs and refreshed every render (not effect deps) so an inline
  // arrow function passed by the caller each render doesn't retrigger the
  // pathname-sync effect below — only an actual pathname change should.
  const indexForPathnameRef = useRef(indexForPathname);
  indexForPathnameRef.current = indexForPathname;
  const pathForIndexRef = useRef(pathForIndex);
  pathForIndexRef.current = pathForIndex;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const [activeIndex, setActiveIndex] = useState(() => indexForPathname(pathname));
  // Set synchronously inside onSettle, right before this hook's own
  // navigation call — lets the pathname-sync effect below tell "this
  // pathname change is our own settle, already reflected in activeIndex"
  // apart from a genuinely external navigation.
  const isInternalNavRef = useRef(false);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      // The very first render's activeIndex already reflects pathname via
      // the lazy useState initializer above — nothing to resync on mount.
      didMountRef.current = true;
      return;
    }
    if (isInternalNavRef.current) {
      isInternalNavRef.current = false;
      return;
    }
    const newIndex = indexForPathnameRef.current(pathname);
    setActiveIndex((current) => (newIndex === current ? current : newIndex));
    // Only re-run when pathname itself changes — indexForPathname is read
    // through a ref precisely so its identity doesn't matter here.
  }, [pathname]);

  function onSettle(index: number) {
    isInternalNavRef.current = true;
    setActiveIndex(index);
    onNavigateRef.current(pathForIndexRef.current(index));
  }

  return { activeIndex, onSettle };
}
