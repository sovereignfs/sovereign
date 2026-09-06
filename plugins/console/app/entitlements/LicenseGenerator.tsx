'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, FormField, Input, Select, Textarea } from '@sovereignfs/ui';
import { deleteLicenseKeyAction, grantLicenseAction, saveLicenseKeyAction } from './actions';
import { CopyIdButton } from '../_components/CopyIdButton';
import styles from '../console.module.css';

const SESSION_KEY = 'sv_gen_privkey';

interface Tier {
  id: string;
  name: string;
}

export interface GeneratorPlugin {
  id: string;
  name: string;
  publicKey: string;
  tiers: Tier[];
}

export interface GeneratorUser {
  id: string;
  email: string;
  name: string | null;
}

interface Props {
  plugins: GeneratorPlugin[];
  users: GeneratorUser[];
  /** Private key `d` values stored in platform_settings, keyed by plugin ID. */
  storedKeys: Record<string, string>;
  /** Public key `x` values stored in platform_settings, keyed by plugin ID. */
  storedPublicKeys: Record<string, string>;
}

type KeySource = 'instance' | 'session' | 'none' | 'manual';
type Outcome = { ok: boolean; message: string } | null;

function toBase64Url(bytes: Uint8Array): string {
  let b = '';
  for (const byte of bytes) b += String.fromCharCode(byte);
  return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Priority: instance storage → sessionStorage → empty. */
function resolveStoredKey(pluginId: string, storedKeys: Record<string, string>) {
  const inst = storedKeys[pluginId];
  if (inst) return { key: inst, source: 'instance' as const };
  const sess =
    typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(SESSION_KEY) ?? '') : '';
  if (sess) return { key: sess, source: 'session' as const };
  return { key: '', source: 'none' as const };
}

function OutcomeText({ outcome }: { outcome: Outcome }) {
  if (!outcome) return null;
  return (
    <p className={outcome.ok ? styles.feedbackSuccess : styles.feedbackError} role="status">
      {outcome.message}
    </p>
  );
}

/**
 * Signs a license token client-side with Ed25519 — the private key never
 * leaves the browser. Same logic as before this component was rebuilt on
 * the design system; only the markup, copy and feedback changed.
 */
