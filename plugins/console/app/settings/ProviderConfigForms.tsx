'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FormField, Input, useToast } from '@sovereignfs/ui';
import styles from '../console.module.css';
import {
  type ActionResult,
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

function ProviderConfigCard({ provider }: { provider: ProviderConfigRow }) {
  const [saveState, saveAction, savePending] = useActionState(saveProviderConfigAction, null);
  const [testState, testAction, testPending] = useActionState(testProviderConfigAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProviderConfigAction,
    null,
  );
  useActionToast(saveState);
  useActionToast(testState);
  useActionToast(deleteState);

  return (
    <div className={styles.providerConfigCard}>
      <div className={styles.providerConfigHeader}>
        <div>
          <h3 className={styles.providerConfigTitle}>{provider.label}</h3>
          <p className={styles.helpText}>
            {provider.pluginName} <code className={styles.codeInline}>{provider.pluginId}</code>
          </p>
        </div>
        <span className={styles.providerConfigStatus}>{provider.status}</span>
      </div>

      <form action={saveAction} className={styles.providerConfigForm}>
        <input type="hidden" name="pluginId" value={provider.pluginId} />
        <input type="hidden" name="provider" value={provider.provider} />
        {provider.callbackUrl && (
          <FormField label="Callback URL" id={`${provider.pluginId}-${provider.provider}-callback`}>
            {(field) => (
              <Input
                {...field}
                name="callbackUrl"
                type="url"
                defaultValue={provider.callbackUrl ?? ''}
                readOnly
              />
            )}
          </FormField>
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
                placeholder={provider.hasSecretValues ? 'Stored' : ''}
                autoComplete="new-password"
              />
            )}
          </FormField>
        ))}

        {provider.scopes.length > 0 && (
          <p className={styles.helpText}>Scopes: {provider.scopes.join(', ')}</p>
        )}
        {provider.missingRequired.length > 0 && (
          <p className={styles.feedbackError}>
            Missing required fields: {provider.missingRequired.join(', ')}
          </p>
        )}
        {provider.lastError && <p className={styles.feedbackError}>{provider.lastError}</p>}
        <Feedback result={saveState} />
        <div className={styles.providerConfigActions}>
          <Button type="submit" size="sm" disabled={savePending}>
            {savePending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>

      <div className={styles.providerConfigActions}>
        <form action={testAction}>
          <input type="hidden" name="id" value={provider.id ?? ''} />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={testPending || !provider.id}
          >
            {testPending ? 'Testing...' : 'Test'}
          </Button>
          <Feedback result={testState} />
        </form>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={provider.id ?? ''} />
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={deletePending || !provider.id}
          >
            {deletePending ? 'Removing...' : 'Remove'}
          </Button>
          <Feedback result={deleteState} />
        </form>
      </div>
    </div>
  );
}

export function ProviderConfigsSection({ providers }: { providers: ProviderConfigRow[] }) {
  if (providers.length === 0) {
    return <p className={styles.helpText}>No installed apps declare configurable providers.</p>;
  }
  return (
    <div className={styles.providerConfigGrid}>
      {providers.map((provider) => (
        <ProviderConfigCard key={`${provider.pluginId}:${provider.provider}`} provider={provider} />
      ))}
    </div>
  );
}
