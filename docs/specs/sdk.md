# Sovereign SDK — specification

|            |                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| **Status** | Draft. Built, except account-deletion fan-out ([epic 14](../epics/sdk.md); specified in core-app §4.5) |
| **Covers** | `@sovereignfs/sdk`                                                                                     |

This document is the single source of truth for what the SDK does. Where code, another document or an issue disagrees with it,
this document wins until it is changed.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are used as described in RFC 2119.

What an app may call is defined by [`contracts/core-api/openapi.yaml`](../../contracts/core-api/openapi.yaml), what core does by
[`core-app.md`](core-app.md), and how an app is configured by [`contracts/env.md`](../../contracts/env.md). This document says only what the
SDK adds.

---

## 1. What it is

`@sovereignfs/sdk` is how a JavaScript app's server talks to the Sovereign server it signs people in with.

```text
contracts/core-api/openapi.yaml     the one contract; any language can call it
  ↓ generated
@sovereignfs/api-client        typed calls, one per operation
  ↓ wrapped by
@sovereignfs/sdk               tokens, failure, version support, sign-in
```

The legacy SDK ran inside the platform, where a call was a function in the same process. An app is now a separate program, and the
network is the only link. So a call has a named actor, it can fail, and core may be older than the SDK.

### 1.1 What bounds it

1. **The SDK MUST NOT offer a capability the HTTP API lacks.** Anything it does, an app in another language or an external app can do
   with the contract alone. A capability is added to the contract first.
2. **It runs on a server.** Tokens MUST NOT reach a browser (§3).
3. **It covers what talks to core.** Databases, field encryption, end-to-end encryption, offline storage and the like use no network
   call to core, and are separate packages (§10).
4. **It names no app.**

### 1.2 Terminology

| Term             | Meaning                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **Person token** | An access token core issued to an app for a signed-in person, for the Core API                    |
| **App token**    | An access token core issued to an app for itself, with no person ([core-app §3.6.6](core-app.md)) |
| **Actor**        | Who a call is made as: a person, the app, or nobody for a public call                             |
| **Capability**   | A group of calls in the contract, such as the Directory                                           |
| **Token store**  | What an app gives the SDK to keep a person's refresh token (§5.1)                                 |

---

## 2. Creating a client

```ts
import { createSovereign } from '@sovereignfs/sdk';

export const sv = createSovereign({ prefix: 'NOTES' });
```

- With `prefix`, the SDK MUST read `<PREFIX>_URL`, `<PREFIX>_CORE_URL`, `<PREFIX>_CORE_CLIENT_ID` and `<PREFIX>_CORE_CLIENT_SECRET`,
  each secret also in its `_FILE` form, as [`contracts/env.md`](../../contracts/env.md) defines and
  [`contracts/app-manifest.md`](../../contracts/app-manifest.md) §3 provides.
- An app with other names MAY pass `appUrl`, `coreUrl`, `clientId` and `clientSecret` instead, so an external app can use it.
- Anything missing or malformed MUST throw when the client is created, naming the variable and never its value.
- `createSovereign` MUST make no network call, so an app starts while core is down.
- One client SHOULD be made per process.

---

## 3. Server only

The package's browser entry MUST throw on import, saying that the SDK runs on a server. A page that needs something from core asks
its own server. The exceptions are the instance document, which is public and which a page MAY fetch directly, and `/keys` (§9.3),
which is for pages and holds no token.

---

## 4. Actors

Nothing is implied from a request. Every call that needs a token names who it is made as:

```ts
const people = await sv.as(person).directory.searchUsers({ q: 'ada' });
await sv.app.notifications.send({ to: sub, title: 'Due today' }); // once notifications exist
const branding = await sv.instance.getBranding(); // public, so no actor
```

- `sv.as(person)` makes calls with a person token. `person` is what §9's `getSession` returns, or `{ sub }` with a token store.
- `sv.app` makes calls with an app token. It MUST NOT hold a person's token, and a person's calls MUST NOT use it.
- `sv.instance` makes public calls, with no token.
- A method exists only on an actor that can use it. `sv.app.directory` MUST NOT exist, so a call the server would refuse is a
  type error.
- An SDK MUST NOT fall back from one actor to another.

---

## 5. Tokens

The SDK gets, caches and refreshes tokens, so an app never handles an access token.

### 5.1 A person's refresh token

Core rotates a refresh token on every use, and treats one used twice as stolen: it removes every token that app holds for that person
([core-app §3.6.1](core-app.md)). So two refreshes racing each other sign the person out on every device. The SDK MUST prevent that:

- An app gives the SDK a token store, with `read(sub)` and `write(sub, next, previous)`. `write` MUST be atomic and MUST fail when the
  stored token is no longer `previous`, as with a database's conditional update: it resolves to `true` when it stored `next`, and to
  `false` (or rejects) when it did not. A store MAY also have `delete(sub)`, which the SDK calls when core says the person deleted their
  account (§9.1). The SDK ships none, since the app owns its data.
- Within a process, the SDK MUST run one refresh at a time for each person and app, and let the others wait for its result.
- Across processes, a refresh reads the stored token when it starts and MUST use the one it finds, whoever wrote it. Two processes that
  both send the same token are indistinguishable from theft, so an app that runs more than one process MUST give its store a
  `lock(sub, work)`, which runs `work` while no other process holds the lock for that person (a database advisory lock, a row lock, or
  the like). The SDK takes it around each refresh. Without one, the SDK narrows the window by reading the token at the last moment, and
  cannot close it.
