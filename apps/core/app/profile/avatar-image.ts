/**
 * Getting a picture ready to upload (core-app §3.15): cropped to a square around its centre and scaled to
 * about 512 pixels, in the browser, because the server does not resize. The pieces that touch the browser
 * are passed in, so the rest can be tested.
 */
export const AVATAR_SIZE = 512;

/** The server refuses more than this; so does the browser, before it sends anything. */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

/** The square to cut from a picture of this size: its centre, as large as fits. */
export function cropSquare(
  width: number,
  height: number,
): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

export type Bitmap = { width: number; height: number; close?: () => void };

export type PrepareDeps = {
  /** Decodes the file, upright (the browser's `createImageBitmap`). */
  decode: (file: Blob) => Promise<Bitmap>;
  /** Draws a square piece of the picture onto a canvas of `size` and encodes it, or gives nothing for a type it cannot make. */
  encode: (
    bitmap: Bitmap,
    crop: { sx: number; sy: number; side: number },
    size: number,
    type: string,
    quality: number,
  ) => Promise<Blob | null>;
};

export class AvatarPrepareError extends Error {
  override name = 'AvatarPrepareError';

  constructor(
    readonly code: 'unreadable' | 'too-large',
    message: string,
  ) {
    super(message);
  }
}

/** WebP first (small), JPEG where the browser cannot make WebP; quality steps down until it fits. */
const TYPES = ['image/webp', 'image/jpeg'];
const QUALITIES = [0.9, 0.8, 0.7, 0.55, 0.4];

/** The picture as a square PNG-free upload: cropped, scaled, encoded, and no more than 1 MB. */
export async function prepareAvatar(file: Blob, deps: PrepareDeps): Promise<Blob> {
  let bitmap: Bitmap;
  try {
    bitmap = await deps.decode(file);
  } catch {
    throw new AvatarPrepareError(
      'unreadable',
      'That picture could not be read. Use a PNG, JPEG or WebP picture.',
    );
  }
  try {
    if (bitmap.width < 1 || bitmap.height < 1) {
      throw new AvatarPrepareError(
        'unreadable',
        'That picture could not be read. Use a PNG, JPEG or WebP picture.',
      );
    }
    const crop = cropSquare(bitmap.width, bitmap.height);
    // Never scale up: a small picture stays as sharp as it was.
    const size = Math.min(AVATAR_SIZE, crop.side);
    for (const type of TYPES) {
      for (const quality of QUALITIES) {
        const blob = await deps.encode(bitmap, crop, size, type, quality);
        // A browser that cannot make this type hands back something else (or nothing): try the next
        if (!blob || blob.type !== type) break;
        if (blob.size <= MAX_UPLOAD_BYTES) return blob;
      }
    }
    throw new AvatarPrepareError(
      'too-large',
      'That picture is too large even after it was shrunk. Try another.',
    );
  } finally {
    bitmap.close?.();
  }
}

/** The real thing, in a browser. Called only from an event handler, never while rendering. */
export const browserDeps: PrepareDeps = {
  decode: (file) => createImageBitmap(file, { imageOrientation: 'from-image' }),
  encode: (bitmap, { sx, sy, side }, size, type, quality) =>
    new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return resolve(null);
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap as ImageBitmap, sx, sy, side, side, 0, 0, size, size);
      canvas.toBlob(resolve, type, quality);
    }),
};
