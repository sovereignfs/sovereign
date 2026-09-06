'use client';

import { useActionState } from 'react';
import { Button, FormField, Input } from '@sovereignfs/ui';
import { ActionFeedback } from '../_components/ActionFeedback';
import { useSaveResult } from '../_lib/use-save-result';
import styles from '../console.module.css';
import { testSmtpSettingsAction, updateSmtpSettingsAction } from './actions';

export interface SmtpSettingsView {
  host: string | null;
  port: number | null;
  user: string | null;
  from: string | null;
  hasPassword: boolean;
  source: 'env' | 'console' | 'mixed';
}

/** Read-only summary shown to non-owners — the section stays visible, but
 * only an owner sees an editable form. */
function SmtpReadOnlySummary({ smtp }: { smtp: SmtpSettingsView }) {
  const rows: [string, string][] = [
    ['Host', smtp.host ?? 'From environment'],
    ['Port', smtp.port === null ? 'From environment' : String(smtp.port)],
    ['User', smtp.user ?? 'From environment'],
    ['From address', smtp.from ?? 'From environment'],
    ['Password', smtp.hasPassword ? 'Configured' : 'Not set'],
    ['Source', smtp.source],
  ];
  return (
    <div className={styles.fieldStack}>
      <ul className={styles.compactList}>
        {rows.map(([label, value]) => (
          <li key={label} className={styles.compactRow}>
            <span className={styles.compactRowSubtitle}>{label}</span>
            <span className={styles.compactRowTitle}>{value}</span>
          </li>
        ))}
      </ul>
      <p className={styles.helpText}>Only the instance owner can change these values.</p>
    </div>
  );
}

export function SmtpSettingsForm({ smtp, canEdit }: { smtp: SmtpSettingsView; canEdit: boolean }) {
  const [saveState, saveAction, savePending] = useActionState(updateSmtpSettingsAction, null);
  const [testState, testAction, testPending] = useActionState(testSmtpSettingsAction, null);
  useSaveResult(saveState);
  useSaveResult(testState);

  if (!canEdit) return <SmtpReadOnlySummary smtp={smtp} />;

  return (
    <div className={styles.fieldStack}>
      <p className={styles.helpText}>
        Current source: <strong>{smtp.source}</strong>. Values saved here take effect immediately
        and override the matching environment variable.
      </p>
      <form action={saveAction} className={styles.settingsForm}>
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
        <ActionFeedback result={saveState} />
        <Button type="submit" size="sm" disabled={savePending}>
          {savePending ? 'Saving…' : 'Save'}
        </Button>
      </form>

      <form action={testAction} className={styles.fieldStack}>
        <div className={styles.rowActions}>
          <Button type="submit" size="sm" variant="secondary" disabled={testPending}>
            {testPending ? 'Sending…' : 'Send test email to myself'}
          </Button>
        </div>
        <ActionFeedback result={testState} />
      </form>
    </div>
  );
}
