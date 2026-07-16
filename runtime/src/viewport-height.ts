/**
 * Reliable full-screen viewport height for standalone (installed PWA) layouts.
 *
 * iOS standalone PWAs intermittently report the viewport ~status-bar height
 * short at launch/resume (e.g. 793 instead of the true 852) — and the short
 * value appears across `visualViewport.height`, `window.innerHeight` AND CSS
 * `100dvh` simultaneously, never self-correcting until a reflow. The one metric
 * that stays correct is `window.screen.height`.
 *
 * In portrait standalone with the software keyboard closed the web content
 * fills the whole screen, so `screen.height` is the reliable target. Everywhere
 * else — browser tabs (where the value must sit inside the browser chrome),
 * landscape (`screen.height` is unreliable there), and while the keyboard is up
 * (we want the shrunk height so fixed footers stay above it) — fall back to the
 * measured visual viewport.
 *
 * Callers push the result onto a CSS custom property (`--sv-vh`) that the
 * full-height containers consume as `height: var(--sv-vh, 100dvh)`.
 */
// The launch-bug shortfall is status-bar-sized — Face-ID iPhones range from
// ~44pt (no Dynamic Island) to ~59pt (Dynamic Island). MIN filters out sub-15px
// rounding noise between screen.height and the visual viewport that isn't this
// bug at all; MAX caps how much we'll ever trust screen.height over the
// measured value. Without an upper bound, any device where screen.height
// doesn't equal the true full-screen render height for some other reason (seen
// on iPhone 16e: the footer rendered clipped) gets --sv-vh set taller than the
// actual visible area, pushing the shell's last grid row below the fold.
const MIN_LAUNCH_BUG_GAP = 15;
const MAX_LAUNCH_BUG_GAP = 60;

export function computeViewportHeight(): number {
  const vv = window.visualViewport;
  const measured = vv?.height ?? window.innerHeight;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const portrait = window.innerWidth <= window.innerHeight;
  // A large gap between the layout height and the visual viewport means the
  // keyboard is up; the ~status-bar launch-bug delta never reaches this.
  const keyboardOpen = vv ? window.innerHeight - vv.height > 100 : false;

  const gap = window.screen.height - measured;
  const looksLikeLaunchBug = gap >= MIN_LAUNCH_BUG_GAP && gap <= MAX_LAUNCH_BUG_GAP;

  return isStandalone && portrait && !keyboardOpen && looksLikeLaunchBug
    ? window.screen.height
    : measured;
}
