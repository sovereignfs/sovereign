# RFC 0029 — Internationalization / Localization (i18n)

**Status:** Draft\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/manifest`, `packages/sdk`, `packages/db`, `runtime`, `apps/auth`,
`plugins/console`, `plugins/account`, `scripts/generate-registry.ts`,
`docs/plugin-development.md`, `docs/self-hosting.md`; builds on RFC 0018
(plugin-scoped env), RFC 0022 (plugin capabilities)\
**Incorporated into plan:** Yes — Tasks 1.0.3 (infrastructure) and 1.0.4 (platform
shell adoption) [post-v1]. `@sovereignfs/manifest` minor bump, `@sovereignfs/sdk` minor bump,
`@sovereignfs/db` minor bump.

---

## Summary

RFC 0029 adds first-class internationalization infrastructure to Sovereign. Operators
define which languages their instance supports via a Console setting; plugins opt in by
declaring an `i18n` manifest field and providing `messages/<locale>.json` translation
files. The active locale is resolved transparently per request — from the user's
Account preference cookie (`sv-locale`), falling back to the instance default, falling
back to English — and injected as an `x-sovereign-user-locale` request header. All
server and client components consume translations through **next-intl**, the platform-blessed
App Router-native library. The generate script merges plugin message files into a unified
namespaced bundle at build time.

Localization is **opt-in for plugins**: a plugin without an `i18n` manifest field and no
`messages/` directory is unaffected by this feature — it renders English regardless of the
active locale, with zero build overhead. Platform chrome (sidebar, header, login page, auth
app) ships with translated strings to prove the full stack end-to-end.

## Motivation

Sovereign is a self-hosted workspace platform. Instances serve teams that may be
primarily non-English speaking — a German company's internal tools, a Tamil-speaking
cooperative's shared workspace, a multilingual nonprofit. Today the platform is entirely
English, with `lang="en"` hardcoded in the root layout and no locale concept anywhere in
the data model.

Operators need control over which languages their instance supports — enabling Sinhala
without plugins that have Sinhala translations would produce a mixed-language UI, which
is worse than a consistent English UI. The system must let the operator gate languages and
let plugins declare which locales they cover.

Plugin developers need a consistent, low-friction path to add translations: a single
convention (`messages/en.json`, `messages/de.json`) rather than per-plugin library
choices that produce inconsistent patterns across the ecosystem.

## Current state (what this builds on)

- `runtime/app/layout.tsx`: `<html lang="en" suppressHydrationWarning>` — hardcoded
  English. `suppressHydrationWarning` already present for the theme script; locale
  detection follows the same pattern.
- `runtime/middleware.ts`: already injects `x-sovereign-user-role`,
  `x-sovereign-user-id`, `x-sovereign-user-capabilities` headers after session
  verification. Locale injection follows the same pattern.
- `packages/db/src/bootstrap.ts`: `platform_settings` key-value table already stores
  `root_plugin_id`, `invite_only`, `license_*` keys. New locale keys land here.
- `packages/sdk/src/types.ts`: `PlatformConfig` type already used by
  `sdk.platform.getConfig()`. New fields `enabledLanguages` and `defaultLanguage` extend
  it.
- `scripts/generate-registry.ts`: already generates `runtime/generated/registry.ts` and
  `runtime/generated/plugin-env.ts` from plugin manifests. Plugin message merging follows
  the same pattern.
- `plugins/account/app/preferences/page.tsx`: already has timezone and theme preferences.
  Language preference adds a third row.
- `plugins/console/app/settings/page.tsx`: already has Tenant, Registration, Branding
  sections. A Languages section is added alongside them.
- Cookie `sv-theme`: the pattern for a transparent per-user preference stored in a
  cookie, set by the Account plugin, read by middleware and the root layout. `sv-locale`
  mirrors this exactly.
- No existing i18n dependencies — this is greenfield.

## Proposed design

### 1 — Platform config: enabled languages

Two new keys in `platform_settings` (seeded on first run, no schema change):

| Key                 | Value (JSON string)       | Default    |
| ------------------- | ------------------------- | ---------- |
| `enabled_languages` | `'["en","de","si","ta"]'` | `'["en"]'` |
| `default_language`  | `'"en"'`                  | `'"en"'`   |

English is always in `enabled_languages` and cannot be removed — it is the base
language that all plugins must support as a fallback.

`PlatformConfig` type gains:

```ts
enabledLanguages: string[];  // BCP 47 tags; always includes 'en'
defaultLanguage: string;     // must be in enabledLanguages
```

`sdk.platform.getConfig()` returns these new fields (already async; no signature change).

A new Edge-readable admin API route mirrors the pattern of `/api/admin/plugins/disabled`:

```
GET /api/admin/i18n
Authorization: x-sovereign-admin-key
Response: { enabledLanguages: string[], defaultLanguage: string }
```

This route is added to `RESERVED_API_SEGMENTS` in `runtime/src/api-namespace.ts` (the
dir-parity test guards it).

### 2 — Manifest `i18n` field

New optional field in the manifest schema (`packages/manifest/src/schema.ts`):

```json
{
  "i18n": {
    "supportedLocales": ["en", "de", "si", "ta"]
  }
}
```

Rules:

- The field is entirely **optional**. Its absence means the plugin is English-only and
  does not participate in message merging.
- `supportedLocales` must be a non-empty array of BCP 47 language tags.
- `"en"` must be present (generate script enforces this — build fails if missing).
- The generate script **fails** if a listed locale has no `messages/<locale>.json` file
  in the plugin source directory.
- The generate script **warns** (not fails) when a platform-enabled language is absent
  from a plugin's `supportedLocales`. The plugin falls back to English strings for that
  locale — which is acceptable but worth surfacing to the Console coverage table.

`manifestFieldNames` in `packages/manifest/src/schema.ts` gains `'i18n'` (required by the
docs-parity test in `runtime/src/docs-parity.test.ts`).

### 3 — Locale resolution chain

Per-request locale resolution in the middleware:

```
sv-locale cookie
  ↓ present and in enabled_languages? → use it
  ↓ else
