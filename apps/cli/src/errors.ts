/**
 * How a command ends (operator-cli §11). Every refusal says what is wrong and what to do about it.
 *
 * - `Refused` (exit 2): nothing was changed.
 * - `Failed` (exit 1): it failed partway; running it again is safe.
 * - `Locked` (exit 3): another deployment holds the lock.
 */
export class SvError extends Error {
  override name = 'SvError';

  constructor(
    message: string,
    readonly exitCode: 1 | 2 | 3,
    /** What to do about it, on a line of its own. */
    readonly hint?: string,
  ) {
    super(message);
  }
}

export class Refused extends SvError {
  override name = 'Refused';

  constructor(message: string, hint?: string) {
    super(message, 2, hint);
  }
}

export class Failed extends SvError {
  override name = 'Failed';

  constructor(message: string, hint?: string) {
    super(message, 1, hint);
  }
}

export class Locked extends SvError {
  override name = 'Locked';

  constructor(message: string, hint?: string) {
    super(message, 3, hint);
  }
}
