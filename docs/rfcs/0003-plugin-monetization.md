# RFC 0003 — Plugin monetization

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** Manifest schema (`packages/manifest`), SDK (`packages/sdk`), runtime middleware, plugin registry, `packages/ui`, Console/Account, SRS\
**Incorporated into plan:** Yes — Phase 1 completed as Task 0.8.0 (manifest field, `sdk.billing` stub, entitlement gating, offline Ed25519 verification, paywall, Account billing tab, Console entitlements view, license generator for operators). Phase 2 (automated payment collection) scheduled as post-v1 Task 1.0.2.

---

## Summary

Let **plugin authors monetize their plugins**. The platform and a set of
always-free plugins stay open; an author may mark a plugin as paid and require an
end user to **buy access** before its routes load. A plugin declares its model in
its manifest:

```jsonc
{
  "monetization": {
    "model": "free" | "one_time" | "recurring" | "pay_what_you_want",
    "interval": "day" | "week" | "month" | "year", // recurring only
    "tiers": [{ "id": "pro", "name": "Pro", "price": { "amount": 900, "currency": "USD" } }],
    "license": { "publicKey": "..." } // verifies author-issued entitlements
  }
}
```

The **plugin author is the merchant** and **fixes the price**. Access is granted
by a **signed entitlement (license) the author issues on payment**, which the
instance **verifies offline** against the author's public key — so monetization
works on a self-hosted instance with **no mandatory central service**. Payment is
collected through a **provider adapter** (manual/bank transfer, PayPal, Stripe to
start; extensible). Enforcement is server-side: the runtime gates a paid plugin's
routes by entitlement, and a reserved `sdk.billing` surface lets a plugin gate
features by tier.

## Motivation

Sovereign's thesis is that the **plugin system is the product**. A durable plugin
ecosystem needs a way for authors to be paid — otherwise non-trivial third-party
plugins have no business model and the ecosystem stays hobby-scale. Today every
installed plugin is free to every user on the instance; there is no notion of a
paid plugin or of access tied to payment.

The constraint is that Sovereign is **self-hosted** and "vendor lock-in is a
defect" (§1.7). Monetization must not require routing every instance's money
through a Sovereign-operated service, and it must keep working when a plugin is
installed on an air-gapped or self-managed box. The design below treats
monetization as an **optional, additive** capability layered on the existing
plugin model, and keeps the core platform fully functional without it.

This is **not** a hosted public marketplace (a v1 non-goal, §1.4/§4.6). It adds
the _licensing/entitlement plumbing_ that lets an author sell access to a plugin;
discovery and a hosted store are explicitly out of scope (see Alternatives).

## Current state (what this builds on)

- **Manifest** (`packages/manifest/src/schema.ts`, `.strict()`) declares a
  plugin's `type` (`platform`/`sovereign`/`community`), `permissions`,
  `repository`, etc. There is no pricing or access-cost concept.
- **Route gating precedent:** the runtime middleware already gates routes by
  `adminOnly` (403) and by disabled status (404), keyed on `routePrefix`. Because
  the Edge middleware can't read the DB, it fetches the gating facts from a
  Node-runtime route (the `/api/admin/plugins/disabled` pattern). Entitlement
  gating reuses this exact shape.
- **Reserved-surface pattern:** the SDK declares not-yet-implemented surfaces
  (`storage`, `notifications`, `events`, and `data` from RFC 0002) as stubs that
  throw `NotImplementedError`, with matching reserved manifest permissions. A
  `billing` surface would follow the same pattern.
- **Registry** (Task 1.0.1, `registry/plugins.json`) plus the manifest
  `repository`/`type` fields are the natural place to publish an author's
  license **public key** and establish author identity.
- **Licensing** (§2.7): third-party plugins may use any license; commercial /
  proprietary plugins are the motivating case for monetization.

## Proposed design

### 1. Monetization models and tiers

A plugin's manifest declares one **model**, author-fixed:

- `free` — default; no entitlement required (equivalent to omitting the field).
- `one_time` — a single payment grants perpetual access.
- `recurring` — access requires an active subscription billed every `interval`
  (`day`/`week`/`month`/`year`).
