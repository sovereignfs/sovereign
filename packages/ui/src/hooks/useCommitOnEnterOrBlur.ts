'use client';

import type { KeyboardEvent } from 'react';

export interface CommitOnEnterOrBlurHandlers {
  onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
}

/**
 * useCommitOnEnterOrBlur — spreads onto a quick-entry input/textarea so
 * Enter and losing focus both commit through the same callback.
 *
 * iOS Safari adds its own "Previous / Next / Done" toolbar above the
 * software keyboard whenever more than one focusable field is nearby (a
 * Sheet with several fields, a form, etc.) — there is no supported way to
 * suppress it, since it's WebKit's own field-detection heuristic, not
 * something the page controls. Tapping that toolbar's Done/checkmark only
 * ever fires a native `blur`; it is not a form submit and dispatches no
 * keydown, so a field that commits only on Enter silently discards whatever
 * was typed the moment a user dismisses the keyboard that way instead of
 * pressing the on-screen Return key — the two dismissal paths look
 * identical to the user but produce different outcomes.
 *
 * `onCommit` is called unconditionally on both Enter and blur — it owns any
 * empty-value no-op itself, matching how every call site's own commit
 * function already guards against an empty value before doing anything.
 * Callers needing more key handling (e.g. Escape-to-cancel) compose their
 * own `onKeyDown` around the returned one rather than this hook growing
 * options for every caller's own key bindings.
 */
export function useCommitOnEnterOrBlur(onCommit: () => void): CommitOnEnterOrBlurHandlers {
  return {
    onKeyDown: (e) => {
      if (e.key === 'Enter') onCommit();
    },
    onBlur: onCommit,
  };
}
