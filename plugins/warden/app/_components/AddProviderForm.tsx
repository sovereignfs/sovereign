'use client';

import { useActionState, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
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

/**
 * Fields are controlled, not left as plain uncontrolled `defaultValue`-less
 * inputs: React resets a `<form action={...}>`'s uncontrolled fields after
 * *every* action call that doesn't throw — including one that resolves with
 * an `{ok: false}` validation error — so an uncontrolled "Base URL" field
 * would silently wipe an already-valid "Name" the user just typed the
 * moment the *next* field failed validation. Controlled state survives that
 * reset because React reasserts it on the next render regardless.
 */
export function AddProviderForm({ onAdded }: { onAdded: () => void }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createProviderAction,
    null,
  );
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) {
      toast.show({ title: state.message, category: 'success' });
      setLabel('');
      setBaseUrl('');
      setApiKey('');
      onAdded();
    }
  }, [state, toast, onAdded]);

  return (
    <Card padding="md" className={styles.providerCard}>
      <p className={styles.providerLabel}>Add a provider</p>
      <form action={formAction} className={styles.form}>
        <FormField label="Name" id="add-label" hint='e.g. "OpenRouter" or "Home server"'>
          {(field) => (
            <Input
              {...field}
              name="label"
              type="text"
              placeholder="OpenRouter"
              value={label}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setLabel(event.target.value)}
            />
          )}
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
              value={baseUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setBaseUrl(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="API key" id="add-apiKey">
          {(field) => (
            <Input
              {...field}
              name="apiKey"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setApiKey(event.target.value)}
            />
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
