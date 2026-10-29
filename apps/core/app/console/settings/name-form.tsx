'use client';

import { startTransition, useActionState, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import type { SettingSource } from '../../../src/settings/store';
import { resetNameAction, saveNameAction, type SettingsResult } from './actions';
import { sourceNote } from './source-note';
import styles from './settings.module.css';

/** The instance's name, as it appears in page titles, the sign-in page and emails. */
export function NameForm({
  name,
  source,
  canEdit,
}: {
  name: string;
  source: SettingSource;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(name);
  const [state, save, saving] = useActionState<SettingsResult | null, FormData>(
    saveNameAction,
    null,
  );
  const [resetState, reset, resetting] = useActionState<SettingsResult | null, null>(
    async (previous) => {
      const result = await resetNameAction(previous);
      if (result.ok) setValue('Sovereign');
      return result;
    },
    null,
  );
  const shown = resetState ?? state;

  return (
    <form className={styles.form} action={save}>
      <FormField label="Name" hint={sourceNote(source)}>
        {(field) => (
          <Input
            {...field}
            name="name"
            maxLength={100}
            value={value}
            disabled={!canEdit}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </FormField>
      {canEdit ? (
        <div className={styles.buttons}>
          <Button type="submit" loading={saving}>
            {saving ? 'Saving…' : 'Save name'}
          </Button>
          {source === 'saved' ? (
            <Button
              type="button"
              variant="secondary"
              loading={resetting}
              onClick={() => startTransition(() => reset(null))}
            >
              Use the default
            </Button>
          ) : null}
        </div>
      ) : null}
      {shown?.ok ? <Alert variant="success">{shown.message}</Alert> : null}
      {shown && !shown.ok ? <Alert variant="error">{shown.error}</Alert> : null}
    </form>
  );
}