defaultLanguage (from /api/admin/i18n, cached in edge var)
  ↓ else
'en'
```

The middleware injects the resolved locale as:

- `x-sovereign-user-locale: <locale>` on the forwarded request headers (read by
  `next-intl`'s `getRequestConfig`)

The `/api/admin/i18n` response is cached in an edge-scoped variable on first fetch,
same as the disabled-plugins list. The cache is invalidated when the middleware processes
a request from the Console settings save action (passes a `x-sovereign-invalidate-i18n`
header to trigger re-fetch on the next request).

### 4 — next-intl integration (no URL routing)

Sovereign uses next-intl's **"without i18n routing"** mode. URLs do not change — there
is no `/de/console` prefix. The locale lives only in the cookie and the request header.
This is consistent with how theme and timezone preferences work.

**`runtime/i18n/request.ts`** (new file):

```ts
import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

export default getRequestConfig(async () => {
  const locale = (await headers()).get('x-sovereign-user-locale') ?? 'en';
  const messages = (await import(`../generated/messages/${locale}`)).default;
  return { locale, messages };
});
```

**`runtime/next.config.ts`** wraps the existing config with `createNextIntlPlugin`:

```ts
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withNextIntl(withPWA({ ... }));
```

**`runtime/app/layout.tsx`**: `NextIntlClientProvider` wraps `{children}` (server
component — reads locale from headers, serializes messages). `<html lang={locale}>` is
now dynamic, replacing the hardcoded `lang="en"`. The `suppressHydrationWarning`
attribute stays (still needed for the theme script).

**Plugin components** use next-intl hooks with their plugin ID as namespace:

```tsx
import { useTranslations } from 'next-intl';

