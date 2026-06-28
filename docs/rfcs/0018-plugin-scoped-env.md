# RFC 0018 — Plugin-scoped environment variables

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/manifest` (new optional `env` field), `packages/sdk` (`sdk.env` scoped accessor), `scripts/generate-registry.ts` (merge + namespacing + validation), the runtime env loader, `.env.example` / `docs/self-hosting.md` / `docs/plugin-development.md` + the docs-parity tests, Docker/Compose; builds on the plugin model (SRS §3.5/§3.9) and RFC 0008 (secret handling)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.5.23; documentation-first. This RFC specifies the model for plugin-declared environment variables and the end-to-end flows; SRS requirement IDs, scheduling, and task allocation are deferred.

---

## Summary

Let a plugin declare and supply its **own** environment variables — entirely
within the plugin's scope, without ever editing the root `.env` or any other
monorepo file — and have the platform incorporate them safely. The design rests on
two pillars:

- **Three distinct value sources**, separating what can be shipped from what must
  not: developer-shipped **non-secret defaults** (baked), the developer's **local
  dev values** (never shipped), and the operator's **production secrets** (injected
  at runtime, never baked).
- **Auto-namespacing**: every plugin key lives in the shared runtime environment as
  `SV_PLUGIN_<SLUG>_<KEY>`; the plugin reads its own keys **unprefixed** through a
  scoped SDK accessor (`sdk.env.get('KEY')`), so a plugin can neither collide with
  platform variables nor with another plugin.

The guiding constraint: **secret values are never written into shipped artifacts.**
"Incorporate keys and values into the build" applies to non-secret config;
sensitive values are supplied by the operator at deploy time.

## Motivation

Sovereign loads a single **root `.env`** shared by the runtime and auth apps. A
plugin that needs its own configuration — an upstream API base URL, a feature flag,
a third-party API key — has no sanctioned channel today: it would have to edit the
root `.env` or other monorepo files, which it must never do (plugins are external,
gitignored, composed as copies). Plugins need a first-class way to carry their
configuration in their own repository and have the platform pick it up — including
a clear, safe answer for **sensitive values**, which a plugin author cannot ship
(they differ per deployment and belong to the operator).

## Current state (what this builds on)

- **Single root `.env`, shared.** `runtime/next.config.ts` and
  `apps/auth/next.config.ts` call `@next/env` `loadEnvConfig` against the monorepo
  root before the app boots; both apps read the same file. There are no per-app or
  per-plugin `.env` files today.
- **Two Next.js env tiers.** `NEXT_PUBLIC_*` is **inlined into the client bundle at
  build time** (baked, public, immutable after build); everything else is read at
  **runtime** from `process.env`.
- **Artifacts keep env out.** `.dockerignore` strips `.env`; the production
  standalone server reads env from the Compose `environment:` block at **container
  start** (e.g. `runtime/middleware.ts:14` reads `SOVEREIGN_AUTH_URL` at request
  time). Baking secret values into the image is both a regression and a hazard.
- **Plugins share the runtime process.** Native plugin `app/` trees are **copied**
  into the runtime and run in the same Node process — they read the **same**
  `process.env` as the platform (e.g. the Console plugin reads
  `process.env.SOVEREIGN_ADMIN_KEY`). → collision risk and, today, unrestricted
  read of platform variables.
- **`generate-registry.ts` runs before `next build`** (and re-runs in dev),
  validating manifests and copying plugin trees in — the natural injection point.
- **Manifest is `.strict()` with docs-parity.** Adding an `env` field is an
  additive **minor** `@sovereignfs/manifest` bump; `manifestFieldNames` +
  `runtime/src/docs-parity.test.ts` enforce that every field is documented.
- **No-default-secrets rule.** `apps/auth/src/env.ts` `required()` throws on a
  missing secret rather than defaulting — the pattern plugin secrets reuse.

## Proposed design

### The three value sources (the core model)

The central move is to **stop treating "plugin env" as one thing.** There are three
sources with different trust and lifecycle:

1. **Developer-shipped non-secret defaults** — declared in the **manifest**
   (`env[KEY].default`). Committed to the plugin repo, validated, and **baked** into
   the build. This is the "values in build artifacts" case, made safe by
   construction: `default` is **rejected on `secret: true` keys**, so only
   non-secret config is ever baked.
2. **Developer local dev/test values** — a **gitignored plugin-local `.env`** in
   `plugins/<id>/` (plugin scope, never shipped, loaded only in dev). Lets a
   developer test with real values — including their own throwaway secrets — without
   editing the root `.env`.
3. **Operator production secrets** — supplied at deploy time via the **namespaced
   container env** (`SV_PLUGIN_<SLUG>_<KEY>`). Declared `secret: true` / `required`
   in the manifest; **validated present at startup** (fail-fast, no default); **never
   baked** into any artifact.

This reconciles "plugin developers pass values" (sources 1–2) with secret-safety
(source 3 owns the sensitive values the developer cannot know).

### Manifest `env` field

An optional declaration map — the plugin's env **contract**:

```jsonc
{
  "env": {
    "API_BASE_URL": {
      "description": "Upstream API base URL.",
      "scope": "build", // non-secret, eligible for client inlining
      "default": "https://api.example.com",
    },
    "API_KEY": {
      "description": "Upstream API key.",
      "required": true,
      "secret": true, // implies runtime scope; operator-supplied; never baked
    },
  },
}
```

Rules: `default` is allowed **only** when `!secret`; `scope: 'build'` marks
non-secret public config (client-inlinable); `secret` implies `scope: 'runtime'`.
Additive optional field → manifest **minor** bump; `manifestFieldNames` +
docs-parity updated.

### Auto-namespacing + the `sdk.env` accessor

The platform maps every declared key into the shared environment as
`SV_PLUGIN_<SLUG>_<KEY>`, so a plugin can never clobber a platform variable or
another plugin's. The plugin reads its **own** keys unprefixed:

```ts
const base = sdk.env.get('API_BASE_URL'); // resolves SV_PLUGIN_<SLUG>_API_BASE_URL
```

For `scope: 'build'` public values that must reach the **client**, the platform
emits a `NEXT_PUBLIC_SV_PLUGIN_<SLUG>_<KEY>` form so `next build` inlines it, and a
client-safe `sdk.env` reads those.

**Honest limitation:** because plugins run in the runtime's process, true _read
isolation_ — preventing a plugin from reading `process.env` directly — is **not
enforceable** in v1. Namespacing prevents _collision_, and `sdk.env` is the
sanctioned, ergonomic, plugin-scoped path; deeper sandboxing (separate processes /
a vetting model) is a non-goal here and is left to a future RFC.

### Build / inject pipeline

`generate-registry.ts` becomes the single incorporation point. For each plugin it:

1. reads the manifest `env` declarations + the plugin-local `.env` (dev only);
2. **namespaces** keys to `SV_PLUGIN_<SLUG>_<KEY>`;
3. writes a **generated, gitignored** consolidated module/file
   (`runtime/generated/plugin-env.*`) the loader merges into the environment, and
   emits the `NEXT_PUBLIC_*` forms for `scope: 'build'` keys so they inline;
4. **validates** — required keys are declared, **no `default` on a `secret` key**,
   no collision with platform-reserved keys, and the plugin has **not** shipped a
   value for a `secret` key (a committed secret value fails the build).

Secret keys are **never** written to the generated file or the image — they are
required from the **container env** at start. The step already runs in the Docker
**builder** stage, so non-secret defaults reach the image while secrets stay
external (delivered via Compose `environment:` at container start, same as platform
secrets).

### Operator experience

The generate step also emits a consolidated, `.env.example`-style **list of
operator-supplied keys** (the `required`/`secret` ones, already namespaced) so the
operator knows exactly what to set. This is surfaced in `docs/self-hosting.md` and,
optionally, a Console "plugin configuration" view (open question). The env
docs-parity concept extends to plugin-declared keys so operator-facing config can't
drift undocumented.

## UI / flows

**Developer** — declares keys (+ non-secret `default`s) in the manifest `env`;
reads them via `sdk.env.get('KEY')`; for local testing puts real values in a
gitignored `plugins/<id>/.env`. Ships the plugin with **no secret values** in it.

**Operator** — installs the plugin, sees the generated list of required
`SV_PLUGIN_<SLUG>_*` secret keys, sets them in their deploy env (Compose
`environment:` / orchestrator). On startup the platform validates the required
secrets are present (fail-fast) and exposes each plugin's keys to it, namespaced.

**Build** — non-secret defaults + `scope: 'build'` public values are baked/inlined;
secrets are absent from the artifact and read at container start.

## Alternatives considered

1. **Bake everything (keys + values, incl. secrets).** Simplest, but ships secrets
   inside the image — and any `NEXT_PUBLIC_*` secret into client JS for everyone to
   read. Rejected; the three-source split exists precisely to avoid this.
2. **Manifest keys-only, no developer-supplied values.** Clean, but doesn't satisfy
   "plugin developers pass values" — a plugin couldn't ship sensible non-secret
   defaults. Rejected in favour of `default` (non-secret only).
3. **Per-plugin process isolation for a true env sandbox.** Would give real read
   isolation, but it is not how the in-process, composed-copy runtime works in v1.
   Rejected for now; noted as a possible future direction.
4. **Convention-only namespacing.** Rejected per the design decision — auto-
   namespacing is enforced so a careless or malicious plugin can't shadow platform
   variables.

## Open questions

1. **Namespace token** — `SV_PLUGIN_<SLUG>_` vs an alternative; how the `<SLUG>` is
   derived from the plugin `id`.
2. **Operator config surface** — a Console "plugin configuration" view for required
   secrets, or docs/generated-example only?
3. **`NEXT_PUBLIC_` rebuild caveat** — `scope: 'build'` public values are baked, so
   changing one needs a rebuild; is that acceptable, or do some "public" values want
   a runtime path?
4. **At-rest interaction** — if operator secrets are ever stored (vs read from env),
   how that intersects RFC 0008's at-rest encryption.
5. **`sdk.env` semantics** — exact behaviour in server vs client components.
6. **Requirement IDs** — proposed entries, deferred until accepted.

## Adoption path

1. **Documentation-first (this RFC).** Model + flows captured; no code, no SRS
   edits, no scheduling.
2. **When accepted & scheduled:** the manifest `env` field (manifest **minor**),
   the `generate-registry.ts` merge + namespacing + validation, the generated
   consolidated loader file, the `sdk.env` scoped accessor (additive SDK **minor**),
   and the `.env.example` / `docs/self-hosting.md` / `docs/plugin-development.md` +
   docs-parity updates.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                          |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; plugin-declared env via a manifest `env` field, three value sources (baked non-secret defaults / dev-local / operator-supplied secrets), auto-namespacing + `sdk.env`, secrets never baked; documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.5.23.                                                                                                                                                                              |
