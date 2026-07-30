# Research 0005 — Trip planning + place check-in plugin

**Status:** Partly decided — **scope (option A1: one plugin)** and **no game
layer (option C)** are settled developer decisions; the place-data/map provider
(option B) and the open questions below remain exploratory\
**Date:** July 2026\
**Author:** Claude Code (from a developer brief)\
**Scope:** A new first-party application plugin (own repository, like
`sovereign-tasks` / `sovereign-shopper` / `sovereign-healthlog`). Touches
`packages/sdk` (offline queue, storage, portability), `packages/manifest`
(`offline`, `offline:write`, `database.requireEncryption`), and probably
`packages/ui` (map surface). No runtime change identified yet.\
**Related:** [RFC 0074](../rfcs/0074-offline-capable-plugins.md),
[RFC 0078](../rfcs/0078-offline-plugin-writes.md),
[RFC 0044](../rfcs/0044-plugin-storage.md),
[RFC 0071](../rfcs/0071-sqlite-at-rest-encryption.md),
[RFC 0007](../rfcs/0007-user-data-portability.md),
[RFC 0002](../rfcs/0002-cross-plugin-data-sharing.md),
[RFC 0062](../rfcs/0062-email-delivery-coverage.md)

---

## Question

The developer wants a Sovereign plugin combining three existing products:
[Wanderlog](https://wanderlog.com/) (structured trip/itinerary planning),
[Wanderlust](https://www.wanderlustapp.io/) (AI itinerary drafting, on-ground
"Trip Mode", travel passport), and [Swarm](https://swarmapp.com/) (place
check-ins as a personal lifelog, with a game layer).

Stated requirements:

1. Plan a trip and a detailed day-by-day itinerary.
2. Manage trip-related **receipts, booking notifications, accommodation
   details, and a timeline**.
3. Help **navigate each day** against a flexible pre-planned schedule.
4. **Check in to places exactly the way Swarm does** — _not_ bound to a planned
   trip, existing independently, but optionally and **automatically** linked to
   a trip when the check-in's date-time falls inside it.
5. **Import existing data** from Swarm and, if possible, the other two.

The open questions this doc exists to answer: is this one plugin or several?
What is the data model? What does the platform already give us, and what is
genuinely missing? What is an honest MVP? And is requirement 5 actually
achievable per source, or aspirational?

## Findings

### 1. The three references are three phases of one lifecycle

The products barely overlap in features, but they operate on the same
underlying object — **a place** — at different points in its life.

| Phase     | Owner in market | The object is…                         |
| --------- | --------------- | -------------------------------------- |
| _someday_ | Wanderlust      | a wish (Bucketlist, Explore feed)      |
| _before_  | Wanderlog       | a plan (trip → day → stop)             |
| _during_  | Wanderlust      | a live schedule (Trip Mode)            |
| _after_   | Swarm           | a record (check-in, lifelog, passport) |

**Wanderlog** is the spreadsheet-killer: trip → days → places beside a live
map, plus flight/hotel confirmations auto-imported by forwarding booking
emails, route optimization, expense tracking with bill-splitting, packing and
todo checklists, real-time collaborative editing, and offline download of
itinerary + maps.

**Wanderlust** frames the same spine as plan → execute → share. Its distinct
pieces: an AI assistant that drafts day-by-day itineraries; "Optimize Day"
(reroutes a day's stops while pinning fixed reservations); **Trip Mode** (an
offline on-ground view — current location, next stop with a countdown,
weather, hand-off to native maps); a **Bucketlist**; a **Travel Passport** (map
of countries visited, backfillable from booking history); and a browser
extension that clips a web page into a trip.

**Swarm** is not a planner at all. You check in at a place; the accumulation
becomes a searchable personal lifelog of everywhere you have been. On top sits
a game layer — coins per check-in (with bonuses for photos, companions, first
visits, and streaks), collectible stickers for category milestones,
mayorships, streak and milestone badges, and a stats profile (top categories,
who you spend time with). Plus a live social map of friends and auto-generated
travel timelines built from check-ins.

**The gap none of them fills:** Wanderlog and Wanderlust die the day the trip
ends. Swarm has no concept of a future. The developer's brief — independent
check-in that auto-links to trips by date-time — is precisely the seam between
them, and it is the reason to build this rather than pick one and self-host an
equivalent.

### 2. The unifying model: two spines joined by time

This is the single most important design finding, and it falls directly out of
requirement 4. **Do not model a check-in as a state of an itinerary item.** The
two are independent spines that join opportunistically:

```
   PLAN SPINE (intentional, future)      LOG SPINE (factual, past)
   ────────────────────────────────      ─────────────────────────
   trip                                  visit  (a check-in)
    └─ trip_day                            ├─ place_id
        └─ itinerary_item ──┐              ├─ happened_at
           (planned_start)  │              ├─ lat/lng, note, photos
                            │              └─ trip_id?  ◀── nullable
                            │                          │
                            └── soft link ─────────────┘
                                (auto: happened_at ∈ trip window)

   Both reference ──▶  place  (id, name, coords, category, source_ref)
```

Consequences worth stating explicitly, because they shape everything:

- **A `visit` is valid with `trip_id = NULL`.** Checking in at your local café
  on a Tuesday is a first-class act. Trips are an _optional_ grouping.
- **The auto-link is derived, not authoritative.** When a visit's
  `happened_at` falls inside a trip's date window (and, optionally, near its
  geography), the plugin proposes `trip_id`. The user can always override — the
  business trip you were on and the weekend you tacked onto it may overlap in
  time. Store the resolved `trip_id` as a real column but keep a
  `link_source: 'auto' | 'manual'` so re-deriving never clobbers a human
  decision.
