'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, FormField, Input, useToast } from '@sovereignfs/ui';
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
  const [excluded, setExcluded] = useState<string[]>([]);
  const [pushToGit, setPushToGit] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Each successful result is handled exactly once — the effect below also
  // resets local state, and the toast provider's own re-render must not
  // replay the success handling for the same `state` object.
  const handledRef = useRef<TriggerResult | null>(null);

  useEffect(() => {
    if (state?.ok && handledRef.current !== state) {
      handledRef.current = state;
      toast.show({ title: 'Backup started — see the list below for status.', category: 'success' });
      formRef.current?.reset();
      setExcluded([]);
      setPushToGit(false);
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
        <FormField label="Exclude apps from this backup" id="backup-exclude">
          {() => (
            <div className={styles.checkboxList}>
              {excludablePlugins.map((plugin) => (
                <Checkbox
                  key={plugin.id}
                  id={`backup-exclude-${plugin.id}`}
                  label={plugin.name}
                  disabled={pending}
                  checked={excluded.includes(plugin.id)}
                  onChange={(checked) =>
                    setExcluded((prev) =>
                      checked ? [...prev, plugin.id] : prev.filter((id) => id !== plugin.id),
                    )
                  }
                />
              ))}
              {excluded.map((id) => (
                <input key={id} type="hidden" name="excludePlugins" value={id} />
              ))}
            </div>
          )}
        </FormField>
      )}

      {gitPushAvailable && (
        <div className={styles.checkboxList}>
          <Checkbox
            id="backup-push-to-git"
            label="Also push to the configured Git remote"
            disabled={pending}
            checked={pushToGit}
            onChange={setPushToGit}
          />
          {pushToGit && <input type="hidden" name="pushToGit" value="on" />}
          <span className={styles.helpText}>
            Pushes the same encrypted archive as a tagged commit — see SV_BACKUP_GIT_REPOSITORY in
            your environment.
          </span>
        </div>
      )}

      <Feedback result={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Starting…' : 'Back up now'}
      </Button>
    </form>
  );
}
