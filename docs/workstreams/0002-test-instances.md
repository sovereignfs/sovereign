# Workstream 0002 — Test instances

**Status:** ⏳ In Progress (leg 1 done)\
**Date:** November 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**Governs:** [core-app](../specs/core-app.md) §3.15.1; [operator-cli](../specs/operator-cli.md) §4.4, §6.4;
[`spec/suite.md`](../../spec/suite.md) §1.1.1; epic [13](../epics/operator-cli.md) (Operator CLI), tasks 13.20 and 13.21\
**Research:** none. The Decisions locked table below was settled with the goal owner in a planning conversation (2026-11-01), and is that
record.

---

## Goal

An operator who sets up a development or staging instance can try it at once: `sv seed` gives it an owner, an admin and an ordinary person
to sign in as, and a sample app to sign in from, and the same code serves `pnpm seed` on a development machine. A production instance can
never be seeded, whatever is typed, because core is told what the instance is for and two separate checks refuse it. The mail a seeded
account would need is Mailpit's, which already exists (`sv mail`).

## Definition of done

- [x] `13.20` — Core knows what the instance is for
- [ ] `13.21` — Seeding development and staging instances
- [ ] operator-cli §13 item 17 holds, shown by a test and by a run on a development instance and a staging one

## Decisions locked

| Decision       | Choice                                                                                                                                                                          | Rejected alternative and why                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where it runs  | Both: `pnpm seed` on a development machine, and `sv seed` on a deployed development or staging instance                                                                         | Local only: a staging server could not be tried without making accounts by hand; deployed only: a developer's machine would need a server                                                                                                        |
| How core knows | `SV_ENVIRONMENT`, set by `sv apply` from `environment` in `suite.yml`, `production` when unset, any other value a start-up error                                                | Inferring it from `NODE_ENV` or the address: neither says what an instance is for, and `NODE_ENV` is `production` in every image. A flag on the command line: it would be the operator typing the permission, which is what must not be possible |
| The two checks | `sv seed` refuses on production before connecting, and core refuses on its own: when the environment is not development or staging, and separately when any real account exists | One check: a wrong variable would seed a real instance, or a hand-made instance could be seeded by setting one. Legacy used two independent checks for the same reason                                                                           |
| Passwords      | Development: one documented password. Staging: random, at least 24 characters, per account, shown once                                                                          | One documented password everywhere: a staging server may be public, and a published password would be a way in. Letting the operator choose on staging: it could be weak, and it would have to be passed on a command line                       |
| Content        | Three accounts (owner, admin, user) at `@sovereign.local` and one public sample app                                                                                             | More (notifications, instance settings, a pending invitation): offered, and not chosen. Nothing stops a later task adding them to the same command                                                                                               |
| The sample app | A public client (PKCE, so no secret exists to leak), made through the registry as the system actor                                                                              | A confidential client: its secret would have to be shown once and kept                                                                                                                                                                           |
| Who may run it | The operator alone: the deployment key cannot, and a runner never sees a seeded password                                                                                        | A GitHub command: a runner has no reason to seed, and the output holds passwords                                                                                                                                                                 |
| Governance     | No new RFC; it extends RFC 0002's `sovereign-admin` and the spec is the source of truth                                                                                         | A new RFC: no design question is open beyond those settled here                                                                                                                                                                                  |
| Execution      | Legs: one branch, one draft PR, one review gate each                                                                                                                            | One PR for both: core's setting and the command are separately reviewable                                                                                                                                                                        |

## Prerequisites

- **Toolkit 0.3.0 published** (done): `environment` in `suite.yml` and Mailpit exist.
- **A development instance to try it on:** the container server used for the operator workflow
  ([workstream 0001](0001-operator-workflow.md), leg 1) is enough, and the seed needs no mail server.

## Legs

| Leg | Name                       | Epic tasks | Gate? | Done when                     |
| --- | -------------------------- | ---------- | ----- | ----------------------------- |
| 1   | Core knows its environment | `13.20`    | No    | 13.20 ✅, reviewed and merged |
| 2   | The seed                   | `13.21`    | No    | 13.21 ✅, reviewed and merged |

Leg 2 needs leg 1. Releasing the toolkit and core after leg 2 lets `sv seed` be run against a published image.

## Leg detail

### Leg 1 — Core knows its environment

**Epic tasks:** `13.20`

**Why here:** nothing may be refused on production until core can tell it is.

**Technical notes:** core's settings are in `apps/core/src/config.ts`, with `apps/core/.env.example` declaring every variable (a test holds
the two together). The names the deployment provides, which `core.env` may not set, are a pattern in
`spec/schemas/suite-v1.schema.json` and the list in `spec/suite.md` §1.2, held together by `scripts/__tests__/operator-specs.test.ts`:
`SV_ENVIRONMENT` goes in both, or that test fails. `coreEnvironment` in `tools/cli/src/apply/render.ts` is where `sv apply` builds core's
variables, and `environmentOf` in `tools/cli/src/suite/environment.ts` already reads the field. The image takes the new variable with no
Dockerfile change, but a core release is needed before `sv apply` can pass it to a published image, since an older core would ignore it.

**Do not proceed if:** a published core that does not know `SV_ENVIRONMENT` would refuse to start when given it: check that an unknown
variable is ignored, or release core first.

### Leg 2 — The seed

**Epic tasks:** `13.21`

**Why here:** it is the thing the setting is for.

**Technical notes:** the seed today is `apps/core/src/dev/seed.ts` with `apps/core/scripts/seed.ts` (`pnpm seed`), made through core's own
sign-up and direct invitations, and checked by `apps/core/src/__tests__/seed.suite.ts` on every database. Move the logic so both
`pnpm seed` and `sovereign-admin seed` call it (`apps/core/src/admin/main.ts` and `run.ts`). The sample app goes through
`ClientRegistry.ensure` with the system actor, as `sovereign-admin apps ensure` does (`apps/core/src/clients/registry.ts`). `sv seed` is a
new request verb in `tools/cli/src/server/request.ts` and `receive.ts`, answered by running the command in core's container as
`app NAME` already is, and not added to what `--deploy-only` allows. The password length rules are the policy's
(`apps/core/src/auth/password-policy.ts`): a generated password must pass them.

**Do not proceed if:** the sample app's redirect cannot be made valid by the registry on both a development machine (an `http://localhost`
address) and a server (`https`): settle it against core-app §3.7.3 first.

## Risks

- **A seeded account on a public staging server** is a real account. The random password and the shown-once output are what make it safe;
  they must hold under `--json` too.
- **The environment variable is a switch.** It is safe only because core refuses when a real account exists as well. Both checks need tests
  that fail without the other.
- **A core older than the toolkit** ignores `SV_ENVIRONMENT`, so `sv seed` would reach a core that cannot refuse by environment: `sv seed`
  must ask core for its environment, not assume it.

## Kill criteria

If a production instance can be seeded by any single mistake, the seed is dropped, and what remains is `SV_ENVIRONMENT` alone, which is
harmless. Each leg ships on its own.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Nov 2026 | Initial draft, with the specification it governs (13.20, 13.21)                                                                                                                                                                                                                                                                                                                                                                 |
| 0.2     | Nov 2026 | Leg 1 done (13.20, root 0.82.0, core 0.56.0): `SV_ENVIRONMENT` is read by core (an unknown value stops it, an unset one is `production`), `sv apply` sets it from `suite.yml`, and nothing else can: `core.env`, a secret and an override of core's Compose file are each refused. An older core ignores the variable, since core's configuration does not reject names it does not know, so the "do not proceed" check passed. |
