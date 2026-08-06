# Workstream 0002 — Native mobile app release (whole-instance)

**Status:** 📋 Planned\
**Date:** July 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0058](../rfcs/0058-native-mobile-app-shell.md) (native mobile app
shell — the governing design), [0013](../rfcs/0013-mobile-responsiveness-pwa.md)
(mobile web baseline the WebView inherits),
[0038](../rfcs/0038-desktop-app-shell.md) (the same client model, already
shipped — the template)\
**Epics touched:** 20 (Mobile), 2 (Platform Shell — validation endpoint),
10 (Accessibility), plus the `sovereign-mobile` repository\
**Research:** [0006](../research/0006-standalone-plugin-apps.md) (shares the
WKWebView spike and the WebView constraints)

---

## Goal

The universal Sovereign mobile app is live on the App Store and Play Store. On
first launch the user enters their instance URL; the app validates it, persists
it, and loads the full Sovereign workspace in a WebView. Multiple instances are
supported. Everything — auth, plugins, shell layout, CSP — continues to be served
by the user's own instance and runs unchanged.

This is the **whole-instance** app, not a focused single-plugin app. It is
deliberately sequenced first: it is largely a port of the already-shipped Tauri
desktop shell, it delivers the store-distribution outcome soonest, and it is a
prerequisite for [workstream 0001](0001-standalone-plugin-apps.md)'s focused
plugin apps regardless.

## Definition of done

- [ ] The app is published on the App Store and Play Store (public release, not
      just an internal track).
- [ ] First launch prompts for an instance URL, validates it, and loads the
      instance; a stored instance loads directly on relaunch.
- [ ] An invalid or unreachable URL fails with an inline error and does not crash.
- [ ] A non-Sovereign URL is rejected as such, not merely as "unreachable".
- [ ] Users can add, remove, and switch between at least two instances.
- [ ] External links open outside the primary WebView.
- [ ] Offline behavior matches the scope decided by leg 1's finding, and whatever
      is not supported is documented rather than silently broken.
- [ ] An in-app text-size control ships, discharging the accessibility debt
      incurred when pinch-zoom was disabled.
- [ ] No Sovereign auth, role, or plugin behavior is duplicated in native code.
- [ ] `docs/repositories.md` lists `sovereign-mobile` and `sovereign-desktop`.

## Decisions locked

Settled by SRS §3.12, RFC 0058, and a planning session with kasunben (July 2026).
CLAUDE.md states the mobile approach is decided and **not** to be treated as an
open question — this table records what that means concretely.

| Decision               | Choice                                                                 | Rejected alternative, and why                                                                                          |
| ---------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Which app first        | Whole-instance universal app                                           | Focused Tally app first — needs the route lock, surface model, and Tally's offline rewrite, and still needs this shell |
| Shell technology       | Capacitor                                                              | Hotwire Native (per-platform bridges); React Native (rebuilds platform UI as a second client) — both closed by SRS     |
| Distribution model     | One binary, user enters instance URL                                   | A build per instance — self-hosters would each publish their own app                                                   |
| Onboarding UI          | Local HTML in the shell                                                | Native SwiftUI/Compose screens — platform-specific for no benefit at this scale; matches shipped desktop 17.1          |
| Instance validation    | `/api/health` today; upgraded by task 20.2                             | `/api/admin/health` — admin-key-gated, would 403 (RFC 0038 v0.2 already corrected this for desktop)                    |
| WebView content source | `server.url` → remote instance over `https`                            | Bundled local assets over `capacitor://` — **no service worker at all**, which would foreclose offline entirely        |
| Auth                   | Cookie-in-WebView                                                      | OAuth-first — blocked on RFC 0072's per-instance admin-only client registration (see workstream 0001 §5)               |
| Push notifications     | Deferred to task 20.5, not in the first release                        | Shipping push in the initial shell — adds APNs/FCM setup and a permission prompt to an already-unverified release      |
| `sdk.device.*`         | Not required for this release                                          | Blocking on tasks 3.32/20.3 — a whole-instance shell needs no surface signal and no route lock                         |
| Offline scope          | Decided by leg 1's spike finding, not assumed                          | Assuming it works (unverified); or declaring it out of scope before measuring                                          |
| Pinch-zoom / text size | Fixed **before** first submission                                      | Submitting as-is — an accessibility-guideline risk at review, and the debt was explicitly conditional                  |
| Release path           | Internal test track (TestFlight / Play internal) before public release | Straight to public — real-device verification is a human handoff, so an internal track is the cheapest safety net      |

