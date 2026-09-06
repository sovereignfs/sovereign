'use client';

import { useCallback, useTransition } from 'react';
import { useToast } from '@sovereignfs/ui';
import type { ActionResult } from './action-result';

/**
 * Run a Console server action from a click (not a form): pending state via
 * `useTransition`, and a toast for the outcome. An `{ ok: false }` result
 * becomes an error toast with the action's own message — the reason a
 * deactivate/delete/revoke failed used to vanish behind `error.tsx`.
 *
 * Returns `[run, pending]`. `run` resolves to the result so a caller can
 * react further (close a dialog, refresh a list) without re-checking `ok`
 * everywhere.
 */
export function useActionRunner(): [
  (
    action: () => Promise<ActionResult>,
    options?: { successTitle?: string },
  ) => Promise<ActionResult>,
  boolean,
] {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (action: () => Promise<ActionResult>, options?: { successTitle?: string }) =>
      new Promise<ActionResult>((resolve) => {
        startTransition(async () => {
          let result: ActionResult;
          try {
            result = await action();
          } catch (error) {
            result = {
              ok: false,
              error: error instanceof Error ? error.message : 'Something went wrong.',
            };
          }
          if (result.ok) {
            if (options?.successTitle || result.message) {
              toast.show({
                title: options?.successTitle ?? 'Done',
                message: result.message,
                category: 'success',
              });
            }
          } else {
            toast.show({ title: 'Action failed', message: result.error, category: 'error' });
          }
          resolve(result);
        });
      }),
    [toast],
  );

  return [run, pending];
}
