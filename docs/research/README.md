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

Proposing one? Copy [`TEMPLATE.md`](TEMPLATE.md) to `NNNN-short-slug.md`, fill
it in, and add a row below.

| Doc                                                       | Title                                                        | Status         | Graduated to                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-enterprise-architecture-assessment.md)        | Enterprise-grade architecture feasibility                    | Exploratory    | Superseded in part by 0002                                                                                                                                                                                        |
| [0002](0002-multi-tenancy-vs-federation-direction.md)     | Multi-tenancy vs. multi-instance federation                  | Decided        | Direction confirmed — no RFC yet                                                                                                                                                                                  |
| [0003](0003-horizontal-scaling-strategy.md)               | Horizontal scaling strategy (DB, storage, orchestration)     | Exploratory    | Pending RFCs for libSQL dialect + shared file storage                                                                                                                                                             |
| [0004](0004-ui-component-sizing-and-catalog-expansion.md) | Expanding `packages/ui`'s sizing scale and component catalog | Decided        | [RFC 0076](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md); further RFCs pending for Combobox/Input OTP and the compound-API rework                                                                       |
| [0005](0005-trip-planning-and-place-checkin-plugin.md)    | Trip planning + place check-in plugin                        | Partly decided | Pending RFCs A (data model + check-in), B (place provider + map), C (trips + day navigation)                                                                                                                      |
| [0006](0006-standalone-plugin-apps.md)                    | Standalone plugin apps and surface-aware features            | Decided        | [RFC 0080](../rfcs/0080-plugin-surface-model.md), [0081](../rfcs/0081-per-plugin-installable-pwa.md), [0082](../rfcs/0082-focused-plugin-app-shell.md), [0083](../rfcs/0083-device-bridge-capability-contract.md) |
| [0007](0007-operator-compliance-surface.md)               | Operator compliance surface and the controller boundary      | Exploratory    | Pending RFCs for legal identity, retention, terms acceptance                                                                                                                                                      |
| [0008](0008-wkwebview-android-webview-offline-spike.md)   | WKWebView / Android WebView offline and service-worker spike | Exploratory    | Not yet — Android SW bug needs root-causing first; see doc's Next steps                                                                                                                                           |
| [0009](0009-offline-database-architecture.md)             | Universal offline database architecture                      | Exploratory    | Not yet — not decided; an OPFS durability spike is the recommended next step, see doc's Next steps                                                                                                                |
| [0010](0010-native-mobile-push-notifications.md)          | Native mobile push notifications (APNs/FCM)                  | Decided        | [RFC 0085](../rfcs/0085-native-push-relay.md), [workstream 0005](../workstreams/0005-native-push-relay.md)                                                                                                        |
