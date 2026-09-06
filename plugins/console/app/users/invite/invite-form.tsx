'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button, Checkbox, FormField, Input } from '@sovereignfs/ui';
import {
  listInvitablePluginOptions,
  sendInviteAction,
  type InvitablePluginOption,
  type InviteState,
} from '../actions';
import styles from '../../console.module.css';

type State = InviteState | null;

export function InviteForm({ onSuccess }: { onSuccess?: () => void }) {
  const [state, formAction, pending] = useActionState<State, FormData>(sendInviteAction, null);
  const [pluginOptions, setPluginOptions] = useState<InvitablePluginOption[]>([]);
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);

  useEffect(() => {
    listInvitablePluginOptions()
      .then(setPluginOptions)
      .catch(() => setPluginOptions([]));
  }, []);

  if (state?.success) {
    return (
      <div className={styles.successBox}>
        <p>
          {state.emailWarning ? 'Invitation created for ' : 'Invitation sent to '}
          <strong>{state.email}</strong>.
        </p>
        {state.emailWarning && (
          <p className={styles.errorText}>Email delivery warning: {state.emailWarning}</p>
        )}
        <p className={styles.tokenNote}>
          If email is not configured, share this token manually:{' '}
          <code className={styles.token}>{state.token}</code>
        </p>
        {onSuccess && (
          <Button type="button" onClick={onSuccess}>
            Done
          </Button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.inviteForm}>
      {state && !state.success && (
        <p className={styles.errorText} role="status">
          {state.error}
        </p>
      )}

      <FormField label="Email address" id="invite-email" required>
        {(field) => (
          <Input
            {...field}
            type="email"
            name="email"
            placeholder="user@example.com"
            autoComplete="off"
          />
        )}
      </FormField>

      <FormField label="Expires in (days) (optional)" id="invite-expires">
        {(field) => (
          <Input {...field} type="number" name="expiresInDays" min="1" max="365" placeholder="7" />
        )}
      </FormField>

      {pluginOptions.length > 0 && (
        <FormField label="Grant access to (optional)" id="invite-plugins">
          {() => (
            <div className={styles.checkboxList}>
              {pluginOptions.map((p) => (
                <Checkbox
                  key={p.id}
                  id={`invite-plugin-${p.id}`}
                  label={p.name}
                  checked={selectedPlugins.includes(p.id)}
                  onChange={(checked) =>
                    setSelectedPlugins((prev) =>
                      checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                    )
                  }
                />
              ))}
              {selectedPlugins.map((id) => (
                <input key={id} type="hidden" name="plugins" value={id} />
              ))}
            </div>
          )}
        </FormField>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  );
}
