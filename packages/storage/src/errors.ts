/**
 * Why a store refused. Each code is something a person can act on, so an app turns it into a message and never into a crash:
 *
 * - `too_large`: this one file is larger than the person's whole quota (HTTP 413).
 * - `over_quota`: the person's space, or their number of files, is used up (HTTP 507).
 * - `not_found`: no such file, or not theirs, which are told apart from nothing (HTTP 404).
 * - `invalid`: a person or a file named in a way no store makes (HTTP 400).
 * - `empty`: the file has no bytes (HTTP 400).
 */
export type StorageErrorCode = 'too_large' | 'over_quota' | 'not_found' | 'invalid' | 'empty';

export const STORAGE_STATUS: Record<StorageErrorCode, number> = {
  too_large: 413,
  over_quota: 507,
  not_found: 404,
  invalid: 400,
  empty: 400,
};

export class StorageError extends Error {
  override name = 'StorageError';

  constructor(
    readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
  }

  /** The HTTP status an app answers with. */
  get status(): number {
    return STORAGE_STATUS[this.code];
  }
}
