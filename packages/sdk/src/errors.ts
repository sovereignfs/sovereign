/**
 * Every failure of a call is one of these (sdk §6). All are a `SovereignError`, so an app can catch the family, and
 * none carries a token, a secret or a person's details in its message.
 */
export class SovereignError extends Error {
  override name = 'SovereignError';
}

/** The client was created wrongly (sdk §2). The message names each variable or option at fault, never its value. */
export class ConfigurationError extends SovereignError {
  override name = 'ConfigurationError';
}

/** Core answered with a failure, in the contract's own terms (`ErrorResponse`). */
export class CoreApiError extends SovereignError {
  override name = 'CoreApiError';

  constructor(
    /** The HTTP status. */
    readonly status: number,
    /** What kind of failure, for a program to act on, or `unknown` when the answer was not one core gives. */
    readonly code: string,
    message: string,
    /** For a 429 that was not retried: the seconds core asked the app to wait. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/** No usable answer: a network failure, a timeout, or a 5xx. Core may be down or slow; the app should stay up. */
export class CoreUnavailableError extends SovereignError {
  override name = 'CoreUnavailableError';

  /**
   * Whether the request may have reached core. `false` only when it certainly did not (the connection was refused, the
   * name did not resolve, or the call had no time left), so that nothing can have happened to it.
   */
  readonly requestSent: boolean;
  /** For a 5xx, its status: core answered, with a failure. */
  readonly status: number | undefined;

  constructor(
    message: string,
    details: { cause?: unknown; requestSent?: boolean; status?: number } = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.requestSent = details.requestSent ?? true;
    this.status = details.status;
  }
}

/** This person's token cannot be renewed (sdk §5.1). They must sign in again. */
export class SessionEndedError extends SovereignError {
  override name = 'SessionEndedError';
}

/** This instance's core does not offer the capability (sdk §7). The call was not sent. */
export class NotSupportedError extends SovereignError {
  override name = 'NotSupportedError';

  constructor(
    /** The capability asked for, such as `directory`. */
    readonly capability: string,
  ) {
    super(`This instance's core does not offer ${capability}.`);
  }
}

/** There is no session, and the call needed one (sdk §9). Send the person to sign in. */
export class NotAuthenticatedError extends SovereignError {
  override name = 'NotAuthenticatedError';

  constructor() {
    super('There is no signed-in person.');
  }
}

/** A sign-in could not be completed: it was not one this app began, it ran out, or core refused it (sdk §9). The person starts again. */
export class SignInError extends SovereignError {
  override name = 'SignInError';
}
