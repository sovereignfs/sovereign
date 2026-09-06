'use client';

import { useActionState, useState } from 'react';
import { Badge, Button, ConfirmDialog, FormField, Input } from '@sovereignfs/ui';
import { ActionFeedback } from '../_components/ActionFeedback';
import { CopyIdButton } from '../_components/CopyIdButton';
import { useSaveResult } from '../_lib/use-save-result';
import styles from '../console.module.css';
import {
  deleteProviderConfigAction,
  saveProviderConfigAction,
  testProviderConfigAction,
} from './actions';

export interface ProviderConfigField {
  key: string;
  label: string;
  description?: string;
  envVar: string;
  required?: boolean;
}

export interface ProviderConfigRow {
  id: string | null;
  pluginId: string;
  pluginName: string;
  provider: string;
  label: string;
  callbackUrl: string | null;
  scopes: readonly string[];
  publicFields: ProviderConfigField[];
  secretFields: ProviderConfigField[];
  publicValues: Record<string, string>;
  hasSecretValues: boolean;
  status: 'configured' | 'error' | 'missing';
  lastCheckedAt: number | null;
  lastError: string | null;
  source: 'env' | 'console' | 'mixed' | 'missing';
  configured: boolean;
  missingRequired: readonly string[];
}

function ProviderStatusBadge({ status }: { status: ProviderConfigRow['status'] }) {
  switch (status) {
    case 'configured':
      return (
        <Badge variant="status" size="sm" status="active">
          Configured
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="status" size="sm" status="failed">
          Error
        </Badge>
      );
    case 'missing':
      return (
        <Badge variant="status" size="sm" status="neutral">
          Not configured
        </Badge>
      );
  }
}

function ProviderConfigCard({ provider }: { provider: ProviderConfigRow }) {
  const [saveState, saveAction, savePending] = useActionState(saveProviderConfigAction, null);
  const [testState, testAction, testPending] = useActionState(testProviderConfigAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProviderConfigAction,
    null,
  );
  const [confirmRemove, setConfirmRemove] = useState(false);
  useSaveResult(saveState);
  useSaveResult(testState);
  useSaveResult(deleteState);

  return (
    <div className={styles.providerConfigCard}>
      <div className={styles.providerConfigHeader}>
        <div>
          <h4 className={styles.providerConfigTitle}>{provider.label}</h4>
          <p className={styles.helpText}>
            {provider.pluginName} <code className={styles.codeInline}>{provider.pluginId}</code>
          </p>
        </div>
        <ProviderStatusBadge status={provider.status} />
      </div>

      <form action={saveAction} className={styles.providerConfigForm}>
        <input type="hidden" name="pluginId" value={provider.pluginId} />
        <input type="hidden" name="provider" value={provider.provider} />
        {provider.callbackUrl && (
          <div className={styles.fieldStack}>
            <span className={styles.helpText}>Callback URL — register this with the provider:</span>
            <span className={styles.userIdRow}>
              <code className={styles.codeInline}>{provider.callbackUrl}</code>
              <CopyIdButton value={provider.callbackUrl} label="Copy callback URL" />
            </span>
          </div>
        )}

        {provider.publicFields.map((field) => (
          <FormField
            key={field.key}
            label={field.label}
            id={`${provider.pluginId}-${provider.provider}-${field.key}`}
            hint={`${field.required ? 'Required. ' : ''}Env fallback: ${field.envVar}`}
            required={field.required}
          >
            {(input) => (
              <Input
                {...input}
                name={`public:${field.key}`}
                type="text"
                defaultValue={provider.publicValues[field.key] ?? ''}
              />
            )}
          </FormField>
        ))}

        {provider.secretFields.map((field) => (
          <FormField
            key={field.key}
            label={field.label}
            id={`${provider.pluginId}-${provider.provider}-${field.key}`}
            hint={`${field.required ? 'Required. ' : ''}Env fallback: ${field.envVar}`}
            required={field.required}
          >
            {(input) => (
              <Input
                {...input}
                name={`secret:${field.key}`}
                type="password"
                placeholder={provider.hasSecretValues ? 'Stored — leave blank to keep' : ''}
                autoComplete="new-password"
              />
            )}
          </FormField>
        ))}

        {provider.scopes.length > 0 && (
          <p className={styles.helpText}>Scopes: {provider.scopes.join(', ')}</p>
        )}
        {provider.missingRequired.length > 0 && (
          <p className={styles.feedbackError} role="status">
            Missing required fields: {provider.missingRequired.join(', ')}
          </p>
        )}
        {provider.lastError && (
          <p className={styles.feedbackError} role="status">
            {provider.lastError}
          </p>
        )}
        <ActionFeedback result={saveState} />
        <div className={styles.rowActions}>
          <Button type="submit" size="sm" disabled={savePending}>
            {savePending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>

      <div className={styles.fieldStack}>
        <div className={styles.rowActions}>
          <form action={testAction}>
            <input type="hidden" name="id" value={provider.id ?? ''} />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={testPending || !provider.id}
            >
              {testPending ? 'Testing…' : 'Test connection'}
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={deletePending || !provider.id}
            onClick={() => setConfirmRemove(true)}
          >
            {deletePending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
        <ActionFeedback result={testState} />
        <ActionFeedback result={deleteState} />
      </div>

      <form action={deleteAction} id={`remove-provider-${provider.pluginId}-${provider.provider}`}>
        <input type="hidden" name="id" value={provider.id ?? ''} />
      </form>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remove ${provider.label} configuration?`}
        message="The saved values (including any secrets) are deleted from this instance. The app falls back to environment variables, or stops working if none are set."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setConfirmRemove(false);
          (
            document.getElementById(
              `remove-provider-${provider.pluginId}-${provider.provider}`,
            ) as HTMLFormElement | null
          )?.requestSubmit();
        }}
      />
    </div>
  );
}

export function ProviderConfigsSection({ providers }: { providers: ProviderConfigRow[] }) {
  if (providers.length === 0) {
    return <p className={styles.textMuted}>No installed apps declare configurable providers.</p>;
  }
  return (
    <div className={styles.providerConfigGrid}>
      {providers.map((provider) => (
        <ProviderConfigCard key={`${provider.pluginId}:${provider.provider}`} provider={provider} />
      ))}
    </div>
  );
}
