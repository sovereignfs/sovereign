# Research 0016 — Fediverse integration and ActivityPub feasibility

**Status:** Exploratory\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** `packages/sdk`, `packages/manifest`, `runtime/src` (scheduler, middleware, security, rate-limit, api-namespace), a future feed plugin\
**Related:** [research 0002](0002-multi-tenancy-vs-federation-direction.md), [RFC 0046](../rfcs/0046-plugin-jobs.md), [RFC 0049](../rfcs/0049-plugin-external-connections.md), [RFC 0043](../rfcs/0043-plugin-secret-vault.md), [RFC 0044](../rfcs/0044-plugin-storage.md), [RFC 0042](../rfcs/0042-public-plugin-routes.md), [RFC 0089](../rfcs/0089-fully-public-plugins.md), [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md), [RFC 0060](../rfcs/0060-client-side-encryption-core.md), [RFC 0092](../rfcs/0092-app-level-field-encryption.md)

---

## Question

Can Sovereign host a Twitter-like section — one combined feed of Mastodon,
Pixelfed and Lemmy content, with the ability to publish, favorite, comment,
and follow from inside Sovereign — and should that publishing go out over
ActivityPub? If it can, what does the feed actually need to understand about
how these networks work (visibility, discovery, moderation, encryption) to
build something honest and safe?

## Summary of the answer

The request is really two features with very different costs, and they are
easy to conflate because a single UI would present both:

- **Tier A — a fediverse _client_.** Sovereign reads and writes through the
  user's existing accounts on Mastodon/Pixelfed/Lemmy via those services'
  HTTP APIs — favoriting, commenting, and following all included. This is a
  plugin, and it is feasible on today's primitives plus a small number of
  platform changes. Publishing here is "post to your Mastodon account," which
  reaches the fediverse — but Sovereign is a client, not a peer, and the
  user's identity stays on the remote instance, not on Sovereign.
- **Tier B — Sovereign as a fediverse _server_.** The instance becomes a real
  ActivityPub actor at its own domain: followable, with an inbox, HTTP
  signatures, and delivery retries. This is not a plugin-sized change. It is a
  platform workstream gated on several platform gaps, and it collides with
  several architectural rules that exist for good reasons.

Tier A delivers essentially all of the described product — the combined
feed, the composer, favorite/comment/follow actions — at a fraction of the
cost of Tier B. Tier B is what makes Sovereign _federated_ rather than a nice
client, and it is worth doing eventually — research 0002 already committed to
federation as the long-term direction — but not as the first step, and not as
a plugin.

## Findings

### How ActivityPub actually works — the mechanics that shape the design

This section exists because several of the findings below only make sense
against the protocol's actual mechanics, not against a Twitter-shaped mental
model of it.

- **Every account is an "actor" whose identity is a URL, not a username.**
  Fetching that URL returns a document describing the actor, its public key,
  and where its inbox/outbox live. The human-readable handle
  (`@alice@instance.example`) is resolved to that URL via **WebFinger**
  (`GET /.well-known/webfinger`), a separate, spec-mandated lookup step.
  Identity is permanent in the sense that it **is** the URL — there is no
  separate, portable account ID underneath it.
- **Delivery is push, not pull.** A post is wrapped in a "Create" activity,
  placed in the author's outbox, and the author's server **delivers a signed
  copy to the inbox of every server with a follower** — one HTTP POST per
  destination server, retried on failure for a bounded window and then
  dropped. Likes, follows, and comments are all just other activity types
  delivered the same way into the relevant actor's inbox.
- **Follows are a two-step handshake**, not an instant subscription: a
  "Follow" activity into the target's inbox, an "Accept" (or, for locked
  accounts, a human-reviewed approval) back before delivery starts.
- **Signing proves authorship, not confidentiality.** Every activity is
  cryptographically signed (HTTP Signatures, moving toward RFC 9421, plus
  Linked Data Signatures for some fields) so the receiving server can verify
  who sent it and that it wasn't altered in transit. The payload itself is
  still plain, readable JSON — signing and encryption are different
  properties, and ActivityPub only provides the first. See "Encryption
  reality" below for why this matters for the feed's UI.