## Prerequisites

| Prerequisite                                           | Owner    | Status                                                 |
| ------------------------------------------------------ | -------- | ------------------------------------------------------ |
| Apple Developer Program account + signing identity     | kasunben | Required before leg 5; secrets list reusable from 17.1 |
| Google Play Developer account                          | kasunben | Required before leg 5                                  |
| A physical iPhone and Android device (or device cloud) | kasunben | Required for legs 4–5 verification — see Risks         |
| Xcode, Android Studio, CocoaPods, Capacitor CLI        | dev env  | Required for leg 4                                     |

Nothing in this workstream is blocked by workstream 0001, RFC 0080, RFC 0081, or
RFC 0082.

## Legs

| Leg | Name                                      | Epic tasks | Repo               | Gate?   | Done when                                                    |
| --- | ----------------------------------------- | ---------- | ------------------ | ------- | ------------------------------------------------------------ |
| 1   | WKWebView offline spike                   | 20.10      | throwaway          | **Yes** | Offline behavior in a real Capacitor build is measured       |
| 2   | Instance identity and validation endpoint | 20.2       | this repo          | No      | A shell can distinguish a Sovereign instance from any 200 OK |
| 3   | Text-size control and zoom compensation   | 10.2       | this repo          | No      | Users can enlarge text without pinch-zoom                    |
| 4   | Capacitor shell scaffold                  | 20.1       | `sovereign-mobile` | No      | The app builds, onboards, and loads an instance on both OSes |
| 5   | Store release, iOS and Android            | 20.4       | `sovereign-mobile` | No      | Published on both stores                                     |

### Cross-repo parallelism

Legs 2–3 are in this repository; legs 4–5 are in `sovereign-mobile`. The leg
contract's "previous leg's PR must be merged first" rule applies **per
repository** — it exists to keep one repo's PR queue linear and reviewable, not
to serialize unrelated repos. So leg 4 may begin as soon as leg 1's gate clears
and leg 2's response contract is _agreed_ (it does not need to be merged; the
shell can validate against `/api/health` in the interim, exactly as the shipped
desktop shell does).

This is the fastest honest path, and it is why this workstream is drawn with the
in-repo work early.

## Leg detail

### Leg 1 — WKWebView offline spike (gate)

**Epic task:** 20.10

**Shared with workstream 0001.** Run it once; both workstreams consume the
finding.

**Why this leg is first:** it is the cheapest leg, it carries the most
information, and here it decides a _scope_ question rather than a go/no-go one —
whether offline is a feature of the first native release or a documented
follow-up. Deciding that after the shell is built means either a rushed retrofit
or a walked-back promise.

**Technical notes:** see task 20.10. The load-bearing constraint is that service
workers require an `https` document, so `server.url` must point at the remote
instance; the `capacitor://` custom scheme yields no service worker. Confirm that
rather than assuming it.

**Do not proceed if:** nothing — this leg always produces a usable answer. A
negative result narrows leg 4's scope; it does not stop this workstream. That is
the difference from workstream 0001, where the same spike gates an entire leg.

### Leg 2 — Instance identity and validation endpoint

**Epic task:** 20.2

**Why this is needed and not already solved:** `/api/health` returns
`{ status: 'ok' }` and nothing else. Any server on the internet returning that
JSON passes validation, so the shell cannot tell a Sovereign instance from an
unrelated service, cannot report a version mismatch, and cannot say "this
instance doesn't have the app you're looking for" (which workstream 0001 needs
later). There is no instance-metadata route today — `/api/instance` contains only
`favicon/` and `logo/`.

**Technical notes:**

- Unauthenticated and session-gate exempt, like `/api/health`. If it becomes a
  new first-level `/api/*` segment, **`RESERVED_API_SEGMENTS` in
  `runtime/src/api-namespace.ts` must be updated or the dir-parity test fails
  CI** — an existing hard rule.
