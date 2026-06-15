/**
 * Pre-paint theme resolver, injected inline as the first body child by the root
 * layout (ACC-08). Reads the `sv-theme` cookie and sets `data-theme` on <html>
 * before hydration to avoid a flash. `light`/`dark` apply directly; `system` (or
 * unset) follows the OS via `prefers-color-scheme`.
 *
 * It is a fixed string so the CSP can allow it by hash (`THEME_SCRIPT_CSP_HASH`
 * in `./security`) rather than a per-request nonce — that keeps the root layout
 * statically renderable (the PWA `/offline` fallback needs it). A guard test
 * (`security.test.ts`) recomputes the hash from this string, so editing the
 * script fails the test until the hash is updated.
 */
export const themeScript = `(function(){try{
var m=document.cookie.match(/(?:^|; )sv-theme=([^;]+)/);
var t=m?decodeURIComponent(m[1]):'system';
var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme=dark?'dark':'light';
}catch(e){}})();`;
