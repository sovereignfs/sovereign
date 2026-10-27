/**
 * Sets `data-theme` before the first paint so there is no flash: the saved choice, else
 * the system preference. It is an inline script, so it runs only with the request's nonce.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('sv-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})();`;
