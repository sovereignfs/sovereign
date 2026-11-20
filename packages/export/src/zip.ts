import { utf8 } from './bytes.js';

const U32 = 0xffffffff;
const U16 = 0xffff;
const FLAGS = 0x0808; // bit 3: sizes after the data; bit 11: names are UTF-8

/** What the central directory needs of an entry written so far. */
export interface ZipEntry {
  name: Uint8Array;
  offset: number;
  size: number;
  crc: number;
  zip64: boolean;
}

function dosTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

class Bytes {
  readonly buffer: Buffer;
  #at = 0;
  constructor(length: number) {
    this.buffer = Buffer.alloc(length);
  }
  u16(value: number): this {
    this.buffer.writeUInt16LE(value, this.#at);
    this.#at += 2;
    return this;
  }
  u32(value: number): this {
    this.buffer.writeUInt32LE(value >>> 0, this.#at);
    this.#at += 4;
    return this;
  }
  u64(value: number): this {
    this.buffer.writeBigUInt64LE(BigInt(value), this.#at);
    this.#at += 8;
    return this;
  }
  bytes(value: Uint8Array): this {
    this.buffer.set(value, this.#at);
    this.#at += value.byteLength;
    return this;
  }
}

/** Whether an entry of `size` bytes at `offset` needs ZIP64 fields. */
export function needsZip64(size: number, offset: number): boolean {
  return size >= U32 || offset >= U32;
}

/** The local header of a stored entry whose CRC and sizes follow its data. */
export function zipLocalHeader(entry: ZipEntry, when: Date): Uint8Array {
  const { time, date } = dosTime(when);
  const extra = entry.zip64
    ? new Bytes(20).u16(0x0001).u16(16).u64(0).u64(0).buffer
    : new Uint8Array(0);
  return new Bytes(30 + entry.name.byteLength + extra.byteLength)
    .u32(0x04034b50)
    .u16(entry.zip64 ? 45 : 20)
    .u16(FLAGS)
    .u16(0)
    .u16(time)
    .u16(date)
    .u32(0)
    .u32(entry.zip64 ? U32 : 0)
    .u32(entry.zip64 ? U32 : 0)
    .u16(entry.name.byteLength)
    .u16(extra.byteLength)
    .bytes(entry.name)
    .bytes(extra).buffer;
}

/** The data descriptor after an entry's data. */
export function zipDataDescriptor(entry: ZipEntry): Uint8Array {
  if (entry.zip64) {
    return new Bytes(24).u32(0x08074b50).u32(entry.crc).u64(entry.size).u64(entry.size).buffer;
  }
  return new Bytes(16).u32(0x08074b50).u32(entry.crc).u32(entry.size).u32(entry.size).buffer;
}

/** The central directory and its end records, after the last entry, which ended at `offset`. */
export function zipCentralDirectory(entries: ZipEntry[], offset: number, when: Date): Uint8Array {
  const { time, date } = dosTime(when);
  const records: Buffer[] = [];
  for (const entry of entries) {
    const bigSize = entry.size >= U32;
    const bigOffset = entry.offset >= U32;
    const extraLength = (bigSize ? 16 : 0) + (bigOffset ? 8 : 0);
    const extra = new Bytes(extraLength > 0 ? extraLength + 4 : 0);
    if (extraLength > 0) {
      extra.u16(0x0001).u16(extraLength);
      if (bigSize) extra.u64(entry.size).u64(entry.size);
      if (bigOffset) extra.u64(entry.offset);
    }
    records.push(
      new Bytes(46 + entry.name.byteLength + extra.buffer.byteLength)
        .u32(0x02014b50)
        .u16(0x0300 | (entry.zip64 || extraLength > 0 ? 45 : 20))
        .u16(entry.zip64 || extraLength > 0 ? 45 : 20)
        .u16(FLAGS)
        .u16(0)
        .u16(time)
        .u16(date)
        .u32(entry.crc)
        .u32(bigSize ? U32 : entry.size)
        .u32(bigSize ? U32 : entry.size)
        .u16(entry.name.byteLength)
        .u16(extra.buffer.byteLength)
        .u16(0)
        .u16(0)
        .u16(0)
        .u32((0o100644 << 16) >>> 0)
        .u32(bigOffset ? U32 : entry.offset)
        .bytes(entry.name)
        .bytes(extra.buffer).buffer,
    );
  }
  const directory = Buffer.concat(records);
  const count = entries.length;
  const zip64 = count >= U16 || directory.byteLength >= U32 || offset >= U32;
  const end: Buffer[] = [directory];
  if (zip64) {
    const endOffset = offset + directory.byteLength;
    end.push(
      new Bytes(56)
        .u32(0x06064b50)
        .u64(44)
        .u16(45)
        .u16(45)
        .u32(0)
        .u32(0)
        .u64(count)
        .u64(count)
        .u64(directory.byteLength)
        .u64(offset).buffer,
      new Bytes(20).u32(0x07064b50).u32(0).u64(endOffset).u32(1).buffer,
    );
  }
  end.push(
    new Bytes(22)
      .u32(0x06054b50)
      .u16(0)
      .u16(0)
      .u16(zip64 ? U16 : count)
      .u16(zip64 ? U16 : count)
      .u32(zip64 ? U32 : directory.byteLength)
      .u32(zip64 ? U32 : offset)
      .u16(0).buffer,
  );
  return Buffer.concat(end);
}

export function zipName(path: string): Uint8Array {
  return utf8(path);
}