- Response should carry instance identity, platform version, and a
  machine-readable status. Design it with workstream 0001's consumer in mind
  (per-plugin presence, enablement, and surface compatibility) so it is extended
  later rather than replaced — RFC 0082 §6 states this requirement.
- **Privacy is the constraint that shapes the payload.** This is an
  unauthenticated endpoint on a self-hosted personal instance. It must not leak
  user counts, admin identities, plugin lists that reveal personal usage, or
  deployment detail useful to an attacker. Prefer a deliberate allowlist over
  reusing the rich `/api/admin/health` report, which is admin-key-gated precisely
  because it is sensitive.
- Coordinate with epic 17 so desktop and mobile do not diverge (20.2's own
  dependency note says so).

**Do not proceed if:** the privacy review of the response payload is unresolved.
An over-sharing unauthenticated endpoint is a worse outcome than a shell that
validates weakly for one more release.

### Leg 3 — Text-size control and zoom compensation

**Epic task:** 10.2

**Why this is a release blocker and not polish:** `runtime/app/layout.tsx` sets
`maximumScale: 1, userScalable: false`, disabling pinch-zoom app-wide.
`docs/research/0011-ios-pwa-inspection-findings.md` records that decision as explicitly
**conditional** on "shipping a compensating in-app text-size control (tracked as
a follow-up)" — which never shipped. In a browser that is known debt. In a store
submission it is an accessibility-guideline risk, and a rejection costs a full
review cycle.

**Technical notes:**

- The tokens make this tractable: every `--sv-font-size-*` in
  `packages/ui/src/tokens/primitives.css` is `rem`-based, so scaling the root
  font size scales the whole type system without touching components.
- Follow the theme precedent end to end — the pre-paint script owns the theme,
  and `plugins/account`'s `ThemeControl` updates it live. A text-size preference
  wants the same shape: persisted per user, applied pre-paint to avoid a reflow
  flash, changeable live.
- **If the pre-paint script changes, `THEME_SCRIPT_CSP_HASH` in
  `runtime/src/security.ts` must be recomputed** — the CSP is nonce-based with a
  hash for that one inline script, and the iOS findings doc records this exact
  trap being hit before.
- `packages/ui` is a published contract — Storybook stories and a version bump
  per NFR-04, and no breaking change in a patch.
- Reconsider whether `userScalable: false` is still warranted once a text-size
  control exists. Keeping both is defensible; keeping neither is not.

**Do not proceed if:** the control cannot be applied pre-paint without a visible
reflow. A janky accessibility feature is a poor discharge of this debt — better to
re-enable pinch-zoom instead and revisit.

### Leg 4 — Capacitor shell scaffold

**Epic task:** 20.1 (external repo: `sovereign-mobile`)

**This leg is largely a port.** Epic 17.1 shipped the identical model in Tauri.
Map it directly:

| `sovereign-desktop` (shipped)   | `sovereign-mobile` equivalent     |
| ------------------------------- | --------------------------------- |
| `src/onboarding.ts`             | same flow, Capacitor              |
| `src/store.ts` (plugin-store)   | `@capacitor/preferences`          |
| `src/main.ts` boot flow         | identical logic                   |
| `index.html` onboarding UI      | reusable with minimal change      |
| `.github/workflows/release.yml` | same shape, iOS/Android artifacts |

**Technical notes:**

- `server.url` → the remote instance over `https`. Never bundle assets behind
  `capacitor://` (leg 1's constraint).
- Navigation policy: keep configured instances in the primary WebView; open
  external links in the system browser. RFC 0058 requires this explicitly.
- **Verify what the shipped desktop shell actually validates against before
  copying it.** Epic 17.1's text says `/api/admin/health` (admin-key-gated, would
  403); RFC 0038's changelog says it was corrected to `/api/health`. One is stale
  — find out which, and fix the stale one in the same pass.
- Do not duplicate auth, roles, sessions, or plugin permissions in native code.
  The shell owns onboarding, storage, WebView lifecycle, and permission
  declarations. Nothing else.
- Offline scope comes from leg 1's finding, not from optimism.

