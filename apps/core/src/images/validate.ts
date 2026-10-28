/**
 * What core accepts as an image (core-app §3.15): at most 1 MB, PNG, JPEG or WebP. The kind is found by
 * reading the bytes, never taken from the name or the type the client claimed, and the image is served
 * as that kind (with `nosniff`), so a file that is something else dressed as an image is not one.
 * SVG is refused here: it is a document that can carry script, accepted only for the instance's logos
 * and favicon, where it is sanitised first (a later task).
 *
 * Images are not resized on the server; the browser crops and scales an avatar before it is sent. The
 * dimensions are read from the header only to refuse a nonsense or enormous picture.
 */
export const MAX_IMAGE_BYTES = 1024 * 1024;

/** The longest side accepted. An avatar is about 512 pixels; this is generous, and refuses a bomb. */
export const MAX_IMAGE_SIDE = 4096;

export type ImageKind = 'png' | 'jpeg' | 'webp';

export const CONTENT_TYPES: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export type ImageErrorCode = 'empty' | 'too-large' | 'svg' | 'unsupported' | 'corrupt' | 'too-big';

export class ImageError extends Error {
  override name = 'ImageError';

  constructor(
    readonly code: ImageErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type InspectedImage = {
  kind: ImageKind;
  contentType: string;
  width: number;
  height: number;
};

const MESSAGES: Record<ImageErrorCode, string> = {
  empty: 'That file is empty.',
  'too-large': 'That picture is larger than 1 MB.',
  svg: 'SVG pictures are not accepted here. Use a PNG, JPEG or WebP picture.',
  unsupported: 'Use a PNG, JPEG or WebP picture.',
  corrupt: 'That picture could not be read.',
  'too-big': 'That picture is too large in pixels.',
};

const fail = (code: ImageErrorCode): never => {
  throw new ImageError(code, MESSAGES[code]);
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Whether the start of the file is markup, as SVG is: after any BOM and whitespace, a "<". */
function looksLikeMarkup(bytes: Buffer): boolean {
  const head = bytes
    .subarray(0, 1024)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  return head.startsWith('<') || /<svg[\s>]/i.test(head);
}

function kindOf(bytes: Buffer): ImageKind | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return undefined;
}

function pngSize(bytes: Buffer): [number, number] {
  // The first chunk is always IHDR: length(4) "IHDR" width(4) height(4)
  if (bytes.length < 24 || bytes.subarray(12, 16).toString('latin1') !== 'IHDR')
    return fail('corrupt');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function jpegSize(bytes: Buffer): [number, number] {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return fail('corrupt');
    let marker = bytes[at + 1] ?? 0;
    while (marker === 0xff) marker = bytes[++at + 1] ?? 0; // fill bytes
    // Markers with no length: standalone (TEM, RSTn, SOI, EOI)
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2;
      continue;
    }
    const length = bytes.readUInt16BE(at + 2);
    // Start of frame, except the tables that share the range (DHT, JPG, DAC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (at + 9 > bytes.length) return fail('corrupt');
      return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
    }
    if (length < 2) return fail('corrupt');
    at += 2 + length;
  }
  return fail('corrupt');
}

function webpSize(bytes: Buffer): [number, number] {
  if (bytes.length < 30) return fail('corrupt');
  const chunk = bytes.subarray(12, 16).toString('latin1');
  const data = 20; // after the chunk's tag and length
  if (chunk === 'VP8 ') {
    // lossy: frame tag(3), start code 9D 01 2A, then 14-bit width and height
    if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) {
      return fail('corrupt');
    }
    return [bytes.readUInt16LE(data + 6) & 0x3fff, bytes.readUInt16LE(data + 8) & 0x3fff];
  }
  if (chunk === 'VP8L') {
    // lossless: signature 0x2F, then 14 bits of width-1 and 14 bits of height-1
    if (bytes[data] !== 0x2f) return fail('corrupt');
    const packed = bytes.readUInt32LE(data + 1);
    return [(packed & 0x3fff) + 1, ((packed >> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8X') {
    // extended: flags(1) reserved(3), then 24-bit width-1 and height-1
    return [bytes.readUIntLE(data + 4, 3) + 1, bytes.readUIntLE(data + 7, 3) + 1];
  }
  return fail('corrupt');
}

/** Checks a file's bytes and says what it is, or throws an `ImageError` saying what is wrong. */
export function inspectImage(bytes: Buffer): InspectedImage {
  if (bytes.length === 0) return fail('empty');
  if (bytes.length > MAX_IMAGE_BYTES) return fail('too-large');
  const kind = kindOf(bytes);
  if (kind === undefined) return fail(looksLikeMarkup(bytes) ? 'svg' : 'unsupported');

  let size: [number, number];
  try {
    size = kind === 'png' ? pngSize(bytes) : kind === 'jpeg' ? jpegSize(bytes) : webpSize(bytes);
  } catch (error) {
    if (error instanceof ImageError) throw error;
    return fail('corrupt'); // a read past the end of a truncated file
  }
  const [width, height] = size;
  if (width < 1 || height < 1) return fail('corrupt');
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) return fail('too-big');
  return { kind, contentType: CONTENT_TYPES[kind], width, height };
}
