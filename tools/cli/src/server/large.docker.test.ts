/**
 * A restore larger than the 1 GiB `sv receive` used to refuse (operator-cli §10.2): the backup is received to disk as it arrives, and the
 * process does not grow with it. A tar with one file of 1.2 GiB is generated in pieces, so the test itself holds almost none of it, and
 * is read through the same reader and extractor the server uses. It needs the disk room, and is with the Docker tests because it is slow.
 */
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeArchive, ChunkReader, extractStream } from './tar.js';

const SIZE = 1.2 * 1024 ** 3;
const PIECE = 1024 * 1024;

/** The header of a `files/big.tar` file of SIZE bytes, then its bytes, then the end of the archive, in pieces. */
async function* oversized(): AsyncIterable<Uint8Array> {
  const header = makeArchive({ 'files/big.tar': '' }).subarray(0, 512);
  header.write(`${Math.floor(SIZE).toString(8).padStart(11, '0')}\0`, 124);
  // The checksum covers the size, so it is made again.
  header.write('        ', 148);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  yield header;
  const piece = Buffer.alloc(PIECE, 0x61);
  for (let sent = 0; sent < SIZE; sent += PIECE) {
    yield piece.subarray(0, Math.min(PIECE, SIZE - sent));
  }
  const padding = (512 - (Math.floor(SIZE) % 512)) % 512;
  yield Buffer.alloc(padding + 1024);
}

describe('a restore of more than a gigabyte', () => {
  it('is written to disk as it arrives, whole, and the process does not grow with it', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-large-'));
    try {
      const before = process.memoryUsage().rss;
      let checks = 0;
      const done = await extractStream(new ChunkReader(oversized()), dir, {
        allowed: (name) => name === 'files/big.tar',
        guard: async () => void (checks += 1),
      });
      const grew = process.memoryUsage().rss - before;
      expect(done.names).toEqual(['files/big.tar']);
      expect(statSync(path.join(dir, 'files', 'big.tar')).size).toBe(Math.floor(SIZE));
      expect(done.bytes).toBe(Math.floor(SIZE));
      // The disk was asked about while it was written, every 64 MiB: about nineteen times.
      expect(checks).toBeGreaterThanOrEqual(15);
      expect(grew).toBeLessThan(300 * 1024 * 1024);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
