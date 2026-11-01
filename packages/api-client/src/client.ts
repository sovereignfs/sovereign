import { operations, type Operations } from './generated/operations';

/** An access token, or a function that gives the current one (so a refreshed token is used without making a new client). */
export type TokenSource = string | (() => string | Promise<string>);

export type CoreClientOptions = {
  /** The instance's own address, with no path: its `SV_URL`. */
  baseUrl: string;
  /**
   * The access token Core issued to the app for a signed-in person, asked for with `resource=<baseUrl>/api/v1`.
   * Not needed for a public operation.
   */
  token?: TokenSource;
  /** `fetch`, when the runtime has none or a test supplies its own. */
  fetch?: typeof fetch;
};

/** What Core said when it refused a call, in the contract's own terms (`ErrorResponse`). */
export class CoreApiError extends Error {
  override name = 'CoreApiError';

  constructor(
    /** The HTTP status. */
    readonly status: number,
    /** What kind of failure, for a program to act on, or `unknown` when the answer was not one Core gives. */
    readonly code: string,
    message: string,
    /** For 429: the seconds Core asked the app to wait. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

type Name = keyof Operations;
type Request<K extends Name> = Operations[K]['request'];

/** One method for each operation of the contract; the types come from it. */
export type CoreClient = {
  [K in Name]: Request<K> extends undefined
    ? () => Promise<Operations[K]['response']>
    : (request: Request<K>) => Promise<Operations[K]['response']>;
};

type Given = { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown };

/**
 * A client for the Core API, generated from its contract (`contracts/core-api/openapi.yaml`): a method for each
 * operation, typed from the contract. Every failure is a `CoreApiError` carrying the contract's error body. The
 * token is sent only to an operation that needs one.
 */
export function createCoreClient(options: CoreClientOptions): CoreClient {
  const base = new URL(options.baseUrl);
  const client: Record<string, unknown> = {};
  for (const name of Object.keys(operations) as Name[]) {
    client[name] = (given: Given = {}) => call(options, base, name, given);
  }
  return client as CoreClient;
}

async function call(
  options: CoreClientOptions,
  base: URL,
  name: Name,
  given: Given,
): Promise<unknown> {
  const operation = operations[name];
  let path: string = operation.path;
  for (const [key, value] of Object.entries(given.params ?? {})) {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  }
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(given.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (operation.scopes !== undefined) {
    const token =
      typeof options.token === 'function' ? await options.token() : (options.token ?? undefined);
    if (!token) throw new Error(`${name} needs an access token: give the client a \`token\`.`);
    headers.authorization = `Bearer ${token}`;
  }
  let body: string | undefined;
  if (given.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(given.body);
  }

  const reply = await (options.fetch ?? fetch)(url, {
    method: operation.method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
  if (reply.ok) return reply.json();
  throw await failure(reply);
}

async function failure(reply: Response): Promise<CoreApiError> {
  let code = 'unknown';
  let message = `Core answered ${reply.status}.`;
  try {
    const body = (await reply.json()) as { error?: unknown; message?: unknown };
    if (typeof body.error === 'string') code = body.error;
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // Not an answer Core gives (a proxy's page, say): the status says what it can.
  }
  const retry = Number(reply.headers.get('retry-after'));
  return new CoreApiError(
    reply.status,
    code,
    message,
    reply.status === 429 && Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}