export function PluginPage() {
  const __t = useTranslations('fs.sovereign.console');
  return <h1>{__t('users.title')}</h1>;
}
```

**Platform shell components** use the `'platform'` namespace:

```tsx
const __t = useTranslations('platform');
return <span>{__t('nav.launcher')}</span>;
```

### 5 — Generate script: message merging

The generate script (`scripts/generate-registry.ts`) gains a `composeMessages()` step
that runs after plugin composition:

1. Reads `runtime/messages/<locale>.json` (platform shell strings).
2. For each installed plugin with an `i18n.supportedLocales` declaration, reads
   `plugins/<id>/messages/<locale>.json`.
3. Emits `runtime/generated/messages/<locale>.ts` for every locale that appears in any
   plugin's `supportedLocales` (union; not limited to platform-enabled locales — the
   generate script doesn't read runtime config).

Generated file shape:

```ts
// runtime/generated/messages/en.ts  (auto-generated — do not edit)
export default {
  platform: {
    'nav.launcher': 'Launcher',
    'nav.console': 'Console',
    // ...
  },
  'fs.sovereign.console': {
    'users.title': 'Users',
    'plugins.title': 'Plugins',
    // ...
  },
  'fs.sovereign.account': {
    'preferences.language': 'Language',
    // ...
  },
};
```

Generated files are added to `runtime/generated/.gitignore` (alongside `registry.ts`
and `plugin-env.ts`).

**Validation in generate script:**

- If `i18n.supportedLocales` contains a locale but `messages/<locale>.json` is absent →
  `process.exit(1)` with a clear error message.
- If `i18n.supportedLocales` does not include `"en"` → `process.exit(1)`.
- If two plugins declare conflicting message keys within the same namespace →
  warning (last-write wins, by load order; unique namespaces per plugin ID make
  conflicts structurally impossible within a single plugin, but platform vs. plugin
  keys could theoretically collide — they don't since they use different namespace keys).

### 6 — SDK surface: `sdk.i18n` (experimental)

New module `packages/sdk/src/i18n.ts`:

```ts
// All three are async — consistent with the platform data-layer contract.
export async function getLocale(): Promise<string>;
export async function getEnabledLanguages(): Promise<string[]>;
export async function getDefaultLanguage(): Promise<string>;
```

- `getLocale()`: reads `x-sovereign-user-locale` from `next/headers()`. Convenience
  wrapper so plugins don't need to import `next/headers` directly.
- `getEnabledLanguages()` / `getDefaultLanguage()`: delegates to host, which reads from
  `platform_settings` (same path as `sdk.platform.getConfig()` for other settings).

`SdkHost` interface gains an `i18n` key:

```ts
i18n: {
  getLocale(): Promise<string>;
  getEnabledLanguages(): Promise<string[]>;
  getDefaultLanguage(): Promise<string>;
};
```

Implementation in `runtime/src/sdk-host.ts` reads from the platform DB.

`sdk.i18n` is marked **experimental** in `docs/sdk-stability.md` — not covered by the
semver guarantee; shape may change as ICU formatting and RTL support are added.

`sdk` export in `packages/sdk/src/index.ts` gains `i18n` in the experimental group.

### 7 — DB: `account_prefs.locale` column

New nullable `locale TEXT` column on the `account_prefs` table. `NULL` means "follow
the platform default." Drizzle-kit migration for both dialects:

```
packages/db/migrations/sqlite/0005_account_locale.sql
packages/db/migrations/postgres/0005_account_locale.sql
```

The Account plugin's `PATCH /api/account/preferences` server action already handles
arbitrary preference fields; it gains a `locale` field that writes `account_prefs.locale`
and clears the `sv-locale` cookie (`maxAge: 0`) so the next request re-resolves fresh.
This mirrors the pattern used for the `sv-theme` cookie on theme change.

### 8 — Translation file convention

```
plugins/<id>/
  messages/
    en.json          ← required (base language)
    de.json          ← optional; must be declared in i18n.supportedLocales
    si.json
    ta.json
  app/               ← unchanged; route segments as today
  manifest.json      ← gains i18n field

runtime/
  messages/
    en.json          ← platform shell strings (sidebar, nav, errors)
    de.json
    si.json
    ta.json
  generated/
    messages/
      en.ts          ← AUTO-GENERATED by generate script
      de.ts
      si.ts
      ta.ts
