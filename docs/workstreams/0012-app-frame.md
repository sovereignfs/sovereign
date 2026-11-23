# Workstream 0012 — The app frame

**Status:** ⏳ In Progress\
**Date:** November 2026\
**Author:** Claude Code\
**Goal owner:** kasunben\
**Governs:** [epic 21](../epics/app-frame.md) (21.1 to 21.10); Shopper's RFC 0005 and RFC 0007, which asked for it

---

## Goal

An app's frame (its header with its own wordmark, a sidebar that is full, a rail or hidden, a settings dialog, the phone's footer and
drawer) comes from `@sovereignfs/ui`, as does a linear barcode; an app in a suite can show the launcher's apps; an app can send a
person to core's sign-up; and an app whose data only the browser opens can write the contract's export there. Shopper uses them
first, and no longer keeps its own copies.

## Definition of done

- [ ] `SettingsDialog`, the new icons, `MobileFooter`'s label, `Header`'s brand, `AppSidebar`, `AppFrame` and `Barcode` are in a
      released `@sovereignfs/ui`
- [ ] Core answers an app the apps a person may open, and the SDK asks it; both released
- [ ] `prompt=create` reaches core's sign-up from the SDK and `@sovereignfs/auth`; released
- [ ] `@sovereignfs/export` writes in a browser; released
- [ ] Epic 21 is ✅

## Decisions locked

| Decision                 | Choice                                                                 | Rejected alternative and why                                                                     |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Where the frame is built | `@sovereignfs/ui`, released, then used                                 | Shopper's own copy: every app would keep one, as Tusk and Shopper do today                       |
| What a component knows   | Nothing of an app: labels, icons, destinations and counts are given    | Shopper's words in the component: the next app could not use it                                  |
| `Header`                 | A `brand` slot, the initial badge the default                          | A second header for apps: core's and the apps' would drift                                       |
| The sidebar's state      | On the device, per app and per kind of page, by pure exported rules    | With the account: it is a choice about a screen, not a person's data                             |
| `SettingsDialog`         | A new component on `Dialog`'s `lg` frame                               | A change to `Dialog`: every dialog would carry a navigation it does not use                      |
| `Barcode`                | Our own encoders, SVG, no dependency                                   | A barcode library: a dependency in a published package for five small encodings                  |
| Order                    | The design system first, as Shopper's legs need it; core and SDK after | All at once: Shopper's settings and list screens wait only on `SettingsDialog` and the icons     |
| Committing               | Directly on `develop`, one commit per task, never pushed by the agent  | A branch per leg: the owner's instruction for this run (2026-11-23); the owner releases each leg |

## Prerequisites

- Shopper's RFC 0005 and RFC 0007 accepted, and Shopper's leg 1 of its workstream 0002 approved (2026-11-23).

## Legs

| Leg | Name                        | Epic tasks   | Gate?              | Done when                                                        |
| --- | --------------------------- | ------------ | ------------------ | ---------------------------------------------------------------- |
| 1   | The design system           | 21.1 to 21.7 | **Owner releases** | `@sovereignfs/ui` carries them, with stories and gallery entries |
| 2   | The apps a person can open  | 21.8         | **Owner decides**  | Core and the SDK answer it, to the contract                      |
| 3   | Sign-up from an app         | 21.9         | —                  | `prompt=create` reaches `/sign-up` with its resume address       |
| 4   | Writing an export in a page | 21.10        | —                  | The writer runs in a browser                                     |

## Leg detail

### Leg 1 — The design system

**Epic tasks:** 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, in the order Shopper's legs need them

**Why here:** Shopper's Settings and list screens (its legs 3 and 4) need only `SettingsDialog` and the icons; its frame (leg 5) the
rest; its cards (leg 7) `Barcode`.

**Technical notes:** read Shopper's `src/ui/AppShell.tsx`, `sidebar.ts`, `useSidebar.ts`, `mobile-nav.tsx` and Tusk's `AppShell`
before 21.5 and 21.6. One `ui` minor and one root minor for the leg.

**Do not proceed if:** a component needs an app's data or words to work.

### Leg 2 — The apps a person can open

**Epic tasks:** 21.8

**Why here:** it is the one task that changes core and the Core API.

**Technical notes:** contract first (`openapi.yaml`, `pnpm generate:api-client`, `expectMatchesContract`); `listLauncherApps` is the
launcher's one read. Which token calls it (a person's, with which scope) is the owner's decision before it starts.

**Do not proceed if:** the token and scope are not decided.

### Leg 3 — Sign-up from an app

**Epic tasks:** 21.9

**Technical notes:** the authorize endpoint is better-auth's provider; `prompt=create` must change only where the person lands.

**Do not proceed if:** it needs more than sending the person to `/sign-up` with a resume address that is a path on core.

### Leg 4 — Writing an export in a page

**Epic tasks:** 21.10

**Do not proceed if:** the zip needs a dependency.

## Risks

- `Header` is core's on every signed-in page: a change to its default is a change to core.
- `AppFrame` decides layout for every app that adopts it; Tusk's offsets for its floating button must still hold.

## Kill criteria

If an app's frame proves to differ too much between apps, `AppSidebar` and `Header`'s slot still stand on their own, and `AppFrame`
is left to each app.

## Changelog

| Version | Date       | Change        |
| ------- | ---------- | ------------- |
| 0.1     | 2026-11-23 | Initial draft |
