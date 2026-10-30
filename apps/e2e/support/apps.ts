import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';
import * as oidc from 'openid-client';
import { CORE_URL, freshAddress, MINIMAL_PORT, RP_PORT, RP_URL } from './env';

/**
 * The two apps core signs people in for, run for the whole suite so that a browser can be sent to them.
 *
 * - The relying party is an off-the-shelf OpenID Connect client (`openid-client`) doing what such a library does:
 *   discovery, the code flow with PKCE, userinfo, refresh, end-session and a back-channel logout receiver. It knows
 *   nothing of core but its address and what the Console gave the app. It is told those with `POST /__configure`,
 *   once the operator has registered it.
 * - The minimal client is a page that says "ok" and notes where it was sent, so a test can make the requests of an
 *   app that uses no library.
 *
 * What either one has seen is read with `GET /__last`.
 */

export type RpSettings = {
  clientId: string;
  clientSecret: string;
  /** Where the app puts its secret when it asks for tokens. In a header (HTTP Basic) unless said. */
  secretIn?: 'header' | 'body';
};

export type RpSeen = {
  claims?: JWTPayload;
  userinfo?: Record<string, unknown>;
  accessToken?: string;
  /** An access token for the Core API (the Directory), got with the refresh token once signed in. */
  directoryToken?: string;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
  /** What the last sign-in came back with when it did not work. */
  error?: string;
  /** How many times the browser asked for the callback: once for each sign-in, whatever the page does. */
  callbacks: number;
  logoutTokens: JWTPayload[];
  logoutError?: string;
};

type Pending = { verifier: string; state: string; nonce: string; resource?: string };

const text = (response: ServerResponse, status: number, type: string, body: string) => {
  response.writeHead(status, {
    'content-type': `${type}; charset=utf-8`,
    'cache-control': 'no-store',
  });
  response.end(body);
};
const json = (response: ServerResponse, value: unknown, status = 200) =>
  text(response, status, 'application/json', JSON.stringify(value));
const page = (response: ServerResponse, body: string, status = 200) =>
  text(response, status, 'text/html', `<!doctype html><title>Notes</title>${body}`);

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const listen = (server: Server, port: number) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

