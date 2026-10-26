# Epic 3: Mail

> How core sends email: SMTP configuration, delivery and templates. Phase 2
> adds a mail API for apps on top.

## Status

📋 Planned

## Overview

Phase 1 needs mail for invitations, verification, password resets, "account
created" and MFA-reset notices. `packages/mailer` (imported) is adapted into a
consumer package with an SMTP transport and a transport tests can read.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.12, §3.14

## Tasks

#### 📋 3.1 — Mail delivery and SMTP configuration

**Goal:** Core can send mail through SMTP configured by environment variables
or the Console.

**Deliverables:**

- `packages/mailer`: an SMTP transport and an in-memory transport for tests
- SMTP from `SV_SMTP_*`, overridden by Console values (1.4), the password
  stored encrypted (1.3)
- A start-up warning when SMTP is not configured; flows that need mail fail
  with a clear message, never silently

**Dependencies:** 1.3, 1.4

**Spec reference:** §3.12, §3.14

**Review checklist:**

- With no SMTP, start-up warns and a mail-dependent flow reports the problem
- A test reads a sent message from the in-memory transport

#### 📋 3.2 — Templates

**Goal:** Every email core sends uses a branded default template.

**Deliverables:**

- English templates for invitation, email verification, password reset,
  account created and MFA reset, each with HTML and plain text
- Branding from the instance name and logo

**Dependencies:** 3.1

**Spec reference:** §3.14

**Review checklist:**

- Each template renders with and without a logo
- Links in each template point at core's public URL (`SV_URL`)