- **A visit may or may not correspond to a planned `itinerary_item`.** Matching
  them (same place, same day) is a _nice_ read-model — "you did 6 of 8 planned
  stops, plus 3 unplanned" — but it must never be a foreign key. Half the
  value of a travel log is the places you didn't plan.
- **`place` is a shared dimension table**, referenced by bucketlist entries,
  itinerary items, and visits alike. This is what makes "I've wanted to go here
  for two years / it was on the plan / I finally went, twice" a single
  coherent story instead of three disconnected records.
- **Time zones are load-bearing, not an afterthought.** Every timestamp in this
  plugin is about a moment in a specific place. Store UTC + an explicit
  IANA zone + the local wall-clock offset, exactly as Swarm's export does
  (`createdAt` + `timeZoneOffset`). A trip that crosses a date line and an
  itinerary rendered in the wrong zone are the same bug.

Everything a user _reads_ about their own history — the visit list, the map,
"been here 4 times", countries visited, and (later, if ever) any reward
mechanic — is then **purely derived from the log spine**: a projection over
`visit` rows, never state stored alongside them. Two reasons this matters
beyond tidiness. It keeps every such view **re-computable after an import**,
which requirement 5 depends on entirely — a decade of back-filled Swarm
check-ins must produce the same counts as if they had been recorded live. And
it means the deferred game layer (see option C) can be added later as pure
read-side code, with **no schema migration** — which is what makes deferring
it cheap rather than a decision to relitigate.

### 3. Platform current state — what this plugin can already rely on

Verified against the tree at time of writing:

- **Offline shell + client cache.** `packages/manifest/src/schema.ts:226`
  exposes a flat `offline: boolean`; `packages/sdk/src/offline.ts:213` is the
  plugin-scoped IndexedDB cache (`get`/`set`/`remove`/`keys`/`clearAll`) with
  quota handling and a logout purge. This is RFC 0074, **implemented**.
- **Offline writes — declared but not built.** The `offline:write` permission
  exists in the enum (`packages/manifest/src/schema.ts:36`) and is validated to
  require `offline: true` (`schema.ts:635`), but the
  `@sovereignfs/sdk/offline-queue` module RFC 0078 specifies **does not exist
  yet** (`packages/sdk/src/` has no queue module). RFC 0078 is **Draft**, with
  no roadmap slot.
- **File storage.** `packages/sdk/src/storage.ts:24-45` —
  `put`/`get`/`delete`/`list`/`getSignedUrl`. Covers check-in photos, receipt
  scans, and booking PDFs (RFC 0044, implemented).
- **At-rest encryption.** `database.requireEncryption`
  (`packages/manifest/src/schema.ts:63`) forces SQLCipher on the plugin's own
  DB. Note the two hard constraints: it requires `isolation: "isolated"`
  (`schema.ts:606-614`) **and** an explicit `dialect: "sqlite"`
  (`schema.ts:621-635`) — so declaring it pins this plugin to SQLite even on a
  Postgres-backed instance.
