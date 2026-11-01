# Using the SDK

`@sovereignfs/sdk` is how a JavaScript app's **server** signs people in with a Sovereign server, and calls it. This is for the
person writing the app. What the package promises is in [`docs/specs/sdk.md`](specs/sdk.md); an app in another language, or one
that cannot use it, can do the same with [OpenID Connect](connecting-an-app.md) and the [contract](../spec/core-api/openapi.yaml).

It runs on a server only. Importing it in a browser throws, because a token must never reach one.

## 1. Register the app

An operator registers the app with core (in the Console, or with the operator tooling), giving it three addresses on the app's own
public name, and takes the **client id** and **secret** it is given:

| Address             | Is                                                      |
| ------------------- | ------------------------------------------------------- |
| Sign-in             | `https://notes.sovereign.local/auth/callback`           |
| After signing out   | `https://notes.sovereign.local/`                        |
| Back-channel logout | `https://notes.sovereign.local/auth/backchannel-logout` |
| Account deleted     | `https://notes.sovereign.local/auth/account-deleted`    |

The app is told where core is, and who it is, in four variables with its own prefix ([`spec/env.md`](../spec/env.md)):
`NOTES_URL`, `NOTES_CORE_URL`, `NOTES_CORE_CLIENT_ID` and `NOTES_CORE_CLIENT_SECRET` (or `NOTES_CORE_CLIENT_SECRET_FILE`).

## 2. Create the client

```ts
import { createSovereign } from '@sovereignfs/sdk';

export const sv = createSovereign({
  prefix: 'NOTES',
  sessionStore, // where the app's sessions are kept
  tokenStore, //   where a person's refresh token is kept, to call core as them
});
```

It reads the variables and makes no network call, so the app starts while core is down. A missing or malformed setting throws
`ConfigurationError`, naming the variable and never its value. Make one client for the process.

### The stores are the app's own

The SDK keeps nothing itself. Each store is a few functions over a table or a cache the app already has:

- **`sessionStore`** keeps the app's sessions and the state of a sign-in in progress: `get`, `set` (with an expiry), `delete`, and
  `deleteMatching({ sub } | { sid })`, which ends the sessions a logout notice names. It must not return a record after its expiry.
- **`tokenStore`** keeps a person's refresh token: `read(sub)` and `write(sub, next, previous)`. Core rotates a refresh token on every
  use and takes one used twice for **theft**, so `write` must be a conditional update (it stores `next` only if the stored token is
  still `previous`, and says whether it did). An app that runs more than one process must also give it `lock(sub, work)`, so two
  processes never refresh at once. Keep refresh tokens encrypted: they are credentials.

## 3. Sign people in

With Next.js, mount the routes once, and read the session where you need it:

```ts
// app/auth/[action]/route.ts: /auth/login, /auth/callback, /auth/logout (POST), /auth/backchannel-logout (POST)
import { nextAuth } from '@sovereignfs/sdk/next';
import { sv } from '@/lib/sovereign';
export const { GET, POST } = nextAuth(sv).handlers;
```

```ts
// A Server Component, route or action
const session = await nextAuth(sv).requireSession('/notes'); // sends a person to sign in, and back
session.sub; //   who they are: identify a person by this and by nothing else
session.claims; // name, email, picture... for the scopes granted
```

Elsewhere, `sv.auth` has the same steps for a web `Request`: `beginSignIn`, `completeSignIn`, `getSession`, `requireSession`,
`signOut` and `handleBackChannelLogout`. The session lives in a host-only cookie (`__Host-` over https) and `getSession` never calls
core. A person can sign out of core elsewhere: core tells the app (the back-channel address above), and the SDK ends the sessions it
names. `sv.links` has the addresses of core's own pages (`profile`, `security`, `connectedApps`, ...) for changing a password or
ending other sessions, which the app does not do itself.

### When a person deletes their account

If the app holds anything of a person (their notes, their settings, a stored refresh token), core tells it when they delete their account
on the instance, at the **account-deleted** address above, and keeps telling it until it answers. Give `nextAuth` the function that
deletes what the app holds:

```ts
export const { GET, POST } = nextAuth(sv, {
  onAccountDeleted: async ({ sub }) => {
    await db.notes.deleteMany({ where: { owner: sub } });
    await db.tokens.delete({ where: { sub } }); // if your token store does not have a delete(sub)
  },
}).handlers;
```

The SDK checks the notice, ends the person's sessions and, if your token store has `delete(sub)`, forgets their refresh token. It answers
core `200` **only after your function has finished**, and `500` if it throws, so core sends the notice again. That means the function
must be safe to run twice, and must not finish before the data is gone. An app that holds nothing of people does not need it, and leaves
the address empty. Elsewhere, `sv.auth.handleAccountDeleted(request, handler)` does the same for a web `Request`.

