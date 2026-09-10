'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  FormField,
  Icon,
  Input,
  Spinner,
  TagInput,
  useToast,
} from '@sovereignfs/ui';
import { OAuthClientDetailPane } from './OAuthClientDetailPane';
import { ConsoleDetailSlot } from '../_components/ConsoleDetailSlot';
import { ConsolePageHeader } from '../_components/ConsolePageHeader';
import { CopyIdButton } from '../_components/CopyIdButton';
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

/** Which irreversible action is awaiting confirmation, and for which client. */
type PendingConfirm = { kind: 'rotate' | 'revoke'; clientId: string; clientName: string } | null;

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

function ClientStatusBadge({ disabled, size = 'sm' }: { disabled?: boolean; size?: 'xs' | 'sm' }) {
  return disabled ? (
    <Badge variant="status" size={size} status="deactivated">
      Revoked
    </Badge>
  ) : (
    <Badge variant="status" size={size} status="active">
      Active
    </Badge>
  );
}

/** "+ Register client" — the page's primary action, as a dialog like Users' Invite and Groups' New group. */
function RegisterClientDialog({
  onRegistered,
}: {
  onRegistered: (created: { client_id: string; client_secret?: string }) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [redirectUris, setRedirectUris] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    if (redirectUris.length === 0) {
      setError('At least one redirect URI is required.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // '/oauth2/register' is RFC 7591 dynamic client registration, which
      // apps/auth's oauth-provider config deliberately disables
      // (`allowDynamicClientRegistration: false` — "no self-service
      // registration", RFC 0072) — it 403s unconditionally, for every
      // caller, before even checking a session. The admin-authenticated
      // create path is a distinct endpoint, '/oauth2/create-client', gated
      // by the same `clientPrivileges` check rotate/revoke already use, and
      // its body field is `application_type`, not `type`.
      const created = await authFetch<{ client_id: string; client_secret?: string }>(
        '/oauth2/create-client',
        {
          method: 'POST',
          body: JSON.stringify({
            client_name: name || undefined,
            redirect_uris: redirectUris,
            scope: DEFAULT_SCOPES,
            application_type: 'web',
          }),
        },
      );
      setName('');
      setRedirectUris([]);
      setOpen(false);
      toast.show({ title: 'Client registered', category: 'success' });
      onRegistered(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register the client.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        + Register client
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Register external client"
        footer={
          <Button type="submit" form="register-client-form" disabled={creating}>
            {creating ? 'Registering…' : 'Register client'}
          </Button>
        }
      >
        <form
          id="register-client-form"
          className={styles.inviteForm}
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          {error && (
            <p className={styles.errorText} role="status">
              {error}
            </p>
          )}
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
        </form>
      </Dialog>
    </>
  );
}

export function OAuthClientsClient({ selectedClientId }: { selectedClientId: string | null }) {
  const toast = useToast();
  const [clients, setClients] = useState<OAuthClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [confirmPending, setConfirmPending] = useState(false);

  const selectedClient = selectedClientId
    ? (clients.find((c) => c.client_id === selectedClientId) ?? null)
    : null;
  const closeHref = '?';

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

  /**
   * Rotate and revoke are both one-way (the old secret stops working; a
   * revoked client is deleted), so each confirms first.
   */
  function askRotate(client: OAuthClientRow): void {
    setConfirm({
      kind: 'rotate',
      clientId: client.client_id,
      clientName: client.client_name ?? client.client_id,
    });
  }

  function askRevoke(client: OAuthClientRow): void {
    setConfirm({
      kind: 'revoke',
      clientId: client.client_id,
      clientName: client.client_name ?? client.client_id,
    });
  }

  async function runConfirmed(): Promise<void> {
    if (!confirm) return;
    setConfirmPending(true);
    try {
      if (confirm.kind === 'rotate') await handleRotate(confirm.clientId);
      else await handleRevoke(confirm.clientId);
    } finally {
      setConfirmPending(false);
      setConfirm(null);
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
    <div>
      <ConsolePageHeader
        title="External clients"
        count={
          loading ? undefined : `${clients.length} ${clients.length === 1 ? 'client' : 'clients'}`
        }
        action={
          <RegisterClientDialog
            onRegistered={(created) => {
              if (created.client_secret) {
                setRevealed({ clientId: created.client_id, clientSecret: created.client_secret });
              }
              void refresh();
            }}
          />
        }
        description="Let a standalone app on its own domain — not an app installed on this instance — offer “log in with Sovereign”. Client secrets are shown exactly once and stored hashed; they cannot be recovered later, only rotated."
      />

      {revealed && (
        <div className={styles.successBox} role="alert">
          <p>
            Client secret for <strong>{revealed.clientId}</strong> — shown once, copy it now. It
            cannot be displayed again; if it&rsquo;s lost, rotate the secret instead.
          </p>
          <p className={styles.tokenNote}>
            <code className={styles.token}>{revealed.clientSecret}</code>{' '}
            <CopyIdButton value={revealed.clientSecret} label="Copy client secret" />
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={styles.selfStart}
            onClick={() => setRevealed(null)}
          >
            Done, I&rsquo;ve copied it
          </Button>
        </div>
      )}

      {loading ? (
        <p className={styles.textMuted}>
          <Spinner size="sm" /> Loading…
        </p>
      ) : clients.length === 0 ? (
        <p className={styles.emptyTableMsg}>
          No external clients registered yet. Register one to let an outside app sign users in.
        </p>
      ) : (
        <ul className={[styles.cards, styles.cardsCapped].join(' ')}>
          {clients.map((client) => {
            const isSelected = client.client_id === selectedClientId;
            return (
              <li
                key={client.client_id}
                className={[styles.card, isSelected ? styles.cardSelected : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <Link
                  href={`?client=${client.client_id}`}
                  className={styles.cardLink}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className={styles.cardTitleRow}>
                    <span className={styles.cardTitle}>
                      {client.client_name ?? 'Unnamed client'}
                    </span>
                    <Icon
                      name="chevron-right"
                      size="sm"
                      aria-hidden
                      className={[styles.textMuted, styles.cardChevron].join(' ')}
                    />
                  </span>
                  <span className={styles.cardDesc}>{client.redirect_uris.join(', ')}</span>
                  <span className={styles.userId} title={client.client_id}>
                    {client.client_id}
                  </span>
                  <span className={styles.detailBadges}>
                    <ClientStatusBadge disabled={client.disabled} size="xs" />
                  </span>
                </Link>
                {/* Mobile-only fallback — `.cardManageMobile` is `display:
                    contents` below the desktop breakpoint and `display: none`
                    above it, since mobile has no detail column to select into. */}
                <span className={styles.cardManageMobile}>
                  <span className={styles.rowActions}>
                    <Button variant="secondary" size="sm" onClick={() => askRotate(client)}>
                      Rotate secret
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={client.disabled}
                      onClick={() => askRevoke(client)}
                    >
                      Revoke
                    </Button>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {selectedClient && (
        <ConsoleDetailSlot detailKey={selectedClient.client_id} closeHref={closeHref}>
          <OAuthClientDetailPane
            client={selectedClient}
            closeHref={closeHref}
            onRotate={() => askRotate(selectedClient)}
            onRevoke={() => askRevoke(selectedClient)}
          />
        </ConsoleDetailSlot>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'revoke' ? 'Revoke client' : 'Rotate client secret'}
        message={
          confirm?.kind === 'revoke' ? (
            <>
              Revoke <strong>{confirm.clientName}</strong>? Sign-ins through this client stop
              working immediately. This cannot be undone.
            </>
          ) : (
            <>
              Rotate the secret for <strong>{confirm?.clientName}</strong>? The current secret stops
              working immediately; the new one is shown once, so update the app right away.
            </>
          )
        }
        confirmLabel={
          confirmPending
            ? confirm?.kind === 'revoke'
              ? 'Revoking…'
              : 'Rotating…'
            : confirm?.kind === 'revoke'
              ? 'Revoke'
              : 'Rotate secret'
        }
        destructive={confirm?.kind === 'revoke'}
        pending={confirmPending}
        onConfirm={() => void runConfirmed()}
      />
    </div>
  );
}
