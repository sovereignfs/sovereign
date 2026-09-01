'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
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
 *
 * The success effect below guards on `handledStateRef` rather than firing
 * whenever `state?.ok` is true: `useActionState`'s `state` is otherwise the
 * *only* thing that should gate re-running this effect, but `onAdded` is a
 * caller-supplied callback, and an effect must list every value it closes
 * over as a dependency — including one a caller passes as a fresh inline
 * closure each render. A prior version of `SetupPrompt` passed
 * `onAdded={() => router.push('/warden')}`, and even navigating to the
 * *current* route still re-rendered the segment; that new render handed
 * this effect a new `onAdded` reference, which alone re-triggered it —
 * replaying the success toast and calling `onAdded()` again, looping for
 * several seconds until the server data caught up and unmounted this form
 * (found live: four stacked "provider was added" toasts from a single
 * submission). Comparing against the exact `state` object already handled
 * makes this effect idempotent regardless of whether a caller's callback is
 * memoized — `SetupPrompt` now also memoizes its own, but this guard
 * protects any future caller that doesn't.
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
  const handledStateRef = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (state?.ok && state !== handledStateRef.current) {
      handledStateRef.current = state;
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
              disabled={pending}
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
              disabled={pending}
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
              disabled={pending}
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
