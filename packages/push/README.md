# @sovereignfs/push

Web Push for a [Sovereign](https://github.com/sovereignfs/sovereign) app's server: notify a person on a phone or a computer where the
app is not open. The app's key from its environment, encryption ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291)) and signing
([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)) on `node:crypto` with no dependency, and sending to the browsers' push services
only. The design is [RFC 0009](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0009-web-push.md).

Server-only (Node 22.3+), ESM; importing it in a browser throws. It needs no core, and logs nothing: no endpoint, key or message.

## The key

```sh
npx @sovereignfs/push keys
```

prints a new private key for `<PREFIX>_VAPID_PRIVATE_KEY` (32 bytes, URL-safe base64) and the public key that follows from it,
which is never configured. A hosted app lists `{ "name": "<PREFIX>_VAPID_PRIVATE_KEY", "bytes": 32 }` in its manifest's `generate`
and the instance makes it. Changing the key ends every subscription made with the old one.

```ts
import { pushSettings } from '@sovereignfs/push';

// `undefined` when the key is unset: the app has no push, and says so.
const settings = pushSettings('MYAPP');
```

`<PREFIX>_VAPID_SUBJECT` is the contact push services see, `mailto:` or `https:`; it defaults to `<PREFIX>_URL` when that is https.
A key that is not one, or a contact that is `localhost` or malformed, throws at start-up.

## Sending one push

```ts
import { parseSubscription, sendPush } from '@sovereignfs/push';

const parsed = parseSubscription(body); // what PushSubscription.toJSON() gives
if (parsed.ok) {
  const outcome = await sendPush({
    subscription: parsed.subscription,
    message: { title: 'A card is due', path: '/cards/42', tag: 'card-42' },
    settings,
    now: Date.now(),
  });
  // 'sent' | 'gone' (forget the device) | 'retry' | 'refused'
}
```

A subscription is accepted only for a known push service's host (`PUSH_SERVICE_HOSTS`: Google's, Mozilla's, Apple's,
Microsoft's); an app that must reach another passes `hosts`. A message is `{ title, body?, path?, tag?, kind?, data? }`, at most
3000 bytes; `path` is a path on the app's own origin.