- The new refresh token MUST be stored before the access token is used.
- A failed `write`, after core has rotated, leaves the token lost. The SDK MUST raise `SessionEndedError`.
- A refresh MUST NOT be retried after the request was sent. If the answer was lost, core may have rotated, and sending the old token
  again would look like theft. The SDK MUST raise `SessionEndedError` and the person signs in again.

A refresh token is a credential, and an app SHOULD keep it encrypted (its own field encryption).

### 5.2 Access tokens

- A token for the Core API is asked for with `resource=<core>/api/v1`, as [core-app §3.9](core-app.md) says. A token asked for with a
  resource comes with no ID token, so this is separate from signing in.
- Tokens MUST be cached in memory only, per actor, until 30 seconds before they expire.
- A `401` MUST discard the cached token and be tried once more with a new one. A second `401` is `SessionEndedError` for a person,
  and `CoreApiError` for the app.
- A `403` MUST NOT be retried. It means a scope is missing.
- An app token is asked for with `client_credentials`. It has no refresh token, and a new one is simply requested.

---

## 6. Failure

Core can be down, slow or refusing, and an app MUST stay up. So every call can fail, and a failure is an error of one of these types:

| Error                  | When                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| `CoreApiError`         | Core answered with a failure. It carries `status`, `code` and `message` |
| `CoreUnavailableError` | No usable answer: a network failure, a timeout, or a `5xx`              |
| `SessionEndedError`    | This person's token cannot be renewed. They must sign in again          |
| `NotSupportedError`    | This instance's core does not offer the capability (§7)                 |
| `ConfigurationError`   | The client was created wrongly (§2)                                     |

Each is an instance of `SovereignError`.

- Every request MUST have a timeout, by default 5 seconds, and an app MAY change it per client.
- A `GET`, and a call the contract marks as safe to repeat, MUST be retried at most twice on `CoreUnavailableError`, with jittered
  backoff, inside one overall limit of 10 seconds. Nothing else is retried.
- A `429` MUST be retried once, after `Retry-After`, only if that fits the limit. Otherwise it is raised with `retryAfter` set.
- The SDK MUST NOT log a token, a secret, or a person's details. An app MAY pass a logger, which receives the operation, status and
  duration.

---

## 7. Version support

An SDK release works with a range of core versions, and core may be older or newer. The SDK MUST NOT guess from a `404`.

- The instance document ([core-app §3.13](core-app.md)) says which API versions and capabilities this core serves.
- The SDK MUST read it before the first call to a capability, cache it for five minutes, and refresh it at once after a `404`.
- A call to a capability the instance lacks MUST raise `NotSupportedError`, naming the capability, and MUST NOT reach the server.
- A core too old to publish this is treated as serving the capabilities of Phase 1: the Directory and the instance document.
- If the document cannot be read, the SDK MUST make the call anyway. Version checks MUST NOT turn a brief outage into a refusal.

---

## 8. Capabilities

Names follow the legacy SDK where the meaning survives. Each method wraps one operation of the contract.

| Method                      | Actor  | Scope       | Operation                  |
| --------------------------- | ------ | ----------- | -------------------------- |
| `directory.searchUsers`     | person | `directory` | `searchDirectoryUsers`     |
| `directory.resolveUsers`    | person | `directory` | `resolveDirectoryUsers`    |
| `directory.findUserByEmail` | person | `directory` | `findDirectoryUserByEmail` |
| `instance.getBranding`      | none   |             | `getInstanceBranding`      |

These are specified in [core-app §4.1](core-app.md). `app.notifications.send` is made as the app (§4), the others as a person,
and a person's call reaches only what that app sent them. An older core that does not list `notifications` raises
`NotSupportedError` for each (§7).

| Method                      | Actor  | Scope                | Operation                  |
| --------------------------- | ------ | -------------------- | -------------------------- |
| `app.notifications.send`    | app    | `notifications:send` | `sendNotification`         |
| `notifications.list`        | person | `notifications`      | `listNotifications`        |
| `notifications.markRead`    | person | `notifications`      | `markNotificationRead`     |
| `notifications.markAllRead` | person | `notifications`      | `markAllNotificationsRead` |
| `notifications.dismiss`     | person | `notifications`      | `dismissNotification`      |
| `notifications.dismissAll`  | person | `notifications`      | `dismissAllNotifications`  |
| `app.email.sendToUser`      | app    | `email:send`         | `sendEmail`                |
| `app.activity.log`          | app    | `activity:write`     | `logActivity`              |

`app.email.sendToUser` ([core-app §4.2](core-app.md)) is made as the app, names the person by `sub`, and answers an `id` and nothing of
whether the message went: core says nothing of the person or their address, and never reports delivery. An instance with no mail does not
list `email`, and the call raises `NotSupportedError` without sending (§7). `app.activity.log` ([core-app §4.3](core-app.md)) is made as the app and names the person by `sub`; it answers an `id` and nothing of whether
the entry was kept. There is no call to read an entry, as the app or as a person: the record is the person's, read in core. A core that does
not list `activity` raises `NotSupportedError` without sending.

| Method        | Actor  | Scope  | Operation       |
| ------------- | ------ | ------ | --------------- |
| `keys.me`     | person | `keys` | `getMyKeys`     |
| `keys.person` | person | `keys` | `getPersonKeys` |
| `apps.list`   | person | (none) | `listMyApps`    |

`apps.list` ([core-app §3.8](core-app.md)) gives the apps core's launcher lists for the person, with a tile's fields, for an app's own
launcher; any of the person's tokens will do. `appsLauncherItems` in `@sovereignfs/ui` turns them into `AppsLauncher`'s items. A core that
does not list `apps` raises `NotSupportedError` without sending.

