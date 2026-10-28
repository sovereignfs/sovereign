import { describe, expect, it } from 'vitest';
import {
  CONTENT_TYPES,
  ImageError,
  inspectImage,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
} from '../images/validate';
import { JPEG_1X1, png, WEBP_LOSSLESS_1X1, WEBP_LOSSY_1X1, webpExtended } from './image-fixtures';

const code = (bytes: Buffer): string | undefined => {
  try {
    inspectImage(bytes);
  } catch (error) {
    if (error instanceof ImageError) return error.code;
    throw error;
  }
  return undefined;
};

describe('an image core accepts', () => {
  it('is a PNG, read from its bytes with its size', () => {
    expect(inspectImage(png(512, 512))).toEqual({
      kind: 'png',
      contentType: 'image/png',
      width: 512,
      height: 512,
    });
  });

  it('is a JPEG', () => {
    expect(inspectImage(JPEG_1X1)).toMatchObject({
      kind: 'jpeg',
      contentType: 'image/jpeg',
      width: 1,
      height: 1,
    });
  });

  it.each([
    ['lossy', WEBP_LOSSY_1X1, 1, 1],
    ['lossless', WEBP_LOSSLESS_1X1, 1, 1],
    ['extended', webpExtended(640, 480), 640, 480],
  ])('is a %s WebP', (_name, bytes, width, height) => {
    expect(inspectImage(bytes)).toMatchObject({
      kind: 'webp',
      contentType: 'image/webp',
      width,
      height,
    });
  });

  it('is served as the kind its bytes say, which has a content type for each of the three', () => {
    expect(CONTENT_TYPES).toEqual({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' });
  });

  it('may be exactly 1 MB, but not a byte more', () => {
    const exactly = Buffer.concat([png(8, 8), Buffer.alloc(MAX_IMAGE_BYTES)]).subarray(
      0,
      MAX_IMAGE_BYTES,
    );
    expect(code(exactly)).toBeUndefined();
    expect(code(Buffer.concat([exactly, Buffer.from([0])]))).toBe('too-large');
  });

  it('may be as large as the longest side allows, and no larger', () => {
    expect(code(png(MAX_IMAGE_SIDE, 8))).toBeUndefined();
    expect(code(png(MAX_IMAGE_SIDE + 1, 8))).toBe('too-big');
    expect(code(png(8, MAX_IMAGE_SIDE + 1))).toBe('too-big');
    expect(code(webpExtended(MAX_IMAGE_SIDE + 1, 8))).toBe('too-big');
  });
});

describe('what core refuses', () => {
  it('an empty file', () => {
    expect(code(Buffer.alloc(0))).toBe('empty');
  });

  it.each([
    ['svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    [
      'svg after an xml declaration',
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>',
    ],
    ['svg after a BOM and spaces', '\uFEFF  \n<svg/>'],
    ['html', '<!doctype html><script>alert(1)</script>'],
  ])('%s, said plainly as one that is not accepted', (_name, text) => {
    expect(code(Buffer.from(text))).toBe('svg');
  });

  it.each([
    ['a GIF', Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'latin1')],
    ['a PDF', Buffer.from('%PDF-1.7 ...')],
    ['plain text', Buffer.from('hello there')],
    ['a ZIP', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
    ['a script with an image extension', Buffer.from('#!/bin/sh\nrm -rf /')],
  ])('%s', (_name, bytes) => {
    expect(code(bytes)).toBe('unsupported');
  });

  it('a file that only claims to be a PNG, JPEG or WebP', () => {
    expect(code(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))).toBe(
      'corrupt',
    );
    expect(code(Buffer.from([0xff, 0xd8, 0xff]))).toBe('corrupt');
    expect(code(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1'))).toBe('corrupt');
  });

  it('a picture cut short, anywhere in its header', () => {
    for (const whole of [png(64, 64), JPEG_1X1, WEBP_LOSSY_1X1, WEBP_LOSSLESS_1X1]) {
      for (let cut = 3; cut < Math.min(whole.length, 30); cut++) {
        const result = code(whole.subarray(0, cut));
        expect(['corrupt', 'unsupported', undefined]).toContain(result);
      }
    }
  });

  it('a size of nothing', () => {
    expect(code(png(0, 8))).toBe('corrupt');
    expect(code(png(8, 0))).toBe('corrupt');
  });

  it('a JPEG that never says how big it is', () => {
    expect(code(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]))).toBe(
      'corrupt',
    );
  });

  it('never throws anything but an ImageError, whatever the bytes', () => {
    let seed = 7;
    for (let round = 0; round < 300; round++) {
      const bytes = Buffer.alloc(40 + (round % 50));
      for (let i = 0; i < bytes.length; i++) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        bytes[i] = seed & 0xff;
      }
      // start like an image, so the reader goes in
      const start = [png(8, 8), JPEG_1X1, WEBP_LOSSY_1X1][round % 3] as Buffer;
      start.copy(bytes, 0, 0, Math.min(start.length, 12));
      try {
        inspectImage(bytes);
      } catch (error) {
        expect(error).toBeInstanceOf(ImageError);
      }
    }
  });
});
