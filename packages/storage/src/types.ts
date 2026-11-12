/**
 * What a file is, judged by its first bytes and never by its name or the type the browser sent (RFC 0004, Security). Only the kinds a
 * browser can show without running anything are shown inline: raster images. Everything else is served as
 * `application/octet-stream` to download, so an uploaded page or SVG is never run as script on the app's address.
 */
export type FileKind = {
  /** The type the file is served as. */
  type: string;
  /** Whether a browser may show it in place. */
  inline: boolean;
};

/** How many bytes `detectKind` needs to tell every kind it knows. */
export const SNIFF_BYTES = 16;

const OCTET: FileKind = { type: 'application/octet-stream', inline: false };

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0) =>
  bytes.length >= at + signature.length && signature.every((byte, i) => bytes[at + i] === byte);

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

export function detectKind(head: Uint8Array): FileKind {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { type: 'image/png', inline: true };
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { type: 'image/jpeg', inline: true };
  if (startsWith(head, ascii('GIF87a')) || startsWith(head, ascii('GIF89a')))
    return { type: 'image/gif', inline: true };
  if (startsWith(head, ascii('RIFF')) && startsWith(head, ascii('WEBP'), 8))
    return { type: 'image/webp', inline: true };
  if (startsWith(head, ascii('ftypavif'), 4)) return { type: 'image/avif', inline: true };
  if (startsWith(head, ascii('%PDF-'))) return { type: 'application/pdf', inline: false };
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return { type: 'application/zip', inline: false };
  return OCTET;
}
