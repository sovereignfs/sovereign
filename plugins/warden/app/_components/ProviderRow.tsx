'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  FormField,
  Input,
  StatusBadge,
  useToast,
} from '@sovereignfs/ui';
import type { StatusBadgeStatus } from '@sovereignfs/ui';
import type { ActionResult } from '../actions';
import { deleteProviderAction, updateProviderAction } from '../actions';
import type { ProviderView } from '../_lib/providers';
import type { ProviderDiscoveryStatus } from '../_lib/model-discovery';
import styles from './providers.module.css';

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return (
    <p className={styles.feedbackError} role="status" aria-live="polite">
      {result.error}
    </p>
  );
}

function statusBadge(discovery: ProviderDiscoveryStatus | undefined): {
  status: StatusBadgeStatus;
  label: string;
} {
  if (!discovery) return { status: 'unmodified', label: 'Not checked yet' };
  if (discovery.ok)
    return { status: 'synced', label: `Connected · ${discovery.modelCount} models` };
  return { status: 'error', label: discovery.message ?? 'Unreachable' };
}

export function ProviderRow({
  provider,
  discovery,
  onChanged,
}: {
  provider: ProviderView;
  discovery: ProviderDiscoveryStatus | undefined;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const toast = useToast();

  const [updateState, updateAction, updatePending] = useActionState<ActionResult | null, FormData>(
    updateProviderAction.bind(null, provider.id),
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionResult | null, FormData>(
    deleteProviderAction.bind(null, provider.id),
    null,
  );

  useEffect(() => {
    if (updateState?.ok) {
      toast.show({ title: updateState.message, category: 'success' });
      setEditing(false);
      onChanged();
    }
  }, [updateState, toast, onChanged]);

  useEffect(() => {
    if (deleteState?.ok) {
      toast.show({ title: deleteState.message, category: 'success' });
      setConfirmingDelete(false);
      onChanged();
    }
  }, [deleteState, toast, onChanged]);

  const badge = statusBadge(discovery);

  if (editing) {
    return (
      <Card padding="md" className={styles.providerCard}>
        <form action={updateAction} className={styles.form}>
          <FormField label="Name" id={`label-${provider.id}`}>
            {(field) => <Input {...field} name="label" type="text" defaultValue={provider.label} />}
          </FormField>
          <FormField label="Base URL" id={`baseUrl-${provider.id}`}>
            {(field) => (
              <Input {...field} name="baseUrl" type="text" defaultValue={provider.baseUrl} />
            )}
          </FormField>
          <FormField
            label="API key"
            id={`apiKey-${provider.id}`}
            hint="Leave blank to keep the current key"
          >
            {(field) => (
              <Input
                {...field}
                name="apiKey"
                type="password"
                autoComplete="new-password"
                placeholder="Configured — leave blank to keep"
              />
            )}
          </FormField>
          <Feedback result={updateState} />
          <div className={styles.formActions}>
            <Button type="submit" size="sm" disabled={updatePending}>
              {updatePending ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card padding="md" className={styles.providerCard}>
      <div className={styles.providerHeader}>
        <div>
          <p className={styles.providerLabel}>{provider.label}</p>
          <p className={styles.providerMeta}>{provider.baseUrl}</p>
        </div>
        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
      </div>
      <div className={styles.providerActions}>
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setConfirmingDelete(true)}>
          Remove
        </Button>
      </div>
      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Remove this provider?"
        message={
          <>
            Remove <strong>{provider.label}</strong>? Its stored API key is deleted too — this
            can&apos;t be undone.
          </>
        }
        confirmLabel={deletePending ? 'Removing…' : 'Remove'}
        destructive
        pending={deletePending}
        error={deleteState && !deleteState.ok ? deleteState.error : undefined}
        onConfirm={() => startTransition(() => deleteAction(new FormData()))}
      />
    </Card>
  );
}
