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

## The store

The app keeps its devices and waiting pushes in its own database, through a `PushStore` it gives the package (the pattern of the
SDK's stores). Every method names the account where it acts for one; an account has at most ten devices, and an eleventh replaces
the one turned on longest ago. **The device's keys are the app's to seal** under its own key; the store gives them back opened.

```ts
interface PushStore {
  saveDevice(account: string, subscription: Subscription, now: number): Promise<void>;
  removeDevice(account: string, endpoint: string): Promise<void>;
  devices(account: string): Promise<Subscription[]>;
  removeAccount(account: string): Promise<void>;
  forget(endpoint: string): Promise<void>; // the push service said it is gone; its waiting pushes go too
  enqueue(items: readonly QueuedPush[]): Promise<void>;
  claim(now: number, leaseMs: number, batch: number): Promise<ClaimedPush[]>;
  done(id: string): Promise<void>;
  later(id: string, at: number): Promise<void>;
  drop(id: string): Promise<void>;
}
```

`@sovereignfs/push/testing` has `memoryPushStore()` and the conformance suite every store passes, on `node:assert`, so any runner
can run it:

```ts
import { pushStoreConformance } from '@sovereignfs/push/testing';

describe('my push store', () => {
  for (const { name, run } of pushStoreConformance(() => makeStore())) it(name, run);
});
```

### The tables

Two tables. `keys` holds `p256dh` and `auth` sealed by the app; `message` is the message as JSON. Times are milliseconds since the
epoch.

PostgreSQL:

```sql
CREATE TABLE push_devices (
  endpoint text PRIMARY KEY,
  account text NOT NULL,
  keys bytea NOT NULL,
  saved_at bigint NOT NULL
);
CREATE INDEX push_devices_account ON push_devices (account, saved_at);

CREATE TABLE push_outbox (
  id text PRIMARY KEY,
  account text NOT NULL,
  endpoint text NOT NULL REFERENCES push_devices (endpoint) ON DELETE CASCADE,
  message text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  due_at bigint NOT NULL,
  claimed_until bigint NOT NULL DEFAULT 0,
  expires_at bigint NOT NULL
);
CREATE INDEX push_outbox_due ON push_outbox (due_at, claimed_until);
CREATE INDEX push_outbox_endpoint ON push_outbox (endpoint);
```

SQLite: the same, with `blob` for `bytea`, `integer` for `bigint`, and `PRAGMA foreign_keys = ON` (or the deletes below written out).

What each method does, in SQL a store can use as it is (PostgreSQL's `$n`; SQLite's `?`):

- `saveDevice`: `DELETE FROM push_outbox WHERE endpoint = $1 AND account <> $2`, then an upsert of the device
  (`ON CONFLICT (endpoint) DO UPDATE SET account, keys, saved_at`), then delete the account's devices beyond the ten newest by
  `saved_at`.
- `removeDevice`: `DELETE FROM push_devices WHERE endpoint = $1 AND account = $2` (its pushes go by the cascade).
- `enqueue`: one `INSERT INTO push_outbox (…) SELECT … FROM push_devices WHERE endpoint = $n AND account = $m` per item, so a push
  is never queued for a device that is not the account's.
- `claim`, one statement, so two runners never claim one row:

  ```sql
  UPDATE push_outbox
  SET attempts = attempts + 1, claimed_until = $now + $lease
  WHERE id IN (
    SELECT id FROM push_outbox
    WHERE due_at <= $now AND claimed_until <= $now
    ORDER BY due_at, id LIMIT $batch
    -- PostgreSQL: FOR UPDATE SKIP LOCKED
  ) AND due_at <= $now AND claimed_until <= $now
  RETURNING id, account, endpoint, message, attempts, due_at, expires_at;
  ```

  then the devices' keys for the endpoints it returned, opened.

- `later`: `UPDATE push_outbox SET due_at = $at, claimed_until = 0 WHERE id = $id`; `done` and `drop`: `DELETE … WHERE id = $id`.

## The outbox

```ts
import { enqueuePush, runPushOutbox } from '@sovereignfs/push';

// In the transaction that made the change, with that transaction's store: a change rolled back sends nothing.
await enqueuePush(txStore, {
  account,
  message: { title: 'A card is due', path: '/cards/42' },
  now: Date.now(),
});

// On a timer, or from a job: claims what is due by a lease, and sends it.
setInterval(() => void runPushOutbox({ store, settings, now: Date.now() }), 15_000);
```

A push is sent once (`201`); a device the push service says is gone (`404`, `410`) is forgotten with its waiting pushes; `429`, `5xx`
and no answer try again after 1, 5 and 30 minutes; anything else, a fourth failure, or a push past its expiry (four hours by
default, `ttlMs`) is dropped. A pass returns counts, and nothing is logged.

## The route

```ts
import { pushSubscriptionHandlers } from '@sovereignfs/push';

export const { GET, POST, DELETE } = pushSubscriptionHandlers({
  store,
  settings,
  account: async (request) => (await getSession(request))?.sub, // the signed-in account, or undefined (401)
  origin: process.env.MYAPP_URL, // the app's own origin, which a POST or DELETE must come from
});
```

| Method   | Body             | Answer                                                                   |
| -------- | ---------------- | ------------------------------------------------------------------------ |
| `GET`    | —                | `{ available: false }`, or `{ available: true, publicKey }`              |
| `POST`   | the subscription | `204`; `400` for anything that is not one; `503` with no key             |
| `DELETE` | `{ endpoint }`   | `204`, removing that device for this account only, whether or not it was |

A body is read to 4 KiB at most, a changing request from another origin is refused (`403`), and every answer is `no-store`.
