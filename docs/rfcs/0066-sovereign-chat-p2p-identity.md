---
rfc: 0066
title: Sovereign Chat companion app, peer identity, and P2P transport
status: Draft
date: July 2026
author: kasunben
scope: >
  runtime, apps/auth, new chat companion app, optional relay service, deployment,
  docs; builds on RFC 0008, RFC 0012, RFC 0039, RFC 0041, RFC 0053, and RFC 0060
incorporated_into_plan: 'Yes - epic tasks 23.1-23.12; roadmap slots deferred'
---

# RFC 0066 - Sovereign Chat Companion App, Peer Identity, and P2P Transport

## Summary

Create Sovereign Chat as an independently deployed companion app rather than a
plugin composed into the Sovereign runtime. A typical deployment uses
`app.example.com` for the Sovereign runtime, `auth.example.com` for account
authentication, `chat.example.com` for the chat client and service, and,
only when required, `relay.example.com` for Veilid connectivity, rendezvous, or
encrypted offline delivery. All domains in this RFC are illustrative; Sovereign
does not own or depend on `example.com`.

Sovereign authentication bootstraps a separate chat identity such as
`@alice:example.com`. The auth service certifies the relationship between a
Sovereign account and a chat identity key, but it does not hold that private key,
authenticate individual messages, or derive conversation keys. Devices
authenticate one another using locally generated keys and exchange end-to-end
encrypted messages over direct or routed peer-to-peer connections. Relay and
offline mailbox services handle ciphertext only.

The runtime exposes Chat as a first-class sidebar and mobile-navigation entry,
while deployment, data, sessions, keys, and failure boundaries remain separate.

## Motivation

Chat has substantially different security and operational requirements from a
normal Sovereign plugin:

- long-lived network connections and peer discovery;
- end-to-end encryption and multi-device key management;
- optional cross-instance communication;
- offline message delivery;
- native or browser-specific networking constraints;
- a threat model in which the runtime, auth server, chat server, and operator
  must not be able to read messages.

Composing Chat into the runtime would blur those boundaries. It would also make
the plugin SDK and platform database responsible for a networking system whose
lifecycle, storage, and security model are independent from ordinary apps.

At the same time, requiring users to create an unrelated Chat account would make
the product feel fragmented. Sovereign should remain the account authority and
entry point while Chat establishes a separate, cryptographically verifiable
identity for peer communication.

## Goals and non-goals

### Goals

- Make Chat feel integrated into Sovereign without running it inside the plugin
  runtime.
- Give each user a human-readable, instance-qualified chat address.
- Keep account authentication separate from peer and message authentication.
- Support direct P2P, routed P2P, and encrypted store-and-forward delivery.
- Prevent the Sovereign runtime, auth service, chat service, and relay from
  decrypting message content.
- Support multiple devices, key-change visibility, revocation, export, and
  deletion from the initial design.
- Allow the transport implementation to evolve without changing chat identity
  or encrypted message formats.

### Non-goals

- Selecting a final Veilid integration or cryptographic library without a
  feasibility prototype and security review.
- Claiming that every browser can establish a direct socket to every peer.
- Hiding routing metadata that the chosen network necessarily exposes.
- Defining public rooms, moderation policy, bridges, bots, or Matrix protocol
  compatibility in the first version.
- Adding Chat to the plugin SDK or storing chat records in the platform DB.
- Scheduling implementation work in the roadmap through this RFC alone.

## Threat model

The design protects message content and conversation keys from:

- a curious or compromised Sovereign operator;
- a compromised runtime, auth service, Chat backend/API, relay, database, or
  backup that cannot replace the client application code;
- a network observer that cannot compromise an endpoint;
- a relay that stores or forwards encrypted envelopes;
- an issuer attempting to impersonate an existing device using only a Sovereign
  account session.

The design does not protect plaintext on an unlocked, compromised endpoint. A
web origin that can serve modified Chat JavaScript can also exfiltrate keys or
plaintext after the next application load; ordinary browser E2EE cannot treat
its code-delivery origin as fully untrusted. Reproducible builds, strict CSP,
controlled service-worker updates, signed native clients, and independently
verifiable release artifacts reduce this risk but do not remove it for the web
client.

