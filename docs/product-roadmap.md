---
title: Product roadmap
description: See Sovereign's product direction by outcome, without confusing plans with shipped features.
aside: false
---

# Product roadmap

This page describes product direction, not a delivery guarantee. Horizons can
change as designs are reviewed and implementation constraints become clearer.
For technical proposals, use the [RFC index](/rfcs/README). Contributors can use
the source repository's `ROADMAP.md` and `epics/` for canonical engineering task
status. This page intentionally summarizes outcomes instead of duplicating that
queue.

## Available now

- A self-hostable, multi-user workspace runtime.
- Shared authentication, account security, and administrative controls.
- Launcher, Account, Inbox, and Console workspace apps.
- A first-party app catalogue composed with the platform: Kanban, Ledger,
  Plainwrite, Sheets, Shopper, Tally, Tasks, and Travellog.
- Warden, a built-in personal AI assistant that each user points at their own
  model provider.
- A native desktop application that loads a self-hosted instance.
- A plugin SDK boundary, app-scoped databases, and shared design system.
- Opt-in client-side encryption for apps that adopt it, and operator-configured
  field-level encryption — not whole-database encryption at rest.
- Docker and non-Docker deployment guidance.

## Being built

- Stronger operator backup, recovery, and data-control workflows.
- Broader plugin capabilities for storage, jobs, events, tools, and external
  connections.
- More complete device and installed-app experiences.
- Sovereign Wallet Phase 1 for loyalty and membership card workflows, and
  Sovereign Docs as a document workspace.
- A native mobile application, verified against real instances but not yet
  released through the app stores.
- Clearer user, operator, and app-developer documentation.

## Next

- Easier production operation and upgrade confidence.
- A more discoverable app ecosystem and compatibility story.
- Richer controls for groups and app access.
- Additional privacy-preserving platform services for apps.

## Later

- More complete portability between compatible Sovereign deployments.

## Exploring

- Encryption at rest for the bulk of the data model, after a single-key
  whole-database approach was tried and withdrawn.
- Peer-to-peer chat with separate chat identity and transport.
- Assistant orchestration beyond single conversations, and local inference as a
  default rather than an operator add-on.

**Exploring does not mean committed.** Draft RFCs are design inputs and may be
changed, phased, or withdrawn.
