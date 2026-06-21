'use client';

import { useEffect, useRef, useState } from 'react';
import { deleteLicenseKeyAction, grantLicenseAction, saveLicenseKeyAction } from './actions';
import styles from './entitlements.module.css';

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

export function LicenseGenerator({ plugins, users, storedKeys, storedPublicKeys }: Props) {
  const [open, setOpen] = useState(false);
  const [pluginId, setPluginId] = useState(plugins[0]?.id ?? '');
  const [privateKey, setPrivateKey] = useState('');
  const [keySource, setKeySource] = useState<'instance' | 'session' | 'none' | 'manual'>('none');
  const [subscriber, setSubscriber] = useState('');
  const [tierId, setTierId] = useState('');
  const [expiry, setExpiry] = useState('');

  // Token generation state
  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState('');
  const [genError, setGenError] = useState('');
  const [copied, setCopied] = useState(false);

  // Grant-to-user state
  const [grantUserId, setGrantUserId] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantResult, setGrantResult] = useState('');
  const [grantOk, setGrantOk] = useState(false);

  // Instance key save/remove state
  const [savingKey, setSavingKey] = useState(false);
  const [keyActionResult, setKeyActionResult] = useState('');
  const [keyActionOk, setKeyActionOk] = useState(false);

  // Keypair generation state
  const [generatingKeypair, setGeneratingKeypair] = useState(false);
  const [generatedPubKey, setGeneratedPubKey] = useState('');
  const [showKeygen, setShowKeygen] = useState(false);
  const [pubKeyCopied, setPubKeyCopied] = useState(false);

  const isFirstRender = useRef(true);

  // On mount: restore key for the initial plugin from instance storage or sessionStorage.
  // Empty deps is intentional — storedKeys and plugins are stable server-rendered props;
  // reading them here (rather than in state initialisers) avoids SSR/browser mismatch.
  useEffect(() => {
    const { key, source } = resolveStoredKey(plugins[0]?.id ?? '', storedKeys);
    if (key) {
      setPrivateKey(key);
      setKeySource(source);
    }
  }, []);

  const selectedPlugin = plugins.find((p) => p.id === pluginId);

  function resetToken() {
    setToken('');
    setGenError('');
    setGrantResult('');
    setGrantOk(false);
  }

  function resetKeyActionResult() {
    setKeyActionResult('');
    setKeyActionOk(false);
  }

  function fillPrivateKey(val: string, source: typeof keySource) {
    setPrivateKey(val);
    setKeySource(source);
    resetToken();
    resetKeyActionResult();
    // Mirror to sessionStorage so it survives page navigations in this tab.
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
    resetKeyActionResult();
    // Skip on first render (handled by mount effect above).
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const { key, source } = resolveStoredKey(newId, storedKeys);
    setPrivateKey(key);
    setKeySource(key ? source : 'none');
  }

  function handlePrivKeyChange(val: string) {
    fillPrivateKey(val, 'manual');
  }

  function clearSessionKey() {
    sessionStorage.removeItem(SESSION_KEY);
    setPrivateKey('');
    setKeySource('none');
    resetToken();
    resetKeyActionResult();
  }

  async function saveKeyToInstance() {
    if (!privateKey.trim()) return;
    setSavingKey(true);
    resetKeyActionResult();
    try {
      // Pass the generated public key when available so the verifier can use it
      // without requiring a manifest update (supports key rotation post-deploy).
      const result = await saveLicenseKeyAction(
        pluginId,
        privateKey.trim(),
        generatedPubKey || undefined,
      );
      setKeyActionOk(result.ok);
      setKeyActionResult(result.ok ? 'Saved to instance.' : (result.error ?? 'Unknown error.'));
      if (result.ok) setKeySource('instance');
    } catch {
      setKeyActionResult('Network error saving key.');
      setKeyActionOk(false);
    } finally {
      setSavingKey(false);
    }
  }

  async function removeFromInstance() {
    resetKeyActionResult();
    try {
      const result = await deleteLicenseKeyAction(pluginId);
      setKeyActionOk(result.ok);
      setKeyActionResult(result.ok ? 'Removed from instance.' : (result.error ?? 'Unknown error.'));
      if (result.ok) {
        setPrivateKey('');
        setKeySource('none');
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      setKeyActionResult('Network error removing key.');
      setKeyActionOk(false);
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
      const d = privJwk.d ?? '';
      const x = pubJwk.x ?? '';
      setGeneratedPubKey(x);
      setShowKeygen(true);
      // Auto-fill the private key — treat as 'manual' so it can be saved to instance.
      fillPrivateKey(d, 'manual');
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate keypair.');
    } finally {
      setGeneratingKeypair(false);
    }
  }

  async function copyPubKey() {
    if (!generatedPubKey) return;
    await navigator.clipboard.writeText(generatedPubKey);
    setPubKeyCopied(true);
    setTimeout(() => setPubKeyCopied(false), 2000);
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
      setGenError('Selected plugin not found.');
      return;
    }
    setGenerating(true);
    try {
      const privD = privateKey.trim();
      // Use the generated public key when a fresh keypair was produced in this session —
      // it forms a valid pair with the auto-filled private key. Fall back to the manifest
      // key when no in-browser generation happened (operator pasted an existing key).
      const pubX = generatedPubKey || selectedPlugin.publicKey;
      const now = Math.floor(Date.now() / 1000);
      const payloadObj: Record<string, unknown> = {
        pluginId,
        sub: subscriber.trim(),
        issuedAt: now,
      };
      if (expiry) payloadObj.expiresAt = Math.floor(new Date(expiry).getTime() / 1000);
      if (tierId) payloadObj.tier = tierId;

      // Encode the JSON payload as base64url.
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
          'Failed to sign token. Verify the private key is a valid Ed25519 d value (base64url).',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function grantToUser() {
    if (!token || !grantUserId || !pluginId) return;
    setGrantResult('');
    setGrantOk(false);
    setGranting(true);
    try {
      const result = await grantLicenseAction(token, grantUserId, pluginId);
      setGrantOk(result.ok);
      setGrantResult(result.ok ? 'Entitlement saved.' : (result.error ?? 'Unknown error.'));
    } catch {
      setGrantResult('Network error saving entitlement.');
    } finally {
      setGranting(false);
    }
  }

  if (plugins.length === 0) return null;

  const canSaveToInstance = privateKey.trim() !== '' && keySource !== 'instance';

  return (
    <section className={styles.generator} aria-label="Generate license token">
      <div className={styles.generatorHeader}>
        <h2 className={styles.generatorTitle}>Generate license token</h2>
        <button
          type="button"
          className={styles.generatorToggle}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? 'Collapse ▲' : 'Expand ▼'}
        </button>
      </div>

      {open && (
        <div className={styles.generatorBody}>
          <p className={styles.generatorHint}>
            Signs a token client-side using Ed25519 — your private key never leaves the browser.
            Requires Chrome&nbsp;113+, Firefox&nbsp;130+, or Safari&nbsp;17+.
          </p>

          <div className={styles.generatorForm}>
            {/* Plugin selector */}
            <div className={styles.generatorRow}>
              <label htmlFor="gen-plugin" className={styles.generatorLabel}>
                Plugin
              </label>
              <select
                id="gen-plugin"
                className={styles.generatorSelect}
                value={pluginId}
                onChange={(e) => handlePluginChange(e.target.value)}
              >
                {plugins.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Keypair generator trigger */}
            <div className={styles.keygenTriggerRow}>
              <button
                type="button"
                className={styles.keygenTriggerBtn}
                onClick={() => void generateKeypair()}
                disabled={generatingKeypair}
              >
                {generatingKeypair ? 'Generating…' : '+ Generate new keypair'}
              </button>
              <span className={styles.generatorMeta}>
                creates a fresh Ed25519 pair and auto-fills the private key below
              </span>
            </div>

            {/* Generated public key panel */}
            {showKeygen && generatedPubKey && (
              <div className={styles.keygenPanel}>
                <div className={styles.keygenPanelHeader}>
                  <p className={styles.keygenPanelTitle}>New keypair generated</p>
                  <button
                    type="button"
                    className={styles.generatorToggle}
                    onClick={() => setShowKeygen(false)}
                    aria-label="Dismiss keypair panel"
                  >
                    ✕
                  </button>
                </div>
                <div className={styles.generatorRow}>
                  <div className={styles.generatorLabelRow}>
                    <label className={styles.generatorLabel}>
                      Public key{' '}
                      <span className={styles.generatorMeta}>
                        (add to manifest.json → monetization.license.publicKey)
                      </span>
                    </label>
                    <button
                      type="button"
                      className={styles.generatorToggle}
                      onClick={() => void copyPubKey()}
                    >
                      {pubKeyCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    className={`${styles.generatorTextarea} ${styles.generatorMono}`}
                    value={generatedPubKey}
                    rows={2}
                    aria-label="Generated public key"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                </div>
                <p className={styles.keygenNote}>
                  The private key has been auto-filled below. Click{' '}
                  <strong>Save to instance</strong> to store it in the platform database so it
                  auto-fills on any device.
                </p>
              </div>
            )}

            {/* Private key input */}
            <div className={styles.generatorRow}>
              <div className={styles.generatorLabelRow}>
                <label htmlFor="gen-privkey" className={styles.generatorLabel}>
                  Private key{' '}
                  <span className={styles.generatorMeta}>
                    (d value from JWK — public key is taken from the manifest)
                  </span>
                </label>
                <div className={styles.keyBadges}>
                  {keySource === 'instance' && (
                    <>
                      <span className={styles.keyStoredBadge}>Stored on instance</span>
                      <button
                        type="button"
                        className={styles.clearKeyBtn}
                        onClick={() => void removeFromInstance()}
                      >
                        Remove
                      </button>
                    </>
                  )}
                  {keySource === 'session' && (
                    <>
                      <span className={styles.keySavedNote}>Saved for this session</span>
                      <button
                        type="button"
                        className={styles.clearKeyBtn}
                        onClick={clearSessionKey}
                      >
                        Clear
                      </button>
                    </>
                  )}
                  {canSaveToInstance && (
                    <button
                      type="button"
                      className={styles.saveKeyBtn}
                      onClick={() => void saveKeyToInstance()}
                      disabled={savingKey}
                    >
                      {savingKey ? 'Saving…' : 'Save to instance'}
                    </button>
                  )}
                </div>
              </div>
              <textarea
                id="gen-privkey"
                className={`${styles.generatorTextarea} ${styles.generatorMono}`}
                value={privateKey}
                onChange={(e) => handlePrivKeyChange(e.target.value)}
                rows={2}
                autoComplete="off"
                spellCheck={false}
                placeholder="Base64url d value, e.g. TjwqILr7pqij4iX5fyAwRtgggduXDJD2hBBu_4OgpKU"
              />
              {keyActionResult && (
                <p
                  className={keyActionOk ? styles.generatorSuccess : styles.generatorError}
                  role="alert"
                >
                  {keyActionResult}
                </p>
              )}
            </div>

            {/* Subscriber */}
            <div className={styles.generatorRow}>
              <label htmlFor="gen-sub" className={styles.generatorLabel}>
                Subscriber
              </label>
              <input
                id="gen-sub"
                type="text"
                className={styles.generatorInput}
                value={subscriber}
                onChange={(e) => {
                  setSubscriber(e.target.value);
                  resetToken();
                }}
                placeholder="Email or instance domain"
              />
            </div>

            {selectedPlugin && selectedPlugin.tiers.length > 0 && (
              <div className={styles.generatorRow}>
                <label htmlFor="gen-tier" className={styles.generatorLabel}>
                  Tier <span className={styles.generatorMeta}>(optional)</span>
                </label>
                <select
                  id="gen-tier"
                  className={styles.generatorSelect}
                  value={tierId}
                  onChange={(e) => {
                    setTierId(e.target.value);
                    resetToken();
                  }}
                >
                  <option value="">— no specific tier —</option>
                  {selectedPlugin.tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.generatorRow}>
              <label htmlFor="gen-expiry" className={styles.generatorLabel}>
                Expiry <span className={styles.generatorMeta}>(leave blank for perpetual)</span>
              </label>
              <input
                id="gen-expiry"
                type="date"
                className={styles.generatorInput}
                value={expiry}
                onChange={(e) => {
                  setExpiry(e.target.value);
                  resetToken();
                }}
              />
            </div>

            {generatedPubKey &&
              selectedPlugin &&
              generatedPubKey !== selectedPlugin.publicKey &&
              generatedPubKey !== storedPublicKeys[pluginId] && (
                <div className={styles.generatorWarn} role="status">
                  <p className={styles.generatorWarnText}>
                    ⚠️ New keypair not yet active — click <strong>Save to instance</strong> to store
                    both keys. Tokens will verify without any manifest update.
                  </p>
                  {!showKeygen && (
                    <div className={styles.generatorWarnKey}>
                      <span className={styles.generatorLabel}>Public key (for your records)</span>
                      <div className={styles.generatorLabelRow}>
                        <textarea
                          readOnly
                          className={`${styles.generatorTextarea} ${styles.generatorMono}`}
                          value={generatedPubKey}
                          rows={2}
                          aria-label="Generated public key"
                          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                        />
                        <button
                          type="button"
                          className={styles.generatorToggle}
                          onClick={() => {
                            void navigator.clipboard.writeText(generatedPubKey);
                            setPubKeyCopied(true);
                            setTimeout(() => setPubKeyCopied(false), 2000);
                          }}
                        >
                          {pubKeyCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            {genError && (
              <p className={styles.generatorError} role="alert">
                {genError}
              </p>
            )}

            <button
              type="button"
              className={styles.generatorButton}
              onClick={() => void generate()}
              disabled={generating}
            >
              {generating ? 'Signing…' : 'Generate token'}
            </button>
          </div>

          {token && (
            <div className={styles.generatorResult}>
              <div className={styles.generatorResultHeader}>
                <p className={styles.generatorResultLabel}>Signed token</p>
                <button
                  type="button"
                  className={styles.generatorToggle}
                  onClick={() => void copyToken()}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <textarea
                readOnly
                className={`${styles.generatorTextarea} ${styles.generatorMono}`}
                value={token}
                rows={4}
                aria-label="Generated license token"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />

              {users.length > 0 && (
                <div className={styles.grantRow}>
                  <label htmlFor="gen-grant-user" className={styles.generatorLabel}>
                    Grant directly to user
                  </label>
                  <div className={styles.grantControls}>
                    <select
                      id="gen-grant-user"
                      className={styles.generatorSelect}
                      value={grantUserId}
                      onChange={(e) => {
                        setGrantUserId(e.target.value);
                        setGrantResult('');
                        setGrantOk(false);
                      }}
                    >
                      <option value="">— select user —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email}
                          {u.name ? ` (${u.name})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.generatorButton}
                      onClick={() => void grantToUser()}
                      disabled={granting || !grantUserId}
                    >
                      {granting ? 'Saving…' : 'Save entitlement'}
                    </button>
                  </div>
                  {grantResult && (
                    <p
                      className={grantOk ? styles.generatorSuccess : styles.generatorError}
                      role="alert"
                    >
                      {grantResult}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
