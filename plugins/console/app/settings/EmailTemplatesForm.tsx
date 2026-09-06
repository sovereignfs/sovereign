'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { Button, FormField, Input, Select, Textarea } from '@sovereignfs/ui';
import { ActionFeedback } from '../_components/ActionFeedback';
import { useSaveResult } from '../_lib/use-save-result';
import styles from '../console.module.css';
import {
  getEmailTemplateCopyAction,
  saveEmailTemplateCopyAction,
  testSendEmailTemplateAction,
  type EmailTemplateId,
} from './email-templates-actions';

const TEMPLATES: Array<{ id: EmailTemplateId; label: string }> = [
  { id: 'passwordReset', label: 'Password reset' },
  { id: 'invite', label: 'User invite' },
];

const LOCALES: Array<{ id: string; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'German (Deutsch)' },
  { id: 'si', label: 'Sinhala (සிංහල)' },
  { id: 'ta', label: 'Tamil (தமிழ்)' },
];

// templateId/locale flow into the preview <iframe>'s src (a URL/HTML sink) —
// validate the <select>'s reported value against the fixed option set before
// it ever reaches state, rather than trusting e.target.value directly (a
// change event isn't guaranteed to carry one of the option values actually
// rendered). previewUrl's own construction below additionally
// encodeURIComponent()s both values — CodeQL's js/xss-through-dom doesn't
// treat an arbitrary predicate function as a taint barrier, only a
// recognized sanitizer like encodeURIComponent.
function isTemplateId(value: string): value is EmailTemplateId {
  return TEMPLATES.some((t) => t.id === value);
}

function isLocaleId(value: string): boolean {
  return LOCALES.some((l) => l.id === value);
}

/** Field key → label + whether it's a multi-line body field. Subject is
 * capped at 200 chars server-side; body fields at 2000 (see
 * packages/db's setEmailCopy). */
const FIELDS_BY_TEMPLATE: Record<EmailTemplateId, Array<{ key: string; label: string }>> = {
  passwordReset: [
    { key: 'subject', label: 'Subject' },
    { key: 'intro', label: 'Intro' },
    { key: 'cta', label: 'Button text' },
    { key: 'expiry', label: 'Expiry notice' },
    { key: 'ignore', label: 'Ignore notice' },
  ],
  invite: [
    { key: 'subject', label: 'Subject' },
    { key: 'intro', label: 'Intro' },
    { key: 'cta', label: 'Button text' },
    { key: 'expiry', label: 'Expiry notice' },
  ],
};

export function EmailTemplatesForm() {
  const [templateId, setTemplateId] = useState<EmailTemplateId>('passwordReset');
  const [locale, setLocale] = useState('en');
  const [copy, setCopy] = useState<Record<string, string>>({});
  const [loading, startLoading] = useTransition();
  const [previewKey, setPreviewKey] = useState(0);

  const [saveState, saveAction, savePending] = useActionState(saveEmailTemplateCopyAction, null);
  const [testState, testAction, testPending] = useActionState(testSendEmailTemplateAction, null);
  useSaveResult(saveState);
  useSaveResult(testState);

  useEffect(() => {
    startLoading(async () => {
      const result = await getEmailTemplateCopyAction(templateId, locale);
      setCopy(result.ok ? result.copy : {});
    });
    // Re-fetch on every template/locale change; a successful save also bumps
    // previewKey (see below) to refresh the iframe with the just-saved copy.
  }, [templateId, locale]);

  useEffect(() => {
    if (saveState?.ok) setPreviewKey((k) => k + 1);
  }, [saveState]);

  const fields = FIELDS_BY_TEMPLATE[templateId];
  const previewUrl = `/api/admin/email-templates/preview?templateId=${encodeURIComponent(templateId)}&locale=${encodeURIComponent(locale)}`;

  return (
    <div className={styles.fieldStack}>
      <div className={styles.settingsForm}>
        <FormField label="Template" id="email-template-select">
          {(field) => (
            <Select
              {...field}
              value={templateId}
              onChange={(e) => {
                if (isTemplateId(e.target.value)) setTemplateId(e.target.value);
              }}
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Locale" id="email-locale-select">
          {(field) => (
            <Select
              {...field}
              value={locale}
              onChange={(e) => {
                if (isLocaleId(e.target.value)) setLocale(e.target.value);
              }}
            >
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>

      {loading ? (
        <p className={styles.textMuted}>Loading current copy…</p>
      ) : (
        <form action={saveAction} className={styles.settingsForm}>
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="locale" value={locale} />
          {fields.map((f) =>
            f.key === 'subject' || f.key === 'cta' ? (
              <FormField key={f.key} label={f.label} id={`email-field-${f.key}`}>
                {(field) => (
                  <Input {...field} name={f.key} defaultValue={copy[f.key] ?? ''} maxLength={200} />
                )}
              </FormField>
            ) : (
              <FormField key={f.key} label={f.label} id={`email-field-${f.key}`}>
                {(field) => (
                  <Textarea
                    {...field}
                    name={f.key}
                    defaultValue={copy[f.key] ?? ''}
                    maxLength={2000}
                    rows={2}
                  />
                )}
              </FormField>
            ),
          )}
          <p className={styles.helpText}>
            Use <code className={styles.codeInline}>{'{{brandName}}'}</code> to insert the
            instance&apos;s email sender name (set on the Identity page).
          </p>
          <ActionFeedback result={saveState} />
          <Button type="submit" size="sm" disabled={savePending}>
            {savePending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      )}

      <div className={styles.fieldStack}>
        <span className={styles.helpText}>Preview (reflects the last saved copy):</span>
        <iframe
          key={previewKey}
          src={previewUrl}
          title="Email preview"
          sandbox=""
          className={styles.emailPreviewFrame}
        />
      </div>

      <form action={testAction} className={styles.fieldStack}>
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="locale" value={locale} />
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
