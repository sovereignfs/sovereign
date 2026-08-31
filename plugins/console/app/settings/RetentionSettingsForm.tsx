'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FormField, Input, useToast } from '@sovereignfs/ui';
import styles from '../console.module.css';
import { type ActionResult, updateRetentionAction } from './actions';

export interface RetentionSettingsView {
  /** null = no window configured = never pruned. */
  deliveryLogsDays: number | null;
  activityLogDays: number | null;
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return (
    <p className={styles.feedbackError} role="status" aria-live="polite">
      {result.error}
    </p>
  );
}

function useActionToast(result: ActionResult | null) {
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    if (result?.ok) {
      toast.show({ title: result.message, category: 'success' });
      router.refresh();
    }
  }, [result, router, toast]);
}

/**
 * GDPR-7 (Art. 5(1)(e) storage limitation). Two independent windows, not one
 * shared setting — audit-log retention (accountability, Art. 5(2)/30) trades
 * off against storage limitation differently than delivery/access-log
 * retention does, so folding them into one number would silently resolve a
 * tension this platform deliberately leaves to the operator. Leaving a field
 * blank disables pruning for that log entirely — there is no default window.
 */
export function RetentionSettingsForm({ retention }: { retention: RetentionSettingsView }) {
  const [state, action, pending] = useActionState(updateRetentionAction, null);
  useActionToast(state);

  return (
    <div className={styles.providerConfigCard}>
      <p className={styles.helpText}>
        Neither window is set by default — nothing is deleted until you configure one. A background
        job checks every few hours and removes rows older than the window you set here.
      </p>
      <form action={action} className={styles.providerConfigForm}>
        <FormField
          label="Delivery & access log retention (days)"
          id="retention-delivery-logs-days"
          hint="Email delivery, push delivery, and cross-app data-access logs. Blank = keep forever."
        >
          {(field) => (
            <Input
              {...field}
              name="retentionDeliveryLogsDays"
              type="number"
              min={1}
              step={1}
              placeholder="Keep forever"
              defaultValue={retention.deliveryLogsDays ?? ''}
            />
          )}
        </FormField>
        <FormField
          label="Activity log retention (days)"
          id="retention-activity-log-days"
          hint="The admin/user activity feed — this is also your account-change audit trail. Blank = keep forever."
        >
          {(field) => (
            <Input
              {...field}
              name="retentionActivityLogDays"
              type="number"
              min={1}
              step={1}
              placeholder="Keep forever"
              defaultValue={retention.activityLogDays ?? ''}
            />
          )}
        </FormField>
        <Feedback result={state} />
        <div className={styles.providerConfigActions}>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}