The key calls ([core-app §5.7](core-app.md)) give public keys and the person's own wrapped keys for the token's app, and nothing a server
could read a document with. A person who has not opened the app is a `CoreApiError` with status `404`; the app says so, and may hold a
share until they do. A core that does not list `keys` raises `NotSupportedError` without sending. The app's server hands what they give
to its page, where `@sovereignfs/sdk/keys` checks and uses them (§9.4).

Account-deletion fan-out runs the other way, from core to an app: it is specified in [core-app §4.5](core-app.md), and the app's part of it is `sv.auth.handleAccountDeleted` (§9).

---

## 9. Signing in

The SDK signs people in through core with an established OpenID Connect client, `openid-client`, and MUST NOT reimplement one.

| Function                          | What it does                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `sv.auth.beginSignIn`             | Starts sign-in with PKCE `S256`, and returns the address to send the person to     |
| `sv.auth.completeSignIn`          | Handles the return, checks `state` and `nonce`, and returns the session            |
| `sv.auth.getSession`              | The current session, or `null`                                                     |
| `sv.auth.requireSession`          | The current session, or throws `NotAuthenticatedError`                             |
| `sv.auth.signOut`                 | Ends the app's session, and returns the address of core's end-session endpoint     |
| `sv.auth.handleBackChannelLogout` | Verifies a logout token and ends the sessions it names                             |
| `sv.auth.handleAccountDeleted`    | Verifies a deletion notice, ends the person's sessions, and runs the app's handler |

- These are framework-neutral: they take a web-standard `Request` and return data and `Set-Cookie` values, and need a **session
  store** from the app (§9.1). `@sovereignfs/sdk/next` binds them to Next.js: cookies, route handlers and redirects. `next` is an
  optional peer dependency, and nothing else needs it.
- A session holds the person's `sub` and the claims of the scopes granted. An app MUST identify a person by `sub`, which is stable.
- `getSession` MUST NOT call core on every request. An app's session is its own, and it ends when its back-channel logout arrives or
  its tokens stop working.
- A logout token MUST be verified as [core-app §3.6.5](core-app.md) describes, and refused if its signature, issuer, audience, age or
  event is wrong, or if it carries a `nonce`.
- An app's session cookie MUST be host-only, with the `__Host-` prefix over https, for the reason in [core-app §3.5](core-app.md).
- Changing a password, listing sessions and revoking them are core's own pages. The SDK offers an address to them (`sv.links`), and no
  call.
- `roles` is available to trusted apps only. The SDK offers `hasRole(session, role)`. An app's own permissions are its own.

### 9.1 What the app provides, and what the SDK does with it

`nextAuth` (`/next`) is **deprecated** from 2.10.0: a new app signs people in with `@sovereignfs/auth` (§9.8). It keeps working, and is
removed only in a major version ([`docs/upgrade.md`](../upgrade.md)).

The app gives `createSovereign` a `sessionStore` (the app owns its data; the SDK ships none outside `/testing`):

```ts
interface SessionStore {
  get(id: string): Promise<StoredRecord | undefined>;
  set(id: string, record: StoredRecord, expiresAt: number): Promise<void>;
  delete(id: string): Promise<void>;
  /** Removes every session of a person (`sub`), or the ones of one core session (`sid`). */
  deleteMatching(match: { sub?: string; sid?: string }): Promise<void>;
}
```

A record is `{ kind: 'session' | 'pending' | 'seen', sub?, sid?, data }`, which the store keeps as it is. A store MUST NOT return a record
after its `expiresAt`.

- `beginSignIn({ returnTo? })` makes the PKCE `S256` verifier, `state` and `nonce`, keeps them in the store as a `pending` record that
  lives an hour (as long as core's emailed links, since core carries an app's request through sign-up, verification and a reset), and returns the address to send the person to and the cookie (`__Host-sv_signin`) that names the record. `returnTo`
  is a path on the app, and anything else is ignored.
- `completeSignIn(request)` finds the pending record from the cookie, deletes it (a callback can be used once), exchanges the code
  with the app's secret, checks the ID token (signature, issuer, audience, `nonce`) and `state`, and makes the session: a `session`
  record, a new random id in the cookie (`__Host-sv_session`), thirty days at most. If the app holds a token store and core gave a
  refresh token, the SDK stores it for the person (§5.1). It returns the session and where to go next.
- `getSession(request)` reads the cookie and the store, and makes no call to core. `requireSession` throws `NotAuthenticatedError` (there is no session). A sign-in that cannot be completed throws `SignInError`: it was not one this app began, it ran out, or core refused it. Both are experimental, like the rest of §9.
- `signOut(request)` deletes the app's session and clears the cookie, and returns core's end-session address with the `id_token_hint`
  and the app's `post_logout_redirect_uri`, which the app MUST have registered. It ends the app's session even if the person never
  returns from core.
- `handleBackChannelLogout(request)` takes a `POST` with a `logout_token` and ends the sessions it names (`deleteMatching`). It
  answers `200`, and `400` for a token it refuses, saying nothing of why beyond `invalid_request`. A token is refused unless its
  header `typ` is `logout+jwt`, its signature checks against core's published keys, its `iss` is this core and its `aud` includes this
  app, it is not issued in the future and has not expired, its `events` carry the back-channel logout event, it carries a `jti`, it
  names a `sub` or a `sid`, and it carries no `nonce`. A `jti` seen before is refused. A token that names only the person (no `sid`)
  also removes their stored refresh token, when the token store can; one that names a `sid` leaves it, since the person's other
  sessions in the app use it. Two deliveries of one token at the same moment can both pass the `jti` check; they can only end the
  same sessions twice.
