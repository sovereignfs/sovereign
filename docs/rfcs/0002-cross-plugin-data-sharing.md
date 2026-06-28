# RFC 0002 — Cross-plugin data sharing

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** SDK (`packages/sdk`), manifest schema (`packages/manifest`), runtime, `packages/ui`, Console/Account\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.5.11. The **reserved `sdk.data` surface** (stub) and the `data:provide` / `data:consume` permissions already landed (they throw `NotImplementedError`, like the other reserved surfaces); the full mechanism — consent model, manifest data-contract declarations, runtime resolution, audit log, and consent UI — lands in that task.

---

## Summary

Define a **consent-gated, pull-based, read-only** mechanism that lets one plugin
(the **consumer**) read another plugin's data (the **provider**) on behalf of the
current user. A provider exposes one or more named, versioned **data contracts**;
a consumer requests a contract and receives data only when the user has granted an
explicit, revocable **consent grant**. The platform mediates every access — no
plugin reads another plugin's tables directly.

```ts
// consumer
const rows = await sdk.data.query({ providerId, contract: 'things', version: 1 }, params);
// provider
sdk.data.provide('things', async (params) => resolveThings(params));
```

## Motivation

Sovereign's plugins each own a slice of a user's data behind the SDK boundary
(plugins must not import `runtime/src` or another plugin's internals; data lives
in slug-prefixed tables in the shared schema). That isolation is correct, but it
blocks legitimate, user-desired flows where one plugin could enrich itself from
another's data — e.g. a plugin that aggregates or reconciles records another
plugin already maintains, so the user doesn't re-enter them.

Today the only options are bad ones: duplicate data entry, or break the boundary.
A first-class, **consent-first** sharing mechanism lets plugins compose around a
user's data while keeping isolation, privacy, and user control intact — and keeps
the principle that capabilities are explicit and platform-mediated.

## Current state (what this builds on)

- **SDK boundary:** plugins use `@sovereignfs/sdk` only; no cross-plugin imports
  (CLAUDE.md hard rules, SRS §3.6). There is no sanctioned way for plugin B to
  read plugin A's data.
- **Reserved-surface pattern:** the SDK already declares post-v1 surfaces
  (`storage`, `notifications`, `events`) as stubs that throw `NotImplementedError`
  (`packages/sdk/src/unimplemented.ts`), and the manifest permission enum reserves
  the matching capabilities (`packages/manifest/src/schema.ts`).
- **Permissions:** plugins declare capabilities in their manifest; the runtime is
  the enforcement point.
- **Data scoping:** user-scoped tables carry `tenant_id` + `user_id`; all access is
  already per-user, per-tenant.

This RFC reuses that reserved-surface pattern: `sdk.data` and `data:*` permissions
land now as stubs; the mechanism behind them is specified here for later.

## Proposed design

### 1. Data contracts

A provider exposes **named, versioned, read-only** datasets ("contracts"). A
contract is a stable shape (e.g. `things@1`) decoupled from the provider's
internal tables — the provider may refactor storage without breaking consumers,
as long as the contract shape holds. Versioning is by major integer; a provider
may serve multiple versions during migration.

### 2. Manifest declarations

Plugins declare the contracts they expose and consume (deferred — added when
accepted):

```jsonc
{
  "data": {
    "provides": [{ "contract": "things", "version": 1, "scope": "user" }],
    "consumes": [{ "provider": "<pluginId>", "contract": "things", "version": 1 }],
  },
}
```

- `provides` registers the contracts a provider serves.
- `consumes` is **informational** (powers consent UI, discovery, and build-time
  checks) — it is **not** the access gate. The gate is the runtime consent grant.
- Validated at build time against the manifest schema.

### 3. Permissions

Two reserved permissions gate participation (added now, enforced later):

- `data:provide` — the plugin may expose contracts.
- `data:consume` — the plugin may request other plugins' contracts.

### 4. Consent

Cross-plugin reads require an **explicit, recorded, revocable user consent grant**
keyed on `(consumer plugin, provider plugin, contract, user)`:

- On a consumer's first `query` without a grant, the runtime raises
  `ConsentRequiredError` and surfaces a **consent prompt** describing exactly what
  the consumer wants to read from which provider, for this user.
- Grants are stored in a platform table (consumer, provider, contract, user,
  `granted_at`, `revoked_at`, scope) and are **revocable** from Account (the user's
  own grants) and visible/auditable in Console.
- Revoking a grant blocks subsequent reads immediately.

### 5. SDK surface

```ts
// consumer — resolves only with an active consent grant, else ConsentRequiredError
sdk.data.query(ref: DataContractRef, params?): Promise<TRow[]>;
// provider — register a resolver for a contract it exposes
sdk.data.provide(contract: string, resolver: DataContractResolver): void;
```

