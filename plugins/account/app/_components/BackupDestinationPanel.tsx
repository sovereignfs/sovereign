'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import {
  Alert,
  Button,
  Checkbox,
  CodeTextarea,
  FormField,
  Input,
  SegmentedControl,
} from '@sovereignfs/ui';
import { connectBackupDestinationAction, type ActionResult } from '../data/actions';
import styles from '../account.module.css';

const AUTH_TYPE_OPTIONS = [
  { label: 'Access token', value: 'https-token' as const },
  { label: 'SSH key', value: 'ssh-key' as const },
];

export interface BackupDestinationPanelProps {
  /** Called once after a destination connects successfully, so the parent
   * page's generic "Connected accounts" list (which already renders any
   * `sdk.connections` record, this one included) can refresh. Safe to pass
   * an unstable (inline) reference — a `handledStateRef` guard (see below)
   * ties the call to a genuinely new successful `state` object, not to this
   * prop's own identity, so a parent re-render with a fresh closure can't
   * replay it. This mirrors the fix for the identical bug class this repo
   * already hit once with an analogous `onAdded` prop. */
  onConnected?: () => void;
}

/**
 * Account → Data: generate a backup key (an age identity, entirely
 * client-side — the private half never leaves the browser) and connect a
 * personal git repository as a backup destination. Workstream 0023 leg 2.
 * No push logic here — that's leg 3.
 */
export function BackupDestinationPanel({ onConnected }: BackupDestinationPanelProps) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [useCustomRecipient, setUseCustomRecipient] = useState(false);
  const [authType, setAuthType] = useState<'https-token' | 'ssh-key'>('https-token');
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    connectBackupDestinationAction,
    null,
  );

  const handledStateRef = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state?.ok && handledStateRef.current !== state) {
      handledStateRef.current = state;
      onConnected?.();
    }
  }, [state, onConnected]);

  async function onGenerate() {
    setGenerating(true);
    try {
      const newIdentity = await generateIdentity();
      const newRecipient = await identityToRecipient(newIdentity);
      setIdentity(newIdentity);
      setRecipient(newRecipient);
      setSavedConfirmed(false);
      setUseCustomRecipient(false);
    } finally {
      setGenerating(false);
    }
  }

  function onDownload() {
    if (!identity) return;
    const blob = new Blob([identity], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sovereign-backup-key.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onCopy() {
    if (!identity) return;
    await navigator.clipboard.writeText(identity);
  }

  const canConnect = useCustomRecipient || savedConfirmed;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Backup key</h2>
          <p className={styles.sectionSubtitle}>
            A backup key lets you decrypt your backups yourself, without needing this app — even if
            this instance is gone. Sovereign never sees or stores it; only you hold it.
          </p>
        </div>

        {identity && recipient ? (
          <Alert variant="warning" heading="Save this key now — it won't be shown again">
            <p className={styles.help}>
              If you lose it, backups encrypted with it can never be decrypted, by you or anyone
              else. Download it or copy it somewhere safe before continuing.
            </p>
            <FormField label="Backup key" id="backup-key-reveal" hint="Keep this private">
              {(field) => <CodeTextarea {...field} value={identity} readOnly rows={3} />}
            </FormField>
            <div
              style={{
                display: 'flex',
                gap: 'var(--sv-space-2)',
                marginTop: 'var(--sv-space-2)',
                marginBottom: 'var(--sv-space-3)',
              }}
            >
              <Button type="button" variant="secondary" size="sm" onClick={onDownload}>
                Download
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void onCopy()}>
                Copy
              </Button>
            </div>
            <Checkbox
              checked={savedConfirmed}
              onChange={setSavedConfirmed}
              label="I've saved my backup key somewhere safe"
            />
          </Alert>
        ) : (
          <Button type="button" onClick={() => void onGenerate()} disabled={generating}>
            {generating ? 'Generating…' : 'Generate a backup key'}
          </Button>
        )}

        {identity && (
          <p className={styles.help} style={{ marginTop: 'var(--sv-space-2)' }}>
            Need a fresh key?{' '}
            <Button type="button" variant="ghost" size="sm" onClick={() => void onGenerate()}>
              Generate a new one
            </Button>{' '}
            — the old one will no longer work for new destinations.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Connect a backup destination</h2>
          <p className={styles.sectionSubtitle}>
            Point Sovereign at a git repository you control — any server. Your backups push there
            encrypted with your backup key above.
          </p>
        </div>

        {state && !state.ok && (
          <p className={styles.feedbackError} role="status" aria-live="polite">
            {state.error}
          </p>
        )}
        {state?.ok && <p className={styles.success}>{state.message ?? 'Connected.'}</p>}

        <form className={styles.form} action={formAction}>
          <FormField label="Name" id="backup-destination-label" hint="For your own reference">
            {(field) => (
              <Input {...field} name="label" placeholder="My backup repo" disabled={pending} />
            )}
          </FormField>
          <FormField label="Repository URL" id="backup-destination-repo-url">
            {(field) => (
              <Input
                {...field}
                name="repoUrl"
                placeholder="https://git.example.com/me/my-backups.git"
                disabled={pending}
              />
            )}
          </FormField>
          <FormField
            label="Branch"
            id="backup-destination-branch"
            hint="Created automatically if it doesn't exist"
          >
            {(field) => (
              <Input {...field} name="branch" defaultValue="backups" disabled={pending} />
            )}
          </FormField>

          <FormField label="Access method" id="backup-destination-auth-type">
            {() => (
              <SegmentedControl
                aria-label="Access method"
                value={authType}
                onChange={setAuthType}
                options={AUTH_TYPE_OPTIONS}
              />
            )}
          </FormField>
          <input type="hidden" name="authType" value={authType} />

          <FormField
            label={authType === 'ssh-key' ? 'SSH private key' : 'Access token'}
            id="backup-destination-credential"
            hint="Stored encrypted; never shown again"
          >
            {(field) =>
              authType === 'ssh-key' ? (
                <CodeTextarea {...field} name="credential" rows={4} disabled={pending} />
              ) : (
                <Input
                  {...field}
                  name="credential"
                  type="password"
                  autoComplete="off"
                  disabled={pending}
                />
              )
            }
          </FormField>

          {useCustomRecipient ? (
            <FormField
              label="Backup key (public part)"
              id="backup-destination-recipient"
              hint="Starts with age1…"
            >
              {(field) => (
                <Input {...field} name="ageRecipient" placeholder="age1…" disabled={pending} />
              )}
            </FormField>
          ) : (
            <input type="hidden" name="ageRecipient" value={recipient ?? ''} />
          )}

          {recipient && !useCustomRecipient && (
            <p className={styles.help}>
              Using the backup key generated above.{' '}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUseCustomRecipient(true)}
                disabled={pending}
              >
                Use a different key
              </Button>
            </p>
          )}
          {!recipient && !useCustomRecipient && (
            <p className={styles.help}>
              Generate a backup key above, or{' '}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUseCustomRecipient(true)}
                disabled={pending}
              >
                paste one you already have
              </Button>
              .
            </p>
          )}

          <div style={{ alignSelf: 'flex-start' }}>
            <Button type="submit" disabled={pending || !canConnect}>
              {pending ? 'Connecting…' : 'Connect destination'}
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