The design also cannot eliminate all metadata. Depending on the selected
transport, a relay or network participant may observe IP addresses, timing,
message sizes, route identifiers, or availability. Metadata collection and
retention must be documented after the transport prototype.

Authentication-server compromise remains significant: an attacker may issue a
new account credential or suppress revocation information. It must not be enough
to forge an existing device signature, derive historical conversation keys, or
silently preserve an existing verified safety number after an identity-key
replacement.

## Current state (what this builds on)

- The runtime and auth server are already separate applications. Auth is backed
  by better-auth and configured with an explicit base URL and trusted origins
  (`apps/auth/src/auth.ts:11-22`).
- Current production deployments may share auth cookies across subdomains
  (`apps/auth/src/env.ts:20-26`). Chat must not receive or depend on those shared
  cookies.
- The auth service supports passwords, TOTP, backup codes, and passkeys
  (`apps/auth/src/auth.ts:149-162`; RFC 0012). These factors authenticate the
  Sovereign account, not chat messages.
- Every Sovereign installation already has a stable random `instanceId`
  (`packages/db/src/platform-db.ts:45-53`, `packages/sdk/src/types.ts:76-81`).
  It can distinguish issuers with the same display domain after restore or
  reconfiguration.
- The desktop shell builds its sidebar from installed plugin metadata and user
  preferences (`runtime/app/(platform)/layout.tsx:43-109`). There is no companion
  app registration model or external sidebar destination today.
- RFC 0041 defines a privacy-limited directory for users on one instance. It is
  not a public federated address directory.
- RFC 0053 defines short-lived, signed plugin flow handoffs. Its replay and
  audience-binding principles are reusable, but a companion-app login is not a
  plugin-to-plugin handoff and needs a separate auth-owned protocol.
- RFC 0060 defines client-side encrypted objects and recovery concepts. Chat
  requires a distinct peer identity and conversation-key protocol, but should
  reuse compatible recovery UX and encrypted local-storage primitives where
  practical.

## Proposed design

### Deployment topology

The logical services are:

| Example origin              | Responsibility                                                        |
| --------------------------- | --------------------------------------------------------------------- |
| `https://app.example.com`   | Sovereign runtime, sidebar entry, instance administration             |
| `https://auth.example.com`  | Sovereign account authentication and chat identity certification      |
| `https://chat.example.com`  | Chat web app, local-key UX, encrypted message model, contact UI       |
| `https://relay.example.com` | Optional network bridge, rendezvous, and ciphertext mailbox functions |

The exact hostnames are operator-configurable. Chat and relay deploy
independently from the runtime and auth service. The relay is optional as a
logical role: a native client may connect to Veilid directly, while a browser
client may require a gateway or a different transport adapter.

`relay` is only the correct product name when the service actually forwards or
stores application envelopes. A service that only exposes a Veilid routing node
or browser bridge should use a role-specific name such as `network` or `veilid`
in deployment documentation.

### Meaning of peer-to-peer

P2P is a property of message authority and delivery, not the absence of all
infrastructure. Sovereign Chat supports three delivery modes:

| Mode                  | Path                                  | Server role                            |
| --------------------- | ------------------------------------- | -------------------------------------- |
| Direct P2P            | Alice device to Bob device            | Discovery and NAT assistance only      |
| Routed P2P            | Alice through network nodes to Bob    | Forwards opaque ciphertext             |
| Offline store-forward | Alice to mailbox, then mailbox to Bob | Temporarily stores encrypted envelopes |

In every mode, endpoints perform authenticated key agreement and end-to-end
encryption. Neither `chat.example.com` nor `relay.example.com` is a message
authority. The UI may report connection mode for diagnostics, but must not imply
that routed delivery is unencrypted or that a direct path is always available.

True asynchronous delivery requires storage somewhere when no recipient device
is online. The first practical implementation should support a bounded-retention
encrypted mailbox while permitting users or operators to disable it and require
simultaneous online delivery.