- **Visibility is addressing, not access control.** A post's `to`/`cc` fields
  list which actors or collections should receive it — the same idea as
  email To/Cc. "Public" is a literal well-known address every server
  recognizes (`.../ns/activitystreams#Public`); "unlisted" is the same
  address moved from `to` to `cc`; "followers-only" and "direct/mentioned"
  narrow the addressee list further. **Once delivered, enforcement is
  cooperative, not cryptographic** — a receiving server has the plaintext
  content in its own database and nothing stops it from displaying a
  "followers-only" post publicly if its admin chooses to (or its database is
  breached). This is the same mechanism, not a lesser one, behind Mastodon's
  "direct message" — it is a normal post narrowly addressed, not an
  encrypted channel. See "Encryption reality" below.
- **Instances set policy toward other instances, on top of per-post
  visibility.** An admin can defederate (silently drop all activity to/from a
  given server) or silence (hide a server's posts from public timelines while
  still allowing direct follows) — the primary moderation lever at the
  network's actual scale, and one a Tier B Sovereign instance would inherit
  for itself; a Tier A Sovereign plugin does not, since it operates behind
  the moderation policy of whichever instance each linked account lives on.

### The three networks model "a post" differently, not just "an API"

- **Mastodon** — actors are people; the shared object is a short post
  ("Note"); reverse-chronological timeline.
- **Pixelfed** — same actor/Note shape as Mastodon with an expected image
  attachment, which is why it can reuse most of Mastodon's client API
  surface. Per-endpoint coverage should still be verified against a live
  instance — "subset" is not a guarantee.
- **Lemmy** — actors include **communities**, not just people; a post is
  addressed **to a community**, not to followers, and replies form a nested
  comment tree rather than a flat reply chain. A person subscribes to a
  community to see its content — there is no "follow a person" primitive
  in the Mastodon sense. This is a structural difference in the object graph,
  not merely an API difference, and it is why Lemmy needs its own adapter
  rather than reusing the Mastodon-compatible one, and why a unified
  "follow" action in the Sovereign UI needs to model a followable **entity**
  (person or community) rather than assuming every target is a person.

### Discovery has a hard ceiling: there is no global index

No ActivityPub server can search "the whole fediverse" — each instance only
knows about actors it has actually encountered (someone on it followed,
replied to, or resolved them). Three genuinely different mechanisms exist,
and they should not be presented to the user as equivalent:

| Mechanism                                                         | Coverage                                                                                            | Needs the linked account's own token? |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Search-and-resolve (exact handle, e.g. `@alice@instance.example`) | Anyone, on demand — the instance WebFingers and fetches the actor live even if it's never seen them | No (mostly)                           |
| Personalized suggestions                                          | Only accounts already known to that specific linked account's instance                              | Yes — personalized per account        |
| Trending / public directory                                       | Only what's popular on that one server                                                              | No                                    |

Suggestions and trending will systematically under-surface small or newer
accounts and skew toward whatever the user's connected instances already
happen to know about — a discovery aid, not a discovery index. Search-and-
resolve is the one mechanism without this ceiling, and is the more reliable
foundation to build a "who to follow" feature on; third-party cross-instance
directories exist as an optional, separate data source layered on top, not
something any connected account provides for free.

### Encryption reality — and what encrypting "our end" does and doesn't fix

- **In transit:** HTTPS between servers — standard, already there, not
  fediverse-specific.
- **Signed, not encrypted:** every activity's authenticity is verified by
  signature; the content itself is plain JSON, both server- and
  admin-readable, on every server it is delivered to.
- **At rest on the origin/remote networks: plaintext, including "direct
  messages."** Mastodon's mentioned-only visibility is the same storage
  mechanism as a public post, just narrowly addressed — not end-to-end
  encrypted messaging. Any admin of any server involved can read it. This is
  established, widely-repeated fediverse safety advice, not a Sovereign-
  specific concern: never treat a fediverse DM as confidential the way a
  Signal message is.
- **What Sovereign encrypting its own copy does and doesn't buy:** Sovereign
  can encrypt whatever it stores locally — cached feed content, and
  certainly credentials — but doing so protects only **Sovereign's own
  storage** (a stolen disk, a leaked backup, unauthorized server access). It
  does not retroactively make a "followers-only" post or DM private: that
  content already exists in plaintext on the origin server and on every
  other recipient's server before Sovereign ever fetches a copy, entirely
  outside Sovereign's control. Encrypting the local cache is defense-in-
  depth for Sovereign's own footprint, not a fix for the fediverse's privacy
  model.
