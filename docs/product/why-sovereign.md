---
title: Why Sovereign?
description: Understand the practical reasons for running shared apps on a Sovereign instance.
aside: false
---

# Why Sovereign?

Groups often rely on separate hosted services for every shared task. Each tool
brings another account, another policy, another data boundary, and another
integration to maintain. Building a custom alternative usually means rebuilding
the same platform foundations before work on the actual problem can begin.

Sovereign provides a common runtime for those apps.

## One environment for shared tools

Users enter one workspace and open the apps their operator has made available.
Identity, navigation, account controls, and platform behavior remain consistent
across those apps.

## Infrastructure chosen by the group

An operator can run Sovereign on infrastructure appropriate for the group and
choose its access, retention, backup, and upgrade policies. That creates control,
not automatic trust: the users still depend on the operator to run the instance
responsibly.

## A foundation for custom needs

When an existing app does not fit, a developer can build a Sovereign app around
the missing workflow. The runtime provides reusable contracts for identity,
app-scoped data, platform UI, and other capabilities, reducing the platform work
that would otherwise be repeated for each custom service.

## Open and inspectable

Sovereign is licensed under AGPL-3.0. Operators and developers can inspect the
source, run it themselves, adapt it, and contribute improvements upstream.

## A consistent app contract

User-facing apps are delivered as plugins. The plugin manifest and SDK define
how an app participates in the workspace and accesses approved platform
capabilities. This keeps the runtime boundary explicit instead of treating apps
as unrestricted runtime code.

[See how Sovereign works](./how-it-works)
