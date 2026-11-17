'use client';

import { startTransition, useActionState, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { clearEscrowAction, saveEscrowAction, type SettingsResult } from './actions';
import styles from './settings.module.css';

/**
 * Recovery (escrow, core-app §5.8): off unless the owner turns it on with the public key `sv key escrow` printed. Says how many
 * accounts are not yet covered, since each is covered only after its person is told, at their next encrypted app.
 */
export function EscrowForm({ line, uncovered }: { line: string | undefined; uncovered: number }) {
  const [value, setValue] = useState(line ?? '');
  const [state, save, saving] = useActionState<SettingsResult | null, FormData>(
    saveEscrowAction,
    null,
  );
  const [clearState, clear, clearing] = useActionState<SettingsResult | null, null>(
    async (previous) => {
      const result = await clearEscrowAction(previous);
      if (result.ok) setValue('');
      return result;
    },
    null,
  );
  const shown = clearState ?? state;

  return (
    <form className={styles.form} action={save}>
      <p className={styles.hint}>
        {line
          ? uncovered === 0
            ? 'Recovery is on, and covers everyone with encrypted data.'
            : `Recovery is on. ${uncovered} ${uncovered === 1 ? 'person is' : 'people are'} not covered yet: each is told, and covered, the next time they open an app that uses encryption.`
          : 'Recovery is off. If someone loses their password, passkeys and recovery kit, nobody can open their encrypted data, you included.'}
      </p>
      <FormField
        label="Recovery key"
        hint="The line sv key escrow printed, starting sv-escrow-1. Its private half stays on your machine, never here."
      >
        {(field) => (
          <Input
            {...field}
            name="escrowKey"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </FormField>
      <div className={styles.buttons}>
        <Button type="submit" loading={saving}>
          {saving ? 'Saving…' : line ? 'Change the recovery key' : 'Turn recovery on'}
        </Button>
        {line ? (
          <Button
            type="button"
            variant="secondary"
            loading={clearing}
            onClick={() => startTransition(() => clear(null))}
          >
            Turn recovery off
          </Button>
        ) : null}
      </div>
      {shown?.ok ? <Alert variant="success">{shown.message}</Alert> : null}
      {shown && !shown.ok ? <Alert variant="error">{shown.error}</Alert> : null}
    </form>
  );
}