- **Portability.** `sdk.portability.provideExport` / `provideImport`
  (`packages/sdk/src/portability.ts:80,154`) — RFC 0007, implemented. This is
  for **Sovereign-native** bundles (takeout, instance migration), _not_ for
  third-party formats. Requirement 5 is a plugin-local importer, not a
  portability-surface feature. Both matter; they are different code.
- **Notifications** (`packages/sdk/src/notifications.ts:32`) for "your next
  stop is in 20 minutes"; **`sdk.email.sendToUser`**
  (`packages/sdk/src/email.ts:32`, RFC 0062) for outbound only.
- **Cross-plugin data contracts** (RFC 0002, `sdk.data.provide`/`consume`)
  — the natural seam to `sovereign-wallet` for trip spend, and to a
  bill-splitting plugin, without absorbing either concern.

### 4. Platform gaps — what genuinely does not exist

Ranked by how much they block the MVP:

1. **No map or geo primitive anywhere.** A grep for `geolocation` across
   `packages/`, `runtime/src`, and `runtime/app` returns nothing. There is no
   map component in `packages/ui`, no tile source, no geocoder, no
   place-search. This is the single largest unknown in the whole proposal and
   is treated as its own decision below.
2. **No `sdk.device.*`.** `CLAUDE.md` reserves it for the post-v1 mobile /
   desktop shells, with a three-tier model (Web API → Capacitor/Tauri plugin →
   `sdk.device.*`). It is not implemented. For a browser/PWA-only v1 the
   plugin can use `navigator.geolocation` directly — but per the DS-first rule
   that is exactly the kind of capability that should not be implemented
   plugin-locally "to be promoted later." Needs a decision.
3. **No offline mutation queue** (RFC 0078, above). Check-in in a dead zone —
   arguably _the_ canonical use case for that RFC — cannot be built until it
   ships.
4. **No inbound email.** Wanderlog's marquee feature is forwarding a booking
   confirmation and having it parsed into the trip. RFC 0062 covers outbound
   (`sendToUser`) only. There is no inbound address, no webhook, no parser.
   This is a large workstream (mailbox, per-user routing address, spoofing
   defence, per-vendor parsers) and is out of scope for a first version.
5. **No background geofencing.** Swarm's auto-check-in prompts depend on
   OS-level background location. Web has nothing comparable. This is a native
   shell concern (post-v1) and should be scoped out loudly rather than
   half-built.

### 5. Import feasibility, per source

Requirement 5 is not uniformly achievable. Honest assessment:

| Source         | Official export                                                                                          | Feasibility |
| -------------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| **Swarm**      | Yes — in-app data request returns a ZIP of JSON/CSV (`checkins.json`, `comments.json`, `photos.json`, …) | **Good**    |
| **Wanderlust** | None found                                                                                               | **Unknown** |
| **Wanderlog**  | "Export to Google Maps", Pro-tier only; no documented JSON/GPX                                           | **Poor**    |

