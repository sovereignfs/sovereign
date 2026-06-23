# Epic: Monetization

> A plugin billing model based on manifest-declared pricing tiers and author-signed Ed25519 entitlement tokens — no platform payment processor lock-in.

## Status

⏳ In Progress

## Overview

Phase 1 (complete) lets plugin authors monetize via a manifest `monetization` object and offline-verifiable entitlement tokens signed with the author's Ed25519 key. The runtime gates paywalled routes by `routePrefix`. The Account plugin handles purchase and license import; Console handles entitlement oversight and manual payment confirmation. Phase 2 (post-v1) adds a `sdk.billing.grantEntitlement()` seam so plugins can accept Stripe/PayPal webhooks and automate the grant flow without a platform payment adapter.

## Tasks

#### ✅ 7.1 — Plugin monetization (RFC 0003)

**Goal:** Let plugin authors monetize plugins via a manifest-declared model + author-signed entitlement gating. RFC 0003 accepted.

**Deliverables:**

- Manifest `monetization` object (`model`/`interval`/`tiers`/`license.publicKey`); validation + tests; `@sovereignfs/manifest` minor bump
- Reserved `sdk.billing`/`entitlements` surface (stub throwing `NotImplementedError`) + `EntitlementRequiredError`; `@sovereignfs/sdk` minor bump
- Entitlement gating in runtime middleware by `routePrefix` (paywall / `402`), mirroring the disabled-plugin pattern; `entitlements` table with `tenant_id`
- `PaymentProvider` adapter interface; manual/bank, Stripe, and PayPal adapters (hosted checkout + webhooks); offline signature verification against author public key
- Subscription management in Account (purchase/import license, active subscriptions, renewal/cancel); entitlement oversight + manual-payment confirmation in Console
- Paywall page (runtime-owned); plugin key-rotation support; docs

**Dependencies:** Task 0.5.08 (API namespace — webhook endpoints), Task 0.5.05 (`sdk.db`)

**SRS reference:** RFC 0003

**Review checklist:**

- A `recurring` plugin is paywalled without an entitlement; a signed license grants access; a Stripe webhook renews the entitlement; manual import works with no gateway

---

#### 📋 7.2 — Phase 2 payment integration (RFC 0003 Phase 2)

**Goal:** Automate the payment → entitlement flow that Phase 1 (Task 0.8.01) leaves
manual. Three sub-tracks, independently deliverable:

**Sub-track A — Bank transfer + admin confirmation**

- New `payment_requests` table (both dialects; drizzle-kit migration).
- Console **Pending Payments** sub-section under Entitlements — lists pending requests with subscriber, plugin, tier, amount, and requested-at.
- Admin **Confirm** / **Reject** actions: confirm auto-creates an entitlement row (`source: 'bank_transfer'`); reject optionally sends a notification email.
- `sdk.billing.requestSubscription({ pluginId, tierId })` (currently `NotImplementedError` stub → implemented) creates the request row and returns configured bank details.
- Console Settings gains a `bank_transfer_details` field (IBAN / instructions).

**Sub-track B — Stripe webhook**

- No platform adapter code — integration lives in the plugin.
- `sdk.billing.grantEntitlement({ userId, pluginId, tierId, expiresAt })` (new) lets a plugin's webhook handler write an entitlement server-side without a signed token.
- Example Stripe webhook handler in `plugins/example-monetized/` or docs.

**Sub-track C — PayPal webhook**

- Same pattern as Stripe; same `sdk.billing.grantEntitlement()` seam.

**Dependencies:** Task 0.8.01 (Phase 1 must be in production), Task 1.0.01 (encryption at rest — payment request records contain PII)

**SRS reference:** RFC 0003 Phase 2

**Review checklist:**

- Bank transfer: user submits request → Console "Pending Payments" shows it → admin confirms → user's next request passes the paywall without re-importing a token
- Bank transfer: admin rejects → user receives notification email (when SMTP configured)
- Stripe: plugin webhook verifies signature, calls `sdk.billing.grantEntitlement()`, user gains access
- `sdk.billing.requestSubscription()` throws `EntitlementRequiredError` when called from a non-plugin context

---

## Related RFCs

- [RFC 0003 — Plugin monetization](../rfcs/0003-plugin-monetization.md)

## Related Docs

- [plugin-development.md — manifest `monetization` field](../plugin-development.md)

## Cross-references

- Entitlement gating in the runtime middleware is part of [Platform Shell](platform-shell.md).
- The Account plugin's subscription management UI is part of [Plugin — Accounts](plugin-accounts.md).
- The Console entitlement oversight and payment confirmation UI is part of [Plugin — Console](plugin-console.md).
