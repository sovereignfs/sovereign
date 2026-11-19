# Research 0012 — A biometric lock for installed core and its apps

|            |                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status** | Decided: designed in [RFC 0006](../rfcs/0006-sessions-across-apps-and-a-lock.md) part B; seen on desktop Chrome and on an iPhone in Safari, the installed app on iOS and Android to confirm with the lock's release |
| **Date**   | November 2026                                                                                                                                                                                                       |
| **Author** | Claude Code                                                                                                                                                                                                         |
| **Scope**  | [core-app](../specs/core-app.md) §3.4.2, §5.4, §5.5; [sdk](../specs/sdk.md) §9.3, §9.5; `@sovereignfs/pwa`; [research 0011](0011-streamlining-sign-in.md) (step-up); [RFC 0001](../rfcs/0001-installable-core.md)   |

---

## Question

People who install core (and Tusk, Fjord, Wallet) on a phone expect what native apps of the same kind do: when the app is opened, or
comes back after a while in the background, it asks for Face ID, Touch ID or a fingerprint before showing anything. Can an installed
web app do that on iPhone and iPad, and on Android? What would it actually protect, how would it fit core's keys and sessions, and
what would each app have to do?

## Method

- **The code and specs:** core's passkeys and their PRF unlock (core-app §3.4.2, §5.5; `apps/core/src/keys`,
  `apps/core/app/(auth)/passkey-sign-in.ts`), how a browser stays unlocked (§5.4), how an app's page gets its key (sdk §9.3, §9.5),
  and what `@sovereignfs/pwa` does on a device.
- **Public sources**, summarised, listed at the end: WebKit's and Apple's material on Face ID and Touch ID for the web, Chrome's and
  web.dev's on user verification and immediate mediation, passkeys.dev, WebKit bugs on the user-gesture rule, and two third-party
  matrices of PRF support. Several are vendor blogs; where they disagree, it says so.
- **Nothing was run on a device.** Every platform statement below is what the sources say; the spike in the recommendation turns each
  into an observed result before an RFC relies on it.

## Findings

### 1. The only way in is WebAuthn

A web page has no API for Face ID, Touch ID or a fingerprint as such. It can only ask for a **passkey with user verification**
(`userVerification: 'required'`); the platform then asks for the biometric, or the device passcode when it has none. So a biometric
lock on the web is a passkey ceremony, and:

- **It needs a passkey for this site** on the device (iCloud Keychain, Google Password Manager, or another provider). Someone without
  one can't use the lock until they add one.
- **The page cannot tell which biometric was used**, or whether it was the passcode. The user-verified flag says only that the
  person was verified. A button can't honestly say "Unlock with Face ID"; it can say "Unlock" with the passkey symbol.
- **The platform shows its own sheet** (on Chrome for Android with the requesting origin), so it looks the same as signing in with a
  passkey.

### 2. Platforms

