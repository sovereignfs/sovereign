---
rfc: 0031
title: Email Template System
status: Draft
date: June 2026
author: kasunben
scope: >
  packages/mailer, packages/db, packages/sdk, runtime, apps/auth, plugins/console
incorporated_into_plan: 'Yes — epic task 9.9 (alongside RFC 0027 Phase 2)'
---

# RFC 0031 — Email Template System

## Summary

Sovereign currently sends emails as raw inline HTML strings with the platform name
("Sovereign") hardcoded in both subject lines and body copy. This RFC defines the
**email template infrastructure** that all platform emails must use: a React Email–based
component layer in `packages/mailer`, standalone locale support, and operator-configurable
subject/copy overrides stored in `platform_settings`. This is a prerequisite for RFC 0027
Phase 2, which uses this infrastructure to inject tenant branding.

---

## Motivation

The two existing email types — password reset (sent by `apps/auth`) and user invite (sent
by `plugins/console`) — share three problems:

1. **No branding.** Subjects say "Reset your Sovereign password"; headers have no logo;
   CTAs use a plain link. Operators who white-label the instance need branded emails.

2. **No localisation.** All copy is English-only regardless of the recipient's language
   preference. When RFC 0029 ships (post-v1), the email layer must be ready to carry
   locale-specific strings.

3. **No maintainability.** Inline HTML strings in application code are impossible to
   preview, impossible to test visually, and hard to keep consistent across templates.

Fixing these in ad-hoc per-template patches would create three diverging approaches.
A shared template system solves them once.

---

## Proposed design

### 1. Template engine: React Email

`@react-email/components` and `@react-email/render` are added to `packages/mailer` as
runtime dependencies.

```
@react-email/render   — render(<Template />) → CSS-inlined HTML string
@react-email/components — Html, Head, Body, Preview, Section, Row, Column,
                          Img, Button, Link, Text, Hr (email-safe primitives)
```

`render(<PasswordResetEmail url={...} branding={...} copy={...} />, { pretty: false })`
produces a single inlined HTML string passed to nodemailer's `html` option — no other
changes to the `send()` interface.

**Why React Email and not alternatives:**

| Option                      | Verdict   | Reason                                                                                                           |
| --------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| React Email                 | ✅ Chosen | TypeScript/TSX-native; same language as the rest of the stack; CSS inlining built-in (Juice); dev preview server |
| MJML                        | ❌        | Different paradigm (XML); not TypeScript-native; requires a compile step                                         |
| Plain HTML string functions | ❌        | No CSS inlining (required for Gmail/Outlook); no preview tooling; diverges per template                          |
| Handlebars / Mustache       | ❌        | Extra dependency; no TypeScript types for template variables                                                     |

### 2. Template file layout

```
packages/mailer/src/
├── templates/
│   ├── components/
│   │   ├── EmailLayout.tsx    # outer shell: Preview + Header + slot + Footer
│   │   ├── EmailHeader.tsx    # logo Img + brand name fallback
│   │   └── EmailFooter.tsx    # instance URL + brand name
│   ├── locales/
│   │   ├── en.json            # required; fallback for all other locales
│   │   ├── de.json
│   │   ├── si.json
│   │   └── ta.json
│   ├── PasswordResetEmail.tsx
│   ├── InviteEmail.tsx
│   └── index.ts               # public API: types + render functions
├── mailer.ts                  # unchanged send() function
└── types.ts                   # MailOptions (unchanged)
```

### 3. Public API

```ts
// packages/mailer/src/templates/index.ts

/** Branding data injected into every email. */
export interface EmailBranding {
  /** Display name — from emailFromName ?? brandName in TenantBrandingValue. */
  name: string;
  /**
   * Absolute HTTPS URL to the logo image served from the instance
   * (e.g. https://acme.example.com/api/brand/logo).
   * Must be publicly reachable — Gmail and Outlook block data: URIs.
   * When undefined the header renders the brand name as text.
   */
  logoUrl?: string;
  /**
   * Hex colour (#rrggbb) used for CTA button backgrounds.
   * Defaults to #09090b (near-black) when undefined.
   */
  primaryColor?: string;
  /** Shown in the email footer. Should be the public base URL of the instance. */
  instanceUrl: string;
}

/** Locale and operator overrides for a specific render call. */
export interface EmailLocale {
  /**
   * BCP 47 locale tag (en, de, si, ta).
   * Falls back to 'en' when the locale is not available.
   */
  locale: string;
  /**
   * Operator-customised strings fetched from platform_settings.
   * Merged over the built-in locale strings — any absent key uses the built-in value.
   */
  overrides?: Partial<EmailCopyMap>;
}

/**
 * Renders a password reset email.
 * @returns CSS-inlined HTML string, ready for nodemailer's `html` option.
 */
export function renderPasswordResetEmail(
  resetUrl: string,
  branding: EmailBranding,
  locale?: EmailLocale,
): string;

/**
 * Renders a user invite email.
 * @returns CSS-inlined HTML string, ready for nodemailer's `html` option.
 */
export function renderInviteEmail(
  registerUrl: string,
  branding: EmailBranding,
  locale?: EmailLocale,
): string;

/**
 * Renders the subject line for a given template ID.
 * Subject interpolation is a subset of copy customisation and must be resolved
 * before calling nodemailer (subject is not part of the HTML body).
 */
export function renderSubject(
  templateId: 'passwordReset' | 'invite',
  branding: EmailBranding,
  locale?: EmailLocale,
): string;
```

