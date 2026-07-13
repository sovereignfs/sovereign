# Epic 23: Sovereign P2P Chat

> Independently deployed, end-to-end encrypted peer-to-peer chat integrated with
> Sovereign identity and navigation.

## Status

📋 Planned

## Overview

Sovereign Chat is a companion app, not a plugin composed into the Sovereign
runtime. It uses Sovereign authentication to bootstrap an independent Chat
identity, then authenticates peers and devices cryptographically without making
the runtime, auth server, chat service, or relay a message authority.

A typical deployment uses `app.example.com`, `auth.example.com`,
`chat.example.com`, and an optional `relay.example.com`. These domains are
illustrative. The user-facing address is instance-qualified, such as
`@alice:example.com`, while contact continuity is anchored to an immutable Chat
ID and identity key rather than the handle.

The epic deliberately separates protocol validation, account handoff, identity,
device lifecycle, transport, message encryption, offline delivery, federation,
and groups. A same-instance one-to-one release must pass its security and
portability gate before federation or group messaging begins.

## Architectural boundaries

- Chat deploys independently and owns its sessions, databases, encrypted
  messages, attachments, and protocol migrations.
- The Sovereign runtime provides navigation and launch initiation only. Chat is
  not a plugin and does not receive `@sovereignfs/sdk` host capabilities.
- The auth service certifies an account-to-Chat-identity binding. It does not
  receive identity private keys or derive conversation keys.
- Devices authenticate peers using identity/device keys and proof of possession.
- Veilid is a transport candidate, not the message-encryption protocol.
- Direct, routed, and offline delivery carry the same endpoint-encrypted
  envelope format.
- Existing parent-domain auth cookies must not be exposed to the Chat origin.
- Cryptographic protocol and library choices require a documented security
  review; no task may substitute custom cryptography for an audited protocol.

## Tasks

#### 📋 23.1 — Protocol selection and Veilid feasibility spike (RFC 0066)

**Goal:** Validate the security model and prove that the proposed transport and
E2EE categories are viable across Sovereign's supported web and native clients
before production architecture is committed.

**Deliverables:**

- Refined threat model covering compromised runtime, auth, Chat backend, web
  code-delivery origin, relay, operator, network, and endpoint roles.
- Evaluation matrix for maintained one-to-one and group E2EE protocol libraries,
  including audit history, browser/native support, licensing, serialization,
  test vectors, multi-device behavior, and downgrade resistance.
- Veilid prototype covering direct and routed delivery, browser/WASM feasibility,
  native bindings, NAT traversal, reconnect, sleep/wake, and resource use.
- Gateway prototype when direct browser support is insufficient.
- Measured metadata inventory for direct, routed, and offline paths.
- Architecture decision record selecting the initial E2EE library, credential
  encoding, transport topology, and Chat repository placement.
- Explicit stop/go criteria when no candidate satisfies the threat model.

**Dependencies:** RFC 0066.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Threat model; Proposed design — Message encryption and Veilid transport boundary.

**Review checklist:**

- Results come from working prototypes and measurements, not API inspection
  alone.
- Browser, installed-PWA, desktop, iOS, and Android constraints are documented.
- No production cryptographic protocol is designed in-house.
- The selected libraries expose test vectors and maintained implementations.
- Relay-visible metadata and unavoidable privacy limitations are recorded.
- A gateway is selected only when the direct-client evidence requires it.

#### 📋 23.2 — Chat companion app and deployment scaffold

**Goal:** Establish Chat as a separately deployable application and add a
disabled-by-default Sovereign entry point without sharing plugin or data
boundaries.

**Deliverables:**

- Chat application scaffold in the repository selected by Task 23.1.
- Independent Chat configuration, health endpoint, database, migration path,
  strict CSP, structured logging, and test harness.
- Optional relay/gateway service scaffold only when selected by Task 23.1.
- Docker Compose profile or documented external-service deployment that leaves
  the baseline Sovereign stack unchanged when Chat is disabled.
- Runtime-owned companion-app configuration for Chat public URL, auth audience,
  availability, icon, and return URL.
- Desktop sidebar and mobile navigation entry, hidden when Chat is disabled.
- Operator documentation for `app.example.com`, `auth.example.com`,
  `chat.example.com`, and optional `relay.example.com` topology.

