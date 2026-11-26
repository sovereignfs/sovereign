import { useSyncExternalStore } from 'react';

// The answer never changes by itself: React asks once more after hydrating, since the server's differs.
const never = () => () => {};

/**
 * Whether the page is running: `false` in the HTML core sends and while React takes it over, `true` from then on. A form of core's own
 * that its script sends keeps its submit button off until then, as the design system's forms do: before that a browser sends it
 * itself, with what is in it, a password too, in the address (core-app §5.2).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
}