### 4. EmailLayout component

```tsx
// templates/components/EmailLayout.tsx
import { Html, Head, Body, Preview } from '@react-email/components';
import { EmailHeader } from './EmailHeader';
import { EmailFooter } from './EmailFooter';

interface EmailLayoutProps {
  branding: EmailBranding;
  preview: string; // short preview text shown in inbox snippet
  children: React.ReactNode;
}

export function EmailLayout({ branding, preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: '#f9f9f9',
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
          padding: '32px 0',
        }}
      >
        <Section
          style={{
            maxWidth: 560,
            margin: '0 auto',
            backgroundColor: '#ffffff',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <EmailHeader branding={branding} />
          <Section style={{ padding: '32px 40px' }}>{children}</Section>
          <EmailFooter branding={branding} />
        </Section>
      </Body>
    </Html>
  );
}
```

**`EmailHeader`:** renders `<Img src={logoUrl} alt={brandName} height={40}>` when
`logoUrl` is set; otherwise renders `<Text>{brandName}</Text>` in bold. This follows
the industry-standard pattern — `alt` text ensures the brand is legible even when the
email client blocks remote images (which many corporate clients do by default). Never
use `data:` URIs for images: Gmail, Outlook, and Apple Mail all refuse to render them
for security reasons.

**`EmailFooter`:** renders the instance URL as a link and the brand name. Keeps a clear
visual separation from the body.

### 5. Localisation (standalone)

Template copy lives in `templates/locales/{locale}.json`. The format uses simple
`{{variable}}` placeholders — a tiny built-in interpolator, no external library.

**`en.json` (required fallback):**

```json
{
  "passwordReset": {
    "subject": "Reset your {{brandName}} password",
    "intro": "You requested a password reset for your {{brandName}} account.",
    "cta": "Reset password",
    "expiry": "This link expires in 1 hour.",
    "ignore": "If you did not request this, you can safely ignore this email."
  },
  "invite": {
    "subject": "You've been invited to {{brandName}}",
    "intro": "You've been invited to join {{brandName}}.",
    "cta": "Create your account",
    "expiry": "This invite expires in 48 hours."
  }
}
```

**Resolution order:** operator override → built-in `{locale}.json` → built-in `en.json`.

**Locale at call time:** callers pass `locale.locale` derived from:

- `apps/auth`: the `preferredLocale` field on the user record (when RFC 0029 adds it),
  falling back to `platform_settings.default_language`, falling back to `'en'`
- `plugins/console`: same; available via the `x-sovereign-user-locale` header injected
  by middleware

**Forward compatibility with RFC 0029:** These `locales/{locale}.json` files use the
same four-locale set (en/de/si/ta) and same file convention as RFC 0029's
`messages/{locale}.json`. When RFC 0029 lands (post-v1 Task 1.0.3), the email strings
slot into the platform-wide i18n pipeline without migration.

### 6. Copy customisation

Operators can override subject lines and body copy per template per locale via
Console → Settings → **Email Templates**. Overrides are stored in the existing
`platform_settings` K-V table — no new DB table.

**Key pattern:** `email_copy_<templateId>_<locale>_<field>`

Examples:

- `email_copy_invite_en_subject` → `"Welcome to Acme Corp"`
- `email_copy_invite_ta_cta` → `"உங்கள் கணக்கை உருவாக்கவும்"`
- `email_copy_passwordReset_de_intro` → `"Sie haben ein Zurücksetzen Ihres Passworts beantragt."`

**`packages/db` new helpers:**

```ts
/**
 * Returns the merged copy map for a template:
 * built-in locale strings merged with operator overrides.
 * Falls back to 'en' for any missing key.
 */
export async function getEmailCopy(
  pdb: PlatformDb,
  tenantId: string,
  templateId: 'passwordReset' | 'invite',
  locale: string,
): Promise<EmailCopyMap>;

/** Writes a single copy override to platform_settings. */
export async function setEmailCopy(
  pdb: PlatformDb,
  tenantId: string,
  templateId: 'passwordReset' | 'invite',
  locale: string,
  field: string,
  value: string,
): Promise<void>;
```

