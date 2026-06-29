// Ref-counted body scroll lock. Multiple overlays (Dialog, Drawer) can be
// open simultaneously; the body stays locked until all of them close.
// Uses data-scroll-locks on <body> as a counter so concurrent callers
// don't clobber each other's lock state.

export function lockBodyScroll(): void {
  const count = parseInt(document.body.dataset.scrollLocks ?? '0', 10);
  document.body.dataset.scrollLocks = String(count + 1);
  if (count === 0) document.body.style.overflow = 'hidden';
}

export function unlockBodyScroll(): void {
  const next = Math.max(0, parseInt(document.body.dataset.scrollLocks ?? '0', 10) - 1);
  document.body.dataset.scrollLocks = String(next);
  if (next === 0) document.body.style.overflow = '';
}
