/**
 * The lock check's steps (task 4.15, research 0012), browser only and only in handlers or effects. Each returns an entry for the log;
 * none sends anything to a server. A passkey made here is kept by the device and never registered with core: it signs in to nothing.
 */

/** One line of the log: when, which check, how it came out, and what was seen. */
export type Entry = {
  at: number;
  check: string;
  outcome: 'ok' | 'failed' | 'info';
  detail: string;
};

const LOG_KEY = 'sv-lock-check-log';
const PASSKEY_KEY = 'sv-lock-check-passkey';
const HIDDEN_KEY = 'sv-lock-check-hidden-at';
const ARMED_KEY = 'sv-lock-check-armed';
/** The user-verified flag of WebAuthn's authenticator data: byte 32, bit 2. */
const USER_VERIFIED = 0x04;
/** A fixed PRF input: the check asks only whether an output comes back, never what it is. */
const PRF_INPUT = new TextEncoder().encode('sovereign-lock-check-prf-input-v1');

/** Storage that may be missing or refuse (a private window): every read and write is allowed to fail. */
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const read = (store: Store | undefined, key: string): string | null => {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const write = (store: Store | undefined, key: string, value: string | null): void => {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    // Kept for this page only.
  }
};

export function readLog(store: Store | undefined): Entry[] {
  try {
    const parsed = JSON.parse(read(store, LOG_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    return [];
  }
}

export function appendLog(store: Store | undefined, entry: Entry): Entry[] {
  const log = [...readLog(store), entry].slice(-200);
  write(store, LOG_KEY, JSON.stringify(log));
  return log;
}

export function clearLog(store: Store | undefined): void {
  write(store, LOG_KEY, null);
}

export const isArmed = (store: Store | undefined) => read(store, ARMED_KEY) === '1';
export const setArmed = (store: Store | undefined, armed: boolean) =>
  write(store, ARMED_KEY, armed ? '1' : null);
export const testPasskeyId = (store: Store | undefined) => read(store, PASSKEY_KEY);

/** The log as text to paste into a message: the device first, then every entry. */
export function report(log: readonly Entry[], device: string): string {
  const lines = log.map(
    (entry) =>
      `${new Date(entry.at).toISOString()}  ${entry.check}  ${entry.outcome.toUpperCase()}  ${entry.detail}`,
  );
  return [`Lock check — ${device}`, ...lines].join('\n');
}

/** How long the app was away, and whether it was kept or ended: called when the page loads and when it is shown again. */
export function backgroundEntry(
  store: Store | undefined,
  event: 'load' | 'shown',
  now: number,
): Entry | undefined {
  const hiddenAt = Number(read(store, HIDDEN_KEY));
  if (!hiddenAt) return undefined;
  write(store, HIDDEN_KEY, null);
  const seconds = Math.round((now - hiddenAt) / 1000);
  return {
    at: now,
    check: 'background',
    outcome: 'info',
    detail:
      event === 'load'
        ? `opened fresh after ${seconds} s away: the app was reloaded, or the device had ended it`
        : `came back after ${seconds} s away, still running`,
  };
}

export const markHidden = (store: Store | undefined, now: number) =>
  write(store, HIDDEN_KEY, String(now));

/** What the device says about itself and about passkeys, without asking the person anything. */
export async function environment(now: number): Promise<Entry[]> {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  const entries: Entry[] = [
    { at: now, check: 'device', outcome: 'info', detail: navigator.userAgent },
    {
      at: now,
      check: 'installed',
      outcome: standalone ? 'ok' : 'info',
      detail: standalone ? 'running as an installed app' : 'running in a browser tab',
    },
  ];
  const api = window.PublicKeyCredential as
    | (typeof PublicKeyCredential & {
        getClientCapabilities?: () => Promise<Record<string, boolean>>;
      })
    | undefined;
  if (!api) {
    entries.push({ at: now, check: 'passkeys', outcome: 'failed', detail: 'no WebAuthn here' });
    return entries;
  }
  const platform = await api.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
  entries.push({
    at: now,
    check: 'passkeys',
    outcome: platform ? 'ok' : 'failed',
    detail: platform
      ? 'a built-in authenticator that verifies the person (Face ID, Touch ID, fingerprint or the device PIN)'
      : 'no built-in authenticator that verifies the person',
  });
  if (api.getClientCapabilities) {
    const capabilities = await api.getClientCapabilities().catch(() => undefined);
    if (capabilities) {
      const listed = Object.entries(capabilities)
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(', ');
      entries.push({ at: now, check: 'capabilities', outcome: 'info', detail: listed });
    }
  }
  return entries;
}

const errorName = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';

const toBase64Url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Makes a passkey for this site, kept by the device only, and says whether it can give a PRF output. */
export async function makePasskey(store: Store | undefined, rpId: string): Promise<Entry> {
  const started = performance.now();
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { id: rpId, name: 'Sovereign lock check' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'lock-check',
          displayName: 'Lock check (can be deleted)',
        },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    const ms = Math.round(performance.now() - started);
    if (!credential)
      return {
        at: Date.now(),
        check: 'make',
        outcome: 'failed',
        detail: `nothing made (${ms} ms)`,
      };
    write(store, PASSKEY_KEY, toBase64Url(credential.rawId));
    const prf = (credential.getClientExtensionResults() as { prf?: { enabled?: boolean } }).prf;
    return {
      at: Date.now(),
      check: 'make',
      outcome: 'ok',
      detail: `made in ${ms} ms; PRF ${prf?.enabled === true ? 'enabled' : prf ? 'not enabled' : 'not reported'}`,
    };
  } catch (error) {
    return {
      at: Date.now(),
      check: 'make',
      outcome: 'failed',
      detail: `${errorName(error)} (${Math.round(performance.now() - started)} ms)`,
    };
  }
}

/**
 * Asks for a passkey as a lock would: user verification required, with the PRF extension. `which` is the passkey made here, or any of
 * the person's passkeys for core (as signing in does). `how` says what started it: a tap, or nothing (the app coming back).
 */
export async function unlock(
  store: Store | undefined,
  rpId: string,
  which: 'test' | 'core',
  how: 'tap' | 'no tap',
): Promise<Entry> {
  const check = `unlock (${which === 'test' ? 'test passkey' : 'passkey for core'}, ${how})`;
  const id = which === 'test' ? testPasskeyId(store) : null;
  if (which === 'test' && !id) {
    return { at: Date.now(), check, outcome: 'failed', detail: 'make a test passkey first' };
  }
  const started = performance.now();
  try {
    const credential = (await navigator.credentials.get({
      publicKey: {
        rpId,
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        userVerification: 'required',
        allowCredentials: id ? [{ type: 'public-key', id: fromBase64Url(id) }] : [],
        extensions: { prf: { eval: { first: PRF_INPUT } } } as AuthenticationExtensionsClientInputs,
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    const ms = Math.round(performance.now() - started);
    if (!credential)
      return { at: Date.now(), check, outcome: 'failed', detail: `no answer (${ms} ms)` };
    const response = credential.response as AuthenticatorAssertionResponse;
    const verified = ((new Uint8Array(response.authenticatorData)[32] ?? 0) & USER_VERIFIED) !== 0;
    const first = (
      credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }
    ).prf?.results?.first;
    const prfBytes = first ? first.byteLength : 0;
    return {
      at: Date.now(),
      check,
      outcome: verified ? 'ok' : 'failed',
      detail: `answered in ${ms} ms; ${verified ? 'user verified' : 'NOT user verified'}; PRF ${prfBytes > 0 ? `${prfBytes} bytes` : 'no output'}`,
    };
  } catch (error) {
    return {
      at: Date.now(),
      check,
      outcome: 'failed',
      detail: `${errorName(error)} (${Math.round(performance.now() - started)} ms)`,
    };
  }
}