Validation at write time: `subject` max 200 chars; all other fields max 2000 chars.

### 7. Integration points

#### `apps/auth` — password reset email

`apps/auth/src/auth.ts` `sendResetPassword` hook updated:

```ts
// apps/auth/src/auth.ts
sendResetPassword: async ({ user, token }) => {
  const resetUrl = `${env.baseUrl}/reset-password?token=${token}`;
  const branding = await getBranding();        // cached; see §7.1
  const copy = await getEmailCopy(db, DEFAULT_TENANT_ID, 'passwordReset', locale);
  const html = renderPasswordResetEmail(resetUrl, branding, { locale, overrides: copy });
  const subject = renderSubject('passwordReset', branding, { locale, overrides: copy });
  await sendMail({ to: user.email, subject, html });
},
```

#### §7.1 — Branding fetch in `apps/auth`

`apps/auth/src/email-branding.ts` — a small module with a 60 s in-memory cache:

```ts
let cached: { value: EmailBranding; expiresAt: number } | null = null;

export async function getBranding(): Promise<EmailBranding> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  try {
    const res = await fetch(`${env.runtimeInternalUrl}/api/admin/tenant-branding`, {
      headers: { 'x-sovereign-admin-key': env.sovereignAdminKey },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data: TenantBrandingValue = await res.json();
    const value: EmailBranding = {
      name: data.emailFromName ?? data.brandName,
      logoUrl: data.emailLogo ?? undefined,
      primaryColor: data.brandPrimary ?? undefined,
      instanceUrl: env.baseUrl,
    };
    cached = { value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch {
    // Graceful fallback — auth must send the email even if runtime is temporarily down
    return { name: 'Sovereign', instanceUrl: env.baseUrl };
  }
}
```

`SOVEREIGN_RUNTIME_INTERNAL_URL` env var (defaults to `http://localhost:3000`; in Docker
set to `http://runtime:3000`). Must be added to `.env.example` and `self-hosting.md`.

#### `runtime/app/api/admin/tenant-branding/route.ts` (new)

```ts
// GET /api/admin/tenant-branding
// Admin-key-gated. Returns TenantBrandingValue (merged DB + env defaults).
export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const pdb = await getPlatformDb();
  const branding = await getTenantBranding(pdb, DEFAULT_TENANT_ID);
  return NextResponse.json(branding);
}
```

This route lives under the existing `api/admin/` namespace — no change to
`RESERVED_API_SEGMENTS` (the first-level segment `admin` is already reserved; this is a
new leaf within it).

#### `plugins/console` — invite email

`plugins/console/app/users/actions.ts` updated:

```ts
const config = await sdk.platform.getConfig();
const branding: EmailBranding = {
  name: config.emailFromName ?? config.brandName,
  logoUrl: config.emailLogo ?? undefined,
  primaryColor: config.brandPrimaryColor ?? undefined,
  instanceUrl: config.instanceUrl, // new field; see §7.2
};
const copy = await getEmailCopy(pdb, tenantId, 'invite', locale);
const html = renderInviteEmail(registerUrl, branding, { locale, overrides: copy });
const subject = renderSubject('invite', branding, { locale, overrides: copy });
await sdk.mailer.send({ to: email, subject, html });
```

#### §7.2 — `sdk.platform.getConfig()` additions

```ts
// @sovereignfs/sdk — PlatformConfig type gains:
emailFromName?: string;   // from tenant_branding.email_from_name
emailLogo?: string;       // from tenant_branding.email_logo (URL)
instanceUrl: string;      // from SOVEREIGN_RUNTIME_PUBLIC_URL or baseUrl
```

`instanceUrl` is needed by plugins to populate `EmailBranding.instanceUrl` without
hardcoding a URL. It reads `SOVEREIGN_RUNTIME_PUBLIC_URL` (new, optional; defaults to
`http://localhost:3000`). Added to `.env.example` and `self-hosting.md`.

#### `plugins/console` — Email Templates section

A new section in Console → Settings:

- **Template selector** (Password Reset / Invite)
- **Locale selector** (populated from enabled languages; defaults to platform default)
- **Subject override** (text input, max 200 chars; `{{brandName}}` interpolation shown)
- **Body copy override fields** (one per key: intro, cta, expiry, ignore)
- **Test-send button** → `POST /api/admin/email-templates/test` sends a sample to the
  currently logged-in admin's email address
- **Live preview panel** → fetches `GET /api/admin/email-templates/preview` and renders
  the output in an `<iframe>` (sandboxed; no JS)

**API routes (admin-key-gated under `/api/admin/`):**

