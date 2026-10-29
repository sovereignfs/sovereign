'use client';

import { startTransition, useActionState, useState } from 'react';
import { Alert, Button, Checkbox } from '@sovereignfs/ui';
import type { SettingSource } from '../../../src/settings/store';
import { resetInviteOnlyAction, saveInviteOnlyAction, type SettingsResult } from './actions';
import { sourceNote } from './source-note';
import styles from './settings.module.css';

/** Whether anyone may sign up, or only people with an invitation. The first account is always allowed. */
export function RegistrationForm({
  inviteOnly,
  source,
  canEdit,
}: {
  inviteOnly: boolean;
  source: SettingSource;
  canEdit: boolean;
}) {
  const [checked, setChecked] = useState(inviteOnly);
  // The setting in force changes when it is reset to the server's: follow it, without losing the message
  // that says what was done (a new `key` would remount the form and wipe it).
  const [inForce, setInForce] = useState(inviteOnly);
  if (inForce !== inviteOnly) {
    setInForce(inviteOnly);
    setChecked(inviteOnly);
  }
  const [state, save, saving] = useActionState<SettingsResult | null, FormData>(
    saveInviteOnlyAction,
    null,
  );
  const [resetState, reset, resetting] = useActionState<SettingsResult | null, null>(
    resetInviteOnlyAction,
    null,
  );
  const shown = resetState ?? state;

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        // A form action would reset the checkbox when it finished, undoing what a refusal should leave.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => save(data));
      }}
    >
      <input type="hidden" name="inviteOnly" value={String(checked)} />
      <Checkbox
        label="Only people I invite can sign up"
        checked={checked}
        disabled={!canEdit}
        onChange={setChecked}
      />
      <p className={styles.hint}>
        {sourceNote(source)} The first account on a new instance can always sign up. Turn this off
        to let anyone create an account.
      </p>
      {canEdit ? (
        <div className={styles.buttons}>
          <Button type="submit" loading={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {source === 'saved' ? (
            <Button
              type="button"
              variant="secondary"
              loading={resetting}
              onClick={() => startTransition(() => reset(null))}
            >
              Use the server’s setting
            </Button>
          ) : null}
        </div>
      ) : null}
      {shown?.ok ? <Alert variant="success">{shown.message}</Alert> : null}
      {shown && !shown.ok ? <Alert variant="error">{shown.error}</Alert> : null}
    </form>
  );
}