**Dependencies:** Task 23.1.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Deployment topology and Runtime integration.

**Review checklist:**

- Chat is not registered as a plugin or generated runtime route.
- Chat disabled leaves existing runtime, auth, and Compose behavior unchanged.
- Runtime-varying URLs are not compiled through `NEXT_PUBLIC_*` variables.
- Chat data and migrations do not use the platform DB.
- Sidebar and mobile entries start a launch flow and have a route back to the
  runtime.
- Docker, ports, env vars, health checks, and writable paths are documented.

#### 📋 23.3 — Sovereign Chat Launch Profile and cookie boundary

**Goal:** Let an authenticated Sovereign user enter Chat through a narrow,
one-time authorization flow without forwarding or sharing the Sovereign session.

**Deliverables:**

- Registered Chat client and exact redirect URI configuration in `apps/auth`.
- Authorization-code flow with random state, PKCE, audience binding, maximum
  60-second code lifetime, one-time consumption, and replay tests.
- Minimal Chat account assertion containing an opaque subject, issuer,
  `instanceId`, tenant context where required, expiry, and scoped actions.
- Back-channel code redemption and a host-only Chat session.
- Migration from parent-domain auth cookies to a host-only/proxy architecture so
  `chat.example.com` never receives runtime or auth cookies.
- Launch, logout, account-deactivation, refresh, denial, and outage semantics.
- Exact-origin CORS, CSRF, redirect, and return-URL enforcement.
- Auth and deployment documentation plus security-focused integration tests.

**Dependencies:** Task 23.2; existing Sovereign auth and MFA behavior.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Sovereign Chat Launch Profile and Origin, cookie, CSP, and storage boundaries.

**Review checklist:**

- Chat cannot read a Sovereign session cookie.
- A launch code is single-use, short-lived, PKCE-bound, and audience-bound.
- Launch assertions cannot authenticate peer connections or decrypt messages.
- Arbitrary redirects and wildcard credentialed CORS are rejected.
- Account deactivation prevents new Chat launches within the documented bound.
- Existing runtime login, logout, passkey, and session flows remain covered.

#### 📋 23.4 — Chat identity, addresses, and instance discovery

**Goal:** Provision a separate cryptographic Chat identity and resolve
Matrix-style addresses without exposing auth database identifiers or email.

**Deliverables:**

- Immutable opaque Chat ID and normalized handle/address model, such as
  `@alice:example.com`.
- Locally generated Chat identity key and proof-of-possession enrollment.
- Issuer credential binding instance, opaque Chat subject, address, identity
  public key, purpose, issue time, expiry, and status reference.
- Issuer signing-key rotation and signed/cacheable credential status mechanism.
- `/.well-known/sovereign-chat` discovery document with versioning and
  `instanceId` binding.
- Exact-address resolution with opt-in discoverability and enumeration controls.
- Opaque single-use invite flow for users who are not publicly discoverable.
- Handle rename, redirect, reservation, deletion, and non-reuse policy.
- Contact-card and safety-number primitives anchored to the identity key.

**Dependencies:** Task 23.3; RFC 0039 stable instance identity.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Identity hierarchy; Address provisioning and privacy; Instance and address
discovery.

**Review checklist:**

- Auth user IDs and email addresses are absent from public Chat credentials.
- Identity private keys are generated client-side and never reach the issuer.
- Credential presentation requires proof of private-key possession.
- Handle changes do not silently replace contact identity.
- Domain plus `instanceId` replacement creates a visible trust event.
- Exact lookup cannot be expanded into unrestricted directory enumeration.

#### 📋 23.5 — Device enrollment, recovery, and revocation

**Goal:** Support multiple user devices and loss recovery without allowing the
auth server or operator to impersonate an existing verified Chat identity.

**Deliverables:**

- Per-device signing/key-agreement keys stored in browser-encrypted or OS secure
  storage as available.
- Existing-device authorization using QR or short authentication codes.
- Identity-key-signed device certificates and device list reconciliation.
- Recovery-secret encrypted identity package with explicit data-loss warnings.
- Device rename, last-used display, revocation, and compromised-device flow.
- Signed device-revocation records distributed through directory and transport
  status channels.
