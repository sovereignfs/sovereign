import { describe, expect, it } from 'vitest';
import { formatKit, kitKey, readKit } from '../kit.js';
import { accountWrapData, newKey, RecordError, unwrapSecret, wrapSecret } from '../records.js';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const ascending = Uint8Array.from({ length: 32 }, (_, i) => i);

async function read(typed: string): Promise<Uint8Array | undefined> {
  const result = await readKit(typed);
  return result.ok ? result.kit : undefined;
}

describe('the recovery kit', () => {
  it('is 14 groups of four from an alphabet with no I, L, O or U', async () => {
    const text = await formatKit(newKey());
    expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){13}[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  // 0x00..0x1f in Crockford base32, as Python's standard base32 writes it with Crockford's alphabet, then the check.
  it('writes a known kit the same way every time', async () => {
    const text = await formatKit(ascending);
    expect(text.slice(0, 64)).toBe(
      '000G-40R4-0M30-E209-185G-R38E-1W81-24GK-2GAH-C5RR-34D1-P70X-3RFG',
    );
    expect(hex((await read(text)) ?? new Uint8Array())).toBe(hex(ascending));
  });

  it('reads back every kit it writes', async () => {
    for (let i = 0; i < 50; i += 1) {
      const kit = newKey();
      expect(hex((await read(await formatKit(kit))) ?? new Uint8Array())).toBe(hex(kit));
    }
  });

  it('ignores case, spaces and hyphens, and reads O as 0 and I and L as 1', async () => {
    const text = await formatKit(ascending);
    const relaxed = text
      .toLowerCase()
      .replaceAll('-', ' ')
      .replace('000G', 'oOOg')
      .replace('1W81', 'iW8L');
    expect(hex((await read(` ${relaxed}\n`)) ?? new Uint8Array())).toBe(hex(ascending));
    expect(hex((await read(text.replaceAll('-', ''))) ?? new Uint8Array())).toBe(hex(ascending));
  });

  it('calls one wrong character mistyped, wherever it is', async () => {
    const text = (await formatKit(ascending)).replaceAll('-', '');
    for (let at = 0; at < text.length; at += 1) {
      const wrong = text[at] === 'Z' ? 'Y' : 'Z';
      expect(
        await readKit(text.slice(0, at) + wrong + text.slice(at + 1)),
        `position ${at}`,
      ).toEqual({
        ok: false,
      });
    }
  });

  it.each([
    ['a U', (text: string) => `U${text.slice(1)}`],
    ['a group missing', (text: string) => text.slice(0, -5)],
    ['a group too many', (text: string) => `${text}-0000`],
    ['nothing', () => ''],
    ['a character outside the alphabet', (text: string) => `${text.slice(0, -1)}!`],
    [
      'two different characters swapped',
      (text: string) => {
        const at = [...text].findIndex((char, i) => char !== text[i + 1]);
        return `${text.slice(0, at)}${text[at + 1]}${text[at]}${text.slice(at + 2)}`;
      },
    ],
  ])('calls a kit with %s mistyped', async (_, change) => {
    const text = (await formatKit(Uint8Array.from({ length: 32 }, (_, i) => 255 - i))).replaceAll(
      '-',
      '',
    );
    expect(await readKit(change(text))).toEqual({ ok: false });
  });

  it('wraps the account key so that only the same kit opens it, and the wrong kit is refused as wrong', async () => {
    const kit = newKey();
    const accountKey = newKey();
    const place = accountWrapData('ada', 'kit');
    const record = await wrapSecret(await kitKey(kit), accountKey, place);

    const typed = await read(await formatKit(kit));
    expect(hex(await unwrapSecret(await kitKey(typed as Uint8Array), record, place))).toBe(
      hex(accountKey),
    );

    const otherKit = await read(await formatKit(newKey()));
    expect(otherKit).toBeDefined();
    await expect(
      unwrapSecret(await kitKey(otherKit as Uint8Array), record, place),
    ).rejects.toBeInstanceOf(RecordError);
  });

  it('makes a key that cannot be exported, and refuses a kit of the wrong length', async () => {
    const key = await kitKey(newKey());
    expect(key.extractable).toBe(false);
    await expect(kitKey(new Uint8Array(31))).rejects.toThrow(TypeError);
    await expect(formatKit(new Uint8Array(33))).rejects.toThrow(TypeError);
  });
});