function relyingParty(): Server {
  let settings: RpSettings | undefined;
  let configuration: oidc.Configuration | undefined;
  let pending: Pending | undefined;
  let callbacks = 0;
  let seen: RpSeen = { callbacks, logoutTokens: [] };

  const discover = async (): Promise<oidc.Configuration> => {
    if (!settings) throw new Error('The app has not been configured.');
    configuration ??= await oidc.discovery(
      new URL(CORE_URL),
      settings.clientId,
      undefined,
      settings.secretIn === 'body'
        ? oidc.ClientSecretPost(settings.clientSecret)
        : oidc.ClientSecretBasic(settings.clientSecret),
      { execute: [oidc.allowInsecureRequests] },
    );
    // The app's server asks from an address of its own: core limits the token endpoint for each address, and the
    // suite's apps are not one address with the test's requests and each other's.
    configuration[oidc.customFetch] = (url, options) => {
      const headers = new Headers(options.headers);
      headers.set('x-forwarded-for', freshAddress());
      return fetch(url, { ...options, headers } as RequestInit);
    };
    return configuration;
  };

  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', RP_URL);
      try {
        if (url.pathname === '/__configure' && request.method === 'POST') {
          settings = JSON.parse(await readBody(request)) as RpSettings;
          configuration = undefined;
          return json(response, { ok: true });
        }
        if (url.pathname === '/__last') return json(response, { ...seen, callbacks });
        if (url.pathname === '/__reset') {
          callbacks = 0;
          seen = { callbacks, logoutTokens: seen.logoutTokens };
          return json(response, { ok: true });
        }

        if (url.pathname === '/') {
          if (!seen.claims) {
            response.writeHead(303, { location: '/login' }).end();
            return;
          }
          return page(
            response,
            `<h1>Notes</h1><p id="who">Signed in as ${String(seen.claims.name ?? seen.claims.sub)}</p>`,
          );
        }

        if (url.pathname === '/login') {
          const config = await discover();
          const verifier = oidc.randomPKCECodeVerifier();
          const resource = url.searchParams.get('resource') ?? 'none';
          pending = {
            verifier,
            state: oidc.randomState(),
            nonce: oidc.randomNonce(),
            // A token asked for with the Core API's address is addressed to it and carries only what it allows, with
            // no ID token: an app signs in without it and asks for that token afterwards (`/api/directory-token`).
            ...(resource === 'none' ? {} : { resource }),
          };
          const parameters: Record<string, string> = {
            redirect_uri: `${RP_URL}/callback`,
            scope: url.searchParams.get('scope') ?? 'openid profile offline_access directory',
            code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
            code_challenge_method: 'S256',
            state: pending.state,
            nonce: pending.nonce,
          };
          if (pending.resource) parameters.resource = pending.resource;
          const prompt = url.searchParams.get('prompt');
          if (prompt) parameters.prompt = prompt;
          response
            .writeHead(303, { location: oidc.buildAuthorizationUrl(config, parameters).href })
            .end();
          return;
        }

        if (url.pathname === '/callback') {
          const config = await discover();
          const run = pending;
          pending = undefined;
          callbacks += 1;
          seen = { callbacks, logoutTokens: seen.logoutTokens };
          if (!run) {
            seen.error = 'No sign-in was started.';
            return page(
              response,
              '<h1>Notes: not signed in</h1><p id="error">No sign-in was started.</p>',
              400,
            );
          }
          try {
            const tokens = await oidc.authorizationCodeGrant(
              config,
              url,
              {
                pkceCodeVerifier: run.verifier,
                expectedState: run.state,
                expectedNonce: run.nonce,
                idTokenExpected: true,
              },
              run.resource ? { resource: run.resource } : undefined,
            );
            const claims = tokens.claims() as JWTPayload;
            seen = {
              claims,
              accessToken: tokens.access_token,
              ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
              ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
              ...(tokens.scope ? { scope: tokens.scope } : {}),
              callbacks,
              logoutTokens: seen.logoutTokens,
            };
            try {
              seen.userinfo = (await oidc.fetchUserInfo(
                config,
                tokens.access_token,
                claims.sub as string,
              )) as Record<string, unknown>;
            } catch (error) {
              seen.error = `userinfo: ${(error as Error).message}`;
            }
            return page(
              response,
              `<h1>Notes: signed in</h1><p id="who">${String(claims.name ?? claims.sub)}</p>`,
            );
          } catch (error) {
            const failure = error as Error & { code?: string; cause?: unknown };
            const message =
              `${failure.message} ${failure.code ?? ''} ${JSON.stringify(failure.cause ?? {})}`.trim();
            seen.error = message;
            return page(
              response,
              `<h1>Notes: not signed in</h1><p id="error">${message.replace(/</g, '&lt;')}</p>`,
              400,
            );
          }
        }

        if (url.pathname === '/api/refresh') {
          const config = await discover();
          if (!seen.refreshToken) return json(response, { ok: false, error: 'no refresh token' });
          try {
            const tokens = await oidc.refreshTokenGrant(config, seen.refreshToken);
            seen.accessToken = tokens.access_token;
            if (tokens.refresh_token) seen.refreshToken = tokens.refresh_token;
            return json(response, { ok: true });
          } catch (error) {
            const failure = error as { code?: string; status?: number };
            return json(response, {
              ok: false,
              error: failure.code ?? (error as Error).message,
              status: failure.status,
            });
          }
        }

        if (url.pathname === '/api/directory-token') {
          const config = await discover();
          if (!seen.refreshToken) return json(response, { ok: false, error: 'no refresh token' });
          try {
            const tokens = await oidc.refreshTokenGrant(config, seen.refreshToken, {
              resource: `${CORE_URL}/api/v1`,
            });
            seen.directoryToken = tokens.access_token;
            if (tokens.refresh_token) seen.refreshToken = tokens.refresh_token;
            return json(response, { ok: true, scope: tokens.scope });
          } catch (error) {
            const failure = error as { code?: string; status?: number; cause?: unknown };
            return json(response, {
              ok: false,
              error: failure.code ?? (error as Error).message,
              cause: failure.cause,
            });
          }
        }

        if (url.pathname === '/api/userinfo') {
          const config = await discover();
          if (!seen.accessToken || !seen.claims)
            return json(response, { ok: false, error: 'not signed in' });
          try {
            await oidc.fetchUserInfo(config, seen.accessToken, seen.claims.sub as string);
            return json(response, { ok: true });
          } catch (error) {
            return json(response, { ok: false, error: (error as Error).message });
          }
        }

        if (url.pathname === '/logout') {
          const config = await discover();
          const target = url.searchParams.get('to') ?? `${RP_URL}/after-logout`;
          const endSession = oidc.buildEndSessionUrl(config, {
            ...(seen.idToken ? { id_token_hint: seen.idToken } : {}),
            post_logout_redirect_uri: target,
            state: 'goodbye',
          });
          response.writeHead(303, { location: endSession.href }).end();
          return;
        }
        if (url.pathname === '/after-logout') {
          seen = { callbacks, logoutTokens: seen.logoutTokens };
          return page(
            response,
            `<h1>Notes: signed out</h1><p id="state">${url.searchParams.get('state') ?? ''}</p>`,
          );
        }

        if (url.pathname === '/backchannel-logout' && request.method === 'POST') {
          const config = await discover();
          const token = new URLSearchParams(await readBody(request)).get('logout_token') ?? '';
          try {
            const { typ } = decodeProtectedHeader(token);
            if (typ !== 'logout+jwt') throw new Error(`The token is typed ${String(typ)}.`);
            const jwks = createRemoteJWKSet(new URL(config.serverMetadata().jwks_uri as string));
            const { payload } = await jwtVerify(token, jwks, {
              issuer: CORE_URL,
              audience: settings?.clientId as string,
            });
            seen.logoutTokens.push(payload);
            return json(response, { ok: true });
          } catch (error) {
            seen.logoutError = (error as Error).message;
            return json(response, { ok: false, error: seen.logoutError }, 400);
          }
        }

        return page(response, '<h1>Not found</h1>', 404);
      } catch (error) {
        return text(response, 500, 'text/plain', (error as Error).stack ?? String(error));
      }
    })();
  });
}