### Identity hierarchy

Chat identity has four layers:

```text
Sovereign account (authentication and eligibility)
  -> chat identity (stable internal ID and human-readable address)
       -> chat identity key (persistent contact continuity)
            -> device keys (laptop, phone, tablet)
                 -> conversation and message keys
```

Each layer has a separate purpose:

- The Sovereign account proves that a user is eligible to create and refresh a
  Chat identity for an instance.
- The internal Chat ID is immutable and opaque. It must not be the auth DB user
  ID or email address.
- The human-readable address, for example `@alice:example.com`, is an alias and
  federation locator. A handle rename does not create a new cryptographic
  identity.
- The chat identity key is generated on a user device. It signs device
  enrollment and rotation statements but is not used as a general web login
  credential.
- Device keys prove which enrolled endpoint is participating in a handshake.
- Conversation keys are established by an audited E2EE protocol and are not
  derived from Sovereign passwords, sessions, or issuer secrets.

The public address is intentionally similar to Matrix because it communicates a
user and an issuing domain. It does not imply Matrix protocol compatibility or a
homeserver-mediated message path.

### Address provisioning and privacy

The default address format is:

```text
@<handle>:<instance-domain>
```

For example, Alice on the illustrative `example.com` deployment is
`@alice:example.com` even when the app is hosted at `chat.example.com`. The
instance domain represents the identity authority; the chat deployment hostname
is replaceable infrastructure.

Provisioning creates:

- an immutable random internal Chat ID;
- a unique normalized handle within the instance;
- a current address alias;
- a chat identity public key binding;
- an issuer credential and its status record.

Handles must not be recycled immediately. Rename and deletion policy must prevent
an old contact address from silently resolving to an unrelated identity. A
deployment may reserve old handles permanently or publish a time-bounded signed
redirect to the new address.

Public address lookup is opt-in. An operator can permit exact-address lookup
without enabling enumeration or fuzzy search. Users who do not want a stable
public address can exchange opaque, single-use invite links that reveal the Chat
identity only after acceptance. A later version may add pairwise contact
identifiers for stronger resistance to cross-context correlation.

### Instance and address discovery

An instance that participates in federation publishes:

```text
https://example.com/.well-known/sovereign-chat
```

An illustrative document is:

```json
{
  "version": 1,
  "instanceId": "550e8400-e29b-41d4-a716-446655440000",
  "issuer": "https://auth.example.com",
  "directory": "https://chat.example.com/.well-known/directory",
  "network": {
    "transport": "veilid",
    "bootstrap": ["https://relay.example.com"]
  },
  "verificationKeys": "https://auth.example.com/.well-known/chat-keys.json"
}
```

Discovery metadata is public, versioned, cacheable, and signed or anchored by
HTTPS plus rotating issuer keys. Clients pin the `instanceId` with the domain so
that restoring a different instance at the same hostname is visible rather than
silently inheriting the old identity.

The directory resolves an exact Chat address or invite; it is not required to
serve presence, message history, or plaintext profiles. Its response binds the
address, internal Chat ID, identity public key, credential status, and a signed
network route record.

### Sovereign Chat Launch Profile

Chat uses an auth-owned authorization-code profile rather than shared cookies or
a runtime session forwarded across origins. The profile should reuse standard
OAuth security properties even if the first implementation is deliberately
narrower than a general OAuth provider.

The launch flow is:

1. The signed-in user selects Chat in the Sovereign sidebar.
2. The runtime starts an authorization request at `auth.example.com`, including
   a registered chat client ID, exact redirect URI, random `state`, PKCE
   challenge, and the audience `sovereign-chat`.
3. Auth uses the existing Sovereign session and any policy checks to authorize
   the request. It returns a single-use code with a lifetime of at most 60
   seconds.
4. `chat.example.com` validates `state` and redeems the code through a back-channel
   request using the PKCE verifier.
5. Auth returns a minimal account assertion scoped to Chat. It contains an
   opaque subject, issuer, instance ID, tenant context where required, expiry,
   and allowed Chat actions. Email and profile fields are omitted unless the
   user or instance policy explicitly permits them.