- When core says a person's session is over (it refuses the renewal of their token, or their token twice), the call throws
  `SessionEndedError` with `byCore` true, and the SDK has already ended the person's sessions in the app (`deleteMatching`) and
  removed their stored refresh token, so their next request signs them in again. A `SessionEndedError` for any other reason (the app
  keeps no token for the person) ends nothing.
- `handleAccountDeleted(request, handler)` takes a `POST` with an `account_deleted_token` (core-app §4.5). The token is refused, with `400`
  and `invalid_request`, by the rules for a logout token except that its header `typ` is `account-deleted+jwt` and its `events` carry
  `urn:sovereignfs:event:account-deleted`; a `jti` seen before is refused. For a good one the SDK ends the person's sessions
  (`deleteMatching`) and removes their stored refresh token, then calls `handler({ sub })`, and **answers `200` only after the handler has
  resolved**. If the handler throws, the SDK answers `500` and core sends the notice again, so the handler MUST be safe to run twice
  and MUST delete everything the app holds of that person before it resolves. The SDK keeps no record of the person once the handler
  has resolved. A token for another app, or for a core other than the one the app was set up with, is refused like any other.
- `handleExportRequest(request, app, handler)` takes a `POST` with an `export_request_token` (core-app §4.7.2). The token is refused,
  with `400` and `invalid_request`, by the rules for a logout token except that its header `typ` is `export-request+jwt` and its
  `events` carry `urn:sovereignfs:event:export-requested`; a `jti` seen before is refused. For a good one the SDK answers `200` at once
  with an export (`contracts/export.md`, `kind: "person"`, `app` the app's `prefix` from `app`, `sub` the person's) as `application/x-tar`,
  and calls `handler({ sub, writer })` with the `@sovereignfs/export` writer it is written through. The handler adds the app's records
  and files for that person under `apps/<prefix>/` and nothing of anyone else's; the SDK writes `contents.json` when it resolves. If the
  handler throws, the answer ends short, which core's check refuses, and core lists the app's part as missing. Asking again changes
  nothing. The Next.js handlers mount it at `/auth/export` when given `onExport: { prefix, version, handler }`.
- The session cookie is `HttpOnly; Secure; SameSite=Lax; Path=/` with no `Domain` and the `__Host-` prefix over https. Over `http`
  (a development instance) it has no `Secure` and no prefix, since a browser would refuse the prefix.
- `sv.links` has the addresses of core's own pages for a person: `profile`, `security`, `preferences`, `connectedApps` and
  `deleteAccount`.
- `hasRole(session, role)` is true when the `roles` claim has `role`. An app that was not given `roles` has none.

### 9.2 Verifying a notice without the SDK's sessions

An app whose sessions are not the SDK's (it signs people in by other means as well, or only has its own sessions after a sign-in it
handled itself) still has to act on core's notices, and MUST NOT write the rules of §9.1 again. The SDK offers the verification alone:

```ts
import { verifyAccountDeletedToken, verifyLogoutToken } from '@sovereignfs/sdk';

const notice = await verifyLogoutToken(request, { coreUrl, clientId, seen });
// { sub?: string; sid?: string }
```

- `verifyLogoutToken` and `verifyAccountDeletedToken` take a web-standard `Request`, a `POST` whose form holds `logout_token` or
  `account_deleted_token` (the body is read), or the token itself, and the options `coreUrl` (the issuer), `clientId` (the audience), `seen`
  and optionally `fetch`. They make no call to core but for its discovery document (the issuer's address with `/.well-known/openid-configuration` appended, so an issuer with a path keeps it) and its published keys, which they read on every call,
  since notices are rare and a key that rotated must not be remembered. Each request has ten seconds and follows no redirect, through
  `fetch` (default: the platform's). The keys are fetched only from core's own address: a discovery document that names them elsewhere is
  an answer core cannot be trusted to have meant, and a `CoreUnavailableError`. A `coreUrl` that is not the issuer core's discovery document names is a `ConfigurationError`, and so is
  a missing option, naming it and never a value.
- They apply **every rule of §9.1** for their notice: the header `typ` (`logout+jwt` or `account-deleted+jwt`), the signature against
  core's keys, `iss`, `aud`, an `iat` not in the future, `exp`, the event, a `jti`, a `sub` or `sid` (a logout token) or a `sub` (a deletion
  notice), and no `nonce`. A logout token for `sub` or `sid` returns the one it names (or both); a deletion notice returns `{ sub }`.
- **`seen` is required.** It is `(jti: string, expiresAt: number) => Promise<boolean>`: it MUST record the `jti` until `expiresAt` and
  answer `true` when it had been recorded already, and a notice whose `jti` it has seen is refused. A verifier without replay
  protection is a mistake this export does not make easy, so there is no default. It is asked last, of a notice that has met every other
  rule, so a forged one fills nothing. Each attempt of core's has a new `jti`, so a retry after a `5xx` is not a replay.
- A notice they refuse throws `InvalidNoticeError`, which an app answers with `400` and `invalid_request`, saying nothing of why. A request that
  is not a `POST` is refused whatever it carries. Core being unreachable (the connection fails, a request times out, or its discovery document
  or keys answer anything but a success) throws `CoreUnavailableError`, which an app answers with `503` so that core sends the notice
  again, and records nothing in `seen`.
- They end and delete nothing. What an app does with `{ sub, sid }` is its own: for a logout token it ends the sessions of that person or of
  that core session, and for a deletion notice it deletes what it holds of the person and answers `200` only after it has (core-app §4.5).
- `handleBackChannelLogout` and `handleAccountDeleted` apply the same rules, from one implementation, through the client's own transport and
  discovery, then the session store's `seen` records, `deleteMatching` and the handler, and behave as §9.1 says.
- `@sovereignfs/sdk/testing` has `memorySeen()`, a `seen` for an app's own tests, beside the fake core that makes both tokens and serves
  its keys.
- Both functions, `InvalidNoticeError` and `memorySeen` are **experimental**, like the rest of §9.

---

### 9.3 Key release

Built ([core-app §5.7](core-app.md), task 16.10). For an app whose manifest has `encryption`, the SDK gets the app's key from core once
in each browser session, through `@sovereignfs/sdk/keys`, the entry a page imports (§3):

- **`appKeys({ core, clientId, returnTo })`** gives `open()`, `unlock()`, `receive()` and `forget()`.
- **`open()`** gives the app key, as a WebCrypto key that cannot be exported, while this browser holds it for the app's session;
  otherwise `{ state: 'locked' }`, and the page shows `LockedState` from `@sovereignfs/ui` with `unlock()` as its action.
- **`unlock()`** makes a key pair and a `state`, keeps both in IndexedDB, and sends the person to core's `/keys/release` with the
  public half. The private half is kept wrapped (pkcs8, AES-GCM) by a key of the browser's that cannot be exported, never as a
  WebCrypto key of a curve, which WebKit's IndexedDB accepts and does not keep; it is opened again, not exportable, by `receive()`. Core releases silently only when the browser names the app's origin as the referrer, so an
  app's pages keep a referrer policy that sends the origin (the browsers' default); with `no-referrer` the person is asked each time.
