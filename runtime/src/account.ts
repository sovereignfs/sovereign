/**
 * Pure validators and constants for the Account plugin's runtime routes
 * (SRS ACC-03/07/08). Kept free of Next.js and I/O so they unit-test cleanly.
 */

export const ACCOUNT_THEMES = ['system', 'light', 'dark'] as const;
export type AccountTheme = (typeof ACCOUNT_THEMES)[number];

export function isValidTheme(value: unknown): value is AccountTheme {
  return typeof value === 'string' && (ACCOUNT_THEMES as readonly string[]).includes(value);
}

/** In-app text-size control (task 10.2), discharging the pinch-zoom-disabled debt. */
export const ACCOUNT_TEXT_SIZES = ['default', 'large', 'larger'] as const;
export type AccountTextSize = (typeof ACCOUNT_TEXT_SIZES)[number];

export function isValidTextSize(value: unknown): value is AccountTextSize {
  return typeof value === 'string' && (ACCOUNT_TEXT_SIZES as readonly string[]).includes(value);
}

/**
 * Whether `tz` is a valid IANA timezone identifier. Uses the Intl database the
 * runtime already ships — constructing a formatter with an unknown zone throws
 * RangeError.
 */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB (ACC-03)

/** Accepted avatar content types → the extension the file is stored under. */
const AVATAR_TYPE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type AvatarValidation = { ok: true; ext: string } | { ok: false; error: string };

/** Validate an uploaded avatar's content type and size (ACC-03). */
export function validateAvatar(contentType: string | null, size: number): AvatarValidation {
  const ext = contentType ? AVATAR_TYPE_EXT[contentType] : undefined;
  if (!ext) {
    return { ok: false, error: 'Unsupported image type. Use JPEG, PNG, or WebP.' };
  }
  if (size <= 0) {
    return { ok: false, error: 'Empty file.' };
  }
  if (size > AVATAR_MAX_BYTES) {
    return { ok: false, error: 'Image is larger than 2 MB.' };
  }
  return { ok: true, ext };
}
