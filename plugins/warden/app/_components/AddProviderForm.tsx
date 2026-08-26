'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button, Card, FormField, Input, useToast } from '@sovereignfs/ui';
import type { ActionResult } from '../actions';
import { createProviderAction } from '../actions';
import styles from './providers.module.css';

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return (
    <p className={styles.feedbackError} role="status" aria-live="polite">
      {result.error}
    </p>
  );
}

export function AddProviderForm({ onAdded }: { onAdded: () => void }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createProviderAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) {
      toast.show({ title: state.message, category: 'success' });
      formRef.current?.reset();
      onAdded();
    }
  }, [state, toast, onAdded]);

  return (
    <Card padding="md" className={styles.providerCard}>
      <p className={styles.providerLabel}>Add a provider</p>
      <form ref={formRef} action={formAction} className={styles.form}>
        <FormField label="Name" id="add-label" hint='e.g. "OpenRouter" or "Home server"'>
          {(field) => <Input {...field} name="label" type="text" placeholder="OpenRouter" />}
        </FormField>
        <FormField
          label="Base URL"
          id="add-baseUrl"
          hint="The endpoint's OpenAI-compatible API base, e.g. https://openrouter.ai/api/v1"
        >
          {(field) => (
            <Input
              {...field}
              name="baseUrl"
              type="text"
              placeholder="https://openrouter.ai/api/v1"
            />
          )}
        </FormField>
        <FormField label="API key" id="add-apiKey">
          {(field) => (
            <Input {...field} name="apiKey" type="password" autoComplete="new-password" />
          )}
        </FormField>
        <Feedback result={state} />
        <div className={styles.formActions}>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Adding…' : 'Add provider'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
