---
title: What is Sovereign?
description: Learn how Sovereign brings private, multi-user apps together in a workspace you control.
aside: false
---

# An open-source workspace runtime

Sovereign hosts private, multi-user apps on infrastructure you control. An
operator runs one Sovereign instance, invites the people who should use it, and
chooses which apps are available in their shared workspace.

That is useful in two ways. A group can install apps that already meet its needs,
or a developer can build a purpose-specific app without rebuilding the platform
underneath it.

## The product model

| Part          | What it means                                                                |
| ------------- | ---------------------------------------------------------------------------- |
| **Instance**  | One deployed Sovereign installation.                                         |
| **Operator**  | The person or organization responsible for infrastructure, policy, and apps. |
| **Workspace** | The environment users enter after signing in.                                |
| **App**       | A user-facing capability available in the workspace.                         |
| **Plugin**    | The technical package and contract used to deliver an app to Sovereign.      |

## What Sovereign handles

Sovereign provides a common shell and reusable platform foundations for
authentication, user sessions, app-scoped data, interface components, access
control, and other platform services. An app developer can concentrate on a
workflow rather than operating a separate authentication service, database
integration, and application shell for every tool.

Platform capabilities have different maturity levels. The [features](./features)
page distinguishes what is available from what is still being developed or
explored.

## What the operator controls

Self-hosting makes the operator responsible. The operator chooses where the
instance runs, who can join, which apps are enabled, how backups work, when
upgrades happen, and which policies apply. Users should understand and trust
their operator before placing data in an instance.

## What Sovereign is not

- It is not a hosted service operated centrally by the Sovereign project.
- It is not a fixed suite of apps; operators can choose and developers can extend
  the workspace.
- It is not peer-to-peer by default; a standard Sovereign instance is operated
  infrastructure.
- It does not remove operational responsibility or eliminate the need to trust
  the chosen operator.

## Continue exploring

- [Why Sovereign exists](./why-sovereign)
- [How an instance works](./how-it-works)
- [Review features and their status](./features)
- [See apps](./apps)
- [Choose a getting-started path](/get-started/)
