import { CoreUnavailableError } from './errors';

/** What the SDK tells an app's logger about a request: the operation, the status and how long it took. Never a token or a person. */
export type LogEvent = {
  operation: string;
  /** The HTTP status, or `error` when there was none. */
  status: number | 'error';
  durationMs: number;
};
export type Logger = (event: LogEvent) => void;

/** The clock, sleep and chance the transport uses, so a test controls all three. */
export type Environment = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
};

export const SYSTEM: Environment = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};

/** The defaults of sdk §6: a 5 second timeout for each request, and 10 seconds for everything one call does. */
export const DEFAULT_TIMEOUT_MS = 5_000;
export const OVERALL_LIMIT_MS = 10_000;
const RETRIES = 2;
const BACKOFF_MS = 200;

export type TransportOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  logger?: Logger;
  environment?: Environment;
};

/** What a request is, to the transport: its name for the logger, whether it may be sent again, and when its call must be over. */
export type Meta = { operation: string; safeToRepeat: boolean; deadline: number };

/** The deadline of one call: everything it does, a refresh and a version check included, must fit in the overall limit. */
export type Deadline = number;

/**
 * Sends requests to core (sdk §6): every request has a timeout; a failure to get a usable answer (a network failure, a
 * timeout or a 5xx) is a `CoreUnavailableError`, after at most two more tries when the request is safe to repeat, all
 * inside the call's deadline; a 429 is tried once more after `Retry-After` only if that fits. Nothing else is repeated.
 */
export class Transport {
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #logger: Logger | undefined;
  readonly #env: Environment;

  constructor(options: TransportOptions = {}) {
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#logger = options.logger;
    this.#env = options.environment ?? SYSTEM;
  }

  get environment(): Environment {
    return this.#env;
  }

  get timeoutMs(): number {
    return this.#timeoutMs;
  }

  /** A deadline for a call that starts now. */
  deadline(): Deadline {
    return this.#env.now() + OVERALL_LIMIT_MS;
  }

  /** `fetch` for one request of an operation, retrying as the specification says. */
  async send(input: RequestInfo | URL, init: RequestInit, meta: Meta): Promise<Response> {
    let tries = 0;
    let waited429 = false;
    for (;;) {
      const started = this.#env.now();
      const remaining = meta.deadline - started;
      if (remaining <= 0) {
        throw new CoreUnavailableError('Core did not answer in time.', { requestSent: false });
      }
      let unavailable: CoreUnavailableError;
      try {
        const reply = await this.#fetch(input, {
          ...init,
          signal: AbortSignal.timeout(Math.min(this.#timeoutMs, remaining)),
        });
        this.#log(meta.operation, reply.status, started);
        if (reply.status === 429 && !waited429) {
          const wait = secondsOf(reply.headers.get('retry-after')) * 1000;
          if (wait > 0 && this.#env.now() + wait < meta.deadline) {
            waited429 = true;
            await reply.body?.cancel().catch(() => undefined);
            await this.#env.sleep(wait);
            continue;
          }
        }
        if (reply.status < 500) return reply;
        await reply.body?.cancel().catch(() => undefined);
        unavailable = new CoreUnavailableError(`Core answered ${reply.status}.`, {
          status: reply.status,
        });
      } catch (error) {
        if (error instanceof CoreUnavailableError) throw error;
        this.#log(meta.operation, 'error', started);
        unavailable = new CoreUnavailableError(describe(error), {
          cause: error,
          requestSent: !neverSent(error),
        });
      }
      if (!meta.safeToRepeat || tries >= RETRIES) throw unavailable;
      const pause = BACKOFF_MS * 2 ** tries * (0.5 + this.#env.random());
      if (this.#env.now() + pause >= meta.deadline) throw unavailable;
      tries += 1;
      await this.#env.sleep(pause);
    }
  }

  #log(operation: string, status: number | 'error', started: number): void {
    if (!this.#logger) return;
    try {
      this.#logger({ operation, status, durationMs: Math.max(0, this.#env.now() - started) });
    } catch {
      // A logger that throws must not take a call down with it.
    }
  }
}

/** Seconds from a `Retry-After`, or 0 when it is missing or not a number of seconds. */
export function secondsOf(header: string | null): number {
  const seconds = Number(header);
  return header !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/** What went wrong, without an address or anything from the request. */
function describe(error: unknown): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'Core did not answer in time.';
  }
  return 'Core could not be reached.';
}

/** The system errors that mean the request was never sent, so nothing can have happened to it (sdk §5.1). */
const NEVER_SENT = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/** Whether a failed request certainly never reached core. Anything else may have been sent. */
export function neverSent(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && NEVER_SENT.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
