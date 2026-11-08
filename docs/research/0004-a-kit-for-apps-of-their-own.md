# 0004: A kit for apps of their own

**Question:** Tusk and Fjord Web are apps that run on their own and can also be hosted by an instance. Each carries its own copy of the same
infrastructure (settings, database, stored secrets, sign-in through core). What should this repository publish so that the next app does not copy
it a third time, and what should the template in `tools/create` make?

**Status:** For review. `@sovereignfs/config` is published as the first step (below); the rest is a recommendation.

## Findings

### The copies

Fjord Web was written first; Tusk's `AGENTS.md` names it the model, and Tusk started from it. Compared on 2026-11-08 with each app's prefix
taken out, the copies have drifted:

| Area            | Tusk                                                                | Fjord Web                                    | Lines that differ                          |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| Database retry  | `src/db/retry.ts`                                                   | the same file                                | 0                                          |
| Database boot   | `src/db/boot.ts`                                                    | the same file                                | 42                                         |
| sqld namespaces | `src/db/sqld.ts`                                                    | the same file                                | 18                                         |
| Start-up        | `instrumentation-node.ts`, `scripts/boot-check.mjs`, `dev-db.mjs`   | the same files                               | 95, 72, 91                                 |
| Core's notices  | `src/sovereign/http.ts`, `verifiers.ts`                             | the same files                               | 86, 16                                     |
| Stored secrets  | `src/crypto/envelope.ts`                                            | the same file                                | 173                                        |
| Settings        | `src/config/` (`readSetting`)                                       | `src/secret-env.ts`, `src/env-renames.ts`, … | different shapes                           |
| Sign-in         | better-auth, `genericOAuth` to core, local accounts, passkeys, TOTP | the same                                     | not compared line by line; the same design |

Neither uses this repository's private packages (`config`, `database`, `crypto`, `mailer`), because they could not: none was on npm.

### Where the copies leave the contracts

- **`NAME` and `NAME_FILE` together.** [`env.md`](../../contracts/env.md) §3 makes it an error. Tusk's `readSetting` lets the file win.
- **The encryption key.** `env.md` §2 names `FIELD_ENCRYPTION_KEYS`, a newest-first list of `id:key` entries. Both apps read
  `<PREFIX>_ENCRYPTION_KEY` and `<PREFIX>_ENCRYPTION_KEY_PREVIOUS`, and their manifests `generate` the first.
- **Names the contract has no row for.** `DB_CONNECT_TIMEOUT_MS`, `MIGRATIONS_DIR`, `AUTH_LOCAL`, `AUTH_SIGNUP`, `AUTH_PASSWORD_MIN_LENGTH`
  mean the same in both apps.

### Why the packages here are not a drop-in

- **`@sovereignfs/config`** fits as it is: a prefix, the variable kinds, `Secret`, `NAME_FILE`. Adopting it changes one behaviour (both
  forms set is refused), which is the contract's.
- **`@sovereignfs/crypto`** seals one value under a key ring (`sv1.…`, `FIELD_ENCRYPTION_KEYS`) with a context string. The apps seal a
  credential with a random data key wrapped under the instance key, bound to row and purpose (`t1.<fingerprint>.<wrapped>.<payload>`), and
  rotate by re-wrapping. The formats are different on disk. Moving an app means a new reader that opens both and writes the new one, and
  the apps' rotation guarantee (the payload never re-encrypted) has no counterpart in the package yet.
- **`@sovereignfs/database`** opens one store. Each app opens two (its own and better-auth's: `tusk` and `tusk_auth` as sqld namespaces or
  PostgreSQL schemas), migrates both, and holds a lock for its migrations. Core never needed that.
- **The SDK's sign-in** (`createSovereign().auth`) is PKCE against core alone. The apps offer local accounts as well, so they sign in through
  better-auth with core as one provider, and use the SDK only for the notices and Core API calls.

## Options

1. **Publish the packages as they are and let apps adopt them.** Cheap for `config`. For `crypto` and `database` it pushes the gap above onto
   each app, which is why they copied in the first place.
2. **Publish a kit for apps of their own** (`@sovereignfs/app-kit`, or the existing packages grown to fit): the apps' own envelope as a
   `crypto` format beside `sv1`, two stores in `database`, the start-up sequence (boot with retry, provision, migrate under a lock, refuse to
   start on a bad setting), core's two notice routes as handlers, and a better-auth preset for "local and/or core". Built by moving Fjord's
   and Tusk's code here, with their tests, rather than writing it again.
3. **Leave it.** Two apps can keep two copies. The cost shows when a third arrives, and every security fix lands twice.

## Recommendation

Option 2, in order, each step usable on its own:

1. **Settings** (done here): `@sovereignfs/config` is published. Each app moves its reader onto it, which also brings both forms set into
   line with `env.md`. The rows for the shared names above go into `env.md` §2 first.
2. **Core's notices:** the back-channel logout and account-deleted routes as framework-free handlers in the SDK, which already verifies
   the tokens. Small, the same in both apps, and security-sensitive, so worth having once.
3. **Start-up and two stores:** `database` learns two stores and the boot sequence; the apps' `boot.ts`, `retry.ts`, `sqld.ts` and
   `instrumentation-node.ts` become calls.
4. **Stored secrets:** the apps' envelope format (`t1`) moves into `crypto` as a second format, with rotation by re-wrapping, and
   `FIELD_ENCRYPTION_KEYS` gains the form the apps need. An app's data on disk does not change; only where the code lives does.
5. **The template:** `tools/create` makes an app of its own (local sign-in, core optional, the three database forms) from the kit, as Tusk and
   Fjord are built, instead of today's core-only Postgres app.

What this does not do: change any app's data on disk, or make a hosted instance depend on a newer core.