6. Chat creates its own host-only, secure session. It does not copy or retain the
   Sovereign session token.
7. On first use, the client creates a chat identity key locally and requests
   certification of its public key. On later use, it unlocks an enrolled device
   or starts the device-linking flow.

Authorization codes and account assertions are not chat credentials and cannot
authenticate a peer connection. Redirect URIs are exact allowlisted values;
arbitrary return URLs are rejected. The launch profile must define logout,
account deactivation, credential refresh, and error semantics before shipping.

Current cross-subdomain auth cookies must be narrowed before Chat is deployed so
that `chat.example.com` cannot receive them. A broad `.example.com` cookie domain
would violate this boundary. The runtime/auth integration should move to
host-only cookies plus explicit proxy or authorization flows, or scope shared
cookies so the Chat origin is excluded by construction.

### Issuer credential and proof of possession

After account authorization, the auth service may issue a signed Chat identity
credential containing only the fields needed by peers:

```json
{
  "version": 1,
  "issuer": "https://auth.example.com",
  "instanceId": "550e8400-e29b-41d4-a716-446655440000",
  "subject": "chat_7f3a91",
  "address": "@alice:example.com",
  "identityKey": "ed25519:BASE64URL_PUBLIC_KEY",
  "issuedAt": 1783958400,
  "expiresAt": 1784563200,
  "capabilities": ["chat.connect"]
}
```

The final encoding and signature format are open, but the credential must be:

- signed by a discoverable, rotating issuer key;
- audience or purpose restricted to Sovereign Chat;
- short-lived enough to bound deactivation delay while tolerating temporary
  issuer outages;
- presentable with proof that the peer controls the bound identity or device
  key, so it is not a bearer token;
- free of email, role, MFA state, session identifiers, and unnecessary profile
  data;
- refreshable without replacing the chat identity key;
- versioned for federation compatibility.

The auth service certifies the account-to-identity binding. It never receives
the private chat identity key. Auth alone cannot enroll a new device under an
existing identity key, decrypt data, or preserve contact verification after a
full identity-key replacement.

### Device enrollment and peer authentication

Each installation generates a device signing/key-agreement key in platform
secure storage where available. An existing enrolled device authorizes a new
device by signing a device certificate or participating in an authenticated QR
or numeric-code flow.

During connection, peers exchange:

- issuer credentials;
- identity-key and device-key certificates;
- signed transport route records;
- ephemeral key-agreement material;
- supported protocol and cipher-suite versions.

Each peer verifies the issuer, credential status, key chain, expiry, negotiated
protocol, and proof of private-key possession. The user-facing contact state is
anchored to the chat identity key, not the current handle or auth account
session.

First contact may use trust on first use. Users can raise assurance by comparing
a safety number or scanning a QR code out of band. An identity-key change shows
a blocking or prominent warning. An issuer signature can confirm that the new
key belongs to an account, but it cannot silently restore prior user
verification.

### Message encryption

Sovereign must not design a bespoke message-encryption protocol. The
implementation task must select audited, maintained protocol libraries that
provide:

- authenticated asynchronous session establishment;
- forward secrecy and post-compromise security for one-to-one chats;
- replay, reordering, and duplicate handling;
- multi-device fan-out;
- membership and key rotation for groups;
- explicit protocol and cipher-suite versioning;
- test vectors and interoperable serialization.

A Double-Ratchet-family protocol is the expected category for one-to-one chat,
and Messaging Layer Security is the expected category for groups, but this RFC
does not lock either choice before a security review. Veilid is transport and
discovery infrastructure; it does not replace the E2EE message protocol.

Message bodies, attachment keys, reactions, edits, and sensitive metadata are
encrypted before leaving the sender. Only the minimum routing envelope needed
for delivery remains visible. Attachments use random per-object keys and an
encrypted manifest; a relay or object store receives ciphertext only.

### Veilid transport boundary

Chat defines a transport interface independent of Veilid:

```ts
interface ChatTransport {
  publishRoute(record: SignedRouteRecord): Promise<void>;
  resolveRoute(peer: ChatIdentity): Promise<SignedRouteRecord[]>;
  sendEnvelope(route: Route, envelope: Uint8Array): Promise<DeliveryReceipt>;
  receiveEnvelopes(signal: AbortSignal): AsyncIterable<Uint8Array>;
}
```

The interface is illustrative, not a committed SDK surface. It belongs to the
Chat codebase, not `@sovereignfs/sdk`.

A feasibility spike must determine whether supported browsers can use Veilid
directly with acceptable connectivity, resource use, background behavior, and
mobile constraints. If they cannot, `relay.example.com` may expose a
browser-compatible gateway. Native desktop and mobile clients may use direct
Veilid bindings while retaining the same identity, envelope, and E2EE layers.

The gateway must not terminate message encryption or mint peer identities. Its
protocol must be replaceable so a future transport does not force account or
conversation migration.

### Offline delivery and retention

When no recipient device is reachable, a sender can upload one encrypted
envelope per recipient device to a mailbox selected by the recipient. Each
envelope has an opaque destination token, size, creation time, expiry, and
ciphertext. The mailbox does not receive a plaintext Chat address or message
type when the transport can avoid it.

Required controls include:

- bounded envelope size and retention;
- quotas and abuse throttling that do not require plaintext inspection;
- authenticated deletion after receipt;
- idempotent delivery and duplicate suppression at the client;
- padding or size buckets where practical;
- operator-visible storage health without message content;
- an option to disable offline storage.

Delivery acknowledgements must not claim that a human read a message. Sent,
delivered-to-device, and read are separate states, and read receipts are opt-in.

### Multi-device recovery and revocation

Account recovery and Chat recovery are separate:

- Resetting a Sovereign password restores account access but does not reveal
  Chat private keys or historical messages.
- An enrolled device can authorize another device.
- A recovery secret may unlock an encrypted identity recovery package, following
  the principles in RFC 0060.
- Operator escrow is not enabled by default.
- If every device and recovery secret is lost, the user creates a new identity
  key. The address may remain the same, but contacts see an identity-change
  warning and old ciphertext remains unrecoverable.

Device revocations are signed by the chat identity key when possible and
published through the issuer/directory and P2P network. Account deactivation
prevents credential refresh and adds the credential to a signed status or
revocation mechanism. Clients cache status data so ordinary peer connections do
not require a live request to `auth.example.com`.

The final design must balance short credential lifetimes against offline use.
Peers must distinguish an expired credential during an issuer outage from an
explicitly revoked device.

### Cross-instance federation and trust

Cross-instance contacts resolve the address domain, fetch its discovery
document, and verify the issuer credential. Instance policy can choose one of:

- local-instance contacts only;
- an operator allowlist of federated instances;
- open federation with explicit user approval for unknown issuers.

Issuer trust establishes that an instance currently binds an address to a
public key. It does not establish that the person is who the user intended to
contact. Safety-number or QR verification remains the higher-assurance path.

Clients pin domain, `instanceId`, issuer key, and chat identity key transitions.
Unexpected replacement of any pinned value produces a visible trust event.

### Runtime integration

Chat is registered as a companion app, not as a plugin manifest or generated
runtime route. The first implementation may use explicit platform settings:

```text
CHAT_ENABLED=true
CHAT_PUBLIC_URL=https://chat.example.com
CHAT_AUTH_AUDIENCE=sovereign-chat
CHAT_RELAY_URL=https://relay.example.com   # optional
```

Final variable names are implementation decisions. Because these values vary by
deployment, the runtime must read them server-side at runtime; they must not use
`NEXT_PUBLIC_*` build-time substitution.

When enabled, the runtime adds Chat to desktop sidebar and mobile app navigation.
The destination starts the authorization flow rather than linking to a session-
accepting URL. Chat opens in the same tab by default and offers an explicit route
back to the Sovereign runtime.