- **Not all cached data deserves the same treatment.** This platform already
  ran the experiment of blanket at-rest encryption for local databases and
  reversed it after repeated real incidents — see the `0.76.0` history and
  "At-rest encryption (formerly RFC 0071) was retired" in `CLAUDE.md` — in
  favor of **targeted field-level encryption** (RFC 0092) plus a separate,
  opt-in **client-side E2EE** system (RFC 0060) reserved for data that is
  genuinely private even from the server. The same shape fits here: encrypt
  credentials always (this is exactly what `sdk.secrets`, RFC 0043, already
  does for any plugin); leave cached **public** post content as ordinary
  local data, since it was never private and blanket-encrypting it costs
  searchability for no real privacy gain; reserve the heavier client-side
  E2EE treatment for content that is genuinely private by nature and that a
  user might reasonably expect Sovereign to protect — a followers-only post
  or DM pulled into Sovereign — while being explicit in the UI that this
  protects Sovereign's own copy, not the copies already sitting elsewhere.
- **UI implication, stated directly:** a fediverse "direct message" rendered
  inside Sovereign must not visually or terminologically borrow the trust
  signals of Sovereign's own genuinely-encrypted surfaces (e.g. anything
  using the RFC 0060 E2EE profile). Doing so would imply a privacy guarantee
  the underlying network never provided.

### What the platform already provides

| Need                               | Exists today                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| Per-user OAuth to a remote service | `sdk.connections` (RFC 0049, implemented) — `packages/sdk/src/connections.ts`                       |
| Encrypted token storage            | `sdk.secrets` (RFC 0043, implemented) — `packages/sdk/src/secrets.ts`                               |
| Media/file storage                 | `sdk.storage` (RFC 0044, implemented) — `packages/sdk/src/storage.ts:23-49`                         |
| Isolated per-plugin database       | RFC 0004, implemented — a feed cache is plugin-local                                                |
| Recurring background work          | In-process scheduler — `runtime/src/scheduler.ts`, manifest `schedules[]`                           |
| Unauthenticated inbound HTTP       | Public `/api/*` namespace — `runtime/src/api-namespace.ts`, `runtime/middleware.ts:283-305`         |
| Unauthenticated page routes        | `publicRoutes` (RFC 0042) and `public: true` (RFC 0089) — `packages/manifest/src/schema.ts:147-188` |
| Notifications, activity log        | `sdk.notifications`, `sdk.activity`                                                                 |

That is a genuinely strong base — favorite, comment, and follow are all
ordinary authenticated calls a plugin route can make through
`sdk.connections`-managed tokens today, with no new platform mechanism
required for the actions themselves. The gaps below are about background
polling, media rendering, and (for Tier B only) inbound federation — not
about the interactive actions.

### Gap 1 — background work cannot reach secrets, connections, or storage

Blocking for Tier A's polling/notifications and for Tier B.

The scheduler invokes handlers from a bare `setInterval` and hands them a
_synthetic_ `Headers` object (`runtime/src/scheduler.ts:84-89`). But every
stateful SDK surface derives its context from `next/headers`, not from that
argument:

- `packages/sdk/src/secrets.ts:20-26`
- `packages/sdk/src/connections.ts:31-38`
- `packages/sdk/src/storage.ts:7-14`

Called outside a request scope, `headers()` does not return the synthetic
object — it throws. Only `sdk.notifications.send` accepts an explicit
`Headers` argument (`packages/sdk/src/notifications.ts:32`), which is why the
scheduler's own comment names it specifically. Consequence: a schedule
handler **cannot read the OAuth token it needs to poll a timeline**. Worse,
user-scoped secrets and connections also require `x-sovereign-user-id`, which
no background context has at all — the scheduler is plugin-scoped, with no
notion of "for each connected user." No shipped plugin declares `schedules`
today, so this has never been exercised in practice.

Interactive actions (favorite, comment, follow, post — all triggered from a
user's own request) are unaffected by this gap; it only blocks polling for
new content and background notification delivery.

### Gap 2 — the scheduler is not a job queue

Blocking for Tier B; a quality ceiling for Tier A's background polling.

`runtime/src/scheduler.ts:8-18` is explicit that this is RFC 0046 Phase 1 and
deliberately not a queue: no persistence, no retries, no backoff, `lastRun`
in memory, and every replica ticks independently. RFC 0046's Phase 2 (the
actual `sdk.jobs` surface, durable state, retries) is epic task 3.16, still
📋 planned. ActivityPub delivery is a retry-with-backoff fan-out problem by
definition — building it on an in-memory 60-second tick would mean silently
dropping posts on restart.

