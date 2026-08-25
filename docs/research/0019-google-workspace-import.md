# Research 0019 — Importing content from Google Workspace

**Status:** Exploratory\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** packages/sdk, packages/manifest, runtime, plugins/console; any current or future plugin that stores documents, spreadsheets, or other file-shaped content\
**Related:** [RFC 0049](../rfcs/0049-plugin-external-connections.md) (plugin external connections), [RFC 0043](../rfcs/0043-plugin-secret-vault.md) (plugin secret vault)

---

## Question

Several current and likely future plugins store content that has an obvious
Google Workspace analogue — rich text documents, spreadsheets, and (later)
presentations or generic Drive files. Users who already keep that content in
Google Docs/Sheets/Drive will want a way to bring it into Sovereign without
manual copy-paste. Should Sovereign support importing content from Google
Workspace, and if so: is this a platform-level capability multiple plugins
share, or something each plugin builds for itself — and how large is the
lift either way?

"Import" here means pulling a copy of user-owned Google content into
Sovereign (the user's own data leaving Google, landing in a Sovereign
plugin) — not publishing Sovereign content back out to Google, and not a
live two-way sync.

## Findings

### The account/credential layer already exists at the platform level

Sovereign already has a generic, implemented framework for exactly this
category of problem — a plugin connecting to an external service on a
user's behalf, storing credentials, and refreshing/erroring gracefully:

- **`sdk.connections`** (`packages/sdk/src/connections.ts:52-106`) —
  `create`/`list`/`get`/`update`/`disconnect`/`markUsed`/`markError`/
  `createOAuthState`/`verifyOAuthState`/`getProviderConfig`. This is RFC
  0049's SDK surface, implemented, not just proposed.
- **`sdk.secrets`** (`packages/sdk/src/secrets.ts:41-68`) —
  `create`/`get`/`list`/`update`/`delete`, scoped `user`/`plugin`/
  `instance`, backed by an encrypted vault (RFC 0043). It already stores
  OAuth token material today (access token, refresh token, expiry), not
  just flat API keys.
- **Signed OAuth state tokens** (`runtime/src/connections.ts:137-202`) —
  `createOAuthStateToken`/`verifyOAuthStateToken`: HMAC-signed, single-use,
  TTL-bound. This is the piece that stops an attacker from forging a
  callback and binding their own Google account to another user's session.
- **A manifest-declared provider model** (`packages/manifest/src/schema.ts:868-908`)
  — a plugin lists `connections.providers[]` (id, title, `callbackPath`,
  `scopes`, `config.public`/`config.secrets` field maps) and the platform
  handles the rest.
- **A fully generic Console admin UI for entering OAuth client
  credentials** — `runtime/app/api/admin/provider-configs/route.ts:54-173`
  auto-discovers every installed plugin's declared providers from the
  registry; `plugins/console/app/settings/ProviderConfigForms.tsx:14-40`
  renders a config form for any of them. A new Google provider needs **no**
  new Console UI code, just a manifest declaration — unlike an older,
  bespoke pattern (a hand-written settings form per integration) that
  predates this generic mechanism.
- RFC 0049's own Motivation section (`docs/rfcs/0049-plugin-external-connections.md:26-34`)
  already names "importing data from third-party tools" as a driving use
  case, and its design sketch uses `google.oauth` as an example provider id
  — this was anticipated, not a stretch fit.

**There is a complete, working, non-Google reference implementation of this
whole flow already in the codebase**: `sovereign-plainwrite`'s GitHub OAuth
integration (`plugins/sovereign-plugin-plainwrite.local/app/_lib/oauth-rules.ts:11-84`
for the authorize-URL/token-exchange adapter,
`plugins/sovereign-plugin-plainwrite.local/app/_lib/actions.ts:1501-1622`
for the `sdk.connections`/`sdk.secrets` wiring, and its manifest's provider
block at `plugins/sovereign-plugin-plainwrite.local/manifest.json:40-63`).
A Google integration would follow this same shape almost mechanically for
the account-connection half of the problem.

### What has no precedent anywhere in this codebase

1. **OAuth token refresh has never actually been exercised.** Plainwrite's
   token type captures `refreshToken`/`expiresAt`
   (`oauth-rules.ts:3-7,67-71`), but no code anywhere calls a
   refresh-token endpoint — GitHub's classic OAuth app tokens don't expire,
   so this path was defined but never needed. Google access tokens expire
   in roughly one hour, so any Google integration beyond a single
   immediate fetch needs real, new refresh-and-retry logic sitting on top
   of `sdk.secrets`/`sdk.connections`, with nothing existing to copy.
2. **No Google API client dependency exists anywhere in the repo** — no
   `googleapis` package, no hand-rolled Drive/Docs REST client. This is
   net-new regardless of which plugin(s) end up consuming it.
3. **No file-picker UI pattern exists.** The closest thing (a plain
   text field for typing a repository owner/name) is not a real analogue
   for "browse and pick a file." Google's own Picker API is a separate
   embeddable JS widget with its own API-key setup, distinct from the
   OAuth client id/secret used for Drive API calls.
