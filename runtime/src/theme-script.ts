/**
 * Pre-paint theme resolver, injected inline as the first body child by the root
 * layout (ACC-08). Reads the `sv-theme` cookie and sets `data-theme` on <html>
 * before hydration to avoid a flash. `light`/`dark` apply directly; `system` (or
 * unset) follows the OS via `prefers-color-scheme`.
 *
 * It also owns the `theme-color` meta so the browser/OS chrome (Safari tab tint,
 * iOS status bar, Android system UI) matches the actual UI. This must run in JS,
 * not via `<meta media>` queries: the app's theme is cookie-driven and can be
 * forced to differ from the OS scheme, which a media query cannot follow. The
 * colours are the light/dark `--sv-color-surface` values (`--sv-white` /
 * `--sv-grey-950`); keep them in sync with `packages/ui/src/tokens/semantic.css`
 * and the `ThemeControl` live toggle.
 *
 * The meta is deliberately *not* declared via the layout's `viewport` export:
 * Next's metadata reconciler re-inserts its own copy during hydration, and a
 * server-rendered meta mutated here would end up duplicated (browser then honours
 * the last one). Creating it here — with nothing for Next to manage — keeps a
 * single authoritative tag.
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
var meta=document.querySelector('meta[name="theme-color"]');
if(!meta){meta=document.createElement('meta');meta.setAttribute('name','theme-color');document.head.appendChild(meta);}
meta.setAttribute('content',dark?'#09090b':'#ffffff');
}catch(e){}})();`;