- Lost-all-devices identity replacement flow that preserves the address only
  with a visible identity-change event.
- Tests for concurrent enrollment, stale devices, replay, recovery failure, and
  identity replacement.

**Dependencies:** Task 23.4; coordinate with RFC 0060 recovery UX and native
secure-storage capabilities from Epics 17 and 20.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Device enrollment and peer authentication; Multi-device recovery and revocation.

**Review checklist:**

- Adding a device requires an existing device or recovery material.
- Sovereign password reset alone cannot recover Chat keys or history.
- Operator escrow is absent by default.
- Device addition preserves the contact safety number when the identity key is
  unchanged.
- Identity replacement warns every previously connected contact.
- Revoked devices cannot establish new authenticated sessions after the defined
  propagation bound.

#### 📋 23.6 — Veilid transport adapter and signed route discovery

**Goal:** Implement the selected Veilid direct or gateway-assisted transport
behind a replaceable Chat-owned interface.

**Deliverables:**

- Versioned internal `ChatTransport` contract for route publication,
  resolution, envelope send/receive, cancellation, receipts, and errors.
- Veilid adapter selected by Task 23.1 for web and/or native clients.
- Signed, expiring route records bound to device identity.
- Direct-to-routed fallback, reconnect, backoff, duplicate suppression, and
  network-change handling.
- Optional browser gateway that forwards opaque envelopes without terminating
  identity or message encryption.
- Connection-mode diagnostics that distinguish direct, routed, offline, and
  unavailable states.
- Integration tests across process boundaries and representative NAT/network
  conditions.

**Dependencies:** Task 23.1, Task 23.2, Task 23.4.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Meaning of peer-to-peer and Veilid transport boundary.

**Review checklist:**

- The transport contract belongs to Chat, not `@sovereignfs/sdk`.
- Route records reject tampering, expiry, replay, and device-key mismatch.
- Gateway compromise cannot mint identities or decrypt envelopes.
- Direct failure falls back predictably without losing or duplicating messages.
- Diagnostics do not describe routed E2EE as insecure.
- Transport replacement does not require Chat identity migration.

#### 📋 23.7 — One-to-one E2EE messaging MVP

**Goal:** Deliver same-instance one-to-one messaging with audited asynchronous
E2EE and authenticated peer identity.

**Deliverables:**

- Integration of the one-to-one E2EE implementation selected by Task 23.1.
- Authenticated asynchronous session establishment and prekey lifecycle.
- Forward secrecy, post-compromise security, replay/reordering handling, and
  explicit protocol/cipher-suite negotiation.
- Multi-device send fan-out and per-device receive state.
- Encrypted message bodies, reactions, edits, replies, deletes, and sensitive
  metadata included in MVP scope.
- Local conversation storage encrypted at rest with versioned migrations.
- Sent, delivered-to-device, failed, and opt-in read-receipt states.
- Conversation, contact verification, key-change, offline, retry, and error UI.
- Protocol test vectors, negative tests, deterministic test peers, and downgrade
  tests.

**Dependencies:** Task 23.5, Task 23.6.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Message encryption and UI flows.

**Review checklist:**

- Runtime, auth, Chat server, gateway, and operator cannot decrypt messages.
- Message keys are not derived from passwords, sessions, issuer secrets, or
  transport keys.
- Unknown identity changes block or prominently warn before sending.
- Replayed and downgraded handshakes fail closed.
- Multi-device delivery neither omits active devices nor leaks plaintext to the
  fan-out service.
- End-to-end tests assert server-side storage contains ciphertext only.

#### 📋 23.8 — Encrypted offline delivery, attachments, and notifications

**Goal:** Make messaging practical when peers are not simultaneously online
without granting mailbox, object storage, push, or runtime services access to
content.

**Deliverables:**

- Recipient-selected encrypted mailbox with opaque destination tokens,
  per-device envelopes, quotas, bounded retention, and authenticated deletion.
- Idempotent retrieval, acknowledgement, expiry, and duplicate suppression.
- Encrypted attachment upload/download with random per-object keys, encrypted
  manifests, size limits, resumable failure behavior, and cleanup.
- Padding or size buckets where supported by measured resource constraints.
- Push wake-up notifications containing no sender, room, message text, or
  attachment metadata.