### Gap 3 — no route at the domain apex for `/.well-known/*`

Blocking for Tier B only.

WebFinger is spec-mandated at `https://<domain>/.well-known/webfinger` and
cannot live under a plugin's `routePrefix`: plugin public routes always
resolve relative to `routePrefix` (`runtime/src/route-guard.ts:90-101`), and
the middleware matcher gates everything except a fixed exclusion list
(`runtime/middleware.ts:738-746`) that does not include it — an unhandled
request there would 303 to the login page. NodeInfo has the same shape. This
needs a narrow platform mechanism (a well-known delegation), not a redesign.

### Gap 4 — CSP blocks all remote media

Blocking for both tiers.

`runtime/src/security.ts:50,52` sets `img-src 'self' data: blob:` and
`connect-src 'self'`. Every avatar and image in a fediverse feed is hosted on
a remote instance, so the feed renders blank as-is. The correct fix is a
**server-side media proxy** (cache remote media through `sdk.storage`, serve
from `'self'`), not a CSP relaxation to `https:` — without a proxy, merely
scrolling a feed leaks the user's IP to every instance hosting an image,
which would be a real privacy regression in a privacy-first product. This is
also what Mastodon itself does, for the same reason.

### Gap 5 — one plugin owns the whole public `/api/*` namespace

Blocking for Tier B only.

`apiProvider: true` is instance-wide and exclusive: `findApiProvider`
(`packages/manifest/src/api-provider.ts:18-21`) returns a provider only when
exactly one manifest declares it, and delegation rewrites `/api/<slug>/*` to
that single plugin's `serve/[slug]/[...path]` route
(`runtime/src/api-namespace.ts:57-75`). An ActivityPub inbox needs an
unauthenticated POST endpoint; claiming the API provider slot for it would
mean no other plugin on the instance could ever have one.

### Gap 6 — the global rate limiter sits in front of the inbox

Blocking for Tier B only.

`runtime/middleware.ts:272-282` runs `checkGlobalRateLimit` **before** the
public `/api/*` branch, defaulting to 300 requests/minute per IP
(`runtime/src/rate-limit.ts:27-28`). A busy relay or a large instance
delivering a burst shares one IP bucket and gets 429s, which remote servers
treat as delivery failure. Federation inbound traffic needs its own shaping.

### Gap 7 — the connections model assumes static, admin-configured credentials

Blocking for Tier A's "connect to any instance" promise.