export function LicenseGenerator({ plugins, users, storedKeys, storedPublicKeys }: Props) {
  const [pluginId, setPluginId] = useState(plugins[0]?.id ?? '');
  const [privateKey, setPrivateKey] = useState('');
  const [keySource, setKeySource] = useState<KeySource>('none');
  const [subscriber, setSubscriber] = useState('');
  const [tierId, setTierId] = useState('');
  const [expiry, setExpiry] = useState('');

  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState('');
  const [genError, setGenError] = useState('');

  const [grantUserId, setGrantUserId] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantOutcome, setGrantOutcome] = useState<Outcome>(null);

  const [savingKey, setSavingKey] = useState(false);
  const [keyOutcome, setKeyOutcome] = useState<Outcome>(null);

  const [generatingKeypair, setGeneratingKeypair] = useState(false);
  const [generatedPubKey, setGeneratedPubKey] = useState('');
  const [showKeygen, setShowKeygen] = useState(false);

  const isFirstRender = useRef(true);

  // On mount: restore the key for the initial plugin from instance storage or
  // sessionStorage. Read here (never in a state initializer) so the server
  // and first client render agree.
  useEffect(() => {
    const { key, source } = resolveStoredKey(plugins[0]?.id ?? '', storedKeys);
    if (key) {
      setPrivateKey(key);
      setKeySource(source);
    }
    // Mount-only by design: plugins/storedKeys are stable server-rendered props.
  }, []);

  const selectedPlugin = plugins.find((p) => p.id === pluginId);

  function resetToken() {
    setToken('');
    setGenError('');
    setGrantOutcome(null);
  }

  function fillPrivateKey(val: string, source: KeySource) {
    setPrivateKey(val);
    setKeySource(source);
    resetToken();
    setKeyOutcome(null);
    const trimmed = val.trim();
    if (trimmed && source !== 'instance') {
      sessionStorage.setItem(SESSION_KEY, trimmed);
    } else if (!trimmed) {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  function handlePluginChange(newId: string) {
    setPluginId(newId);
    setTierId('');
    setShowKeygen(false);
    setGeneratedPubKey('');
    resetToken();
    setKeyOutcome(null);
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const { key, source } = resolveStoredKey(newId, storedKeys);
    setPrivateKey(key);
    setKeySource(key ? source : 'none');
  }

  function clearSessionKey() {
    sessionStorage.removeItem(SESSION_KEY);
    setPrivateKey('');
    setKeySource('none');
    resetToken();
    setKeyOutcome(null);
  }

  async function saveKeyToInstance() {
    if (!privateKey.trim()) return;
    setSavingKey(true);
    setKeyOutcome(null);
    try {
      // Pass the generated public key when available so the verifier can use
      // it without a manifest update (supports key rotation post-deploy).
      const result = await saveLicenseKeyAction(
        pluginId,
        privateKey.trim(),
        generatedPubKey || undefined,
      );
      setKeyOutcome({
        ok: result.ok,
        message: result.ok ? 'Key saved to this instance.' : (result.error ?? 'Unknown error.'),
      });
      if (result.ok) setKeySource('instance');
    } catch {
      setKeyOutcome({ ok: false, message: 'Network error saving the key.' });
    } finally {
      setSavingKey(false);
    }
  }

  async function removeFromInstance() {
    setKeyOutcome(null);
    try {
      const result = await deleteLicenseKeyAction(pluginId);
      setKeyOutcome({
        ok: result.ok,
        message: result.ok ? 'Key removed from this instance.' : (result.error ?? 'Unknown error.'),
      });
      if (result.ok) {
        setPrivateKey('');
        setKeySource('none');
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      setKeyOutcome({ ok: false, message: 'Network error removing the key.' });
    }
  }

  async function generateKeypair() {
    setGeneratingKeypair(true);
    setGenError('');
    try {
      const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
      const [privJwk, pubJwk] = await Promise.all([
        crypto.subtle.exportKey('jwk', pair.privateKey) as Promise<JsonWebKey>,
        crypto.subtle.exportKey('jwk', pair.publicKey) as Promise<JsonWebKey>,
      ]);
      setGeneratedPubKey(pubJwk.x ?? '');
      setShowKeygen(true);
      // Auto-fill the private key — treated as 'manual' so it can be saved to the instance.
      fillPrivateKey(privJwk.d ?? '', 'manual');
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate a keypair.');
    } finally {
      setGeneratingKeypair(false);
    }
  }

  async function generate() {
    resetToken();
    const missing: string[] = [];
    if (!privateKey.trim()) missing.push('private key');
    if (!subscriber.trim()) missing.push('subscriber');
    if (missing.length > 0) {
      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      setGenError(
        missing.length === 1
          ? `${capitalize(missing[0] ?? '')} is required.`
          : `${missing.map(capitalize).join(' and ')} are required.`,
      );
      return;
    }
    if (!selectedPlugin) {
      setGenError('Selected app not found.');
      return;
    }
    setGenerating(true);
    try {
      const privD = privateKey.trim();
      // A keypair generated in this session forms a valid pair with the
      // auto-filled private key; otherwise the manifest's public key applies.
      const pubX = generatedPubKey || selectedPlugin.publicKey;
      const now = Math.floor(Date.now() / 1000);
      const payloadObj: Record<string, unknown> = {
        pluginId,
        sub: subscriber.trim(),
        issuedAt: now,
      };
      if (expiry) payloadObj.expiresAt = Math.floor(new Date(expiry).getTime() / 1000);
      if (tierId) payloadObj.tier = tierId;

      const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payloadObj)));
      // The signature covers the UTF-8 bytes of the base64url string itself —
      // matching what runtime/src/license.ts verifies with Buffer.from(payloadB64).
      const sigInput = new TextEncoder().encode(payloadB64);

      const cryptoKey = await crypto.subtle.importKey(
        'jwk',
        { kty: 'OKP', crv: 'Ed25519', d: privD, x: pubX, key_ops: ['sign'] },
        { name: 'Ed25519' },
        false,
        ['sign'],
      );
      const sig = new Uint8Array(
        await crypto.subtle.sign({ name: 'Ed25519' }, cryptoKey, sigInput),
      );
      setToken(`${payloadB64}.${toBase64Url(sig)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setGenError(
        msg ||
          'Failed to sign the token. Check that the private key is a valid Ed25519 d value (base64url).',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function grantToUser() {
    if (!token || !grantUserId || !pluginId) return;
    setGrantOutcome(null);
    setGranting(true);
    try {
      const result = await grantLicenseAction(token, grantUserId, pluginId);
      setGrantOutcome({
        ok: result.ok,
        message: result.ok ? 'Entitlement saved.' : (result.error ?? 'Unknown error.'),
      });
    } catch {
      setGrantOutcome({ ok: false, message: 'Network error saving the entitlement.' });
    } finally {
      setGranting(false);
    }
  }

  if (plugins.length === 0) return null;

  const canSaveToInstance = privateKey.trim() !== '' && keySource !== 'instance';
  const keypairPending =
    generatedPubKey &&
    selectedPlugin &&
    generatedPubKey !== selectedPlugin.publicKey &&
    generatedPubKey !== storedPublicKeys[pluginId];

  return (
    <div className={styles.fieldStack} aria-label="Generate license token">
      <p className={styles.lede}>
        Signs a token in your browser with Ed25519 — the private key never leaves it. Needs Chrome
        113+, Firefox 130+ or Safari 17+.
      </p>

      <form
        className={styles.settingsForm}
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <FormField label="App" id="gen-plugin">
          {(field) => (
            <Select
              {...field}
              value={pluginId}
              onChange={(e) => handlePluginChange(e.target.value)}
            >
              {plugins.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <div className={styles.rowActions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void generateKeypair()}
            disabled={generatingKeypair}
          >
            {generatingKeypair ? 'Generating…' : 'Generate new keypair'}
          </Button>
          <span className={styles.helpText}>
            Creates a fresh Ed25519 pair and fills in the private key below.
          </span>
        </div>

        {showKeygen && generatedPubKey && (
          <div className={styles.successBox} role="status">
            <p>
              <strong>New keypair generated.</strong> Add the public key to the app&apos;s{' '}
              <code className={styles.codeInline}>
                manifest.json → monetization.license.publicKey
              </code>
              , or save both keys to this instance so tokens verify without a manifest change.
            </p>
            <p className={styles.tokenNote}>
              <code className={styles.token}>{generatedPubKey}</code>{' '}
              <CopyIdButton value={generatedPubKey} label="Copy public key" />
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={styles.selfStart}
              onClick={() => setShowKeygen(false)}
            >
              Dismiss
            </Button>
          </div>
        )}

        <FormField
          label="Private key"
          id="gen-privkey"
          hint="The d value from the JWK, base64url. The public key comes from the manifest unless you generated a pair above."
        >
          {(field) => (
            <Textarea
              {...field}
              value={privateKey}
              onChange={(e) => fillPrivateKey(e.target.value, 'manual')}
              rows={2}
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. TjwqILr7pqij4iX5fyAwRtgggduXDJD2hBBu_4OgpKU"
            />
          )}
        </FormField>
        <div className={styles.rowActions}>
          {keySource === 'instance' && (
            <>
              <Badge variant="status" size="sm" status="active">
                Stored on this instance
              </Badge>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void removeFromInstance()}
              >
                Remove from instance
              </Button>
            </>
          )}
          {keySource === 'session' && (
            <>
              <Badge variant="status" size="sm" status="pending">
                Kept for this session
              </Badge>
              <Button type="button" variant="secondary" size="sm" onClick={clearSessionKey}>
                Clear
              </Button>
            </>
          )}
          {canSaveToInstance && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void saveKeyToInstance()}
              disabled={savingKey}
            >
              {savingKey ? 'Saving…' : 'Save to instance'}
            </Button>
          )}
        </div>
        <OutcomeText outcome={keyOutcome} />

        <FormField
          label="Subscriber"
          id="gen-sub"
          hint="Email address or instance domain."
          required
        >
          {(field) => (
            <Input
              {...field}
              type="text"
              value={subscriber}
              onChange={(e) => {
                setSubscriber(e.target.value);
                resetToken();
              }}
              required
            />
          )}
        </FormField>

        {selectedPlugin && selectedPlugin.tiers.length > 0 && (
          <FormField label="Tier (optional)" id="gen-tier">
            {(field) => (
              <Select
                {...field}
                value={tierId}
                onChange={(e) => {
                  setTierId(e.target.value);
                  resetToken();
                }}
              >
                <option value="">No specific tier</option>
                {selectedPlugin.tiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}

        <FormField
          label="Expiry (optional)"
          id="gen-expiry"
          hint="Leave blank for a perpetual license."
        >
          {(field) => (
            <Input
              {...field}
              type="date"
              value={expiry}
              onChange={(e) => {
                setExpiry(e.target.value);
                resetToken();
              }}
            />
          )}
        </FormField>

        {keypairPending && (
          <Alert variant="warning">
            The new keypair is not active yet — choose <strong>Save to instance</strong> to store
            both keys. Tokens then verify without a manifest update.
          </Alert>
        )}

        {genError && (
          <p className={styles.feedbackError} role="status">
            {genError}
          </p>
        )}

        <Button type="submit" disabled={generating}>
          {generating ? 'Signing…' : 'Generate token'}
        </Button>
      </form>

      {token && (
        <div className={styles.successBox} role="status">
          <p>
            <strong>Signed token</strong> — copy it for the subscriber, or grant it directly below.
          </p>
          <p className={styles.tokenNote}>
            <code className={styles.token}>{token}</code>{' '}
            <CopyIdButton value={token} label="Copy license token" />
          </p>

          {users.length > 0 && (
            <div className={styles.fieldStack}>
              <FormField label="Grant directly to a person" id="gen-grant-user">
                {(field) => (
                  <Select
                    {...field}
                    value={grantUserId}
                    onChange={(e) => {
                      setGrantUserId(e.target.value);
                      setGrantOutcome(null);
                    }}
                  >
                    <option value="">Choose a person…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                        {u.name ? ` (${u.name})` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <div className={styles.rowActions}>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void grantToUser()}
                  disabled={granting || !grantUserId}
                >
                  {granting ? 'Saving…' : 'Save entitlement'}
                </Button>
              </div>
              <OutcomeText outcome={grantOutcome} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
