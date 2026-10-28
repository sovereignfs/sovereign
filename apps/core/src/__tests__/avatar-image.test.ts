import { describe, expect, it, vi } from 'vitest';
import {
  AVATAR_SIZE,
  AvatarPrepareError,
  cropSquare,
  MAX_UPLOAD_BYTES,
  prepareAvatar,
  type PrepareDeps,
} from '../../app/profile/avatar-image';

describe('cropSquare', () => {
  it.each([
    [1000, 600, { sx: 200, sy: 0, side: 600 }],
    [600, 1000, { sx: 0, sy: 200, side: 600 }],
    [512, 512, { sx: 0, sy: 0, side: 512 }],
    [11, 4, { sx: 3, sy: 0, side: 4 }],
    [1, 1, { sx: 0, sy: 0, side: 1 }],
  ])('cuts the middle square from %i x %i', (width, height, crop) => {
    expect(cropSquare(width, height)).toEqual(crop);
  });

  it('always stays inside the picture, and is as large as fits', () => {
    for (const [w, h] of [
      [3, 977],
      [4096, 17],
      [640, 480],
      [481, 480],
    ] as const) {
      const { sx, sy, side } = cropSquare(w, h);
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sx + side).toBeLessThanOrEqual(w);
      expect(sy + side).toBeLessThanOrEqual(h);
      expect(side).toBe(Math.min(w, h));
    }
  });
});

const blobOf = (type: string, size: number) => new Blob([new Uint8Array(size)], { type });
const file = new Blob(['x'], { type: 'image/png' });

function deps(overrides: Partial<PrepareDeps> = {}, bitmap = { width: 1600, height: 900 }) {
  const close = vi.fn();
  const encode = vi.fn<PrepareDeps['encode']>(() => Promise.resolve(blobOf('image/webp', 40_000)));
  const decode = vi.fn(() => Promise.resolve({ ...bitmap, close }));
  return { decode, encode, close, ...overrides } as PrepareDeps & {
    decode: typeof decode;
    encode: typeof encode;
    close: typeof close;
  };
}

describe('prepareAvatar', () => {
  it('crops the middle square, scales it to 512, and encodes it as WebP', async () => {
    const d = deps();
    const blob = await prepareAvatar(file, d);
    expect(blob.type).toBe('image/webp');
    expect(d.encode).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1600, height: 900 }),
      { sx: 350, sy: 0, side: 900 },
      AVATAR_SIZE,
      'image/webp',
      0.9,
    );
  });

  it('never scales a small picture up', async () => {
    const d = deps({}, { width: 120, height: 200 });
    await prepareAvatar(file, d);
    expect(d.encode.mock.calls[0]?.[2]).toBe(120);
  });

  it('falls back to JPEG in a browser that cannot make WebP', async () => {
    const d = deps({
      encode: vi.fn((_b, _c, _s, type) =>
        Promise.resolve(blobOf(type === 'image/webp' ? 'image/png' : type, 30_000)),
      ),
    });
    const blob = await prepareAvatar(file, d);
    expect(blob.type).toBe('image/jpeg');
  });

  it('lowers the quality until the picture fits in 1 MB', async () => {
    const sizes: Record<string, number> = { '0.9': 2_000_000, '0.8': 1_500_000, '0.7': 900_000 };
    const d = deps({
      encode: vi.fn((_b, _c, _s, type, quality) =>
        Promise.resolve(blobOf(type, sizes[String(quality)] ?? 100_000)),
      ),
    });
    const blob = await prepareAvatar(file, d);
    expect(blob.size).toBe(900_000);
    expect(blob.size).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
  });

  it('says so when no type and quality is small enough', async () => {
    const d = deps({
      encode: vi.fn((_b, _c, _s, type) => Promise.resolve(blobOf(type, 5_000_000))),
    });
    await expect(prepareAvatar(file, d)).rejects.toMatchObject({ code: 'too-large' });
  });

  it('says so when the file is not a picture the browser can read', async () => {
    const d = deps({ decode: vi.fn(() => Promise.reject(new Error('InvalidStateError'))) });
    await expect(prepareAvatar(file, d)).rejects.toMatchObject({ code: 'unreadable' });
    await expect(prepareAvatar(file, d)).rejects.toBeInstanceOf(AvatarPrepareError);
  });

  it('refuses a picture with no size', async () => {
    const d = deps({}, { width: 0, height: 0 });
    await expect(prepareAvatar(file, d)).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('lets go of the decoded picture, whether or not it worked', async () => {
    const ok = deps();
    await prepareAvatar(file, ok);
    expect(ok.close).toHaveBeenCalledOnce();
    const bad = deps({ encode: vi.fn(() => Promise.resolve(null)) });
    await expect(prepareAvatar(file, bad)).rejects.toBeInstanceOf(AvatarPrepareError);
    expect(bad.close).toHaveBeenCalledOnce();
  });
});
