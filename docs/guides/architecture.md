---
title: Architecture and security
description: Understand Sovereign's runtime boundaries, trust model, and technical decisions.
---

# Architecture and security

Use these documents to evaluate how Sovereign works and where its trust
boundaries sit. This page is an index: the architecture reference describes the
implemented system, architecture rules are normative for contributors, and RFCs
record proposals and decisions.

- [Architecture overview](/architecture)
- [Security model](/security)
- [Architecture rules](/architecture-rules)
- [Sovereign requirements and design record](https://github.com/sovereignfs/sovereign/blob/main/docs/sovereign-proposal-plan-srs.md)
- [RFC index](/rfcs/README)

The runtime is self-hostable and plugin-first, but a conventional instance is
not trustless. Users trust the instance operator, and plugins access the host
only through supported contracts and declared capabilities.
