'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, FormField, Input, TagInput, StatusBadge, useToast } from '@sovereignfs/ui';
import styles from '../console.module.css';

interface OAuthClientRow {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  scope?: string;
  disabled?: boolean;
}

/** Only populated immediately after create/rotate — never persisted client-side beyond this render. */
interface RevealedSecret {
  clientId: string;
  clientSecret: string;
}

const DEFAULT_SCOPES = 'openid email profile';

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/auth${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const text = await res.text();
  const parsed = text
    ? ((): unknown => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })()
    : null;
  if (!res.ok) {
    throw new Error(
      (parsed as { message?: string } | null)?.message ?? `Request failed (${res.status})`,
    );
  }
  // deleteOAuthClient responds 200 with an empty body, not 204 — parsed is
  // null in that case, which callers treat as "no return value".
  return parsed as T;
}

export function OAuthClientsClient() {
  const toast = useToast();
  const [clients, setClients] = useState<OAuthClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [redirectUris, setRedirectUris] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await authFetch<OAuthClientRow[] | null>('/oauth2/get-clients');
      setClients(rows ?? []);
    } catch (error) {
      toast.show({
        title: 'Could not load external clients',
        message: error instanceof Error ? error.message : undefined,
        category: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(): Promise<void> {
    if (redirectUris.length === 0) {
      toast.show({ title: 'At least one redirect URI is required', category: 'error' });
      return;
    }
    setCreating(true);
    try {
      const created = await authFetch<{ client_id: string; client_secret?: string }>(
        '/oauth2/create-client',
        {
          method: 'POST',
          body: JSON.stringify({
            client_name: name || undefined,
            redirect_uris: redirectUris,
            scope: DEFAULT_SCOPES,
            type: 'web',
          }),
        },
      );
      if (created.client_secret) {
        setRevealed({ clientId: created.client_id, clientSecret: created.client_secret });
      }
      setName('');
      setRedirectUris([]);
      toast.show({ title: 'Client registered', category: 'success' });
      await refresh();
    } catch (error) {
      toast.show({
        title: 'Could not register client',
        message: error instanceof Error ? error.message : undefined,
        category: 'error',
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate(clientId: string): Promise<void> {
    try {
      const rotated = await authFetch<{ client_id: string; client_secret?: string }>(
        '/oauth2/client/rotate-secret',
        { method: 'POST', body: JSON.stringify({ client_id: clientId }) },
      );
      if (rotated.client_secret) {
        setRevealed({ clientId: rotated.client_id, clientSecret: rotated.client_secret });
      }
      toast.show({ title: 'Secret rotated', category: 'success' });
    } catch (error) {
      toast.show({
        title: 'Could not rotate secret',
        message: error instanceof Error ? error.message : undefined,
        category: 'error',
      });
    }
  }

  async function handleRevoke(clientId: string): Promise<void> {
    try {
      await authFetch('/oauth2/delete-client', {
        method: 'POST',
        body: JSON.stringify({ client_id: clientId }),
      });
      toast.show({ title: 'Client revoked', category: 'success' });
      await refresh();
    } catch (error) {
      toast.show({
        title: 'Could not revoke client',
        message: error instanceof Error ? error.message : undefined,
        category: 'error',
      });
    }
  }

  return (
    <div className={styles.providerConfigStack}>
      {revealed && (
        <div role="alert" className={styles.providerConfigCard}>
          <p className={styles.helpText}>
            <strong>Client secret for {revealed.clientId}</strong> — shown once, copy it now. It
            cannot be displayed again; if it&rsquo;s lost, rotate the secret instead.
          </p>
          <code className={styles.codeInline}>{revealed.clientSecret}</code>
          <div className={styles.providerConfigActions}>
            <Button variant="secondary" size="sm" onClick={() => setRevealed(null)}>
              Done, I&rsquo;ve copied it
            </Button>
          </div>
        </div>
      )}

      <div className={styles.providerConfigForm}>
        <FormField label="Display name" id="oauth-client-name" hint="Shown on the consent screen">
          {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField
          label="Redirect URIs"
          id="oauth-client-redirects"
          hint="Exact match required at authorization time — no prefix or wildcard"
        >
          {(field) => (
            <TagInput
              {...field}
              value={redirectUris}
              onChange={setRedirectUris}
              placeholder="https://your-app.example/auth/callback"
            />
          )}
        </FormField>
        <Button onClick={() => void handleCreate()} disabled={creating}>
          {creating ? 'Registering…' : 'Register client'}
        </Button>
      </div>

      <div className={styles.providerConfigCard}>
        {loading ? (
          <p className={styles.helpText}>Loading…</p>
        ) : clients.length === 0 ? (
          <p className={styles.helpText}>No external clients registered yet.</p>
        ) : (
          clients.map((client) => (
            <div key={client.client_id} className={styles.providerConfigCard}>
              <p className={styles.helpText}>
                <strong>{client.client_name ?? '(unnamed)'}</strong>{' '}
                <StatusBadge status={client.disabled ? 'error' : 'synced'}>
                  {client.disabled ? 'revoked' : 'active'}
                </StatusBadge>
              </p>
              <p className={styles.helpText}>Client ID: {client.client_id}</p>
              <p className={styles.helpText}>Redirect URIs: {client.redirect_uris.join(', ')}</p>
              <div className={styles.providerConfigActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleRotate(client.client_id)}
                >
                  Rotate secret
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleRevoke(client.client_id)}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