- **`receive()`**, at the key return address, reads the answer from the fragment, removes the fragment from the address before
  anything else, and makes every check of core-app §5.7, refusing anything else with its reason. The `state` and its key are used
  once; a request not answered in ten minutes is dropped. The first signing key it is given for a person is remembered, and an
  answer signed by another is refused.
- **It keeps the key** as core-app §5.4 keeps the account key: wrapped by a device key and by the session's key secret, which the
  app's server makes on the first ask and keeps with the app's own session (`auth.keySecret(request)`, served by `nextAuth` at
  `/auth/key-secret` to the app's own pages only, or by `@sovereignfs/auth/server`'s `keySecrets` at `/api/auth/sv/key-secret` for an app on that package,
  auth.md §8.1, which the page names as `secretPath`). The app's session ending, by back-channel logout or otherwise, leaves nothing
  that opens.
- `@sovereignfs/crypto` stays private and is bundled into the entry, as `@sovereignfs/api-client` is.

### 9.4 Sharing

Built (core-app §5.7, RFC 0005 §3.1, task 16.11), in `@sovereignfs/sdk/keys`, beside §9.3:

- **`checkPerson(keys)`** takes what `keys.person` (or `keys.me`) gave: the account's signature must cover both public keys for this person
  and app, and the account's signing key must be the one this browser remembers for the person (the first is remembered, and so is the
  one key release names). A changed one is refused with `changed` until **`trustChanged(keys)`**, after the person using the app said to
  go on; a signature that does not verify is refused with `signature`.
- **`identity(appKey, me)`** checks the person's own keys the same way, then opens their two key pairs with the app key.
- **`share({ documentKey, documentId, to, identity })`** seals a document key to a checked person for one document, signed with the
  person's own signing key; **`openShared({ record, documentId, me, from, identity })`** checks the sharer's signature, then opens it.
- **`newDocumentKey()`** makes a document key. An app makes a new one at the next write after removing a reader, and seals it only to
  those who remain (RFC 0005 §8); what a removed reader already read cannot be taken back, and the app says so.
- Document keys are the app's to keep, beside its documents.
- **`encryptContent(contentKey, { documentId, version }, stream)`** and `decryptContent` encrypt a document in RFC 0005 §1.3's
  chunks, as streams; **`encryptBytes`** and `decryptBytes` a small value whole (a name, a type, a size). `importDocumentKey` makes
  the content key from a document key's bytes. A blob read under another id or version, or cut short, does not open.

### 9.5 An app with no core

Built (RFC 0005 §4's last paragraph, [RFC 0003](../rfcs/0003-apps-of-their-own.md), task 16.13). An app that runs with no core keeps
its people's keys in a vault of its own, on its own database, and unlocks it at its own sign-in. It stores the same records as core's
vault (core-app §5.3), made by the same routine in the browser, so a person's keys can later move to core's vault and open there.

- **On the server, `@sovereignfs/sdk/vault`:** `new AppVault(database)` over any database with `run` and `transaction`, as
  `@sovereignfs/database` has; its tables are `vaultMigrations(family)` (`sqlite` for a SQLite file and sqld, `postgres`), recorded
  apart from the app's own migrations (`migrate(db, vaultMigrations(db.family), { table: VAULT_MIGRATIONS_TABLE })`, or the app's
  own tool). It keeps a person's account keys, the account key wrapped for the password (or passphrase) and the kit, and their keys
  for the app, under the app's own `sub` for the person and its manifest `prefix` as the client id. It opens nothing. Passkeys that
  unlock and escrow need core and are refused.
- **The vault id** (`await vault.vaultId()`) stands where core's instance id stands in the password derivation: 32 random bytes,
  made the first time and never again. It is refused, not remade, when accounts exist and it does not.