## 4. Call core

Every call names who it is made as:

```ts
const { users } = await sv.as({ sub: session.sub }).directory.searchUsers({ q: 'ada' }); // as a person
const branding = await sv.instance.getBranding(); // public, so no actor
```

The SDK gets, caches and refreshes the tokens; the app never handles one. It asks the instance what it serves first, so a call to
something an older core lacks raises `NotSupportedError` and sends nothing.

### Tell a person something

An app with the app scope `notifications:send` (an operator gives it, under "What the app may do on its own") can send a notification
with nobody there. It goes to the person's bell in core, with a link back to the app:

```ts
await sv.app.notifications.send({
  to: person.sub,
  title: 'Due today',
  body: 'Water the plants',
  url: 'https://notes.sovereign.local/tasks/3', // on one of the app's own addresses
  key: 'due-3', // sending it again within a day is the same send
});
```

The answer is the same whether or not the person gets it: they may never have used the app or may have switched it off, and core
does not say. With the person scope `notifications` an app can also read and clear _its own_ notifications for someone it is acting
for (`sv.as(person).notifications.list()`, `markRead`, `dismiss`, ...), so that reading one in the app clears it in core.

### Email a person

An app with the app scope `email:send` can email a person without being given their address. It names them by `sub`; core looks the
address up and sends from the instance's own mail, in its own template, under the app's name:

```ts
await sv.app.email.sendToUser({
  to: person.sub,
  subject: 'Your task is due', // sent as "Notes: Your task is due"
  body: 'Water the plants.', // plain text; line breaks are kept
  link: 'https://notes.sovereign.local/tasks/3', // on one of the app's own addresses, drawn as a button
  key: 'due-3', // sending it again within a day is the same send
});
```

As with notifications, the answer is the same whether or not the person gets it, and core never reports delivery. They must have used
the app, have a verified address and not have switched the app's email off (Preferences). An instance with no mail server does not
list `email`, so this raises `NotSupportedError` without sending. It is not a replacement for an app's own mail: use that when the app
has the address and needs more than plain text.

### Note what the app did for a person

An app with the app scope `activity:write` can add a line to the person's own activity page in core, so that they can see what apps did for
them in one place:

```ts
await sv.app.activity.log({
  to: person.sub,
  summary: 'You completed Water the plants', // one line of text, the words the person should read
  link: 'https://notes.sovereign.local/tasks/3', // optional, on one of the app's own addresses
  at: new Date().toISOString(), // optional: when it happened, within the last day
  key: 'done-3', // recording it again within a day is the same record
});
```

Only the person can read it, and they can delete it: the app cannot list what it recorded, and neither can anyone who runs the
instance. As with the other calls, the answer is the same whether or not it was kept.

## 5. Handle failure

Core can be down, slow or refusing, and the app must stay up. Every failure is a `SovereignError`:

| Error                  | Do                                                                              |
| ---------------------- | ------------------------------------------------------------------------------- |
| `CoreUnavailableError` | Show the page without what core would have given; try later                     |
| `SessionEndedError`    | Send the person to sign in again                                                |
| `CoreApiError`         | Core refused: `status`, `code` and `message` say why (a `429` has `retryAfter`) |
| `NotSupportedError`    | This core lacks the capability: do without it                                   |
| `ConfigurationError`   | A bug in how the client was made                                                |

Every request times out (5 seconds by default) and only safe ones are retried. Nothing logs a token, a secret or a person's
details; pass `logger` to hear the operation, status and duration of each request.

## 6. Test the app

`@sovereignfs/sdk/testing` is a core that needs no server, and can be told to fail:

```ts
import { createFakeCore, memorySessionStore } from '@sovereignfs/sdk/testing';

const core = createFakeCore();
core.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
const sv = createSovereign({
  appUrl: 'https://notes.sovereign.local',
  coreUrl: core.url,
  ...core.credentials,
  sessionStore: memorySessionStore(),
  tokenStore,
  fetch: core.fetch,
});

core.fail({ kind: 'down' }); // or 'timeout', 'lost-answer', { kind: 'status', status: 503 }
const notice = await core.logoutToken({ sub: 'u1' }); // what core sends when a session ends
```

The fake rotates a refresh token on every use and ends a person's tokens when one is used twice, as core does, so a test finds the
mistake that would sign people out.

## Which core

Each release states the core versions it supports in its README and `package.json`. A core too old to say what it serves is
treated as serving the Directory and the instance document, and nothing else.