**Do not proceed if:** the app cannot load and authenticate against a real
instance on a physical device of each platform. Simulator-only verification is
insufficient here — see Risks.

### Leg 5 — Store release, iOS and Android

**Epic task:** 20.4 (external repo + store consoles)

**Technical notes:**

- Reuse 17.1's discovered secret set for iOS: `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_PASSWORD`, `APPLE_TEAM_ID` — the team ID was found necessary _during_
  17.1's implementation and is absent from RFC 0038's list.
- **Internal test track first** (TestFlight, Play internal testing), then public.
- Privacy labels / data-safety declarations must reflect reality: the app
  collects nothing itself and connects only to a user-supplied instance. No
  telemetry by default — RFC 0058 states this.
- Store copy must not imply Sovereign hosts user data.
- Declare minimum iOS and Android versions — RFC 0058 open question 2, still
  unanswered, and it must be resolved here.
- Decide RFC 0058's open question: whether instance-URL entry accepts any HTTPS
  URL or only validated Sovereign instances. Leg 2 makes the stricter option
  possible.

**Do not proceed if:** privacy declarations cannot be made truthfully from the
shell's actual behavior.

## Risks

- **Real-device verification is a documented human handoff.**
  `docs/pwa-real-device-testing.md` states an agent cannot fully validate
  installed-PWA or native behavior without a physical device, and that the final
  check is a human handoff. This bounds legs 4–5: an agent can build, wire CI,
  and prepare a checklist, but sign-off requires a device. Plan for that rather
  than discovering it at submission.
- **Apple guideline 4.2 (minimum functionality)** for WebView wrappers. Well
  precedented by Nextcloud/Bitwarden/Element, and the self-hosted-client category
  is the one Apple accommodates — but non-zero, and it is the risk that would
  most change the plan.
- **Accessibility review** on the disabled pinch-zoom — mitigated by leg 3, which
  is why leg 3 precedes leg 5.
- **WKWebView data eviction.** iOS can purge `WKWebsiteDataStore` under storage
  pressure or prolonged non-use. For the whole-instance app the visible effect is
  a forced re-login and a cold cache — annoying, not data loss (unlike
  workstream 0001's write queue). Leg 1 measures it.
- **The `/api/health` weakness is currently shipping in desktop too.** Whatever
  leg 2 produces should be adopted by `sovereign-desktop` as well, or the two
  shells diverge — which 20.2's review checklist explicitly warns against.
- **A stale contradiction between epic 17.1 and RFC 0038** on the validation
  endpoint (see leg 4). Small, but it is exactly the kind of thing a port
  faithfully reproduces.
- **`sovereign-mobile` and `sovereign-desktop` are absent from
  `docs/repositories.md`**, which calls itself the canonical repository map.
  Folded into leg 4 as a deliverable.

## Kill criteria

**If leg 1 shows offline is unworkable in the WebView:** ship the shell
online-only, document the limitation, and treat offline as a follow-up. The
release still delivers store distribution, native launch behavior (which the iOS
findings doc names as the fix for the irreducible PWA launch flash), and the
foundation workstream 0001 needs. Do **not** hold the release for it.

**If Apple rejects under 4.2:** ship Android first, and reopen the iOS approach
with the rejection text in hand. Play Store distribution is independently
valuable and unaffected.

**If device access is unavailable:** stop at the end of leg 4 with a built,
CI-signed artifact and an internal test track. Do not submit for public release
on simulator-only verification.

## Relationship to workstream 0001

|                | 0002 (this)                                        | 0001 (standalone plugin apps)                                    |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Ships          | Whole-instance app                                 | Per-plugin PWA + focused native apps                             |
| Governing RFCs | 0058, 0013, 0038                                   | 0080, 0081, 0082                                                 |
| Shared         | Task 20.10 spike; WebView constraints; cookie auth | —                                                                |
| Dependency     | None on 0001                                       | Needs this workstream's leg 4 shell (0001's own legs 1–4 do not) |

Task 20.10 belongs to both; run it once. Otherwise the two workstreams are
independent and 0001's legs 1–4 can proceed in parallel with this one, in the
same repository, subject to the usual per-repo leg ordering.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
