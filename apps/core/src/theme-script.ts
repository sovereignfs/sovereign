import { THEME_COLORS } from './pwa';

/**
 * Sets `data-theme` before the first paint so there is no flash: the saved choice, else the system preference. It
 * is an inline script, so it runs only with the request's nonce.
 *
 * When there is a saved choice it also gives the browser's bar the page's colour in that theme, since the two
 * `theme-color` tags follow the system's colour scheme and a person's choice may be the other one. It does that
 * again once the page has been read, since the tags may come after this script. With no saved choice the system's
 * scheme decides both, and the tags are left as they are.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('sv-theme');var saved=t==='light'||t==='dark';if(!saved){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t;if(saved){var c=${JSON.stringify(THEME_COLORS)}[t];var bar=function(){var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute('content',c);m[i].removeAttribute('media')}};bar();document.addEventListener('DOMContentLoaded',bar)}}catch(e){document.documentElement.dataset.theme='light'}})();`;