- **`vaultRoute(vault, { origin })`** is the one route the page calls (`/auth/vault` unless moved): `GET` reads the person's
  records, `POST` applies one change, only when its `Origin` is `origin`, the app's public address (`<PREFIX>_URL`; never the
  request's own URL, which a proxy may rewrite), and the browser does not call it cross-site. The app passes the `sub` from its own
  session, never from the request.
- **Its database** is any with `run(sql, args)` taking `?` placeholders and answering `{ rows, rowsAffected }`, and
  `transaction(fn)`; `@sovereignfs/database` is one, and an app on another driver wraps its own in those two calls.
- **Argon2id is WebAssembly**, so the pages that derive (sign-in, sign-up, reset, change, the passphrase) need `'wasm-unsafe-eval'`
  in `script-src`, as core's do (core-app §5.2); never `'unsafe-eval'`.
- **The session's secret** is the app's to keep with its own session (`newSessionSecret()`), served to its own pages at
  `/auth/key-secret` as `{ sub, secret }`. With the session gone, what a browser kept opens nothing. There is no table of them.
- **Deleting a person** is `vault.deleteAccount(sub, tx)`, on the transaction that deletes the person in the app.
- **In the page, `localVault({ clientId, vaultId })`** from `@sovereignfs/sdk/local-vault`, a browser entry of its own so that `/keys`
  never loads the password derivation (libsodium's WebAssembly), which `/local-vault` loads only when a key is derived. `derive(password, address)` gives the sign-in
  value the app's own sign-in takes where it took the password, and a secret; `afterSignIn(secret)` sets the keys up or opens them.
  An app whose sign-in is someone else's asks for a passphrase: `unlockWithPassphrase(passphrase, sub)`, kept as the password's way
  in. `open()` gives the app key or `{ state: 'locked' }`, as §9.3's does; `kitPending()`, `keepKit(kit)` and `unlockWithKit(typed,
secret)` are the kit, as core's pages do it; `prepareChange` and `finishChange` a password change. No request carries a password,
  a passphrase or a key that opens anything.
- **Exports** (core-app §4.7, `contracts/export.md`): with no core to ask it, the app offers both itself, through `@sovereignfs/export`.
  Its **operator** is the first account made in it. On its **Data** page, the operator saves the age recipients its export is encrypted
  to, and takes the app's export (`kind: "app"`), encrypted as it is written, after their password again; anyone else gets a page that is
  not there. On a person's **Your data** page, each person takes their own (`kind: "person"`), not encrypted. Both run and are downloaded
  once as core's do (core-app §4.7.3), under the app's own data path, with the same shared pieces core uses:
  `ExportJobs` on the app's own database (its table from `exportJobsMigrations`), `ExportRunner`, `downloadExport` and `viewOf` from
  `@sovereignfs/export`, and `ExportPanel` from `@sovereignfs/ui`.
- **Not here:** sharing with another person needs their public keys, which only core serves (§9.4); an app with no core shares
  nothing yet.

### 9.6 A fresh sign-in

An app can ask core for a sign-in that is recent, before something that wants one, and know when the person last signed in at core.

- `beginSignIn({ returnTo?, prompt?, maxAgeSeconds? })`: `prompt: 'login'` asks core to have the person sign in again even with a session
  there; `prompt: 'none'` asks core to show nothing, and the callback fails with `SignInError` when the person would have had to sign in;
  `prompt: 'create'` asks core to open its sign-up rather than its sign-in (OpenID Connect Prompt Create 1.0), for an app's _Create an
  account_; `maxAgeSeconds` asks for a sign-in no older than that (OpenID Connect `max_age`), which core gives by asking again when its session is
  older. An age that is not a whole number of seconds, 0 or more, is refused with `TypeError`.
- `completeSignIn` holds a sign-in asked with `maxAgeSeconds` to it: the ID token's `auth_time` MUST be within the age, or the callback
  fails with `SignInError`, whatever core answered.
- A session carries `authTime`, when the person last signed in at core in milliseconds, from `auth_time`; it is missing when core did
  not say. `sv.auth.signedInWithin(session, seconds)` says whether that is within the last `seconds`, by the client's clock.
- `@sovereignfs/sdk/next`: `/auth/login` passes on `prompt` (`login`, `none` or `create`) and `max_age` (whole seconds) from its query, and
  ignores anything else; `requireSession(returnTo, { maxAgeSeconds })` sends a person whose sign-in is older, or unknown, to sign in
  again with that age.

### 9.7 Checking a session against core

An app's session is its own, and core's can end without telling it (it expires; a notice is missed). An app that sets
`checkEverySeconds` has its sessions checked against core at that interval ([RFC 0006](../rfcs/0006-sessions-across-apps-and-a-lock.md)
part A). The template sets an hour; unset, nothing is checked.

- A session carries `checkedAt`, set when it is signed in and at each check. `sv.auth.needsCheck(session)` is true once more than
  `checkEverySeconds` have passed since then, and never when the client does not check.
- `@sovereignfs/sdk/next`: `requireSession` sends a session that needs a check to `/auth/login?returnTo=…&prompt=none`. Core shows nothing
  while its session lives: the callback **renews the session in place** (the same id, cookie and key secret; the claims, `authTime`,
  `checkedAt` and `expiresAt` of the new sign-in) and returns to the page. When core answers `login_required`, `completeSignIn` ends the
  browser's session and throws `SignInError` with `reason: 'login_required'` and the `returnTo`; the callback clears the session cookie and
  sends the person to sign in the usual way, to the same page.
- `getSession` is unchanged: no call to core, so server actions and routes use the session as it is until the next page is opened.
- Signing in again in a browser that has a session renews it for the same person; another person's sign-in ends the first person's
  session in that browser.
- `checkEverySeconds` must be a whole number of seconds, 1 or more (`ConfigurationError`).
- The fake core's `loginRequired(authorizationUrl)` answers a `prompt=none` sign-in as core does for someone with no session.

### 9.8 Signing in for a session the app keeps

For an app that keeps its people's sessions itself (`@sovereignfs/auth`, [`auth.md`](auth.md) §8, RFC 0007), the SDK gives the steps of
§9.1 without a session of its own:

- `beginSignIn` as in §9.1: the pending record is the SDK's, in its store, and its cookie the SDK's.
- `finishSignIn(request)` checks the answer as `completeSignIn` does (state, nonce, PKCE, `max_age`), keeps core's refresh token in the
  `TokenStore` as §5.1 says, and returns who signed in (`sub`, `sid`, the claims, the scopes, the ID token) and where they were going,
  with the one cookie that clears the pending sign-in. It makes no session. A sign-in with `prompt=none` that finds the person signed
  out at core throws a `SignInError` whose reason is `login_required`, so the caller ends its own session (§9.7).
- `endSessionUrl(idToken)` is core's sign-out for an ID token the caller kept; core decides what it ends (core-app §3.6.5).
- The notices are §9.2's (`verifyLogoutToken`, `verifyAccountDeletedToken`), and a session's secret is the caller's (`newSessionSecret`).

`completeSignIn` is `finishSignIn` with the SDK's session made from it, so the two cannot drift. Everything §5.1 promises of the refresh
token holds unchanged: the SDK is still the only thing that sends it.

### 9.9 Who is signed in, typed

A session's `user` is who the person is, the same shape for the SDK's sessions and for `@sovereignfs/auth`'s ([`auth.md`](auth.md)),
and for an account of the app's own as for one from core (RFC 0007 §10):

| Field      | Is                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`       | The app's own id for the person, and the only thing to identify them by. With the SDK's sessions it is core's `sub` |
| `sub`      | Core's id for the person, when they came through core; missing for an account of the app's own                      |
| `name`     | With `profile`                                                                                                      |
| `email`    | With `email`, and `emailVerified` with it                                                                           |
| `picture`  | With `profile`: an absolute, versioned address                                                                      |
| `locale`   | With `profile`: a BCP 47 tag                                                                                        |
| `zoneinfo` | With `profile`: an IANA time zone                                                                                   |
| `roles`    | With `roles`, for a trusted app only, from the token core signed; empty otherwise                                   |