- Optional coarse unread-count bridge to the runtime, disabled by default and
  protected by dedicated short-lived authorization.
- Operator storage-health and abuse controls based on quotas and routing
  envelopes rather than plaintext inspection.

**Dependencies:** Task 23.7; storage backend selected in Task 23.2.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Offline delivery and retention; Runtime integration.

**Review checklist:**

- Offline envelopes and attachments are ciphertext before upload.
- Mailbox records do not contain plaintext Chat addresses when opaque routing is
  technically available.
- Retention, quotas, deletion, and disabled-mailbox behavior are tested.
- Push payloads reveal no message or contact content.
- Delivery receipts do not imply that a human read the message.
- Expired and acknowledged objects are removed idempotently.

#### 📋 23.9 — Same-instance release hardening, portability, and deletion

**Goal:** Establish the release gate for same-instance one-to-one Chat through
portable data, complete deletion semantics, operational coverage, and an
independent security assessment.

**Deliverables:**

- Export of identity metadata, contacts, encrypted conversations, attachments,
  protocol versions, and deliberately included recovery material.
- Import/restore with identity-continuity checks and explicit collision handling.
- Sovereign account-deletion handoff that revokes refresh and deletes Chat-owned
  server data idempotently.
- Clear documentation that deletion cannot erase content already delivered to
  another user's device.
- Backup, restore, upgrade, rollback, key-rotation, retention, monitoring, and
  incident-response runbooks.
- Reproducible web builds, controlled service-worker updates, signed native
  artifacts, and documented client-code integrity limitations.
- Abuse controls for launches, lookup, invites, route publication, mailboxes,
  attachments, and resource exhaustion.
- Desktop/mobile browser and installed-PWA real-device validation.
- Independent cryptographic and application-security review with resolved
  release-blocking findings.

**Dependencies:** Task 23.8; RFC 0064 backup principles where applicable.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md), Data
ownership, export, and deletion; Security requirements.

**Review checklist:**

- Export and backup artifacts do not introduce new plaintext copies.
- Restore cannot silently bind history to a different identity key.
- Account deletion revokes future launches and removes server-owned Chat data.
- Browser/PWA behavior is verified on real iOS and Android devices.
- No unresolved critical or high-severity audit finding remains.
- Operators can diagnose health without access to message content or contact
  graphs.
- Documentation does not claim protection from a web origin serving malicious
  replacement client code.

#### 📋 23.10 — Cross-instance federation and trust policy

**Goal:** Enable secure communication between independently operated Sovereign
instances while making issuer and identity changes visible to users.

**Deliverables:**

- Cross-instance discovery and exact-address resolution using the RFC 0066
  well-known document.
- Domain, `instanceId`, issuer-key, credential-status, and identity-key pinning.
- Issuer signing-key rotation and instance migration/recovery procedures.
- Operator policies for local-only, allowlisted, and open federation modes.
- Explicit user approval for unknown issuers where policy requires it.
- Federated invite, contact verification, block, report, and failure flows.
- Interoperability fixtures with multiple independently configured instances.
- Federation abuse limits that do not require message plaintext.

**Dependencies:** Task 23.9.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Cross-instance federation and trust.

**Review checklist:**

- Same-instance behavior remains functional when federation is disabled.
- Unexpected domain, instance, issuer, or identity replacement is visible and
  fails closed where trust cannot be established.
- Issuer trust is not presented as human identity verification.
- Federation does not require a central Sovereign-operated directory.
- Interoperability tests cover key rotation, expiry, revocation, and outages.
- Unknown instances cannot bypass local contact or abuse policy.

#### 📋 23.11 — Group messaging and membership security

**Goal:** Add E2EE group conversations using the audited group protocol selected
by Task 23.1, with explicit membership and epoch transitions.

**Deliverables:**

- Group creation, invitation, join, leave, removal, role, and deletion flows.
- Audited group-key protocol integration, expected to use Messaging Layer
  Security unless Task 23.1 selects a better-supported equivalent.
- Multi-device membership and key-update behavior.
- Membership history and visible security events for additions, removals, and
  identity changes.
- Encrypted group metadata, message content, reactions, edits, attachments, and
  read-receipt policy.
