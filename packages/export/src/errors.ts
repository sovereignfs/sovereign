/** Why an export was refused or could not be made. `code` is stable; `message` is for a log, never for a person. */
export type ExportErrorCode =
  | 'invalid_path'
  | 'invalid_head'
  | 'invalid_archive'
  | 'invalid_contents'
  | 'unknown_format'
  | 'mismatch'
  | 'too_large'
  | 'invalid_recipients'
  | 'not_open'
  | 'closed';

export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}