export type MinimalSeen = { callbacks: string[] };

function minimalClient(): Server {
  const seen: MinimalSeen = { callbacks: [] };
  return createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://localhost:${MINIMAL_PORT}`);
    if (url.pathname === '/__last') return json(response, seen);
    if (url.pathname === '/callback') seen.callbacks.push(url.href);
    return page(response, `<h1>Minimal</h1><p id="path">${url.pathname}</p>`);
  });
}

/** Starts both apps; returns what stops them. */
export async function startApps(): Promise<() => Promise<void>> {
  const servers = [relyingParty(), minimalClient()];
  await listen(servers[0] as Server, RP_PORT);
  await listen(servers[1] as Server, MINIMAL_PORT);
  return async () => {
    await Promise.all(servers.map(close));
  };
}

/** What the relying party has seen. */
export async function rpSeen(): Promise<RpSeen> {
  return (await (await fetch(`${RP_URL}/__last`)).json()) as RpSeen;
}

export async function configureRp(settings: RpSettings): Promise<void> {
  await fetch(`${RP_URL}/__configure`, {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

/** Asks the relying party to do something with the tokens it holds (`/api/refresh`, `/api/userinfo`, …). */
export async function rpApi(
  path: string,
): Promise<{ ok: boolean; error?: string; scope?: string; cause?: unknown }> {
  return (await (await fetch(`${RP_URL}${path}`)).json()) as {
    ok: boolean;
    error?: string;
    scope?: string;
    cause?: unknown;
  };
}

/** Waits until the relying party has been sent `count` logout notices (they arrive after the response that caused them). */
export async function rpLogoutTokens(count: number, timeoutMs = 10_000): Promise<RpSeen> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const seen = await rpSeen();
    if (seen.logoutTokens.length >= count) return seen;
    if (Date.now() > deadline) {
      throw new Error(`Only ${seen.logoutTokens.length} of ${count} logout notices arrived.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
