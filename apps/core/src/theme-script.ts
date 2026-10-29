/**
 * Sets `data-theme` before the first paint so there is no flash: the saved choice, else the system preference. It
 * is an inline script, so it runs only with the request's nonce.
 *
 * It does not touch the `theme-color` tags: they are the framework's, and one changed before the page is hydrated is
 * not recognised by it, which then adds another. The browser's bar takes the colour of a saved choice a moment later,
 * once the page is ready (`ThemeWatcher`).
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('sv-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})();`;
