'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FormField, Input, useToast } from '@sovereignfs/ui';
import { type TriggerResult, triggerInstanceBackupAction } from './actions';
import styles from '../console.module.css';

export interface ExcludablePlugin {
  id: string;
  name: string;
}

function Feedback({ result }: { result: TriggerResult | null }) {
  if (!result || result.ok) return null;
  return (
    <p className={styles.feedbackError} role="status" aria-live="polite">
      {result.error}
    </p>
  );
}

export function BackupTriggerForm({
  excludablePlugins,
  gitPushAvailable,
}: {
  excludablePlugins: ExcludablePlugin[];
  gitPushAvailable: boolean;
}) {
  const [state, action, pending] = useActionState(triggerInstanceBackupAction, null);
  const toast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.show({ title: 'Backup started — see the list below for status.', category: 'success' });
      formRef.current?.reset();
      // Re-runs the page's Server Component so BackupJobList's initialJobs
      // prop includes the just-enqueued job — see that component's own doc
      // comment for why a plain useState there wouldn't otherwise pick it up.
      router.refresh();
    }
  }, [state, toast, router]);

  return (
    <form ref={formRef} action={action} className={styles.settingsForm}>
      <FormField
        label="Passphrase"
        id="backup-passphrase"
        hint="Required to decrypt this backup later — never stored on the server."
      >
        {(field) => (
          <Input
            {...field}
            name="passphrase"
            type="password"
            autoComplete="new-password"
            disabled={pending}
            required
          />
        )}
      </FormField>

      {excludablePlugins.length > 0 && (
        <fieldset className={styles.settingsForm}>
          <legend>Exclude apps from this backup</legend>
          {excludablePlugins.map((plugin) => (
            <label key={plugin.id} className={styles.checkboxRow}>
              <input type="checkbox" name="excludePlugins" value={plugin.id} disabled={pending} />
              <span>{plugin.name}</span>
            </label>
          ))}
        </fieldset>
      )}

      {gitPushAvailable && (
        <label className={styles.checkboxRow}>
          <input type="checkbox" name="pushToGit" disabled={pending} />
          <span>
            Also push to the configured Git remote
            <span className={styles.helpText}>
              Pushes the same encrypted archive as a tagged commit — see SV_BACKUP_GIT_REPOSITORY in
              your environment.
            </span>
          </span>
        </label>
      )}

      <Feedback result={state} />
      <div className={styles.providerConfigActions}>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Starting…' : 'Back up now'}
        </Button>
      </div>
    </form>
  );
}
