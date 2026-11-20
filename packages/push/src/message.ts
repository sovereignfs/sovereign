/**
 * What a push says (RFC 0009 §1.3). It is shown as it is by the app's worker (`@sovereignfs/pwa`); `kind` and `data` are for the
 * app's own `onPushKind` there. The icon is the app's own, never named by a push.
 */
export interface PushMessage {
  /** 1 to 120 characters. */
  readonly title: string;
  /** Up to 500 characters. */
  readonly body?: string;
  /** Where opening it goes: a path on the app's own origin (`/cards/42`), never another site. */
  readonly path?: string;
  /** Up to 100 characters: a push with the same tag replaces the last one on that device. */
  readonly tag?: string;
  /** Up to 100 characters, for the app's own handler in its worker. */
  readonly kind?: string;
  /** Small values for that handler. */
  readonly data?: Readonly<Record<string, string | number | boolean>>;
}

/** The most a message may be once serialised, below the 4 KB push services accept with room for the encryption's own bytes. */
export const MAX_MESSAGE_BYTES = 3000;

export class PushMessageError extends Error {
  override readonly name = 'PushMessageError';
}

const length = (text: string) => [...text].length;
// eslint-disable-next-line no-control-regex -- a control character in a title or a path is what this refuses
const CONTROL = /[\u0000-\u001f\u007f]/;

const text = (value: unknown, name: string, most: number, least = 0): string | undefined => {
  if (value === undefined) {
    if (least > 0) throw new PushMessageError(`${name} is required`);
    return undefined;
  }
  if (typeof value !== 'string' || length(value) < least || length(value) > most)
    throw new PushMessageError(`${name} is text of ${least} to ${most} characters`);
  return value;
};

/** Whether a path names a page on the app's own origin: it begins with one `/`, and has no `\` or control character. */
export function isOwnPath(path: string): boolean {
  return (
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('\\') &&
    !CONTROL.test(path) &&
    path.length <= 2048
  );
}

/**
 * Checks a message and returns it as it will be sent, with nothing it does not name. Throws {@link PushMessageError}, naming the
 * field, for anything outside its limits.
 */
export function checkMessage(value: PushMessage): PushMessage {
  if (typeof value !== 'object' || value === null)
    throw new PushMessageError('a message is an object');
  const title = text(value.title, 'title', 120, 1) as string;
  if (CONTROL.test(title)) throw new PushMessageError('title has a control character');
  const body = text(value.body, 'body', 500);
  if (body !== undefined && CONTROL.test(body.replace(/\n/g, '')))
    throw new PushMessageError('body has a control character other than a new line');
  const path = text(value.path, 'path', 2048);
  if (path !== undefined && !isOwnPath(path))
    throw new PushMessageError('path is a path on the app, beginning with one /');
  const tag = text(value.tag, 'tag', 100);
  const kind = text(value.kind, 'kind', 100);
  let data: Record<string, string | number | boolean> | undefined;
  if (value.data !== undefined) {
    if (typeof value.data !== 'object' || value.data === null || Array.isArray(value.data))
      throw new PushMessageError('data is an object');
    data = {};
    for (const [key, item] of Object.entries(value.data)) {
      if (
        typeof item !== 'string' &&
        typeof item !== 'boolean' &&
        !(typeof item === 'number' && Number.isFinite(item))
      )
        throw new PushMessageError('data holds only text, numbers and true or false');
      data[key] = item;
    }
  }
  const message: PushMessage = {
    title,
    ...(body !== undefined && { body }),
    ...(path !== undefined && { path }),
    ...(tag !== undefined && { tag }),
    ...(kind !== undefined && { kind }),
    ...(data !== undefined && { data }),
  };
  if (Buffer.byteLength(JSON.stringify(message)) > MAX_MESSAGE_BYTES)
    throw new PushMessageError(`the message is more than ${MAX_MESSAGE_BYTES} bytes`);
  return message;
}