A field core was not asked for or did not send is missing, and a claim of the wrong type is left out (`personFromClaims`). `claims`
stays for what is not typed. **An app is not told** another person's email beyond a Directory match on the whole address, anything
of their passkeys, second step or sessions, or anything of the lock but that the person must sign in again. How a person signed in
(`amr`) waits for core to send it (6.6, parked).

## 10. From the legacy SDK

Every namespace of the legacy `sdk` object:

| Legacy          | Now                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `auth`          | **SDK** §9. `changePassword`, `listSessions` and `revokeSession` become links to core's pages     |
| `directory`     | **SDK** §8                                                                                        |
| `platform`      | **SDK** `instance.getBranding`, for what an app needs of it                                       |
| `notifications` | **SDK** §8                                                                                        |
| `email`         | **SDK** §8 (`app.email.sendToUser`)                                                               |
| `activity`      | **SDK** §8 (`app.activity.log`)                                                                   |
| `messages`      | Not carried over (core-app §4.1)                                                                  |
| `portability`   | **Later**, with export (core-app §2). Nothing is carried over until then                          |
| `authz`         | Gone: there are no grants between plugins. Core's `roles` and an app's own permissions replace it |
| `db`            | **Local.** The app's own database                                                                 |
| `crypto`        | **Local.** `@sovereignfs/crypto`                                                                  |
| `mailer`        | **Local.** `@sovereignfs/mailer`, with the app's own mail settings                                |
| `env`           | **Local.** `contracts/env.md`                                                                     |
| `id`            | **Local.** The app's own                                                                          |
| `jobs`          | **Local.** The app runs its own, and acts as `sv.app`                                             |
| `secrets`       | **Local.** The app's own field encryption                                                         |
| `storage`       | **Local.** The app's own, with `data` in its manifest                                             |
| `device`        | **Local.** `@sovereignfs/bridge`                                                                  |
| `webhooks`      | **Local.** The app verifies its own                                                               |
| `data`          | Deferred: data shared between apps                                                                |
| `events`        | Deferred: events between apps                                                                     |
| `handoffs`      | Deferred: moving a person between apps with context                                               |
| `tools`         | Deferred: tools shared between apps                                                               |
| `connections`   | Deferred                                                                                          |
| `plugins`       | Deferred: which apps exist is the launcher's                                                      |
| `billing`       | Not carried over                                                                                  |

---

## 11. Testing an app

`@sovereignfs/sdk/testing` provides a fake core that an app's tests can run with no server:

- it answers the contract's operations, and its answers MUST be checked against the contract;
- it can act as a person, sign someone in, and send a logout notice (signing in and the notice arrive with §9; a person's tokens are there now);
- it can be told to fail in each way §6 lists, so an app can test what happens when core is down.

## 12. Packaging, stability and versioning

- The package is MPL-2.0, like the other packages, so an app under any licence can use it.
- It depends on `@sovereignfs/api-client` and `openid-client`, and runs on Node's supported versions, and on any server runtime that
  has `fetch` and Web Crypto.
- Its entry points are the root, `/next`, `/testing`, `/keys` and `/local-vault`, the two a browser imports (§9.3; §9.5 for an app
  with no core), and `/vault`, an app's own vault on its server (§9.5). `/keys` reaches no file of libsodium; `pnpm packages:check`
  fails when it does.
- It has its own `sdk-vX.Y.Z` tag ([`docs/releasing.md`](../releasing.md)).
- Its first release is `2.0.0`. The legacy SDK (§10) was published under the same name up to `1.25.0`, and npm will not make a lower
  version `latest`. A version of the legacy SDK is not an earlier release of this one.
- Every export is **stable** or **experimental**, and versions follow the same rules as the design system
  ([design-system §3 and §4](design-system.md)), in its "From `1.0.0`" column: breaking something stable is a major version. In this
  version the stable exports are `createSovereign`, the error types of §6, §4's
  actors, and §8's capabilities. Everything else is experimental.
- Each release states the core versions it supports.

## 13. Not in this version

Any language but JavaScript; calling core from a browser; capabilities Phase 2 has not specified; anything between apps; a token store
of its own; an app catalogue.

## 14. This version is done when

1. A stock app signs a person in, searches the Directory as them, and signs out, using nothing but this package.
2. Twenty parallel calls for one person, with an expired access token, make one refresh in a process, and with a lock two processes
   each make their own, one after the other, with neither sending a token twice.
3. With core stopped, an app starts, and each call raises `CoreUnavailableError` within the limit.
4. A lost answer to a refresh raises `SessionEndedError`, and does not resend the old token.
5. A capability an older core lacks raises `NotSupportedError` without a request.
6. A back-channel logout ends the app's session.
7. Bundling the root entry for a browser fails on import.
8. Every method in §8 is checked against the contract by a test.
9. An app's tests run against `/testing` with no server.

## Changelog

| Date       | Change                                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | First draft. Scope, app tokens and explicit actors were decided in discussion.                                                                                                                                                                            |
| 2026-10-30 | §5.1: the token store's `write` says whether it stored, and an optional `lock` closes the window between processes, which a conditional update cannot. §14: what two processes can promise.                                                               |
| 2026-10-30 | §9.1: the session store the app provides, what each function does with it, how a logout token is refused, the cookie, `sv.links`.                                                                                                                         |
| 2026-10-31 | §9, §8, §10: `handleAccountDeleted`, the app's part of account-deletion fan-out (core-app §4.5); legacy `portability` waits for export. Not built.                                                                                                        |
| 2026-10-31 | §5.1, §9.1: built. A token store MAY have `delete(sub)`; `nextAuth` takes `onAccountDeleted` and mounts `/auth/account-deleted`; the fake core makes `accountDeletedToken`.                                                                               |
| 2026-11-02 | §9.2: `verifyLogoutToken` and `verifyAccountDeletedToken`, the rules of §9.1 for an app whose sessions are not the SDK's, with `seen` required: [RFC 0003](../rfcs/0003-apps-of-their-own.md). Built in task 14.11.                                       |
| 2026-11-16 | §9.3: key release, specified and not built (core-app §5.7).                                                                                                                                                                                               |
| 2026-11-17 | §9.3: key release built, in the `/keys` entry, with `auth.keySecret` and `nextAuth`'s `/auth/key-secret`; §3 and §12 name the entry. `@sovereignfs/crypto` is bundled rather than published.                                                              |
| 2026-11-17 | §8: `keys.me` and `keys.person`; §9.4: sharing, built, in the `/keys` entry.                                                                                                                                                                              |
| 2026-11-17 | §9.5: an app with no core, built: `/vault` (`AppVault`, `vaultMigrations`, `vaultRoute`, `newSessionSecret`) and `localVault` in `/keys`; §12 names the entry.                                                                                            |
| 2026-11-17 | §9.5, §12: `localVault` moves to `@sovereignfs/sdk/local-vault`, an entry of its own, before any release carried it in `/keys`; `/keys` no longer reaches libsodium.                                                                                      |
| 2026-11-18 | §9.6: a fresh sign-in (`prompt`, `maxAgeSeconds`, `authTime`, `signedInWithin`, `requireSession`'s age); §9.1: core ending a session ends it in the app (`SessionEndedError.byCore`), and a logout notice for the whole person removes the refresh token. |
| 2026-11-19 | §9.7: checking a session against core (`checkEverySeconds`, `checkedAt`, `needsCheck`, `prompt=none` renewal in place, `SignInError.reason`); the fake core's `loginRequired`.                                                                            |
| 2026-11-19 | §9.1: a pending sign-in lives an hour, not ten minutes, so an app's sign-in carried through an emailed link is not refused.                                                                                                                               |
| 2026-11-20 | §9.9: a session's typed `user`, the same shape as `@sovereignfs/auth`'s, and what an app is not told; §9.1: `nextAuth` deprecated.                                                                                                                        |
| 2026-11-20 | §9.1: `handleExportRequest`, an app's part of a person's export; §9.5: an app with no core offers the owner's and a person's export itself (RFC 0008). Not built.                                                                                         |
| 2026-11-22 | §9.3: the key secret is also served by `@sovereignfs/auth`'s `keySecrets` (RFC 0007 amendment 1 A4, task 20.6).                                                                                                                                           |
| 2026-11-26 | §9.3: `unlock()` keeps the request's private key wrapped by a browser key, not as an X25519 WebCrypto key, which Safari and every iOS browser silently do not keep in IndexedDB.                                                                          |