- Stale epoch, removed-member, concurrent-change, replay, and downgrade tests.
- Group size and resource limits based on measured client performance.

**Dependencies:** Task 23.9; Task 23.10 only for cross-instance group members.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md),
Message encryption and Adoption path.

**Review checklist:**

- Removed members cannot decrypt messages from later group epochs.
- Group membership changes are authenticated and visible.
- The implementation uses a maintained protocol library, not custom group
  cryptography.
- Concurrent membership changes converge or fail with a recoverable state.
- Group metadata receives the same privacy treatment as message content.
- Same-instance groups do not depend on federation being enabled.

#### 📋 23.12 — Native transport and background delivery adapters

**Goal:** Use native networking, secure storage, and background capabilities in
desktop and mobile Chat clients without changing identity, envelope, or E2EE
contracts.

**Deliverables:**

- Desktop and mobile Chat client placement decision: dedicated companion clients
  or integration into the existing Sovereign shells.
- Native Veilid transport adapters where Task 23.1 shows a material advantage
  over the browser gateway.
- OS secure storage for identity, device, and local database wrapping keys.
- Deep-link handling for Chat addresses, invites, and device enrollment.
- Background receive/wake strategy within iOS, Android, macOS, Windows, and Linux
  platform limits.
- Native notification routing with content privacy preserved.
- Migration and interoperability tests between browser, installed PWA, desktop,
  and mobile devices.
- Store/privacy declarations and operator/user documentation.

**Dependencies:** Task 23.9; Epic 17 desktop and Epic 20 mobile foundations.

**SRS reference:** [RFC 0066](../rfcs/0066-sovereign-chat-p2p-identity.md), Veilid
transport boundary and Adoption path.

**Review checklist:**

- Native adapters use the same Chat identity and E2EE envelope formats as web.
- Private keys use OS secure storage where available.
- Deep links cannot enroll devices or accept contacts without user confirmation.
- Background limitations and delayed-delivery states are represented honestly.
- Push notifications do not expose message content by default.
- A user can communicate across mixed web, desktop, and mobile devices.

## Delivery phases

| Phase                       | Tasks       | Exit condition                                                    |
| --------------------------- | ----------- | ----------------------------------------------------------------- |
| Architecture validation     | 23.1        | Protocol, transport, metadata, and repository decisions recorded  |
| Platform and identity       | 23.2–23.5   | Launch, address, identity, device, and recovery flows complete    |
| Same-instance messaging MVP | 23.6–23.8   | One-to-one online/offline E2EE works across supported web clients |
| Same-instance release gate  | 23.9        | Portability, operations, real-device QA, and security review pass |
| Federation and groups       | 23.10–23.11 | Cross-instance and group trust semantics pass interoperability QA |
| Native optimization         | 23.12       | Native adapters interoperate without protocol forks               |

## Related RFCs

- [RFC 0066 — Sovereign Chat companion app, peer identity, and P2P transport](../rfcs/0066-sovereign-chat-p2p-identity.md)
- [RFC 0060 — Client-side encryption core](../rfcs/0060-client-side-encryption-core.md)
- [RFC 0039 — Instance ID and terminology](../rfcs/0039-instance-id-and-terminology.md)
- [RFC 0012 — Passkeys and TOTP multi-factor auth](../rfcs/0012-passkeys-and-mfa.md)
- [RFC 0041 — User directory and member selection SDK](../rfcs/0041-user-directory.md)
- [RFC 0058 — Native mobile app shell](../rfcs/0058-native-mobile-app-shell.md)

## Related Docs

- [architecture-rules.md](../architecture-rules.md)
- [security.md](../security.md)
- [self-hosting.md](../self-hosting.md)
- [pwa-real-device-testing.md](../pwa-real-device-testing.md)

## Cross-references

- Epic 1 (Users & Auth) owns the Sovereign account and session used only to
  authorize the Chat launch and identity credential lifecycle.
- Epic 2 (Platform Shell) owns companion-app navigation and runtime chrome.
- Epic 8 (Data Sovereignty) provides related recovery, backup, export, and
  deletion principles but does not own Chat message storage.
- Epics 17 and 20 provide desktop and mobile shell capabilities that native Chat
  adapters may consume.