**Swarm is the only one worth committing to.** The export is a real, documented
GDPR-style takeout, and a healthy ecosystem of third-party tools
([swarm-to-sqlite](https://pypi.org/project/swarm-to-sqlite/),
[unleash_foursquare](https://github.com/dareneiri/unleash_foursquare),
[swarm-downloader](https://github.com/ericblue/swarm-downloader)) has already
mapped the shape, which is the raw Foursquare API check-in object: `id`,
`createdAt` (epoch seconds), `timeZoneOffset`, `shout`, `venue` (`id`, `name`,
`location.{lat,lng,address,city,state,country,cc,postalCode}`, `categories[]`),
`photos`, `likes`, `comments`, `with[]`, `sticker`, `isMayor`. That maps almost
one-to-one onto the `visit` + `place` tables sketched above — which is a good
sign the model is right, and a good reason to let the Swarm shape _inform_ the
schema rather than fight it.

⚠️ **The exact field set must be verified against a real export before an RFC
commits to a mapping.** The list above is assembled from third-party tooling
and the public API shape, not from an export the developer has produced. This
is the highest-value thing to do before writing the RFC — it is one afternoon
of work and it de-risks the entire importer.

Two further notes:

- Photos in a Swarm export are **URLs, not files**. A faithful import means
  fetching each one and putting it in `sdk.storage` — a long-running,
  rate-limited, partially-failing job. Design the importer as resumable from
  the start; do not model it as a request/response.
- For Wanderlog and Wanderlust, the realistic fallback is a **generic
  importer** — GPX/KML/GeoJSON, plus a CSV column-mapping step — rather than
  vendor-specific parsers. That also covers Google Takeout location history,
  Google Maps saved lists, and Day One, each of which is arguably a more
  valuable source than Wanderlog anyway. **Recommend framing requirement 5 as
  "Swarm natively + a generic geo-import path," not "all three natively."**

## Options considered

### A. Scope — one plugin or several? — **DECIDED: A1**

> **Decision (developer, July 2026): one plugin.** A2 was explicitly rejected —
> check-in belongs in the same plugin as trips, not behind a data contract.
> A1's downside (a large single-plugin surface) is managed by the slice
> ordering in the recommendation below, not by splitting the repository.
> Recorded here so the alternatives aren't relitigated later.

**A1. One plugin, two spines** _(**chosen**)_. `trip` and `visit` live in one
plugin, one isolated database, one nav entry.

- ✅ The auto-link by date-time is a local join — no cross-plugin contract, no
  consent flow, no latency.
- ✅ `place` stays a single shared dimension. Split across plugins it becomes
  two divergent place tables and a reconciliation problem.
- ✅ Ships as one thing the user understands: "my travel app."
- ❌ Large surface for one plugin. Real risk of an MVP that is 40% of five
  features instead of 100% of two.

**A2. Two plugins + RFC 0002 data contract.** `sovereign-checkin` provides a
`visits` contract; `sovereign-trips` consumes it.

- ✅ Check-in ships standalone and early — it is the daily-use half.
- ✅ Architecturally pure; demonstrates the cross-plugin contract properly.
- ❌ The auto-link crosses a consent boundary, becoming a user-visible
  permission prompt for what should feel like one product's internal behaviour.
- ❌ Duplicate `place` tables, or a third plugin just to own places.
- ❌ Two repos, two release cadences, for one mental model.

**A3. Trip planner first; defer check-in.** Ship Wanderlog-equivalent, add
Swarm-equivalent later.

- ✅ Smallest first release.
- ❌ Inverts the value. Check-in is the part that makes it a _daily_ app; trip
  planning is used twice a year. Deferring it means the plugin sits unopened
  between holidays — and it is also the half with a working import path, i.e.
  the half that can be populated with years of real data on day one.

### B. Place data and maps — the hard external dependency

This is a genuine fork in the road and deserves its own decision, possibly its
own research doc.

**B1. Bring-your-own API key** (Google Places / Mapbox, via
`sdk.secrets` or `sdk.connections`).

- ✅ Best data quality; matches what all three references actually use.
- ✅ No platform infrastructure.
- ❌ Every self-hoster must create a cloud account and a billing profile to use
  the app. That is a poor fit for the project's posture, and a real adoption
  cliff.
- ❌ Sends the user's queries — and by extension their movements — to a third
  party, in a plugin whose entire premise is that you don't want that.

**B2. OpenStreetMap stack** — Nominatim for geocoding, Overpass or a
[Photon](https://photon.komoot.io/) instance for place search, OSM raster or
vector tiles for display.

- ✅ No account, no key, no billing. Works out of the box.
- ✅ Aligns with the privacy-first premise.
- ❌ Public Nominatim/Overpass endpoints have strict usage policies and are
  not appropriate for an app hammering them; polite defaults + caching are
  mandatory, and heavy users should self-host.
- ❌ Place metadata (hours, phone, photos, categories) is markedly thinner than
  Google's. Category taxonomy is also messier, which matters for any
  category-based grouping of a visit history.

**B3. Manual-first, geo-optional.** Places are user-created records (name +
optional coordinates from a map pick or `navigator.geolocation`); external
search is an _enhancement_ configured per-instance.

- ✅ Ships without resolving B1 vs B2 at all — the plugin is useful with zero
  external dependencies.
- ✅ Makes the provider a swappable adapter rather than a foundation.
- ❌ Manual place entry is meaningfully worse UX than search-and-tap, and a
  travel app is judged on exactly that interaction.

**Leaning: B3 as the architecture, B2 as the default adapter, B1 as an opt-in
upgrade.** Define a narrow internal `PlaceProvider` interface (`search`,
`reverseGeocode`, `details`) and make everything above it provider-agnostic
from day one. Do not let Google's response shape leak into the schema — the
Swarm import shape is a better anchor, and it is provider-neutral.

**Where does the map component live?** Per the DS-first rule in
`docs/design-system.md`, a reusable map surface belongs in `@sovereignfs/ui`,
not in this plugin. But `packages/ui` is a published zero-dependency-ish design
system, and every map library is a heavy dependency with its own CSS. This
tension is unresolved and is called out as an open question below — it may
warrant its own RFC.

### C. The Swarm game layer — **DECIDED: none of it, this phase**

> **Decision (developer, July 2026): no gamification in this phase.** Check-in
> is a plain record-where-I-went feature. Not "descoped to a personal
> subset" — **out entirely**.

Two independent reasons converge on the same answer, which is why this is a
decision rather than a preference.

**It doesn't survive single-tenancy anyway.** Swarm's mechanics are calibrated
for a global population: mayorships, leaderboards, friends-nearby. On a
self-hosted instance your peer group is a household or a small team. Mayorship
of your own kitchen is a joke, not a feature. So the competitive half was never
portable to Sovereign in the first place.

**And the non-competitive half is a distraction from the actual product.**
Streaks, stickers, and badges are retention mechanics for an ad-supported
consumer app that needs you opening it daily. A self-hosted personal log has no
such incentive to manufacture — the user already wants their own data. Building
a reward economy first would consume the budget that requirement 5 (import) and
slice 2 (trips) actually need.

**The line drawn**, since "gamification" has a fuzzy edge:

| Out (reward mechanics)                                    | In (reading your own log)                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| coins, stickers, badges, streaks, mayorship, leaderboards | visit history list, map of visits, "been here 4 times", places/countries visited, search |

The right-hand column is not a game layer — it is the log being legible. A
check-in feature without it is a write-only database, which is worse than
useless: users would be entering data they can never read back.

**This costs nothing to reverse.** Because every read view is a projection over
`visit` (see finding 2), a later phase can add streaks or badges as pure
read-side code with **no schema migration and no backfill** — computed over
imported history exactly as over live check-ins. That is the whole reason to
keep derived state out of the tables. Should a later phase want it,
household-scoped social variants (an opt-in shared map of instance members'
check-ins) would fit RFC 0065's group model; cross-instance versions are
federation work, explicitly post-v1
([Research 0002](0002-multi-tenancy-vs-federation-direction.md)).

## Recommendation

**Build it as one plugin, two spines (A1 — decided), manual-first with a
pluggable place provider (B3 → B2), and no game layer (C — decided).** Own
repository, following the `sovereign-*` first-party pattern.

### Proposed MVP — three vertical slices, in this order

**Slice 1 — Check-in, visit history, and Swarm import.**
`place`, `visit`, manual/GPS check-in with note and photo, the visit history
list, a map of visits, per-place visit counts, and the Swarm ZIP importer. No
reward mechanics (C). Ships standalone and useful, and the import means it
arrives populated with years of real data instead of empty. **This is the slice
that makes it a daily app, so it goes first.**

**Slice 2 — Trips + itinerary + auto-link.**
`trip`, `trip_day`, `itinerary_item`, the date-time auto-link back to `visit`,
attachments (receipts, booking PDFs, accommodation details) via `sdk.storage`,
and a manually-entered reservation record. The "planned vs. actual" view for a
trip is the payoff and the thing neither Wanderlog nor Swarm can do.

**Slice 3 — Day navigation ("Trip Mode").**
Today's schedule, current position, next stop and countdown, hand-off to the
native maps app for directions, notification reminders, offline-capable.

### Explicitly out of scope for v1 — and why

| Deferred                                                                             | Reason                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbound booking-email parsing                                                        | No platform inbound-email capability; large standalone workstream                                                                                                                                        |
| AI itinerary generation                                                              | Belongs to RFC 0063 (core assistant), not this plugin                                                                                                                                                    |
| Route optimization                                                                   | Needs a routing/matrix provider — same unresolved fork as B                                                                                                                                              |
| Background auto-check-in                                                             | Requires native shell (post-v1 mobile epic)                                                                                                                                                              |
| Bill splitting / budgets                                                             | Consume via RFC 0002 from wallet / splitting plugins                                                                                                                                                     |
| Real-time collaborative edit                                                         | No CRDT/presence primitive on the platform                                                                                                                                                               |
| Public journey sharing                                                               | Overlaps RFC 0042 `publicRoutes`; defer until the core works                                                                                                                                             |
| **All reward mechanics** — coins, stickers, badges, streaks, mayorship, leaderboards | Decided out for this phase (C). Competitive mechanics are meaningless at single-instance scale; personal ones are retention theatre a self-hosted log doesn't need. Addable later with no schema change. |
| Splitting check-in into its own plugin                                               | A2 rejected (A). One plugin, one database, one `place` table.                                                                                                                                            |

### Platform posture

- `database: { isolation: 'isolated', dialect: 'sqlite', requireEncryption: true }`.
  **Location history is the most sensitive data class the platform has
  handled** — a continuous record of a person's physical movements — and it is
  also the single best argument for self-hosting. Note the cost, and be
  deliberate about accepting it: this pins the plugin to SQLite even on
  Postgres instances (`schema.ts:621-635`).
- `offline: true` from the start. Slice 3 is unusable without it, and the
  offline read path (RFC 0074) already exists.
- **Slice 1 and 2 should be built to work without `offline:write`**, degrading
  to online-only check-in, and adopt the queue when RFC 0078 ships. Do not
  block this plugin on an unscheduled draft RFC — but do offer it as the
  second real-world adopter alongside `sovereign-shopper`, since a check-in
  queued in a dead zone is close to that RFC's canonical use case.
- Register `provideExport`/`provideImport` (RFC 0007) for takeout. This is
  separate from, and additional to, the Swarm importer.

## Open questions

1. **Verify the Swarm export against a real file.** Highest-value, lowest-cost
   next action. Everything about the importer's schema mapping is currently
   inferred from third-party tooling. _(Developer action — request the export
   now; the turnaround is not instant.)_
2. **Where does the map component live?** `@sovereignfs/ui` per DS-first, or
   plugin-local given the dependency weight? Which library (MapLibre GL,
   Leaflet), and does a published design system want that in its dependency
   tree? May need its own RFC.
3. **Does `sdk.device.geolocation` get built now?** Using
   `navigator.geolocation` plugin-locally is expedient and contradicts the
   DS-first rule and the reserved post-v1 `sdk.device.*` design. A minimal
   `sdk.device.geolocation` that later gains a Capacitor tier is the honest
   answer, but it opens the `sdk.device` surface earlier than planned.
4. **Default place provider, and who pays the request budget?** If OSM, what
   are the polite defaults, and does the plugin ship pointing at public
   endpoints (with the usage-policy exposure that implies) or require an
   operator to configure one?
5. **Is `place` a candidate RFC 0002 data contract?** A shared place/location
   dimension could serve future plugins. Probably premature — but worth not
   designing it in a way that forecloses the option.
6. **Auto-link precision.** Date-window overlap alone will mislink (a work trip
   and a weekend that share a date). Does geography participate? Does the user
   confirm the first time, then it learns?
7. **Photo storage volume.** A decade of Swarm check-ins can be thousands of
   photos. What is the expected footprint, and does `sdk.storage` have a
   per-plugin quota story?

## Next steps

Graduate to **RFC-per-slice**, not one monolith — the slices have genuinely
different risk profiles and the map/geo question should not hold up the
schema.

1. **RFC A — Data model and check-in.** The two-spine schema, the `place`
   dimension, the auto-link rule, the read-side history/map/count projections,
   and the Swarm importer. No reward mechanics (C) — but the projection
   boundary must be drawn so they remain addable without a migration. _The one
   thing it must design: the `visit`↔`trip` linkage semantics, including how a
   re-derive interacts with a manual override._ Blocked on open question 1.
2. **RFC B — Place provider and map surface.** _The one thing it must design:
   the `PlaceProvider` interface and where the map component lives._ Resolves
   open questions 2–4. Could reasonably be a research doc first.
3. **RFC C — Trips, itineraries, and day navigation.** _The one thing it must
   design: how a fixed reservation and a flexible planned stop coexist in one
   day's schedule when the user is running late._ Depends on A; benefits from
   RFC 0078 landing but does not require it.

Before any of these: **request the Swarm export** (question 1) — now the only
remaining blocker on RFC A, since scope (A1) and the game layer (C) are
decided.