```
GET  /api/admin/email-templates?templateId=&locale=  → { copy: EmailCopyMap }
PATCH /api/admin/email-templates                     → { templateId, locale, field, value }
POST /api/admin/email-templates/test                 → { templateId } — sends sample email
GET  /api/admin/email-templates/preview              → { templateId, locale } → text/html
```

### 8. `MailOptions` contract

The `send()` interface **does not change** — `MailOptions.html` remains a pre-rendered
string. The template rendering step is the caller's responsibility, not the mailer's.
This keeps the mailer package minimal and avoids coupling it to the DB or SDK.

### 9. Dev preview

`packages/mailer` adds an `email:dev` npm script that starts the React Email dev server
on port 3003 (separate from the runtime's 3000 and auth's 3001). This is a dev-only
convenience and not part of the production build. The preview server renders all TSX
files under `templates/` with live reload.

```json
// packages/mailer/package.json (scripts, dev only)
"email:dev": "email dev --dir src/templates --port 3003"
```

---

## Open questions

1. **Notification emails (RFC 0015):** The notification center (Task 0.7.01) sends
   in-app notifications via SSE/push — it does not currently send emails. When email
   digests for notifications are added (post-v1), they should use this template
   infrastructure with a new `NotificationDigestEmail.tsx` template.

2. **Rich body overrides:** The current copy override model lets operators replace
   individual text fields (subject, intro, cta). A future enhancement could allow a full
   rich-text body override (WYSIWYG editor in Console, stored as sanitised HTML).
   Deferred — the per-field model is sufficient for v1.

3. **CID (inline) image attachments:** CID attachments work in desktop email clients
   (Outlook, Apple Mail) but not in most webmail (Gmail, Outlook.com). The hosted-URL
   approach is chosen for maximum compatibility. If CID support is requested, it could be
   added as an optional enhancement without changing the template API.

4. **`preferredLocale` on user record:** RFC 0029 adds the language preference to
   `account_prefs`. Until then, `apps/auth` falls back to platform default language. This
   fallback is correct and requires no code change when RFC 0029 lands — just a lookup
   of the field that will exist.

---

## Semver impact

| Package           | Bump  | Reason                                                                                               |
| ----------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `packages/mailer` | minor | New template exports, `@react-email/*` deps added                                                    |
| `packages/db`     | minor | `getEmailCopy` / `setEmailCopy` helpers                                                              |
| `packages/sdk`    | minor | `PlatformConfig` gains `emailFromName`, `emailLogo`, `instanceUrl`                                   |
| `runtime`         | minor | `/api/admin/tenant-branding`, `/api/admin/email-templates/*` routes; Console Email Templates section |
| `apps/auth`       | minor | Branded password reset email; branding fetch from runtime                                            |
| `plugins/console` | minor | Branded invite email; Email Templates Console section                                                |

---

## Alternatives considered

**Templates in each caller** (auth and console separately): rejected because it would
duplicate `EmailLayout`, `EmailHeader`, `EmailFooter` and the locale/copy logic in two
places, immediately diverging.

**Templates as a new `packages/email-templates`** package: rejected because the template
rendering is tightly coupled to the mailer's types (`EmailBranding`, `MailOptions`) and
the number of templates doesn't justify a new package boundary.

**`branding` param on `send()`:** rejected because it would require `packages/mailer` to
depend on `packages/db` (to fetch branding) or force the mailer to accept arbitrary
injected data — neither is clean. Rendering is a caller concern; the mailer sends.

---

## Review checklist

- `pnpm email:dev` (in `packages/mailer`) starts the preview server on `:3003`; all
  templates render correctly with sample brand data
- Send a password reset email → arrives with brand logo in header, brand name in subject,
  CTA button in `brandPrimary` colour
- Block remote images in email client → brand name appears as `alt` text; email is still
  fully readable
- Set `emailFromName` in Console → Branding → email arrives with `From: Acme Corp <...>`
- Console → Settings → Email Templates: override invite subject to "Welcome to Acme Corp"
  → test-send → arrives with custom subject
- Console → Settings → Email Templates → live preview panel renders without a horizontal
  scrollbar at the default 560 px container width
- Set locale to Tamil (`ta`) in platform settings → invite email body renders in Tamil
  script
- Take `apps/auth` offline → password reset email still sends with graceful "Sovereign"
  defaults (branding cache fallback)
- `SOVEREIGN_RUNTIME_INTERNAL_URL` unset in `.env` → defaults to `http://localhost:3000`;
  Docker compose passes the correct internal service URL
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass
- Docs-parity test passes: `emailFromName`, `emailLogo`, `instanceUrl` in
  `sdk.platform.getConfig()` documented in `plugin-development.md`

---

## Changelog

- **v0.1** (June 2026) — Initial draft.
