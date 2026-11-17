/**
 * `@sovereignfs/sdk/vault` — the vault of an app that runs with no core (sdk §9.5), on the app's server. Server only.
 *
 * - `AppVault` keeps a person's records on the app's own database, as core keeps them (core-app §5.3), and opens none of them.
 * - `vaultMigrations(family)` are its tables, run under their own history table (`VAULT_MIGRATIONS_TABLE`).
 * - `vaultRoute(vault, { origin })` answers `localVault()` from `@sovereignfs/sdk/keys`, for the person the app's own session names.
 * - `newSessionSecret()` is the secret an app keeps with each session, so what a browser kept opens nothing once it ends.
 */
import { AppVault, VaultError, VaultIdLost, type VaultAppRow } from '@sovereignfs/crypto/vault';

export {
  AppVault,
  newSessionSecret,
  VAULT_MIGRATIONS_TABLE,
  VaultError,
  VaultIdLost,
  vaultMigrations,
} from '@sovereignfs/crypto/vault';
export type {
  AppVaultWay,
  VaultAccountRow,
  VaultAppRow,
  VaultDatabase,
  VaultExecutor,
  VaultMigration,
  VaultRow,
  VaultWayInRow,
} from '@sovereignfs/crypto/vault';

/** What `localVault()` sends: one change, applied whole or refused. */
export type VaultChange =
  | {
      readonly op: 'set-up';
      readonly account: {
        suite: number;
        unlockSalt: string;
        signingPublic: string;
        signingPrivate: string;
      };
      readonly waysIn: readonly { way: string; id: string; record: string }[];
    }
  | { readonly op: 'put-way-in'; readonly wayIn: { way: string; id: string; record: string } }
  | { readonly op: 'remove-way-in'; readonly way: 'password'; readonly id: string }
  | { readonly op: 'confirm-kit'; readonly record: string }
  | { readonly op: 'put-app'; readonly app: VaultAppRow };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const refused = (error: string, status: number) => json({ ok: false, error }, status);

/**
 * A change from the page itself: the request's `Origin` is the app's public origin, and the browser does not call it cross-site.
 * The origin is the app's configured address, never the request's own URL, which a proxy in front of the app may have rewritten.
 */
function sameOrigin(request: Request, allowed: string): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  return request.headers.get('origin') === allowed;
}

export type VaultRouteOptions = {
  /** The app's public address, as people's browsers reach it (its `<PREFIX>_URL`): `https://notes.example.org`. */
  origin: string;
};

/**
 * The route `localVault()` calls (at `/auth/vault` unless the app chooses another path), for the person the app's session names:
 * `sub` is the app's own, taken from its session and never from the request; with no session, pass `undefined`.
 *
 * - `GET` answers the person's keys and ways in, and with `?app=<client id>` their keys for that app.
 * - `POST` applies one `VaultChange`, only from the app's own origin (`options.origin`).
 *
 * Nothing it answers or takes opens anything: the records are wrapped, and the session secret is served by the app's own
 * `key-secret` route, not here.
 */
export function vaultRoute(
  vault: AppVault,
  options: VaultRouteOptions,
): (request: Request, sub: string | undefined) => Promise<Response> {
  const allowed = new URL(options.origin).origin;
  return async (request, sub) => {
    if (!sub) return refused('No session.', 401);
    try {
      if (request.method === 'GET') {
        const clientId = new URL(request.url).searchParams.get('app');
        if (clientId !== null)
          return json({ ok: true, value: (await vault.app(sub, clientId)) ?? null });
        return json({ ok: true, value: await vault.read(sub) });
      }
      if (request.method !== 'POST') return refused('Not allowed.', 405);
      if (!sameOrigin(request, allowed)) return refused('Not from this app.', 403);
      const change = (await request.json()) as VaultChange;
      switch (change?.op) {
        case 'set-up':
          await vault.setUp(sub, change.account, change.waysIn);
          break;
        case 'put-way-in':
          await vault.putWayIn(sub, change.wayIn);
          break;
        case 'remove-way-in':
          return json({ ok: true, value: await vault.removeWayIn(sub, 'password', change.id) });
        case 'confirm-kit':
          await vault.confirmKit(sub, change.record);
          break;
        case 'put-app':
          await vault.putApp(sub, change.app);
          break;
        default:
          return refused('That is not a change.', 400);
      }
      return json({ ok: true });
    } catch (error) {
      if (error instanceof VaultError)
        return refused(error.message, error.code === 'invalid' ? 400 : 409);
      if (error instanceof VaultIdLost) return refused(error.message, 500);
      if (error instanceof SyntaxError || error instanceof TypeError)
        return refused('That is not a change.', 400);
      throw error;
    }
  };
}