Companion apps need a small platform-owned registration model if more than Chat
is introduced. It should describe display name, icon, public origin,
authorization audience, availability, and navigation placement. It must not
grant plugin SDK access or bypass normal origin boundaries.

An unread-count bridge is optional and privacy-sensitive. If implemented, it
exposes only a coarse count or boolean for the current user, uses a dedicated
short-lived authorization, and never exposes sender, room, or message content to
the runtime. Chat should own web-push payloads and notification settings unless a
later RFC defines a privacy-preserving cross-app notification contract.

### Origin, cookie, CSP, and storage boundaries

- Chat uses host-only `Secure`, `HttpOnly`, and appropriate `SameSite` session
  cookies. It does not receive runtime or auth cookies.
- Cross-origin APIs use exact origin allowlists; wildcard credentialed CORS is
  forbidden.
- Each app maintains its own strict nonce/hash-based CSP. Chat does not require
  weakening the runtime CSP.
- Launch codes never appear in logs beyond the minimum operational record and
  are removed from browser-visible URLs immediately after consumption.
- Private keys are generated and used client-side. Browser storage must use an
  encrypted wrapper and native clients should use OS secure storage.
- Chat databases, mailbox storage, attachments, and backups are operationally
  separate from the platform DB.
- The runtime and auth activity logs may record Chat launch and credential
  lifecycle events, but never contact graphs, room IDs, route records, or
  message metadata.

### Data ownership, export, and deletion

Chat owns its encrypted local and server-side data. It must provide an export
containing identity metadata, contacts, encrypted conversations, attachment
ciphertext, protocol versions, and the information needed to decrypt when the
user includes recovery material deliberately.

Sovereign account deletion triggers a signed, authenticated deletion request to
Chat and revokes future credential refresh. Deletion from a user's own services
cannot erase messages or ciphertext already delivered to another user's device.
The UI and documentation must state this limit plainly.

## Security requirements

- Sovereign sessions, passwords, MFA secrets, and auth signing secrets never
  derive chat identity, device, conversation, or attachment keys.
- A launch assertion is audience-bound, short-lived, replay-protected, and
  unusable as a peer credential.
- Chat credentials require proof of possession and contain no unnecessary
  account data.
- Identity and device private keys never leave the client in plaintext.
- The auth, chat, and relay services cannot decrypt message content.
- Identity-key replacement is visible to previously connected peers.
- Device and account revocation have signed, cacheable, testable semantics.
- Direct, routed, and offline delivery use the same E2EE envelope contract.
- Cryptographic protocols and libraries require an independent security review,
  test vectors, fuzzing where appropriate, and downgrade-resistance tests.
- Federation discovery, redirects, callback URLs, and return URLs fail closed
  against SSRF and open-redirect attacks.
- Relay abuse controls operate on quotas and routing envelopes, not plaintext
  inspection.

## UI flows

### First launch

```text
Sovereign sidebar
  -> authorize Chat at auth.example.com
  -> return to chat.example.com
  -> choose or confirm @alice:example.com
  -> create identity key locally
  -> record recovery material
  -> enter Chat
```

The recovery warning must explain that a Sovereign password reset cannot recover
encrypted history.

### Add a contact

```text
Enter @bob:other.example
  -> discover other.example
  -> resolve and verify Bob's signed identity
  -> show issuer and verification state
  -> connect over the available P2P route
  -> optionally compare a safety number or scan a QR code
```

An opaque invite follows the same flow but does not expose the identity until
the invite is accepted.

### Add a device

An existing device displays a QR code or short authentication code. The new
device proves its key, the existing device authorizes it, and contacts receive a
normal device-addition event. Adding a device must not reset the contact safety
number when the chat identity key is unchanged.

### Lost identity

If no enrolled device or recovery material remains, account authentication can
create a replacement identity key but cannot recover history. The user confirms
the destructive transition, and all contacts see an identity-change warning.

## Alternatives considered

### Build Chat as a normal Sovereign plugin

Rejected. Plugin composition is appropriate for server-mediated workspace apps,
but Chat requires independent networking, key lifecycle, cross-instance
identity, offline delivery, and possibly native transport bindings. Treating it
as a plugin would weaken both the plugin boundary and the Chat threat model.

