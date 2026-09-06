import type { ActionResult } from '../_lib/action-result';
import styles from '../console.module.css';

/**
 * Inline error for a form driven by `useActionState` — announced to assistive
 * tech via `role="status"`. Successes are toasted by the caller (or shown as
 * a success box when there's a follow-up, like an invite token), so this
 * renders nothing for `ok: true`.
 */
export function ActionFeedback({ result }: { result: ActionResult | null | undefined }) {
  if (!result || result.ok) return null;
  return (
    <p className={styles.feedbackError} role="status" aria-live="polite">
      {result.error}
    </p>
  );
}