`query` is **read-only** and the runtime scopes it to the current user + tenant
before invoking the provider's resolver. The reserved stub
(`packages/sdk/src/data.ts`) throws `NotImplementedError` until the mechanism
lands; `ConsentRequiredError` is reserved in `packages/sdk/src/errors.ts`.

### 6. Security and scoping

- **Read-only.** No write-back across plugins in this RFC.
- **Platform-mediated.** Consumers never touch provider tables; the runtime routes
  `query` to the provider's registered resolver. The SDK boundary is preserved.
- **User- and tenant-scoped.** The runtime injects the requesting user/tenant; a
  provider resolver cannot read another user's data.
- **Audited.** Every cross-plugin read is logged (consumer, provider, contract,
  user, timestamp) for transparency.
- **Sync is the consumer's job.** The mechanism is query/resolve; mapping fetched
  data into the consumer's own records (and any scheduling) is plugin logic.

### Example (abstract)

> _Plugin A_ exposes a `things` contract (its records, as a stable read-only
> shape). _Plugin B_ declares `consumes` of `A/things@1` and holds `data:consume`.
> With the user's consent, _Plugin B_ calls
> `sdk.data.query({ providerId: 'A', contract: 'things', version: 1 })` and maps
> the result into its own records, re-syncing periodically. Without consent, the
> call raises `ConsentRequiredError`.

No real plugin is named here intentionally — the mechanism is generic and any
plugin may be a provider, a consumer, or both.

## Impact when accepted (deferred — beyond the reserved stub already landed)

| Where               | Change                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `packages/manifest` | Add the optional `data.provides[]` / `data.consumes[]` declarations; tests; **minor** bump. |
| `packages/sdk`      | Implement `sdk.data.query`/`provide` against the runtime (replace the stub).                |
| Runtime             | Provider-resolver registry, consent enforcement, user/tenant scoping, audit log.            |
| Platform DB         | `consent_grants` + `data_access_log` tables (with `tenant_id`).                             |
| `packages/ui`       | Consent-prompt dialog primitive.                                                            |
| Console / Account   | Manage/revoke grants (Account: own grants; Console: audit/oversight).                       |
| SRS §3 / §5         | Promote the mechanism from "post-v1 plan" to specified; manifest reference for `data.*`.    |
| `docs/roadmap.md`   | The implementation task (already stubbed as a future task entry).                           |

## Alternatives considered

1. **Direct cross-plugin table reads.** Breaks the SDK boundary and isolation;
   a consumer would couple to a provider's storage. Rejected.
2. **Push-only via `events`.** A provider could publish change events a consumer
   subscribes to. Useful later, but it does not cover "read current state on
   demand with consent," and pushes data without a per-contract consent gate.
   Complementary, not a replacement — out of scope here.
3. **Per-call consent prompts (no stored grant).** Prompting on every read is
   hostile to sync/automation. A stored, revocable grant is the right model.
4. **Write-through sharing.** Letting a consumer mutate a provider's data is a far
   larger surface (conflict, ownership, audit). Explicitly out of scope; this RFC
   is read-only.

## Open questions

1. **Grant granularity.** Per `(consumer, provider, contract)` (proposed) vs.
   per-provider blanket consent. Proposal: per-contract — least surprise.
2. **Contract discovery.** Do consumers bind to a fixed `providerId`, or to a
   contract "kind" any provider can satisfy (e.g. several plugins exposing a
   `things` contract)? Proposal: fixed `providerId` in v1; capability-style
   discovery later.
3. **Caching/staleness.** Does the runtime cache `query` results, or always hit the
   provider resolver? Proposal: no platform cache in v1; consumers cache if needed.
4. **Versioning negotiation.** Behaviour when a consumer requests a version the
   provider no longer serves — hard error vs. negotiated downgrade. Proposal: hard
   `error`; providers keep old majors during migration windows.
5. **Consent expiry.** Should grants expire or require periodic re-confirmation?
   Proposal: no expiry in v1; revocation is always available.

## Adoption path

1. **Now (this change):** reserved `sdk.data` stub + `data:provide`/`data:consume`
   permissions + `ConsentRequiredError`, all additive (SDK/manifest **minor**
   bumps). No behaviour change for existing plugins.
2. **On acceptance:** apply the "Impact when accepted" table — manifest `data.*`,
   consent tables + UI, runtime resolution, then SDK implementation.
3. The mechanism becomes part of the public manifest + SDK contract from the
   `@sovereignfs/sdk` / `@sovereignfs/manifest` minor release that ships it.

## Changelog

| Version | Date     | Change                                                          |
| ------- | -------- | --------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; reserved `sdk.data` stub + `data:*` permissions. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.5.11.              |