`sdk.connections` providers are declared in the manifest with fixed config
fields, configured once by an admin in Console
(`runtime/src/provider-configs.ts`, `packages/manifest/src/schema.ts:448-488`).
Mastodon does not work that way: **every instance is a separate OAuth
provider**, and a client must register itself dynamically at each one via
`POST /api/v1/apps` to obtain that instance's own `client_id`/`client_secret`
([Mastodon docs](https://docs.joinmastodon.org/methods/apps/)). Sovereign has
one row per provider, not one per remote host. Cheapest workaround: per-user
token paste (the user creates an application in their own account settings
and pastes the token — this is also how Lemmy's username/password-to-JWT
login works, with no OAuth dance at all). Cleanest: RFC 0049 grows a notion
of per-host provider instances, with dynamic client registration handled by
the plugin and stored via `sdk.secrets`.

### Gap 8 — no outbound-network permission, and ActivityPub is an SSRF machine

The manifest permission set (`docs/plugin-development.md`) has no
network/egress permission today: `activity:write`, `admin:*`, `auth:session`,
`crypto:use`, `data:*`, `device:*`, `instance:configure`, `mailer:send`,
`notifications:send`, `platform:admin`. Plugins call `fetch()` unmediated.
For Tier A this is a governance gap — an install-time disclosure that a feed
plugin talks to arbitrary third parties is currently missing. For Tier B it
is a security gap: ActivityPub requires fetching URLs supplied by remote,
untrusted actors (actor documents, media, linked objects) — textbook SSRF,
and the platform offers no guard rail to build it against yet.

### Non-technical constraints that matter more than the code

- **Federation is an explicit v1 non-goal** — "Federated identity or
  multi-instance linking" (SRS §1.4, `docs/sovereign-proposal-plan-srs.md:118`)
  and "Federated instances" (§4.6, line 1072). Research 0002 sets federation
  as the long-term direction but flags the real blocker as unresolved: every
  cross-user aggregate query assumes one shared database.
- **Domain identity is permanent**, per the actor-URL mechanics above. Moving
  domains breaks every follower relationship, irreversibly. Sovereign
  instances are self-hosted and often start on a throwaway hostname.
- **ActivityPub assumes an always-on, publicly reachable server.** Remote
  instances retry delivery for a bounded window, then drop the relationship.
  Many Sovereign deployments — a laptop, an intermittently-online home
  server — do not federate well as a target.
- **An inbox is an unauthenticated public write endpoint.** Spam, abuse, and
  moderation (blocklists, domain blocks, media takedowns) become the
  self-hoster's problem, and remote media cached on their disk becomes their
  legal exposure — consistently underestimated by people running a fediverse
  server for the first time.
- **Federated content cannot be recalled.** RFC 0007 (portability) and RFC
  0033 (user data deletion) both promise the user control over their data.
  Once a Delete activity is emitted, honoring it is a remote instance's
  choice, not a guarantee. That promise needs restating for federated
  content before Tier B ships, not after.
- **Handle namespace collision.** `acct:alice@instance.tld` would need to be
  allocated from, or reconciled with, the platform's existing user records,
  on the same domain that serves auth.

### Implementation vehicle for Tier B, if it ever proceeds

Tier B should not be a hand-rolled protocol implementation.
[Fedify](https://github.com/fedify-dev/fedify) is a TypeScript ActivityPub
server framework (v1.0+) that handles HTTP Signatures across all four
competing mechanisms (draft-cavage, RFC 9421, Linked Data Signatures,
FEP-8b32) with negotiation, WebFinger, NodeInfo, and queued delivery with
retries, and documents Next.js integration among other frameworks. That
converts Gap 2's delivery queue and the signature work from "build it" to
"wire it to a backing store" — Sovereign already has both candidates (the
Redis broker in `runtime/src/brokers/redis.ts`, or the platform database).
Its Next.js integration should still be verified against the App Router and
this repository's own `middleware.ts` via a spike, not assumed.

## Options considered

**A. Client-only aggregator plugin ("Feed").** Read timelines from connected
accounts, normalize, render a Twitter-like UI, favorite/comment/follow and
compose/publish through those accounts' own APIs.

- _Pros:_ delivers the described product, favorite/follow/comment included;
  no protocol risk; no inbound attack surface; no domain-permanence trap;
  works on a laptop instance; the normalization model is reusable if Tier B
  ever happens.
- _Cons:_ not federation — Sovereign is a client. Nobody can follow the
  Sovereign instance. Depends on remote APIs and their rate limits. "Publish
  via ActivityPub" is really "publish via your Mastodon account." Discovery
  ("who to follow") is inherently local to what each linked instance already
  knows, not a global search.

**B. Client aggregator plus outbound-only ActivityPub.** Publish natively
over ActivityPub without accepting an inbox.

- _Rejected._ Doesn't work. Delivery requires the actor to be publicly
  fetchable and signature-verifiable, and following is an inbox round-trip.
  An actor nobody can follow and nobody can reply to publishes into a void.
  There is no half-step here.

**C. Full ActivityPub actor, implemented as a plugin.** Tier B inside the
plugin boundary.

- _Pros:_ real federation; matches the `@sovereignfs` "federated systems"
  direction.
- _Cons:_ needs most of the gaps above closed, most of which are
  platform-level, so "it's just a plugin" is false. Takes the single
  `apiProvider` slot hostage. Puts moderation, abuse, and legal exposure on
  every operator who installs it.

**D. Full ActivityPub in the platform core.** Federation as a first-class
platform capability rather than a plugin.

- _Rejected for now._ Contradicts the product thesis that the plugin system
  _is_ the product, and would make every operator carry a federation surface
  they did not ask for. If Tier B proceeds, the right split is: platform
  provides the primitives (well-known routing, durable jobs, background
  context, egress guard), the plugin provides the protocol and the UI.

**E. Defer entirely.** Note the interest, revisit post-v1.

- _Pros:_ honest about the v1 non-goal; zero cost.
- _Cons:_ leaves real, largely-unblocked user value on the table — Option A
  is genuinely close, and favorite/comment/follow need no new platform
  mechanism at all for the interactive path.

## Recommendation

**Do Option A now; treat Option C as a separate, later, platform-gated
workstream. Do not start with the ActivityPub server.**

Concretely:

1. **Close Gap 1 first** — a background execution context for SDK surfaces.
   This is the one blocker with value far beyond this feature: it is what
   makes `schedules` useful for _any_ plugin, and it is currently a
   documented capability that cannot actually do stateful work. It should be
   fixed regardless of whether the feed plugin is ever built.
2. **Close Gap 4 with a media proxy**, not a CSP relaxation — also reusable
   by any plugin rendering remote content.
3. **Start Tier A with Mastodon + Pixelfed only**, using per-user token entry
   (Gap 7 workaround) to avoid blocking on RFC 0049 changes. Add Lemmy once
   the normalized model — a followable **entity** that's a person or a
   community, not just a person — has survived contact with two networks.
   Favorite/comment/follow are ordinary authenticated calls and need no
   platform change; read-only feed first, composer and these actions second.
4. **Lead discovery with search-and-resolve**, not suggestions or trending —
   the only mechanism without the "local to what the instance already knows"
   ceiling. Label suggestions/trending in the UI as an aid, not an index.
5. **Encrypt credentials via `sdk.secrets` as a matter of course; leave
   cached public post content unencrypted; do not visually or
   terminologically present a fetched fediverse DM or followers-only post
   as private in the way Sovereign's own RFC 0060 E2EE surfaces are** — it
   would imply a guarantee the origin network never provided. Revisit
   client-side E2EE for that narrow category only if there's a concrete
   design for it, not as a default.
6. **Revisit Tier B when RFC 0046 Phase 2 (`sdk.jobs`) exists**, since durable
   retrying delivery is its hard dependency and epic task 3.16 is planned
   anyway. At that point Tier B is roughly: well-known delegation + a Fedify
   integration spike + inbox rate-limit shaping + an egress/SSRF guard + the
   moderation surface. That is a workstream, not a task.

Framed as a recommendation, not a decision — the Tier A/Tier B split and the
sequencing are what need a developer call.

## Open questions

- Does the product want to be a fediverse _reader_ or a fediverse _peer_? The
  answer decides everything above, and the original request is ambiguous
  between them.
- Should Tier A's normalized post model be a `data:provide` contract (RFC 0002) so other plugins can consume the feed, or plugin-private?
- Does a background execution context get a per-user variant ("run this for
  each user with a connection"), or does the plugin iterate users itself with
  a plugin-scoped context? This shapes RFC 0046 Phase 2's API.
- Does "follow" in the unified UI model a single entity type with a `kind:
person | community` discriminator, or two distinct actions? This affects
  every screen that renders a follow button.
- Is client-side E2EE ever warranted for cached followers-only/DM content
  pulled into Sovereign, given it only protects Sovereign's own copy and not
  the copies that already exist elsewhere? Leaning "no, mark it clearly
  instead" per the recommendation above, but not settled.
- If Tier B proceeds: one instance actor, or an actor per user? Per-user is
  what users expect; it multiplies key management, moderation, and the
  handle-namespace question.
- Who moderates? A self-hoster inheriting Mastodon-scale moderation
  obligations with none of Mastodon's tooling is a genuine product risk.

## Next steps

This graduates to RFCs only for Tier A, and only after the developer confirms
the tier split:

- **RFC (new) — Background execution context for SDK surfaces.** The one
  thing it must design: how `pluginId` and an optional `userId` reach
  `secrets`/`connections`/`storage` outside a request scope, without
  reintroducing a forgeable header path. Fixes a live capability gap
  independent of this feature.
- **RFC (new) — Remote media proxy.** Must design: cache keying and eviction
  through `sdk.storage`, the SSRF guard on fetch, and whether the proxy is a
  platform route or a plugin capability.
- **RFC (new) — Fediverse client plugin.** Must design: the normalized
  cross-network post/entity model (including the person-vs-community
  discriminator), the per-network adapter contract, the search-first
  discovery UI, and the plaintext-content UI treatment for followers-only/DM
  posts described above.
- **Not an RFC yet — Tier B.** Revisit after `sdk.jobs` lands. If it
  proceeds, it needs its own research doc for the moderation and
  domain-identity questions before any design work; those are the decisions
  that sink federation projects, not the protocol.

Sources for external claims:
[Mastodon apps API](https://docs.joinmastodon.org/methods/apps/),
[Fedify](https://github.com/fedify-dev/fedify),
[Lemmy interoperability discussion](https://lemmy.world/post/18635732).
