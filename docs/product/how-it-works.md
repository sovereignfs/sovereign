---
title: How Sovereign works
description: Follow the relationship between an operator, a Sovereign instance, its users, apps, and shared platform services.
aside: false
---

# How Sovereign works

Sovereign combines one operated instance with a shared workspace and installable
apps.

## 1. An operator deploys an instance

The operator installs Sovereign on infrastructure they control and configures
the public URL, database, email, storage, instance identity, and production
security settings.

## 2. The operator defines the workspace

The operator chooses how people gain access and which apps are available. The
Console provides administrative controls; the Launcher becomes the user's entry
point to installed apps.

## 3. Users sign in once

Users authenticate to that instance and enter one workspace. Their account and
security settings are available through the Account app. Access remains scoped
to the instance and its operator.

## 4. Apps use platform contracts

User-facing apps are delivered as plugins. They use the Sovereign SDK and
declared capabilities instead of importing runtime internals. Shared platform
services can cover identity, app-scoped data, UI, storage, notifications, jobs,
and other capabilities as each contract becomes available.

## 5. The operator maintains the service

The operator is responsible for TLS, secrets, email delivery, backups, upgrades,
monitoring, policies, and user support. Sovereign provides the runtime; it does
not operate the infrastructure on the operator's behalf.

## Trust boundary

```text
Users
  │ authenticate to and trust
  ▼
Sovereign instance ── operated by one person or organization
  ├── shared platform services
  ├── installed apps delivered as plugins
  └── operator-controlled database and storage
```

For implementation details, continue to the [architecture documentation](/architecture)
and [security model](/security).
