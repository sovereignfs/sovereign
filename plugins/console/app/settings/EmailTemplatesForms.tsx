'use client';

import { useActionState, useState } from 'react';
import styles from '../console.module.css';
import { type ActionResult, updateEmailCopyAction, sendTestEmailAction } from './actions';

type TemplateId = 'passwordReset' | 'invite';

const TEMPLATE_LABELS: Record<TemplateId, string> = {
  passwordReset: 'Password Reset',
  invite: 'Invite',
};

const COPY_FIELDS: Record<TemplateId, { key: string; label: string; maxLength: number }[]> = {
  passwordReset: [
    { key: 'subject', label: 'Subject', maxLength: 200 },
    { key: 'intro', label: 'Introduction', maxLength: 2000 },
    { key: 'cta', label: 'Button label', maxLength: 2000 },
    { key: 'expiry', label: 'Expiry note', maxLength: 2000 },
    { key: 'ignore', label: 'Ignore note', maxLength: 2000 },
  ],
  invite: [
    { key: 'subject', label: 'Subject', maxLength: 200 },
    { key: 'intro', label: 'Introduction', maxLength: 2000 },
    { key: 'cta', label: 'Button label', maxLength: 2000 },
    { key: 'expiry', label: 'Expiry note', maxLength: 2000 },
    { key: 'footer', label: 'Footer note', maxLength: 2000 },
  ],
};

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={result.ok ? styles.feedbackSuccess : styles.feedbackError}
      role="status"
      aria-live="polite"
    >
      {result.ok ? result.message : result.error}
    </p>
  );
}

function CopyFieldForm({
  templateId,
  fieldKey,
  label,
  maxLength,
  initialValue,
}: {
  templateId: TemplateId;
  fieldKey: string;
  label: string;
  maxLength: number;
  initialValue: string;
}) {
  const [state, action, pending] = useActionState(updateEmailCopyAction, null);
  return (
    <form action={action} className={styles.settingsForm}>
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="field" value={fieldKey} />
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor={`${templateId}-${fieldKey}`}>
          {label}
          {fieldKey === 'subject' && (
            <span style={{ fontWeight: 400, color: 'var(--sv-color-text-secondary)' }}>
              {' '}
              — supports <code>{'{{brandName}}'}</code>
            </span>
          )}
        </label>
        <input
          id={`${templateId}-${fieldKey}`}
          name="value"
          type="text"
          defaultValue={initialValue}
          maxLength={maxLength}
          placeholder="Leave blank to use the built-in default"
          className={styles.input}
        />
      </div>
      <Feedback result={state} />
      <button type="submit" className={styles.actionButton} disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

function TestSendForm({ templateId }: { templateId: TemplateId }) {
  const [state, action, pending] = useActionState(sendTestEmailAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="templateId" value={templateId} />
      <Feedback result={state} />
      <button type="submit" className={styles.actionButton} disabled={pending}>
        {pending ? 'Sending…' : 'Send test email to my address'}
      </button>
    </form>
  );
}

interface EmailTemplatesFormProps {
  initialCopy: Record<TemplateId, Record<string, string>>;
  previewBaseUrl: string;
}

export function EmailTemplatesForm({ initialCopy, previewBaseUrl }: EmailTemplatesFormProps) {
  const [activeTemplate, setActiveTemplate] = useState<TemplateId>('passwordReset');
  const fields = COPY_FIELDS[activeTemplate];
  const copy = initialCopy[activeTemplate];

  const previewUrl = `${previewBaseUrl}/api/admin/email-templates/preview?templateId=${activeTemplate}`;

  return (
    <div>
      <div className={styles.fieldGroup} style={{ marginBottom: 24 }}>
        <label className={styles.label} htmlFor="template-selector">
          Template
        </label>
        <select
          id="template-selector"
          className={styles.input}
          value={activeTemplate}
          onChange={(e) => setActiveTemplate(e.target.value as TemplateId)}
        >
          {(Object.keys(TEMPLATE_LABELS) as TemplateId[]).map((id) => (
            <option key={id} value={id}>
              {TEMPLATE_LABELS[id]}
            </option>
          ))}
        </select>
      </div>

      <p className={styles.helpText}>
        Override the built-in English copy for the selected template. Leave any field blank to use
        the default. <code>{'{{brandName}}'}</code> is replaced with the instance name.
      </p>

      {fields.map((f) => (
        <CopyFieldForm
          key={`${activeTemplate}-${f.key}`}
          templateId={activeTemplate}
          fieldKey={f.key}
          label={f.label}
          maxLength={f.maxLength}
          initialValue={copy[f.key] ?? ''}
        />
      ))}

      <div style={{ marginTop: 24 }}>
        <p className={styles.helpText}>
          Preview and test the template with the current instance identity and copy overrides.
        </p>
        <iframe
          src={previewUrl}
          title={`Preview: ${TEMPLATE_LABELS[activeTemplate]}`}
          sandbox="allow-same-origin"
          style={{
            width: '100%',
            height: 480,
            border: '1px solid var(--sv-color-border)',
            borderRadius: 6,
            display: 'block',
            marginBottom: 16,
          }}
        />
        <TestSendForm templateId={activeTemplate} />
      </div>
    </div>
  );
}
