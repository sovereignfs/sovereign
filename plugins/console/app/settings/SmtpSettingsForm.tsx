'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FormField, Input, useToast } from '@sovereignfs/ui';
import styles from '../console.module.css';
import { type ActionResult, testSmtpSettingsAction, updateSmtpSettingsAction } from './actions';

export interface SmtpSettingsView {
  host: string | null;
  port: number | null;
  user: string | null;
  from: string | null;
  hasPassword: boolean;
  source: 'env' | 'console' | 'mixed';
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return (
    <p className={styles.feedbackError} role="status" aria-live="polite">
      {result.error}
    </p>
  );
}

function useActionToast(result: ActionResult | null) {
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    if (result?.ok) {
      toast.show({ title: result.message, category: 'success' });
      router.refresh();
    }
  }, [result, router, toast]);
}

/** Read-only summary shown to non-owners — the section stays visible, but
 * only an owner sees an editable form (matches the RoleCell pattern in
 * plugins/console/app/users/page.tsx for owner-only actions). */
function SmtpReadOnlySummary({ smtp }: { smtp: SmtpSettingsView }) {
  return (
    <div className={styles.providerConfigCard}>
      <p className={styles.helpText}>Host: {smtp.host ?? '(from env)'}</p>
      <p className={styles.helpText}>Port: {smtp.port ?? '(from env)'}</p>
      <p className={styles.helpText}>User: {smtp.user ?? '(from env)'}</p>
      <p className={styles.helpText}>From: {smtp.from ?? '(from env)'}</p>
      <p className={styles.helpText}>Password: {smtp.hasPassword ? 'configured' : 'not set'}</p>
      <p className={styles.helpText}>Source: {smtp.source}</p>
      <p className={styles.helpText}>Only the instance owner can view or change these values.</p>
    </div>
  );
}

export function SmtpSettingsForm({ smtp, canEdit }: { smtp: SmtpSettingsView; canEdit: boolean }) {
  const [saveState, saveAction, savePending] = useActionState(updateSmtpSettingsAction, null);
  const [testState, testAction, testPending] = useActionState(testSmtpSettingsAction, null);
  useActionToast(saveState);
  useActionToast(testState);

  if (!canEdit) return <SmtpReadOnlySummary smtp={smtp} />;

  return (
    <div className={styles.providerConfigCard}>
      <p className={styles.helpText}>
        Current source: <strong>{smtp.source}</strong>. Console-saved values take effect immediately
        and override the matching env var.
      </p>
      <form action={saveAction} className={styles.providerConfigForm}>
        <FormField label="Host" id="smtp-host" hint="Env fallback: SMTP_HOST">
          {(field) => <Input {...field} name="host" type="text" defaultValue={smtp.host ?? ''} />}
        </FormField>
        <FormField label="Port" id="smtp-port" hint="Env fallback: SMTP_PORT">
          {(field) => (
            <Input
              {...field}
              name="port"
              type="number"
              min={1}
              max={65535}
              defaultValue={smtp.port ?? ''}
            />
          )}
        </FormField>
        <FormField label="User" id="smtp-user" hint="Env fallback: SMTP_USER">
          {(field) => <Input {...field} name="user" type="text" defaultValue={smtp.user ?? ''} />}
        </FormField>
        <FormField label="Password" id="smtp-pass" hint="Env fallback: SMTP_PASS">
          {(field) => (
            <Input
              {...field}
              name="pass"
              type="password"
              placeholder={smtp.hasPassword ? 'Configured — leave blank to keep' : ''}
              autoComplete="new-password"
            />
          )}
        </FormField>
        <FormField label="From address" id="smtp-from" hint="Env fallback: SMTP_FROM">
          {(field) => <Input {...field} name="from" type="text" defaultValue={smtp.from ?? ''} />}
        </FormField>
        <Feedback result={saveState} />
        <div className={styles.providerConfigActions}>
          <Button type="submit" size="sm" disabled={savePending}>
            {savePending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>

      <form action={testAction}>
        <Button type="submit" size="sm" variant="secondary" disabled={testPending}>
          {testPending ? 'Sending...' : 'Send test email'}
        </Button>
        <Feedback result={testState} />
      </form>
    </div>
  );
}
