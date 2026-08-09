'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FormField, Input, useToast } from '@sovereignfs/ui';
import styles from '../console.module.css';
import { type ActionResult, updatePushRelayAction } from './actions';

export interface PushRelaySettingsView {
  url: string | null;
  defaultUrl: string;
  disabled: boolean;
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
 * RFC 0087's "distinct, explicit full opt-out" — the URL field and the
 * disabled toggle are independent controls. Leaving the URL field blank
 * means "use the default" (`pushRelay.url: null` in the action), never
 * "the relay is off"; only the checkbox does that.
 */
export function PushRelaySettingsForm({ pushRelay }: { pushRelay: PushRelaySettingsView }) {
  const [state, action, pending] = useActionState(updatePushRelayAction, null);
  useActionToast(state);

  return (
    <div className={styles.providerConfigCard}>
      <p className={styles.helpText}>
        Native mobile push notifications (RFC 0087) route through a shared, sovereignfs-operated
        relay by default — it never sees notification content, only an already-encrypted blob. Leave
        the URL blank to use the default; self-hosting your own relay is a documented escape hatch,
        not required.
      </p>
      <form action={action} className={styles.providerConfigForm}>
        <FormField label="Relay URL" id="push-relay-url" hint={`Default: ${pushRelay.defaultUrl}`}>
          {(field) => (
            <Input
              {...field}
              name="pushRelayUrl"
              type="text"
              placeholder={pushRelay.defaultUrl}
              defaultValue={pushRelay.url ?? ''}
            />
          )}
        </FormField>
        <label className={styles.checkboxRow}>
          <input type="checkbox" name="pushRelayDisabled" defaultChecked={pushRelay.disabled} />
          <span>
            Disable native push entirely
            <span className={styles.helpText}>
              No push device tokens are registered while this is on. Web Push and every other
              notification channel are unaffected.
            </span>
          </span>
        </label>
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
