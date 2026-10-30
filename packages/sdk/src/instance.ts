import {
  CoreApiError as ApiClientError,
  createCoreClient,
  type InstanceBranding,
} from '@sovereignfs/api-client';
import { CoreApiError, NotSupportedError } from './errors';
import type { Deadline, Transport } from './transport';

/** How long what core serves is believed before it is read again (sdk §7). */
const FRESH_MS = 5 * 60_000;

/** What a core that publishes no `api` serves (core-app §3.13): the Directory, and the instance document itself. */
const PHASE_ONE: readonly string[] = ['directory'];

/** The only API version this SDK speaks. */
export const API_VERSION = 'v1';

type Served = { capabilities: ReadonlySet<string>; readAt: number };

/**
 * What this core serves, read from its instance document (sdk §7): read before the first call to a capability, believed for
 * five minutes, and read again at once after a `404`. A capability core lacks is refused before anything is sent. A
 * document that cannot be read never stops a call, so a brief outage is not turned into a refusal.
 */
export class Instance {
  readonly #transport: Transport;
  readonly #coreUrl: string;
  #served: Served | undefined;

  constructor(transport: Transport, coreUrl: string) {
    this.#transport = transport;
    this.#coreUrl = coreUrl;
  }

  /** The instance's branding, which is public (`getInstanceBranding`). */
  async branding(deadline: Deadline): Promise<InstanceBranding> {
    const document = await this.#fetch(deadline);
    this.#remember(document);
    return document;
  }

  /** Throws `NotSupportedError` when the instance is known not to serve `capability`. */
  async require(capability: string, deadline: Deadline): Promise<void> {
    const now = this.#transport.environment.now();
    let served = this.#served;
    if (!served || now - served.readAt >= FRESH_MS) {
      try {
        this.#remember(await this.#fetch(deadline));
      } catch {
        // Not read: make the call anyway (sdk §7).
        return;
      }
      served = this.#served;
    }
    if (served && !served.capabilities.has(capability)) throw new NotSupportedError(capability);
  }

  /** Reads the document again at the next call, since a `404` may mean the instance changed. */
  forget(): void {
    this.#served = undefined;
  }

  async #fetch(deadline: Deadline): Promise<InstanceBranding> {
    const core = createCoreClient({
      baseUrl: this.#coreUrl,
      fetch: (input, init) =>
        this.#transport.send(input, init ?? {}, {
          operation: 'getInstanceBranding',
          safeToRepeat: true,
          deadline,
        }),
    });
    try {
      return await core.getInstanceBranding();
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw new CoreApiError(error.status, error.code, error.message, error.retryAfter);
      }
      throw error;
    }
  }

  #remember(document: InstanceBranding): void {
    const api = (document as { api?: { versions?: unknown; capabilities?: unknown } }).api;
    const versions = Array.isArray(api?.versions) ? (api.versions as unknown[]) : undefined;
    const listed = Array.isArray(api?.capabilities) ? (api.capabilities as unknown[]) : undefined;
    const capabilities =
      api === undefined || listed === undefined
        ? PHASE_ONE
        : versions && !versions.includes(API_VERSION)
          ? []
          : listed.filter((name): name is string => typeof name === 'string');
    this.#served = {
      capabilities: new Set(capabilities),
      readAt: this.#transport.environment.now(),
    };
  }
}
