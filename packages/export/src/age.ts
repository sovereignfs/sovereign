import { createHash } from 'node:crypto';
import { Decrypter, Encrypter } from 'age-encryption';
import { ExportError } from './errors.js';
import { chunksOf } from './bytes.js';
import type { ByteSource } from './types.js';

const X25519 = /^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/;
/** The most recipients an export is encrypted to. */
export const MAX_RECIPIENTS = 16;

/**
 * The age X25519 recipients in a line the owner pastes: separated by spaces, commas or new lines, each `age1…`, at least one and at
 * most sixteen, none twice. Throws `invalid_recipients` saying what is wrong.
 */
export function parseRecipients(line: string): string[] {
  const recipients = line
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (recipients.length === 0)
    throw new ExportError('invalid_recipients', 'There is no recipient.');
  if (recipients.length > MAX_RECIPIENTS)
    throw new ExportError(
      'invalid_recipients',
      `There are more than ${MAX_RECIPIENTS} recipients.`,
    );
  const seen = new Set<string>();
  for (const recipient of recipients) {
    if (!X25519.test(recipient)) {
      throw new ExportError(
        'invalid_recipients',
        `${recipient.slice(0, 12)}… is not an age X25519 recipient (age1…).`,
      );
    }
    try {
      new Encrypter().addRecipient(recipient);
    } catch {
      throw new ExportError(
        'invalid_recipients',
        `${recipient.slice(0, 12)}… is not a valid age recipient.`,
      );
    }
    if (seen.has(recipient))
      throw new ExportError('invalid_recipients', 'A recipient is given twice.');
    seen.add(recipient);
  }
  return recipients;
}

/** A short, stable name for a recipient, for a log: the first 16 hex digits of its SHA-256. */
export function recipientFingerprint(recipient: string): string {
  return createHash('sha256').update(recipient).digest('hex').slice(0, 16);
}

function webStream(source: ByteSource): ReadableStream<Uint8Array> {
  if (typeof (source as ReadableStream<Uint8Array>).getReader === 'function')
    return source as ReadableStream<Uint8Array>;
  const iterator = chunksOf(source)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });
}

/** Encrypts a stream to age recipients, as a stream. The recipients are checked first. */
export async function encryptTo(
  recipients: string[],
  source: ByteSource,
): Promise<ReadableStream<Uint8Array>> {
  const encrypter = new Encrypter();
  for (const recipient of parseRecipients(recipients.join(' '))) encrypter.addRecipient(recipient);
  return encrypter.encrypt(webStream(source));
}

/** Decrypts an age stream with one or more identities (`AGE-SECRET-KEY-1…`). A wrong key or a changed byte errors the stream. */
export async function decryptWith(
  identities: string[],
  source: ByteSource,
): Promise<ReadableStream<Uint8Array>> {
  if (identities.length === 0)
    throw new ExportError('not_open', 'There is no key to open the export with.');
  const decrypter = new Decrypter();
  for (const identity of identities) decrypter.addIdentity(identity);
  try {
    return await decrypter.decrypt(webStream(source));
  } catch (error) {
    throw new ExportError(
      'not_open',
      `The export does not open with this key: ${(error as Error).message}`,
    );
  }
}