|                                 | iPhone and iPad, Home Screen web app                                                                                                                                                                | Android, Chrome installed app                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Passkeys in the installed app   | Supported since iOS 16 (Safari's support); demos create and use passkeys from a Home Screen app. Forum reports of failures when a sign-in page is opened from a Home Screen shortcut (iOS 18.6)     | Supported: the same Chrome WebAuthn as a tab, with face or fingerprint, falling back to PIN or pattern (Chrome 120 onward) |
| Prompt without a tap            | **Not to be relied on.** Safari has long asked for a user gesture, with one call allowed without one per page load in some versions, and a 2022 report of it relaxed in Safari 16. Sources disagree | **No.** Chrome asks for transient user activation                                                                          |
| PRF (a secret from the passkey) | iCloud Keychain from iOS 18 (18.4 the practical floor); reports of rough edges in cross-device flows                                                                                                | Google Password Manager passkeys, on by default; Chrome 142+ named as supported                                            |
| Storage                         | Each Home Screen web app has its own storage, apart from Safari's                                                                                                                                   | An installed app shares Chrome's storage for its origin                                                                    |

Two consequences shape every option. **The lock must be a screen with one button**, because the prompt can't be relied on to appear by
itself; a person taps "Unlock", then sees Face ID. **PRF is what makes it more than a curtain**: with it, the touch yields a secret
that can unwrap the person's keys, so the lock protects the data and not only the view.

### 3. What core already has

Most of the machinery exists:

- **Passkeys that unlock** (§5.5): every passkey ceremony of core's pages asks for PRF, and a passkey with a way in can open the
  person's account key. A browser already signed in can be unlocked by a passkey through a ceremony whose answer is sent nowhere.
- **Staying unlocked** (§5.4): the account key is kept in IndexedDB, wrapped by a device key and by a key from the session's secret,
  and a page that loads with a session unwraps it silently. **That silence is what a lock would change.**
- **Core verifies user verification itself** in its hooks (§3.4.2), so a server-checked passkey assertion is already trusted to mean
  "this person, verified on the device".

### 4. What a lock can protect

Three strengths, from weakest to strongest:

1. **A curtain**: a full-screen cover over the page until a passkey ceremony succeeds. Server-rendered pages have already sent the
   person's data in the HTML, the session cookie still works for every request, and anyone with developer tools or the network can
   read it. It stops a glance, not a person holding the unlocked phone who knows what they're doing.
2. **Locked keys**: after a time in the background, the page drops the unwrapped account key from memory, and opening it again
   needs the passkey's PRF output, not only the session's secret. Encrypted data (what apps keep end to end, sdk §9.3) stays closed
   until the touch. Core's own pages and an app's unencrypted pages still show.
3. **A locked session**: the server marks the session locked after a time without use, or when the app goes to the background, and
   answers every request with the lock page until a server-checked passkey assertion (or the password) unlocks it. Nothing of the
   person reaches a locked browser. Apps reach the same through OpenID Connect's `max_age`: an app whose own session is locked sends
   the person to core with `max_age`, and core asks for the passkey.

Level 3 is the one that matches what people expect of a native app lock. Level 2 is what makes the person's encrypted data safe
whichever level is chosen.

### 5. Apps on their own hosts

Each app is on a host of its own, and a passkey belongs to one relying party. RFC 0002 keeps core's passkeys on core's host (no shared
parent domain), so **Tusk cannot use core's passkey directly**. The options:

- **Through core** (OpenID Connect `max_age`, or `prompt=login`): the app's lock sends the person to core, core asks for its passkey,
  and the app gets a fresh ID token with `auth_time`. One passkey for everything; costs a redirect, which in an installed app opens
  core in a browser view over the app (research 0010). Needs the SDK to send `max_age` and check `auth_time`, which research 0011
  lists as missing.
- **Related origin requests** (WebAuthn Level 3): core publishes `/.well-known/webauthn` naming the apps' origins, and an app may
  then use a passkey whose relying party is core. Supported in Chrome and in Safari 18; one passkey, no redirect, but every app's
  origin must be listed by core, and core must stay generic (it would list what the operator registered).
- **A passkey per app**: each app registers its own, used only for its lock. Simple and independent, but a person makes one passkey
  per app, and the app needs its own verification of assertions.

### 6. Pitfalls

- **Background and resume** come as `visibilitychange` and `pageshow`; iOS often ends a Home Screen app in the background, so the
  app usually starts fresh and must decide from a stored time whether to lock, never from in-memory state alone.
- **The service worker** must not serve a cached page to a locked browser; core's already caches nothing per person (§3.5).
- **Someone without a passkey that verifies** (an old device, a security key without a PIN) must still be able to unlock with the
  password, or they are locked out of their own app.
- **The setting is per device**: a lock that is right for a shared tablet is a nuisance on a laptop. It belongs to the device (or the
  installed app), with an account-wide default at most.

## Options

1. **Curtain only**, in `@sovereignfs/pwa` for every app: quick, looks right, protects little. Misleading if presented as security.
2. **Locked keys**, in core's key store (§5.4) and the SDK's `/keys` entry: an idle or background timer drops the unwrapped key; PRF
   unwraps it again. Protects encrypted data; leaves the rest visible.
3. **Locked session in core, `max_age` for apps**: a server-side lock on core's session after a set time (or on going to the
   background, signalled by the page), the lock page with "Unlock" (passkey) and "Use your password", and the SDK's `max_age` so apps
   ask core for a fresh verification. Combines with 2.
4. **Related origins**, as 3 but each app checks core's passkey itself without a redirect.

## Recommendation

1. **A spike first**, on an iPhone (iOS 18.4 and 26), an iPad and an Android phone, with core and one app installed: create a passkey
   in the installed app, prompt from a button after resume, prompt without a tap after resume, PRF output on each, and how long each
   platform keeps a background app alive. Record what is seen, as research 0010 did.
2. **Then an RFC for option 3 with option 2**: core's locked session (an idle time and "lock when in the background" per device, the
   lock page, password as the fallback), the key store dropping the unwrapped key while locked, and the SDK's `max_age` with
   `auth_time` checked, so each app can lock through core. It shares the SDK's `max_age` work with step-up in research 0011, and
   should be designed with it.
3. **Related origins later**, once the redirect through core is seen to be the friction on a device.
4. **Not a curtain on its own**: it would promise more than it gives.

## Running the device check (task 4.15)

On an instance on an https host, on each device. On a development or staging instance anyone signed in can run it; on production,
sign in as the owner (`instance:diagnose`):

1. Sign in to core in the device's browser (Safari on iPhone and iPad, Chrome on Android) and add core to the home screen.
2. Open core from the home screen and go to `/lock-check`. The first lines of the log say what the device is, whether core runs
   installed, and what the browser says about passkeys.
3. **Make a test passkey**, then **Unlock with the test passkey**: whether a passkey can be made in the installed app, whether a tap
   brings Face ID, Touch ID or the fingerprint, and whether the PRF output comes back. **Unlock with my passkey for core** asks for a
   passkey the account already has, as the lock would.