4. **No rich-content format-conversion pipeline exists anywhere in the
   monorepo.** A repo-wide search for common conversion libraries
   (`mammoth`, `turndown`, `pandoc`, `rehype`, `unified`, `docx`,
   `html-to-markdown`) turns up nothing. This matters because Google Docs
   and Google Sheets need **structurally different** converters even
   though both come from "Google": a Doc is prose/rich-text (headings,
   lists, tables, inline formatting), a Sheet is tabular cell data
   (values, formulas, formats). One "Google import" feature is really two
   independent conversion problems that happen to share an OAuth/API
   front door.

### What Google's export API actually offers

_(General knowledge, not repo-sourced — verify current details against
Google's own docs before building.)_

Google Drive's `files.export` endpoint converts a native Google Docs/Sheets
file into a fixed set of MIME types on Google's side — there is no
"export as Markdown." Docs exports as `text/plain`, `text/html`, or
`.docx`/`.pdf`/`.odt`; Sheets exports as `.csv`, `.tsv`, `.xlsx`, `.ods`, or
`.pdf`. For Docs, `text/html` is the most structure-preserving option
practically available and is what an importer would need to parse; CSV is
the natural fit for Sheets (and closer to what a spreadsheet plugin already
understands as its own import format, if it has one). This confirms finding
4 above rather than changing it: HTML→(whatever the destination format is)
conversion is unavoidable for a Docs importer specifically.

### A self-hosting-specific friction point: Google's OAuth verification

Unlike GitHub OAuth apps (which plainwrite's precedent uses and which work
immediately with no review), Google requires an OAuth consent-screen
**verification process** for apps requesting scopes it classifies as
"sensitive" or "restricted" — Drive/Docs read scopes fall into this
category. Historically this has meant a manual Google review, and for
restricted scopes a paid third-party security assessment, before the app
can be used by more than a small number of test users without a scary
"unverified app" warning. Because Sovereign's connection-provider model
(per the plainwrite precedent) has **each self-hosted instance operator
register their own OAuth app** rather than Sovereign shipping one shared
app, this burden would fall on every individual operator who wants to turn
this feature on, not on the Sovereign project once. This is worth
confirming against Google's current policy before committing to a design —
it's the kind of detail that can make an otherwise-reasonable feature
impractical for a privacy-first, self-hosted audience specifically.

## Options considered

### A. A shared platform-level Google import capability

A new package (or a `runtime`-hosted helper, analogous to how
`sdk.connections`/`sdk.secrets` are shared infrastructure) that owns the
Google OAuth adapter, token refresh, and Drive API calls, exposing a small
surface — "list the user's Docs/Sheets," "fetch file X as format Y" — that
any plugin can call. Each consuming plugin still owns its own
format-specific conversion (HTML→whatever a docs-shaped plugin stores;
CSV→whatever a sheets-shaped plugin stores) and its own import UI.

- **Pros:** OAuth wiring, token refresh, and the Drive API client are
  written once and reviewed once (this is exactly the kind of security-
  sensitive, easy-to-get-subtly-wrong code — token handling, refresh
  races, scope minimization — that benefits from a single implementation).
  Consistent UX (Console shows one "Google" connection, not one per
  plugin, if plugins share a provider id). Matches the platform's existing
  "shared infrastructure, plugin-owned domain logic" split established by
  RFC 0049 itself.
- **Cons:** Requires picking an ownership home and a stable internal
  contract before the first consumer exists — some speculative design
  cost. If only one plugin ever ends up wanting this, the abstraction was
  unnecessary overhead.

### B. Each plugin builds its own bespoke Google integration

A docs-shaped plugin and a sheets-shaped plugin (and any future plugin)
each declare their own Google OAuth provider, write their own token-refresh
logic, and call the Drive API directly.

- **Pros:** No upfront shared-abstraction design; the first plugin to want
  this ships without waiting on a platform decision.
- **Cons:** Duplicates the hardest, most security-sensitive part of the
  feature (OAuth + token refresh) per plugin. Drift risk — one plugin's
  refresh logic gets fixed after a bug, the other's doesn't. Directly
  against the grain of what RFC 0049 already built shared infrastructure
  to prevent (its own Motivation section calls out exactly this
  duplication risk).

### C. Narrow one-shot MVP first, defer the picker and persistent connection

Scope the first version down to "paste a link to a single Google Doc/Sheet
you've already made shareable, fetch it once, convert it, done" — no OAuth
connection at all for the very first cut, relying on Google's public
export endpoints for anyone-with-the-link content, or a minimal one-time
OAuth consent scoped to a single file (Google's `drive.file` scope, which
is _not_ in the sensitive/restricted category and does not require the
verification process above). Full Drive browsing (Option A's "list the
user's files") and persistent reconnectable accounts come later, if at
all.

- **Pros:** Sidesteps the OAuth-verification friction point almost
  entirely — `drive.file` scope access is per-file and consent-driven, not
  a standing grant to browse the whole Drive. Much smaller surface: no
  picker UI, no token refresh (a single-use, short-lived grant can be
  acceptable depending on the exact flow chosen), no persistent connection
  record needed for a true one-shot fetch. Mirrors the scope discipline
  the Sheets plugin's own documentation already applies to its
  `FINANCE()` external-provider integration — deliberately avoid
  reintroducing a bigger admin-secrets/OAuth workstream than the feature
  actually needs.
- **Cons:** Weaker product experience (re-importing the same doc later
  means repeating the flow; no "connected as you@gmail.com, browse your
  files" convenience). May still need to become Option A later if demand
  for a richer flow shows up, meaning some of this work is thrown away
  rather than extended — worth deciding up front whether that's
  acceptable.

### D. Don't build Google-API integration at all; rely on manual export

Users export from Google themselves (File → Download) and hand the
resulting file to whatever plain local-file import a plugin already offers
for its own format. No OAuth, no Google API client, no picker.

- **Pros:** Zero new infrastructure, zero new dependency, zero exposure to
  Google's verification process. Consistent with the platform's general
  bias toward not building integrations "preemptively" (the same
  discipline the Sheets plugin's own `FINANCE()` scope notes apply to
  avoiding a keyed provider before it's needed). Lets the team learn
  whether demand is real before committing to the OAuth/API investment.
- **Cons:** Materially worse experience for the exact users this feature
  targets (people who already live in Google Workspace) — asking them to
  manually download-then-upload defeats most of the point. Format
  conversion (HTML/DOCX/CSV → whatever a plugin stores) is still needed
  either way, so this option doesn't eliminate finding 4's work, only the
  OAuth/API-client/picker portion of it.

## Recommendation

Treat this as two separable questions with different urgency, rather than
one monolithic "build Google import" decision:

1. **The account-connection question is basically already answered.**
   RFC 0049/0043's infrastructure is implemented, has a working non-Google
   precedent to copy, and explicitly anticipated this use case. There is
   no real platform-level design work left to do here — a future RFC for
   this feature can cite RFC 0049 and move straight to the Google-specific
   adapter, rather than re-litigating the connection model.
2. **The real open design question is scope, per Option C.** Given the
   Google OAuth verification friction is real and falls on every
   self-hosting operator individually (not a one-time cost to the
   Sovereign project), a narrow `drive.file`-scoped, one-shot-import MVP
   is the more honest starting point than a full "browse your whole
   Drive" experience — smaller build, smaller ongoing operator burden,
   and it directly tests whether the format-conversion work (the
   genuinely hard, novel part per finding 4) is worth doing before
   investing in a picker and persistent-connection UX on top of it.
3. **Build the Google-facing pieces (OAuth adapter, API client, format
   converters) as shared infrastructure (Option A) rather than
   per-plugin (Option B) as soon as a second consumer is likely** — which
   here is immediate, since both a docs-shaped and a sheets-shaped plugin
   are named as intended consumers from the start. Even under the Option
   C narrow MVP, whichever plugin builds it first should write the OAuth
   adapter and Drive API call in a way the next plugin can reuse, rather
   than each plugin re-deriving it.

This is a recommendation, not a decision — no implementation should start
from this doc alone.

## Open questions

- **Does Google's current OAuth verification policy still work the way
  described above for `drive.readonly`-class scopes, and does `drive.file`
  genuinely avoid it?** This doc's Google-specific claims are general
  knowledge, not verified against Google's current developer documentation
  as part of this research pass — confirm before an RFC commits to a
  specific scope choice.
- **Where should the shared Google adapter actually live** — a new
  `packages/` package, or code inside whichever plugin builds it first
  with an explicit "promote later" note? (The platform's own DS-first
  precedent for `packages/ui` argues against "plugin-local, promote
  later" as a habit — see `docs/architecture-rules.md`.)
- **Which plugin should build the first Google import flow?** This doc
  deliberately doesn't take a position — that's a product/roadmap call,
  not a research finding.
- **Is Slides (or generic Drive files) in scope at all, ever?** Nothing
  above assumes yes; this doc only examined Docs and Sheets because those
  are the two content shapes with an existing analogue in this platform
  today.
- **What happens to formatting/structure Google's export can't losslessly
  represent** (e.g. Docs' comments/suggestions, Sheets' charts/pivot
  tables/conditional formatting)? Not investigated here — needs a spike
  against real exported files once a target destination format is chosen.

## Next steps

Graduate to an RFC once:

- a specific consuming plugin and its target destination format are
  chosen (the RFC needs a concrete "HTML → X" or "CSV → Y" conversion
  target, not an abstract one), and
- the Google OAuth verification open question above is confirmed.

The RFC should be scoped narrowly (Option C's one-shot MVP), cite this
doc and RFC 0049/0043 for the connection-layer design instead of
re-deriving it, and explicitly flag the shared-adapter question (open
question 2 above) as something the RFC itself should settle rather than
deferring further.