- `pay_what_you_want` — the user chooses any amount ≥ an optional floor; grants
  access like `one_time` (or `recurring` if combined — out of scope v1).

**Tiers** (optional) are named access levels (e.g. `basic`/`pro`) with their own
price; the active tier is carried in the entitlement so a plugin can unlock
features accordingly. Prices are integer **minor units** + ISO 4217 currency
(the money convention used across the platform).

### 2. What is monetizable

- **Platform** plugins (Console, Account, Launcher) and the platform itself are
  **always free** — they are core, ship in the monorepo, and cannot declare
  `monetization`.
- Only `sovereign` / `community` plugins may be paid.
- An instance operator may always **disable** a paid plugin (existing CON-07); a
  disabled plugin is never billable.

### 3. Author-as-merchant via decentralized signed licenses (recommended)

The plugin author is the merchant of record and is paid directly. Access is
proven by an **author-issued, signed entitlement token** — a "license":

1. The author holds a **keypair**. The **public key** is published in the
   plugin's manifest (`monetization.license.publicKey`) and/or the registry entry.
2. A user on an instance initiates purchase. The instance hands off to the
   author's **checkout** (the author's payment provider) or, for manual/bank, to
   the author's payment instructions.
3. On confirmed payment the author's billing issues a **signed license** scoped to
   `{ pluginId, subscriber identity, tier, issuedAt, expiresAt? }`, signed with
   the author's private key.
4. The instance stores the license and **verifies its signature offline** against
   the author's public key on every entitlement check. No call to a Sovereign
   service is required.
