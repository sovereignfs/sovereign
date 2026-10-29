'use client';

import { useActionState, useState } from 'react';
import { Alert, Button, CopyButton, FormField, Input } from '@sovereignfs/ui';
import { inviteAction, type InviteResult } from './actions';
import styles from './invites.module.css';

/**
 * Invites an address to sign up. The fields are held here, not left to the form: React empties a form once its
 * action finishes, and a refusal must leave what was typed to be put right. A success clears the address.
 */
export function InviteForm({ mailReady }: { mailReady: boolean }) {
  const [email, setEmail] = useState('');
  const [days, setDays] = useState('7');
  const [state, act, pending] = useActionState<InviteResult | null, FormData>(
    async (previous, form) => {
      const result = await inviteAction(previous, form);
      if (result.ok) setEmail('');
      return result;
    },
    null,
  );

  return (
    <form className={styles.form} action={act}>
      {!mailReady ? (
        <Alert variant="warning">
          Email is not set up, so invitations are not sent. You can still invite someone and pass
          the link on yourself.
        </Alert>
      ) : null}
      <div className={styles.fields}>
        <div className={styles.emailField}>
          <FormField label="Email address" required>
            {(field) => (
              <Input
                {...field}
                type="email"
                name="email"
                autoComplete="off"
                placeholder="name@example.com"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <div className={styles.daysField}>
          <FormField label="Expires after (days)" hint="Leave empty for no expiry.">
            {(field) => (
              <Input
                {...field}
                type="number"
                name="days"
                min={1}
                max={365}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <Button type="submit" loading={pending}>
          {pending ? 'Inviting…' : 'Invite'}
        </Button>
      </div>
      {state?.ok ? (
        <Alert variant="success">
          {state.message}
          {state.link ? (
            <span className={styles.link}>
              <code className={styles.code}>{state.link}</code>
              <CopyButton text={state.link} label="Copy link" />
            </span>
          ) : null}
        </Alert>
      ) : null}
      {state && !state.ok ? <Alert variant="error">{state.error}</Alert> : null}
    </form>
  );
}