4. **Arm: ask with no tap**, leave the app for a minute and come back, and note whether a prompt appeared by itself; the log says how
   the request ended and how fast. Then leave it for ten minutes, and for an hour: the log says whether the app was still running or
   had been ended.
5. **Copy results** and send them. Delete the "Lock check" passkey from the device's passwords afterwards.

## What the devices showed (task 4.15)

Run with the lock check on `sovereign.openfs.io`, core 0.115.0, signed in as the owner, in November 2026.

|                                                    | Desktop Chrome 158, macOS, browser tab                                                                     | iPhone 15 Pro, iOS 18.7, Safari tab                            | iPhone, installed app | Android  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------- | -------- |
| A passkey made in the page                         | Yes (6 s), PRF enabled                                                                                     | Yes (36 s); PRF not reported, which Safari reports only on use | Not seen              | Not seen |
| Unlock after a tap, the account's passkey for core | Yes, user verified, PRF 32 bytes (twice)                                                                   | Yes, Face ID, user verified, PRF 32 bytes                      | Not seen              | Not seen |
| Unlock after a tap, the passkey made in the page   | Yes, user verified, PRF 32 bytes (three times)                                                             | Yes, user verified, **no PRF output**                          | Not seen              | Not seen |
| Unlock with no tap                                 | On load: once refused after 10 s, once answered in 1.8 s; on coming back to the tab: no answer within 60 s | On coming back after 29 s: answered in 7.8 s, user verified    | Not seen              | Not seen |
| Kept in the background                             | Not measured (a reload and a 1 s switch)                                                                   | Still running after 29 s                                       | Not seen              | Not seen |

What this settles:

- **The lock's path works where it was tried.** A tap on an unlock button brings Touch ID or Face ID, the person is verified, and the
  account's own passkey gives the PRF output that reopens their keys, on both a desktop browser and an iPhone.
- **A prompt with no tap is possible but not dependable.** It worked once on each, and failed or went unanswered on desktop Chrome. The
  lock page always has an Unlock button; asking on its own is at most an addition.
- **PRF depends on where the passkey is kept.** The passkey made in the page on the iPhone gave none, while the account's passkey did. A
  likely cause is that it was saved to a password manager other than iCloud Keychain; unlocking keys by passkey must fall back to the
  password whenever there is no output.

What stays open: an installed app on iOS (the installed app opens at `/`, and nothing in core links to the lock check, so it could not be
reached there without another release), and Android, for which no device was at hand. Neither changes the design, which works whatever
they show (RFC 0006 part B): there is always an Unlock button and always the password, and the lock decides from a stored time. The lock's
own release is tried in an installed app on an iPhone before it is called done.

## Open questions

Decided with the goal owner (2026-11-19), and written into RFC 0006 part B:

- ~~Can an operator require it?~~ No. Signing in stays as it is (email and password, a passkey, the second step); the lock is something a
  person turns on for themselves, once signed in, for opening the app on that device from then on.
- ~~The default idle time?~~ Fifteen minutes, with 1, 5, 15 and 60 to choose from.
- ~~"Lock on leaving the app" on a desktop?~~ Yes, offered on every device, but only once the person has turned the lock on there.
- ~~Add a passkey first?~~ Yes: turning the lock on needs a passkey on this device, and asks for one to be added when there is none.

## Sources

- WebKit, [Meet Face ID and Touch ID for the Web](https://webkit.org/?p=11312)
- passkeys.dev, [iOS reference](https://passkeys.dev/docs/reference/ios) and [Android reference](https://passkeys.dev/docs/reference/android/)
- web.dev, [userVerification deep dive](https://web.dev/articles/webauthn-user-verification?authuser=7)
- Chrome for Developers, [WebAuthn immediate mediation origin trial](https://developer.chrome.com/blog/webauthn-immediate-mediation-ot?authuser=0)
- Corbado, [Safari WebAuthn and user-activated events](https://corbado.com/blog/safari-webauthn-user-activated-events) and
  [Passkeys and the PRF extension](https://www.corbado.com/blog/passkeys-prf-webauthn)
- WebKit Bugzilla, [bug 230893](https://bugs.webkit.org/show_bug.cgi?id=230893); W3C public-webauthn,
  [Safari 16 user-gesture report](https://lists.w3.org/Archives/Public/public-webauthn/2022Oct/0129.html)
- Apple Developer Forums, [passkeys from Home Screen shortcuts](https://developer.apple.com/forums/thread/815784) and
  [PRF in Safari's cross-device flow](https://developer.apple.com/forums/thread/774112)
- Progressier, [biometric authentication with passkeys in an installed PWA](https://progressier.com/pwa-capabilities/biometric-authentication-with-passkeys)
- A third-party [PRF support matrix](https://raw.githubusercontent.com/DeOrganized/stacks-passkey-wallet/HEAD/docs/prf-support-matrix.md)
