# Research index

Status at a glance for all Sovereign research notes. Open the individual file
for full findings, sources, and open questions.

## What a research doc is

A research doc is the stage **before** an RFC: an open-ended technical or
strategic question that doesn't yet have a concrete proposal. It captures
findings, current-state facts (with `file:line` references), options
considered, and a recommendation — but it does not commit to a design the way
an RFC does. Research docs are internal (unpublished — see
[documentation-structure.md](../documentation-structure.md)); they are working
notes, not a public decision record.

**Pipeline:** `docs/research/` (exploration) → `docs/rfcs/` (accepted design)
→ `docs/epics/` (scheduled task). A research doc graduates into one or more
RFCs once its recommendation is concrete enough to design against; it is not
deleted afterward — keep it as the decision trail and have the resulting
RFC(s) reference it back via their "Current state" or "Motivation" section.

Not every research doc produces an RFC. Some conclude "not now" or "rejected"
— that's a valid, useful outcome; record it rather than losing the reasoning.

Some skip the RFC in the other direction. **A research doc that already carries a
settled design — options weighed, choice made, rejected alternatives recorded —
may govern a workstream and its epic tasks directly**, because an RFC restating
it would add a review cycle without adding a decision. This is a narrow
exception with four conditions, set out in
[documentation-structure.md](../documentation-structure.md) under
"Research-as-design (the RFC exception)"; the key ones are that rejected
alternatives must be written down and that any genuinely open decision must
become an explicit gate in the workstream. When in doubt, write the RFC.

Proposing one? Copy [`TEMPLATE.md`](TEMPLATE.md) to `NNNN-short-slug.md`, fill
it in, and add a row below.

| Doc                                                       | Title                                                                  | Status         | Graduated to                                                                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-enterprise-architecture-assessment.md)        | Enterprise-grade architecture feasibility                              | Exploratory    | Superseded in part by 0002                                                                                                                                                                                        |
| [0002](0002-multi-tenancy-vs-federation-direction.md)     | Multi-tenancy vs. multi-instance federation                            | Decided        | Direction confirmed — no RFC yet                                                                                                                                                                                  |
| [0003](0003-horizontal-scaling-strategy.md)               | Horizontal scaling strategy (DB, storage, orchestration)               | Exploratory    | Pending RFCs for libSQL dialect + shared file storage                                                                                                                                                             |
| [0004](0004-ui-component-sizing-and-catalog-expansion.md) | Expanding `packages/ui`'s sizing scale and component catalog           | Decided        | [RFC 0076](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md); further RFCs pending for Combobox/Input OTP and the compound-API rework                                                                       |
| [0005](0005-trip-planning-and-place-checkin-plugin.md)    | Trip planning + place check-in plugin                                  | Partly decided | Pending RFCs A (data model + check-in), B (place provider + map), C (trips + day navigation)                                                                                                                      |
| [0006](0006-standalone-plugin-apps.md)                    | Standalone plugin apps and surface-aware features                      | Decided        | [RFC 0080](../rfcs/0080-plugin-surface-model.md), [0081](../rfcs/0081-per-plugin-installable-pwa.md), [0082](../rfcs/0082-focused-plugin-app-shell.md), [0083](../rfcs/0083-device-bridge-capability-contract.md) |
| [0007](0007-operator-compliance-surface.md)               | Operator compliance surface and the controller boundary                | Exploratory    | [RFC 0090](../rfcs/0090-default-privacy-policy-and-tos.md) (default privacy/tos, platform + plugin); source disclosure, retention, and terms-acceptance RFCs still pending                                        |
| [0008](0008-wkwebview-android-webview-offline-spike.md)   | WKWebView / Android WebView offline and service-worker spike           | Exploratory    | Platform findings stand; the "Android SW bug" was misattributed — root cause found in [0012](0012-offline-first-architecture.md)                                                                                  |
| [0009](0009-offline-database-architecture.md)             | Universal offline database architecture                                | Superseded     | Superseded by [0012](0012-offline-first-architecture.md), which decides the storage question it left open                                                                                                         |
| [0010](0010-native-mobile-push-notifications.md)          | Native mobile push notifications (APNs/FCM)                            | Decided        | [RFC 0087](../rfcs/0087-sovereign-relay.md), [workstream 0005](../workstreams/0005-native-push-relay.md)                                                                                                          |
| [0011](0011-ios-pwa-inspection-findings.md)               | iOS PWA inspection findings                                            | Complete       | Findings fixed directly (no RFC needed) — see doc's resolution table                                                                                                                                              |
| [0012](0012-offline-first-architecture.md)                | Offline-first architecture                                             | Exploratory    | Pending RFCs for offline session/shell caching, tiered manifest + storage, encryption + device auth, and tier-2 sync; escrow decision gates the third                                                             |
| [0013](0013-layered-database-encryption-strategy.md)      | Layered database encryption strategy (wire, app-level, zero-knowledge) | Decided        | [RFC 0092](../rfcs/0092-app-level-field-encryption.md) (Accepted), epic tasks 8.31–8.34, [workstream 0011](../workstreams/0011-app-level-field-encryption.md); RFC 0060 already covers Layer 3                    |
| [0014](0014-plugin-subdomain-serving.md)                  | Serving plugins on subdomains (`tasks.example.com`)                    | Exploratory    | Pending RFC for manifest field + host-normalization middleware; possible companion SDK/UI RFC for origin-aware URL helpers                                                                                        |
| [0015](0015-harness-engine-benchmark.md)                  | `apps/harness` engine: llama.cpp vs. Ollama benchmark                  | Exploratory    | Governs epic task 22.1 directly — see [RFC 0063](../rfcs/0063-core-assistant-jarvis.md); benchmark not yet run                                                                                                    |
