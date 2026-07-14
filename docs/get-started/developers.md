---
title: Build a Sovereign app
description: Create a plugin that uses Sovereign's shared platform foundations for a custom workflow.
---

# Build an app on Sovereign

In the user interface it is an **app**. In the architecture and source code it
is delivered as a **plugin** with a manifest and SDK boundary.

## Start with the workflow

Define the user problem before choosing platform capabilities. A focused plugin
should own its domain while using shared runtime services through supported
contracts.

## Reuse platform foundations

Available contracts include authentication context, app-scoped database access,
the workspace shell, and the shared design system. Other capabilities have their
own maturity and compatibility requirements; check the relevant documentation
instead of importing runtime internals.

## Follow the plugin path

1. Read the [plugin development guide](/plugin-development).
2. Define the plugin manifest and routes.
3. Use `@sovereignfs/sdk` for runtime capabilities.
4. Use `@sovereignfs/ui` for reusable interface components and tokens.
5. Keep user-scoped data tenant-aware and plugin tables slug-prefixed.
6. Test the plugin boundary, database behavior, UI, and access rules.
7. Validate compatibility before distribution or installation.

## Architectural rule

Plugins must not import from runtime internals. The SDK is the supported
boundary, and capabilities that are not exposed there are not available to a
plugin merely because their host implementation exists.

[Open the full developer documentation](/docs/developers)
