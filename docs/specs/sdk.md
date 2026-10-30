# Sovereign SDK — specification

|            |                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| **Status** | Draft. Built, except account-deletion fan-out and the capabilities of Phase 2 ([epic 14](../epics/sdk.md)) |
| **Covers** | `@sovereignfs/sdk`                                                                                         |

This document is the single source of truth for what the SDK does. Where code, another document or an issue disagrees with it,
this document wins until it is changed.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are used as described in RFC 2119.

What an app may call is defined by [`spec/core-api/openapi.yaml`](../../spec/core-api/openapi.yaml), what core does by
[`core-app.md`](core-app.md), and how an app is configured by [`spec/env.md`](../../spec/env.md). This document says only what the
SDK adds.

---

## 1. What it is

`@sovereignfs/sdk` is how a JavaScript app's server talks to the Sovereign server it signs people in with.

```text
spec/core-api/openapi.yaml     the one contract; any language can call it
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
  each secret also in its `_FILE` form, as [`spec/env.md`](../../spec/env.md) defines and
  [`spec/app-manifest.md`](../../spec/app-manifest.md) §3 provides.
- An app with other names MAY pass `appUrl`, `coreUrl`, `clientId` and `clientSecret` instead, so an external app can use it.
- Anything missing or malformed MUST throw when the client is created, naming the variable and never its value.
- `createSovereign` MUST make no network call, so an app starts while core is down.
- One client SHOULD be made per process.

---

## 3. Server only

The package's browser entry MUST throw on import, saying that the SDK runs on a server. A page that needs something from core asks
its own server. The one exception is the instance document, which is public and which a page MAY fetch directly.

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
  `false` (or rejects) when it did not. The SDK ships none, since the app owns its data.
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

`app.email.sendToUser` is specified ([core-app §4.2](core-app.md)) and planned: it is offered when core serves it.

These are not specified yet, because [core-app §2](core-app.md) leaves them to Phase 2. Each is specified in core and added to the
contract first, and the names are reserved:

| Namespace  | Actor          | Expected from legacy |
| ---------- | -------------- | -------------------- |
| `activity` | person and app | `log`                |

Account-deletion fan-out runs the other way, from core to an app, and needs its own design.

---

## 9. Signing in

The SDK signs people in through core with an established OpenID Connect client, `openid-client`, and MUST NOT reimplement one.

| Function                          | What it does                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `sv.auth.beginSignIn`             | Starts sign-in with PKCE `S256`, and returns the address to send the person to |
| `sv.auth.completeSignIn`          | Handles the return, checks `state` and `nonce`, and returns the session        |
| `sv.auth.getSession`              | The current session, or `null`                                                 |
| `sv.auth.requireSession`          | The current session, or throws `NotAuthenticatedError`                         |
| `sv.auth.signOut`                 | Ends the app's session, and returns the address of core's end-session endpoint |
| `sv.auth.handleBackChannelLogout` | Verifies a logout token and ends the sessions it names                         |

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
  lives ten minutes, and returns the address to send the person to and the cookie (`__Host-sv_signin`) that names the record. `returnTo`
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
  names a `sub` or a `sid`, and it carries no `nonce`. A `jti` seen before is refused.
- The session cookie is `HttpOnly; Secure; SameSite=Lax; Path=/` with no `Domain` and the `__Host-` prefix over https. Over `http`
  (a development instance) it has no `Secure` and no prefix, since a browser would refuse the prefix.
- `sv.links` has the addresses of core's own pages for a person: `profile`, `security`, `preferences`, `connectedApps` and
  `deleteAccount`.
- `hasRole(session, role)` is true when the `roles` claim has `role`. An app that was not given `roles` has none.

---

## 10. From the legacy SDK

Every namespace of the legacy `sdk` object:

| Legacy          | Now                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `auth`          | **SDK** §9. `changePassword`, `listSessions` and `revokeSession` become links to core's pages     |
| `directory`     | **SDK** §8                                                                                        |
| `platform`      | **SDK** `instance.getBranding`, for what an app needs of it                                       |
| `notifications` | **SDK** §8                                                                                        |
| `email`         | **SDK**, planned (§8)                                                                             |
| `activity`      | **SDK**, reserved (§8)                                                                            |
| `messages`      | Not carried over (core-app §4.1)                                                                  |
| `portability`   | Decided with account-deletion fan-out                                                             |
| `authz`         | Gone: there are no grants between plugins. Core's `roles` and an app's own permissions replace it |
| `db`            | **Local.** The app's own database                                                                 |
| `crypto`        | **Local.** `@sovereignfs/crypto`                                                                  |
| `mailer`        | **Local.** `@sovereignfs/mailer`, with the app's own mail settings                                |
| `env`           | **Local.** `spec/env.md`                                                                          |
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
- Its entry points are the root, `/next` and `/testing`.
- It has its own `sdk-vX.Y.Z` tag ([`docs/releasing.md`](../releasing.md)).
- Every export is **stable** or **experimental**, and versions follow the same rules as the design system
  ([design-system §3 and §4](design-system.md)). In this version the stable exports are `createSovereign`, the error types of §6, §4's
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

| Date       | Change                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | First draft. Scope, app tokens and explicit actors were decided in discussion.                                                                                                              |
| 2026-10-30 | §5.1: the token store's `write` says whether it stored, and an optional `lock` closes the window between processes, which a conditional update cannot. §14: what two processes can promise. |
| 2026-10-30 | §9.1: the session store the app provides, what each function does with it, how a logout token is refused, the cookie, `sv.links`.                                                           |
