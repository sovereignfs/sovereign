'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Alert, Button, ConfirmDialog, Select } from '@sovereignfs/ui';
import {
  changeRoleAction,
  deactivateAction,
  deleteAction,
  resetMfaAction,
  reactivateAction,
  type ActionResult,
} from '../actions';
import styles from '../accounts.module.css';

type Props = {
  id: string;
  name: string;
  /** What the person may do to this account: the page works it out, and the server holds it again. */
  may: {
    manage: boolean;
    assignRole: boolean;
    resetMfa: boolean;
  };
  deactivated: boolean;
  /** The role the account has now. */
  currentRole: string;
};

type Run = (previous: ActionResult | null) => Promise<ActionResult>;

/** A button that asks first, then does it, and says how it went. The dialog stays up to show a refusal. */
function Confirmed({
  label,
  title,
  message,
  confirmLabel,
  pendingLabel,
  destructive,
  run,
  onDone,
}: {
  label: string;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  run: Run;
  onDone: (message: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState<ActionResult | null, null>(
    (previous) => run(previous),
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      onDone(state.message);
    }
  }, [state, onDone]);

  return (
    <>
      <Button
        type="button"
        variant={destructive ? 'destructive' : 'secondary'}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        message={message}
        confirmLabel={pending ? pendingLabel : confirmLabel}
        destructive={destructive ?? false}
        pending={pending}
        error={state && !state.ok ? state.error : undefined}
        onConfirm={() => startTransition(() => act(null))}
      />
    </>
  );
}

/** The things an operator can do to one account. Which are offered follows the rules; the server holds them again. */
export function AccountActions({ id, name, may, deactivated, currentRole }: Props) {
  const [done, setDone] = useState<string | undefined>();
  const [roleState, changeRole, rolePending] = useActionState<ActionResult | null, FormData>(
    changeRoleAction.bind(null, id),
    null,
  );

  return (
    <div className={styles.actions}>
      {done ? <Alert variant="success">{done}</Alert> : null}
      {may.assignRole ? (
        <form className={`${styles.actionRow} ${styles.roleForm}`} action={changeRole}>
          <Select name="role" defaultValue={currentRole} aria-label="Role">
            <option value="platform:user">User</option>
            <option value="platform:admin">Admin</option>
          </Select>
          <Button type="submit" variant="secondary" loading={rolePending}>
            {rolePending ? 'Saving…' : 'Change role'}
          </Button>
          {roleState?.ok && roleState.message ? <span>{roleState.message}</span> : null}
          {roleState && !roleState.ok ? <Alert variant="error">{roleState.error}</Alert> : null}
        </form>
      ) : null}
      {may.manage ? (
        <div className={styles.actionRow}>
          {deactivated ? (
            <Confirmed
              label="Reactivate"
              title="Reactivate this account?"
              message={`${name} will be able to sign in again. The sessions that ended stay ended.`}
              confirmLabel="Reactivate"
              pendingLabel="Reactivating…"
              run={reactivateAction.bind(null, id)}
              onDone={setDone}
            />
          ) : (
            <Confirmed
              label="Deactivate"
              title="Deactivate this account?"
              message={`${name} will be signed out everywhere and cannot sign in until you reactivate it. Every app loses what it was given for them.`}
              confirmLabel="Deactivate"
              pendingLabel="Deactivating…"
              destructive
              run={deactivateAction.bind(null, id)}
              onDone={setDone}
            />
          )}
          {may.resetMfa ? (
            <Confirmed
              label="Reset two-factor sign-in"
              title="Reset two-factor sign-in?"
              message={`${name}’s authenticator app and passkeys are removed, so they can sign in with their password and set them up again. They are told by email.`}
              confirmLabel="Reset"
              pendingLabel="Resetting…"
              run={resetMfaAction.bind(null, id)}
              onDone={setDone}
            />
          ) : null}
          <Confirmed
            label="Delete account"
            title="Delete this account?"
            message={`${name}’s account and everything that belongs to it is removed, and every app loses what it was given for them. This cannot be undone.`}
            confirmLabel="Delete"
            pendingLabel="Deleting…"
            destructive
            run={deleteAction.bind(null, id)}
            onDone={setDone}
          />
        </div>
      ) : null}
    </div>
  );
}
