# Epic: Example Plugins

> A frictionless plugin on-ramp — canonical starter skeletons and capability-demo examples that double as runtime test fixtures.

## Status

✅ Complete

## Overview

Task 0.5.28 delivered three entry points to the same canonical skeleton: a GitHub template repo (`sovereign-plugin-template`), a `sv plugin new <name>` CLI command, and an `npm create @sovereignfs/plugin` initializer. Capability-demo examples (`example-basic`, `example-api`) demonstrate runtime composition, route-guard patterns, `apiProvider`, and plugin-declared capabilities (Task 0.6.1 extends `example-basic` to demo the `capabilities` manifest field). These examples also serve as fixtures for integration and E2E tests.

## Related RFCs

- [RFC 0017 — Plugin starter template & examples](../rfcs/0017-plugin-starter-and-examples.md)

## Related Docs

- [plugin-development.md — Getting started](../plugin-development.md)

## Notes

More worked examples (e.g. `example-monetized` for the monetization paywall pattern) are added alongside feature tasks — see [Monetization](monetization.md) for the post-v1 Stripe/PayPal example plugin.

## Tasks

#### ✅ 12.1 — Plugin starter template & example plugins

> Full entry: **[3.12]** in [plugins-runtime.md](plugins-runtime.md) — Plugin starter template & example plugins.
> This task delivered the GitHub template repo, `sv plugin new`, `npm create @sovereignfs/plugin`, and the `example-basic`/`example-api` capability-demo plugins.

---
