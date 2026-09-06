'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@sovereignfs/ui';
import type { ActionResult } from './action-result';

/**
 * Settings-style forms: on a successful `useActionState` result, toast the
 * action's message and refresh the route's Server Components so the saved
 * value (and anything the shell derives from it — sidebar, launcher) is
 * re-rendered without a manual reload. Errors stay inline (`ActionFeedback`).
 *
 * Was copy-pasted seven times across the Settings forms as `useSaveResult` /
 * `useActionToast`. Each result object is handled once — the toast
 * provider's own re-render must not replay it.
 */
export function useSaveResult(result: ActionResult | null | undefined): void {
  const toast = useToast();
  const router = useRouter();
  const handled = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (result?.ok && handled.current !== result) {
      handled.current = result;
      toast.show({ title: result.message ?? 'Saved.', category: 'success' });
      router.refresh();
    }
  }, [result, toast, router]);
}
