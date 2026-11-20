'use client';

import { startTransition, useActionState, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { clearExportKeysAction, saveExportKeysAction, type DataResult } from './actions';
import styles from './data.module.css';

/**
 * The keys the owner's export is encrypted to (core-app §4.7.1): public age keys, pasted as `sv key export` prints them. Their private
 * halves stay on the owner's machine, so the server can write an export and never read one.
 */
export function KeysForm({ recipients }: { recipients: string[] }) {
  const saved = recipients.join(' ');
  const [value, setValue] = useState(saved);
  const [state, save, saving] = useActionState<DataResult | null, FormData>(
    saveExportKeysAction,
    null,
  );
  const [clearState, clear, clearing] = useActionState<DataResult | null, null>(
    async (previous) => {
      const result = await clearExportKeysAction(previous);
      if (result.ok) setValue('');
      return result;
    },
    null,
  );
  const shown = clearState ?? state;

  return (
    <form className={styles.form} action={save}>
      <p className={styles.hint}>
        {recipients.length > 0
          ? `Exports are encrypted to ${recipients.length === 1 ? 'one key' : `${recipients.length} keys`}. Only whoever holds the matching private key can open one.`
          : 'No key is saved, so no export can be taken. Run sv key export on your machine and paste the line it prints, or paste any age public key you hold.'}
      </p>
      <FormField
        label="Export keys"
        hint="One or more age public keys, starting age1, separated by spaces. Their private halves stay with you, never here."
      >
        {(field) => (
          <Input
            {...field}
            name="recipients"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </FormField>
      <div className={styles.buttons}>
        <Button type="submit" loading={saving}>
          {saving ? 'Saving…' : recipients.length > 0 ? 'Change the keys' : 'Save the keys'}
        </Button>
        {recipients.length > 0 ? (
          <Button
            type="button"
            variant="secondary"
            loading={clearing}
            onClick={() => startTransition(() => clear(null))}
          >
            Remove the keys
          </Button>
        ) : null}
      </div>
      {shown?.ok ? <Alert variant="success">{shown.message}</Alert> : null}
      {shown && !shown.ok ? <Alert variant="error">{shown.error}</Alert> : null}
    </form>
  );
}