```

**Message key naming convention**: flat namespaced keys using dot notation within a
locale file. No nesting beyond two levels (`section.key`):

```json
{
  "users.title": "Users",
  "users.invite": "Invite user",
  "plugins.title": "Plugins",
  "plugins.toggle.enable": "Enable",
  "plugins.toggle.disable": "Disable"
}
```

**Translation hook naming convention**: the return value of `useTranslations()` is
always bound to `__t` (double underscore). This makes translation call-sites visually
distinct and easy to grep, and avoids shadowing any ambient `t` variable. Plugin
developers must follow this convention; it is documented in `docs/plugin-development.md`
and enforced by code review.

**ICU message format**: next-intl supports ICU syntax (`{count, plural, one {# item}
other {# items}}`). This RFC does not mandate ICU — simple `{name}` interpolation is
sufficient for v1 translations. Richer ICU usage (plurals, select, date/number
formatting) is deferred to the open questions.

## UI flows

### Flow 1: Admin enables a new language

1. Admin opens Console → Settings → Languages section.
2. Sees a list of ~30 languages. English is checked and greyed out (cannot disable).
3. Checks "Tamil (ta)". The plugin coverage table below shows which installed plugins
   have `messages/ta.json` (green) and which do not (amber, will fall back to English).
4. Saves. `updateLanguageSettingsAction` writes `enabled_languages: ["en","de","si","ta"]` to
   `platform_settings`.
5. On the next request, the middleware picks up the updated value from `/api/admin/i18n`.

### Flow 2: User selects their language

1. User opens Account → Preferences.
2. Sees a "Language" dropdown (new, below Theme). Options: "Follow instance default (English)"
   - the enabled languages ("German", "Sinhala", "Tamil").
3. Selects "Sinhala". On save, the server action writes `account_prefs.locale = 'si'` and
   sets `sv-locale=si` cookie (`HttpOnly`, `SameSite=Lax`, no `Secure` in dev).
4. On next page load, middleware reads `sv-locale=si` → validates against enabled_languages
   → resolves to `'si'` → sets `x-sovereign-user-locale: si`.
5. `getRequestConfig` loads `runtime/generated/messages/si.ts`. All translated components
   render in Sinhala. `<html lang="si">` is set.

### Flow 3: Plugin with no translations

1. Plugin `com.example.tasks` has no `i18n` field and no `messages/` directory.
2. Generate script ignores it entirely. Its routes are not affected.
3. When a Tamil-locale user visits the plugin, all strings render in English (the
   plugin's hardcoded strings). No errors, no fallback logic needed — the plugin just
   doesn't participate in the locale system.

## Auth app locale handling

The auth app (`apps/auth/`) runs on a separate origin (`:3001` in dev; same domain in
production via reverse proxy). The `sv-locale` cookie is set on the runtime origin
(`:3000` in dev) and is not automatically shared with the auth origin in dev.

**Production (single domain, reverse proxy):** Cookies are same-domain — auth middleware
reads `sv-locale` exactly as the runtime middleware does.

**Dev (split origins):** Auth middleware uses the `Accept-Language` request header for
locale detection, falling back to `en`. Additionally, the runtime middleware passes
`?locale=<locale>` as a query parameter in the login redirect URL, allowing auth to
pre-select the correct locale without the cookie.

The auth app gets its own translation infrastructure:

```
apps/auth/
  messages/
    en.json     ← login, register, 2FA, password reset strings
    de.json
    si.json
    ta.json
  i18n/
    request.ts  ← reads sv-locale cookie (prod) or Accept-Language (dev fallback)
```

The auth `next.config.ts` is independently wrapped with `createNextIntlPlugin`.

This split-origin dev limitation is documented in `docs/self-hosting.md` (under "Language
config") and noted in the Console Languages section as "Auth login page uses browser
language in development; both are in sync in production."

## Alternatives considered

### URL-prefix routing (`/de/console`, `/ta/launcher`)

Next.js App Router has built-in support for locale-prefixed routing via `next-intl`'s
middleware. Rejected because:

- Every plugin's `routePrefix` becomes a locale-prefixed segment, complicating the
  generate script's route composition, the middleware's admin API namespace split,
  the root-plugin rewrite logic, and all internal links.
- The URL structure becomes a public contract — renaming a locale breaks bookmarks and
  integrations.
- For a self-hosted workspace (not a public-facing marketing site), SEO-driven locale
  routing has no value.
- The `sv-locale` cookie pattern is already established for `sv-theme`; locale fits
  the same model exactly.

### Library-agnostic (no blessed library)

Define the manifest field and `sdk.i18n.getLocale()` contract without prescribing how
plugins load and apply messages. Rejected because:

- Each plugin would invent its own message-loading approach, producing inconsistent
  patterns across the ecosystem.
- The generate script cannot merge messages into a unified bundle without knowing the
  format and loading convention.
- The plugin starter template (RFC 0017) would have nothing useful to scaffold for
  translations.
- next-intl is the dominant App Router–native solution, actively maintained, and has
  zero runtime dependencies when used in RSC-only mode (`next-intl/server`).

### Opt-out (all plugins are localized by default)

Make English the default namespace and require plugins to opt out if they don't want to
participate. Rejected because:

- The overwhelming majority of existing plugins have no translations. An opt-out model
  would generate empty `messages/en.json` stubs or silently include plugins with no
  strings, adding noise to the generated bundle.
- Breaking existing plugins implicitly — a plugin that ships without translations
  would produce missing-key warnings for every string in a locale-switched context.
- Opt-in is the right contract: you get localization when you declare it and provide
  the files.

### Separate locale service / edge config store

Cache enabled_languages in an edge-compatible key-value store (e.g. Next.js data cache
with `revalidateTag`) rather than a `GET /api/admin/i18n` fetch in middleware. Rejected
because:

- The existing pattern for edge-gated platform data (disabled plugins, root plugin ID)
  is already a fetch-and-cache in middleware. Consistency matters more than a minor
  performance delta.
- A separate cache layer adds a new abstraction without a compelling reason given the
  low frequency of language config changes.

## Open questions

1. **RTL language support** — Arabic, Hebrew, Persian, and others require `dir="rtl"` on
   `<html>` and CSS logical properties (`margin-inline-start` instead of `margin-left`).
   The design system (`packages/ui`) is not RTL-aware today. RTL is out of scope for
   Tasks 0.9.4–0.9.5 but should be tracked as a follow-up. The RFC should reserve
   the BCP 47 locale tags for RTL languages in the Console language list even if they
   are disabled in v1.

2. **ICU message format vs. simple interpolation** — next-intl supports full ICU syntax
   for plurals (`{count, plural, one {# item} other {# items}}`), gender, and select.
   Do we mandate ICU for plugin translation files in v1, or leave it to the plugin
   author? A convention recommendation should land in `docs/plugin-development.md` but
   may not need to be enforced by the schema.

3. **Number and date formatting** — `Intl.NumberFormat` and `Intl.DateTimeFormat` are
   browser-native and locale-aware. `next-intl` exposes `useFormatter()` for these.
   Should `sdk.i18n` provide a formatting helper, or should plugin authors call
   `useFormatter()` from next-intl directly? The latter is simpler but couples plugins
   to next-intl more deeply.

4. **Machine-translation CI tooling** — some ecosystems provide a CI step that detects
   untranslated keys when new strings are added to `en.json`. This could be a useful
   registry/CI addition but is out of scope for v1.

5. **Per-plugin locale fallback beyond English** — if a plugin declares
   `supportedLocales: ["en", "de"]` and the active locale is Tamil, it falls back to
   English. Is this always the right fallback, or should plugins be able to declare an
   alternative fallback chain (`"ta" → "si" → "en"`)? Deferred to a follow-up RFC if
   the need arises.

6. **Auth app locale cookie sharing in dev** — the `?locale=<locale>` redirect param is
   a workaround for the split-origin cookie limitation. A cleaner long-term solution
   might be an auth-app-specific locale API endpoint that the runtime middleware calls
   on login redirect, but this adds latency. Deferred until dev ergonomics are
   validated in practice.

## Adoption path

### Task 1.0.3 — i18n infrastructure

- `packages/manifest`: new optional `i18n` field in schema, validation, `manifestFieldNames`
  update. Minor bump.
- `packages/db`: new `locale TEXT` column + drizzle-kit migration (both dialects).
  `PlatformConfig` gains `enabledLanguages` / `defaultLanguage`. Minor bump.
- `packages/sdk`: new `sdk.i18n` module (`getLocale`, `getEnabledLanguages`,
  `getDefaultLanguage`); `SdkHost` gains `i18n` key; host implementation in
  `runtime/src/sdk-host.ts`. Minor bump. Marked experimental in `docs/sdk-stability.md`.
- `scripts/generate-registry.ts`: `composeMessages()` step; validation rules.
  Generated files in `runtime/generated/messages/` (gitignored).
- `runtime/middleware.ts`: locale resolution + `x-sovereign-user-locale` injection.
  New `GET /api/admin/i18n` route. `RESERVED_API_SEGMENTS` update. Minor bump.
- `runtime/i18n/request.ts`: new file. `runtime/next.config.ts`: `createNextIntlPlugin`
  wrapper. Root layout: `NextIntlClientProvider`, dynamic `lang` attribute.
- `plugins/console`: Languages section in Settings (enable/disable, default, coverage
  table). Minor bump.
- `plugins/account`: Language preference in Preferences tab. Minor bump.
- Docs: `docs/plugin-development.md` gains "i18n" section (manifest field, file
  convention, `sdk.i18n`, next-intl usage). `docs/self-hosting.md` gains "Language
  config" section (enabled languages, default language env vars). Both docs are required
  for the docs-parity test to pass.
- New dep: `next-intl` in `runtime/package.json`.

Root `package.json` does not bump (post-v1 task; ships after v1.0.0).

### Task 1.0.4 — Platform shell i18n adoption

The platform ships with four built-in languages as its reference translation set:

| Locale | Language | Script              |
| ------ | -------- | ------------------- |
| `en`   | English  | Latin               |
| `de`   | German   | Latin               |
| `si`   | Sinhala  | Sinhala (non-Latin) |
| `ta`   | Tamil    | Tamil (non-Latin)   |

Sinhala and Tamil use non-Latin scripts and exercise the full stack beyond ASCII — they
validate that `getRequestConfig` loads the correct message file, that `lang={locale}`
propagates to `<html>`, and that the runtime's default font stack falls back gracefully to
system fonts for these scripts (no custom font bundling required in v1; system fonts cover
Sinhala and Tamil on modern OSes and Android).

Deliverables:

- `runtime/messages/{en,de,si,ta}.json`: all platform chrome strings (sidebar nav labels,
  offline banner, health page labels, error messages, etc.)
- `plugins/console/messages/{en,de,si,ta}.json`: all Console UI strings; `manifest.json`
  gains `i18n: { supportedLocales: ["en","de","si","ta"] }`
- `plugins/account/messages/{en,de,si,ta}.json`: all Account UI strings; same manifest
  update
- `apps/auth/messages/{en,de,si,ta}.json`: login, register, 2FA, password-reset strings;
  `apps/auth/i18n/request.ts`; `apps/auth/next.config.ts` wrapped with
  `createNextIntlPlugin`. Minor bump.
- RFC 0017 plugin starter template (`packages/create-plugin`): scaffold includes a
  `messages/en.json` stub and next-intl usage example.
- E2E test: language switch to German (Latin) and Tamil (non-Latin) → Console/Account
  UI strings render in the selected language.

Root `package.json` does not bump (post-v1 task; ships after v1.0.0).

### Semver summary

| Package                 | Change                                                    |
| ----------------------- | --------------------------------------------------------- |
| `@sovereignfs/manifest` | Minor — new optional `i18n` field (additive)              |
| `@sovereignfs/sdk`      | Minor — new experimental `sdk.i18n` surface (additive)    |
| `@sovereignfs/db`       | Minor — new `locale` column + migration                   |
| `runtime`               | Minor — next-intl wiring, middleware, generate, API route |
| `plugins/console`       | Minor — Languages section                                 |
| `plugins/account`       | Minor — Language preference                               |
| `apps/auth`             | Minor — i18n/request.ts, messages, next.config.ts change  |

No breaking changes to any published package surface.

## Changelog

| Version | Date     | Change        |
| ------- | -------- | ------------- |
| 0.1     | Jun 2026 | Initial draft |