5. `recurring` licenses carry `expiresAt`; the instance treats an expired license
   as no access and prompts renewal. Renewal re-issues a license (online check to
   the author's endpoint, or a fresh signed token). A **grace period** is allowed
   before hard lock.
6. **Manual / bank transfer** is a first-class flow: the author confirms receipt
   out of band and issues the signed license, which the user (or the instance
   admin) imports. No automation or live gateway needed.

This keeps money and merchant responsibility with the author, requires **no
central service**, supports offline verification, and naturally accommodates
manual payment — at the cost of authors running (or using a hosted) license-issuing
checkout, and of revocation requiring expiry/online re-checks (see Open questions).

### 4. Manifest declarations

`monetization` is an **optional** object (deferred — added when accepted):

```jsonc
"monetization": {
  "model": "recurring",
  "interval": "month",
  "tiers": [
    { "id": "basic", "name": "Basic", "price": { "amount": 500, "currency": "USD" } },
    { "id": "pro",   "name": "Pro",   "price": { "amount": 1500, "currency": "USD" } }
  ],
  "license": { "publicKey": "<base64 ed25519 public key>" }
}
```

Validated at build time against the manifest schema (a `free`/absent value keeps
every existing manifest valid). The manifest declares pricing; the operator and
users do not change it.

### 5. Payment-provider adapters

A small **`PaymentProvider` interface** abstracts collection so adapters are
pluggable (same seam idea as the protocol adapters in other plugin specs):

- **Manual / bank transfer** — present instructions; settlement and license
  issuance are confirmed out of band by the author.
- **Stripe** — hosted Checkout + signed **webhooks**; recurring handled by Stripe
  subscriptions; webhook → license issue/renew/revoke.
- **PayPal** — hosted checkout + IPN/webhooks, same shape.
- **Extensible** — new providers implement the interface without core changes.

**No card data ever touches the instance** — hosted checkout only (keeps PCI
scope off the platform).

### 6. Entitlement enforcement

Server-side and authoritative; the client is never trusted.

- The runtime **middleware gates a paid plugin's `routePrefix`** by entitlement,
  reusing the `adminOnly`/disabled pattern (Edge middleware fetches entitlement
  facts from a Node-runtime route). No valid entitlement → redirect to a
  **paywall** page (or `402 Payment Required` for API routes).
- A reserved **`sdk.billing` / `sdk.entitlements`** surface lets a plugin check
  the current user's entitlement and **tier** to gate features in-app
  (`sdk.billing.requireEntitlement()` / `getEntitlement()`), throwing/normalizing
  when absent. Until implemented it throws `NotImplementedError`.
- Entitlements are stored per `{ user, plugin, tier, status, source, expiresAt }`
  in the platform DB (with `tenant_id`).

### 7. UX

- **Account** — purchase / import a license, view active subscriptions and
  renewal dates, cancel.
- **Console** — view entitlements across users, import/confirm manual payments,
  troubleshoot (admin oversight; the operator is not the merchant).
- **Paywall** — a runtime-owned page shown when a user without entitlement hits a
  paid plugin, showing the author's tiers/prices and a purchase/redeem action.

### 8. Security and legal

- License **signature verification** with the author's public key; support **key
  rotation** (publish new keys via registry; keep old keys valid for issued
  licenses).
- The **author is merchant of record** — taxes, invoicing, refunds, and
  chargebacks are the author's responsibility, not the instance operator's or the
  Sovereign project's.
- Billing/PII data is minimized and subject to the platform's privacy posture
  (GDPR); the instance stores entitlements, not card data.

### 9. Self-host reconciliation

Monetization is **optional and additive**: an instance with no paid plugins, or
offline, is unaffected. Entitlements verify **offline** against published author
keys, so a paid plugin keeps working without contacting any Sovereign service.
This satisfies §1.7 ("no cloud dependency for **core** functionality") — paid
plugins are not core — and avoids making the project a payment intermediary.

## Impact when accepted (deferred — no edits yet)

| Where                             | Change                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/manifest`               | Optional `monetization` object (model/interval/tiers/license); validation + tests; **minor** bump.           |
| `packages/sdk`                    | Reserved `sdk.billing`/`entitlements` surface (stub) + `EntitlementRequiredError`; **minor** bump.           |
| Runtime middleware + a Node route | Entitlement gating by `routePrefix` (paywall / `402`), mirroring the disabled-plugin gating pattern.         |
| Runtime                           | `PaymentProvider` adapter interface; manual/bank, Stripe, PayPal adapters; webhook endpoints + verification. |
| Platform DB                       | `entitlements` (+ a payments/transactions ledger), with `tenant_id`.                                         |
| Plugin registry                   | Publish author identity + license public key(s); key rotation.                                               |
| `packages/ui`                     | Paywall / pricing components; subscription-management UI.                                                    |
| Console / Account                 | Subscription management (Account) and entitlement oversight + manual-payment confirmation (Console).         |
| SRS §1.4 / §4.6 / §1.7            | Clarify that monetization (licensing plumbing, not a hosted marketplace) is in scope; reconcile wording.     |
| `docs/roadmap.md`                 | A phased implementation task (manifest + entitlement gating first; providers; subscription UX).              |

## Alternatives considered

1. **Central Sovereign billing / marketplace** (a hosted store; Stripe Connect to
   route payouts to authors; central license issuance and discovery). Best UX and
   the only clean path to plugin **discovery**, but introduces a central
   dependency (against §1.7), makes the project a payment intermediary with the
   attendant PCI/tax/legal burden, and squarely revisits the marketplace non-goal.
   Recorded as a **possible future convenience layer** on top of the decentralized
   model, not the v1 mechanism.
2. **Operator-as-merchant** (the instance admin connects their own gateway and
   sells plugin access to their users). Fits single-tenant self-host cleanly, but
   does not pay plugin authors — so it does not serve the stated goal. Rejected.
3. **Honor-system / unsigned flags** (mark a plugin paid, no cryptographic
   entitlement). Trivial to bypass; provides no real gate. Rejected.

## Open questions

1. **Decentralized license-key vs central store** as the v1 mechanism — the
   primary fork. Recommendation: decentralized signed licenses now; central store
   as a later optional layer.
2. **License token format** — signed JWT vs a compact license key; **offline-only**
   verification vs an optional **online** status check (for instant revocation).
3. **Revocation** on refund/chargeback — short-lived tokens + renewal, an online
   revocation list, or accept eventual expiry. Trade-off vs offline guarantee.
4. **Payout routing** if any central/hosted component is offered (Stripe Connect?
   author-direct only?).
5. **Free trials**, **regional pricing/currency**, **proration**, **taxes/invoicing**
   — likely out of v1; confirm.
6. **Author identity & key distribution/rotation** and the **trust model** for
   `community` plugins (who vouches for a public key?).
7. Exact **SRS wording** to revise in §1.4/§4.6 (marketplace non-goal) and §1.7
   (cloud-dependency), so "no hosted marketplace" and "monetization exists" coexist.

## Adoption path

1. Accept RFC → land the manifest `monetization` field + reserved `sdk.billing`
   stub and `entitlements` table (additive, no behaviour change) — the same
   reserve-first step used for RFC 0002.
2. Implement **entitlement gating** (middleware + paywall) against manually
   imported signed licenses — proves the model end to end with the **manual/bank**
   adapter and zero external dependencies.
3. Add the **Stripe** then **PayPal** adapters (hosted checkout + webhooks) and the
   subscription-management UX in Account/Console.
4. Revisit a central discovery/checkout layer only if there is demand.

## Phase 2 — Automated payment collection (post-v1, Task 1.0.2)

Phase 1 (Task 0.8.0) ships the manual Ed25519 token model. Phase 2 adds automated
payment collection — users subscribe and receive access without the operator generating
and distributing a token by hand.

### Bank transfer + admin confirmation flow

1. User opens the paywall page and clicks "Request access via bank transfer."
2. `sdk.billing.requestSubscription({ pluginId, tierId })` creates a `payment_requests`
   row (`status: pending`) and presents the operator's configured payment instructions
   (IBAN / account details stored in Console Settings — a new `bank_transfer_details`
   `platform_setting` key).
3. Console gains a **Pending Payments** sub-section under Entitlements — lists pending
   requests with subscriber, plugin, tier, amount, and requested-at timestamp.
4. The operator confirms receipt out of band (inspects their bank statement), then
   clicks **Confirm payment** → status transitions to `confirmed` → the runtime
   auto-creates an `entitlements` row (as if `source: 'bank_transfer'`). The
   subscriber immediately gains access on their next request.
5. **Reject** sets status to `rejected` and, if SMTP is configured, sends the
   subscriber a notification email.

### Stripe / PayPal webhook flow

Plugin authors who prefer fully automated collection configure their payment
gateway's webhook to POST to their plugin's serve route
(`/api/<slug>/payment-webhook`), which is delegated via the existing public API
namespace (RFC 0008/PLT-16). The plugin's server-side webhook handler:

1. Verifies the gateway signature.
2. Calls `sdk.billing.grantEntitlement({ userId, pluginId, tierId, expiresAt })` to
   write the entitlement directly — no signed token required (server-side trust).

The platform itself ships no gateway adapter code; payment integration is entirely
in the plugin. `sdk.billing.grantEntitlement()` is the platform-side seam.

### New DB table (Phase 2)

`payment_requests` — `{ id, userId, pluginId, tierId, status, requestedAt, resolvedAt, resolvedBy, notes, tenantId }`.

Both SQLite and Postgres dialects; drizzle-kit migration added.

### New / updated SDK surfaces (Phase 2)

| Surface                                    | Status                                        | Notes                                                                                                     |
| ------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `sdk.billing.requestSubscription(input)`   | New (throws `NotImplementedError` in Phase 1) | Creates a `payment_requests` row; returns instructions.                                                   |
| `sdk.billing.grantEntitlement(input)`      | New                                           | Admin/webhook path to write an entitlement without a signed token. Callable only from plugin server code. |
| `sdk.billing.getEntitlement(pluginId)`     | Phase 1 stub → Phase 2 implemented            | Returns the current user's active entitlement for a plugin.                                               |
| `sdk.billing.requireEntitlement(pluginId)` | Phase 1 stub → Phase 2 implemented            | Throws `EntitlementRequiredError` if no active entitlement.                                               |

## Changelog

| Version | Date     | Change                                                                                      |
| ------- | -------- | ------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft.                                                                              |
| 0.2     | Jun 2026 | Added to the roadmap as exploratory Task 0.8.0 (gated on acceptance; still Draft).          |
| 0.3     | Jun 2026 | RFC accepted; status updated to Accepted; Task 0.8.0 now scheduled (no implementation yet). |
| 0.4     | Jun 2026 | Phase 1 complete (Task 0.8.0). Phase 2 section added; roadmap Task 1.0.2 scheduled.         |
