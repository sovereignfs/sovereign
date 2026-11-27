import { useSyncExternalStore } from 'react';

// The answer never changes by itself: React asks once more after hydrating, since the server's differs.
const never = () => () => {};

/**
 * Whether the page is running: `false` in the HTML a server sends and while React takes it over, `true` from then on, and at once for
 * what is first drawn in the browser.
 *
 * A form that its script sends keeps its submit button off until this is `true`. Before that a browser sends such a form itself, as a
 * GET with every named box in the address, a password too. With its submit button off it is not sent, by a click or by Enter.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
}
