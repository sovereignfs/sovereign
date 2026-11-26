import type { FormEvent } from 'react';
import { useHydrated } from '../../hooks/useHydrated';
import { Alert } from '../Alert/Alert';
import { Button } from '../Button/Button';
import { FormField } from '../FormField/FormField';
import { Input } from '../Input/Input';
import styles from './Account.module.css';

/** How a link came back from Sovereign: `done`, or why it was refused. */
export type LinkOutcome = 'done' | 'taken' | 'address';

export interface LinkSovereignPanelProps {
  /** Whether this account already signs in through Sovereign. */
  linked: boolean;
  /** What the instance is called, as people know it. Default "Sovereign". */
  instanceName?: string;
  /** How the last link came back (the page reads it from its address). */
  outcome?: LinkOutcome | undefined;
  error?: string | undefined;
  pending?: boolean;
  /** The password, once the person submits it. The panel never sends anything itself. */
  onSubmit: (values: { password: string }) => void;
}

const OUTCOMES: Record<
  LinkOutcome,
  { variant: 'success' | 'error'; text: (name: string) => string }
> = {
  done: {
    variant: 'success',
    text: (name) => `Linked. You can sign in here through ${name} from now on.`,
  },
  taken: {
    variant: 'error',
    text: (name) =>
      `That ${name} account already signs in to another account here, so nothing was linked.`,
  },
  address: {
    variant: 'error',
    text: (name) =>
      `The address of that ${name} account belongs to another account here, so nothing was linked.`,
  },
};

/**
 * Linking an account of the app's own to the person's Sovereign account (auth.md §8.2): after their password, they sign in at Sovereign,
 * and whoever signs in there is linked to this account. Nothing is ever linked because two addresses match.
 */
export function LinkSovereignPanel({
  linked,
  instanceName = 'Sovereign',
  outcome,
  error,
  pending = false,
  onSubmit,
}: LinkSovereignPanelProps) {
  // The button is off until the page is running, as `AuthButton`'s is, so a browser never sends the password itself.
  const hydrated = useHydrated();

  // The box is read when the form is sent, as in `SignInForm`: a password manager can fill it without telling the page.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ password: String(new FormData(event.currentTarget).get('password') ?? '') });
  }

  const said = outcome ? OUTCOMES[outcome] : undefined;
  if (linked)
    return (
      <div className={styles.form}>
        {said?.variant === 'success' ? (
          <Alert variant="success">{said.text(instanceName)}</Alert>
        ) : null}
        <p>This account signs in through {instanceName} too.</p>
      </div>
    );
  return (
    <form className={styles.form} onSubmit={submit}>
      {said ? <Alert variant={said.variant}>{said.text(instanceName)}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <p>
        Sign in here with your {instanceName} account as well. After your password, {instanceName}{' '}
        asks you to sign in; that account is then linked to this one.
      </p>
      <FormField label="Password" required>
        {(field) => (
          <Input {...field} type="password" name="password" autoComplete="current-password" />
        )}
      </FormField>
      <div className={styles.row}>
        <Button type="submit" loading={pending} disabled={!hydrated}>
          {pending ? 'Opening…' : `Link to ${instanceName}`}
        </Button>
      </div>
    </form>
  );
}
