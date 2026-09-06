'use client';

import { useActionState, useState } from 'react';
import { Button, Checkbox, FormField, Input } from '@sovereignfs/ui';
import { ActionFeedback } from '../_components/ActionFeedback';
import { useSaveResult } from '../_lib/use-save-result';
import styles from '../console.module.css';
import { updatePushRelayAction } from './actions';

export interface PushRelaySettingsView {
  url: string | null;
  defaultUrl: string;
  disabled: boolean;
}

/**
 * RFC 0087's "distinct, explicit full opt-out" — the URL field and the
 * disabled toggle are independent controls. Leaving the URL field blank
 * means "use the default" (`pushRelay.url: null` in the action), never
 * "the relay is off"; only the checkbox does that.
 */
export function PushRelaySettingsForm({ pushRelay }: { pushRelay: PushRelaySettingsView }) {
  const [state, action, pending] = useActionState(updatePushRelayAction, null);
  const [disabled, setDisabled] = useState(pushRelay.disabled);
  useSaveResult(state);

  return (
    <div className={styles.fieldStack}>
      <p className={styles.helpText}>
        Native mobile push notifications route through a shared relay by default — it never sees
        notification content, only an already-encrypted blob. Leave the URL blank to use the
        default; self-hosting your own relay is optional.
      </p>
      <form action={action} className={styles.settingsForm}>
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
        <div className={styles.checkboxList}>
          <Checkbox
            id="push-relay-disabled"
            label="Turn native push off entirely"
            checked={disabled}
            onChange={setDisabled}
          />
          {disabled && <input type="hidden" name="pushRelayDisabled" value="on" />}
          <span className={styles.helpText}>
            No push device tokens are registered while this is on. Web Push and every other
            notification channel are unaffected.
          </span>
        </div>
        <ActionFeedback result={state} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </div>
  );
}