### Use the Sovereign user ID or email as the public Chat ID

Rejected. Internal auth IDs are deployment details, and email unnecessarily
leaks personal data. Chat receives an opaque subject and provisions an immutable
Chat ID plus a user-facing alias.

### Share the Sovereign session cookie with Chat

Rejected. It expands the authority of a compromise at `chat.example.com`,
couples independent deployments, and still does not solve peer authentication.
A one-time authorization-code flow gives Chat only the authority it needs.

### Make the auth server the live verifier for every peer connection

Rejected. It makes communication availability and privacy depend on a central
service and exposes the contact graph through verification traffic. Peers verify
signed credentials and cached status data locally.

### Treat the Matrix-style address as a cryptographic identity

Rejected. Handles can change, domains can be reconfigured, and human-readable
names can be reassigned. Contact continuity is anchored to the identity key and
immutable internal Chat ID.

### Require direct device-to-device delivery only

Rejected as the default. NATs, browser restrictions, sleeping mobile devices,
and asynchronous use make direct-only delivery unreliable. Routed transport and
optional ciphertext mailboxes preserve E2EE while making the product usable.

### Let the relay terminate encryption

Rejected. This would reduce the system to transport encryption and give the
operator access to messages. The relay forwards or stores endpoint-encrypted
envelopes only.

### Invent a Sovereign message-encryption protocol

Rejected. Secure asynchronous and group messaging protocols are specialist work.
Sovereign should integrate audited protocol implementations and keep the
transport adapter replaceable.

## Open questions

1. Which audited protocol and implementation should provide one-to-one E2EE,
   multi-device sessions, and group messaging?
2. Can the supported browser matrix use Veilid directly, or is a gateway
   required? What are the measured connectivity and battery costs?
3. What signed credential encoding and status mechanism best support offline
   verification and implementation across web, desktop, and mobile clients?
4. How long should issuer credentials and offline mailbox envelopes remain
   valid by default?
5. Should identity-key recovery use a recovery secret, social/device recovery,
   or both in the first release?
6. Is exact public-address lookup opt-in per user, per instance, or both?
7. Should old handles be reserved permanently or support signed redirects?
8. Which metadata is exposed by the selected Veilid/gateway topology, and which
   mitigations are practical?
9. Should the first release permit cross-instance federation or prove the model
   with same-instance contacts first?
10. Does Chat live in this monorepo as `apps/chat`, or in an independently
    versioned repository sharing only public packages and protocol schemas?
11. Should companion-app registration become a general platform feature or stay
    as Chat-specific configuration until a second companion app exists?

## Adoption path

1. **Protocol and threat-model review:** validate identity hierarchy, recovery,
   metadata boundaries, credential format, and candidate E2EE libraries with an
   external security reviewer.
2. **Transport feasibility spike:** prototype direct and gateway-assisted Veilid
   connectivity across desktop browsers, installed PWAs, native desktop, iOS,
   Android, NATs, sleep/wake, and offline delivery.
3. **Identity prototype:** implement `example.com`-style discovery, immutable
   Chat IDs, local identity/device keys, one-time auth launch, proof-of-possession
   credentials, and safety-number verification.
4. **Same-instance MVP:** ship one-to-one encrypted chat, multi-device linking,
   encrypted attachments, bounded offline mailbox delivery, export, deletion,
   and the Sovereign sidebar/mobile entry.
5. **Federation:** enable cross-instance discovery and policy after issuer-key
   rotation, revocation, domain/instance pinning, and abuse controls pass review.
6. **Groups and native clients:** add an audited group protocol and direct native
   transport adapters without changing identity or envelope contracts.

The documentation-only RFC has no semver impact. Implementation will have
Docker, Compose, environment-variable, CSP, cookie, deployment, backup, and
operator-documentation impact. Any new public `@sovereignfs/ui` component or
companion registration API follows its package's normal semver policy. This RFC
does not add a Chat surface to `@sovereignfs/sdk`.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
