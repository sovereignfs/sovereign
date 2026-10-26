# Writer-first patterns — worked examples

Concrete patterns backing `sv-ui-design`. They come from the Sovereign UI
work that established the error-UX convention, rewritten with core's own
vocabulary.

## 1. Jargon-translation table (worked example)

Build one of these per feature with technical internals, before writing any
user-facing string. Internal terms stay in code, schema, the Core API and
developer docs.

| Internal (code, protocol)              | User-facing                                                      |
| -------------------------------------- | ---------------------------------------------------------------- |
| OAuth / OIDC client                    | app                                                              |
| scope `profile`                        | "Your name, picture, language and time zone"                     |
| scope `email`                          | "Your email address"                                             |
| scope `directory`                      | "Find other people on this instance"                             |
| scope `offline_access`                 | "Stay signed in when you're not using it"                        |
| consent grant                          | "Apps you've allowed" / "Connected apps"                         |
| revoke consent                         | "Remove access"                                                  |
| `sub`                                  | never shown, except "Copy account ID" in the Console             |
| session                                | "Signed-in device" (with browser and last active)                |
| TOTP / backup codes                    | "Authenticator app" / "Recovery codes"                           |
| passkey (WebAuthn credential)          | "Passkey"                                                        |
| `platform:owner` / `admin` / `user`    | Owner / Admin / Member                                           |
| capability matrix                      | "What each role can do" (Console only)                           |
| deactivated account                    | "Suspended — can't sign in"                                      |
| client secret (Console)                | "Secret" — shown once, with "Copy" and a warning it won't reappear |
| trusted client (Console)               | "Skip the permission screen for this app"                        |

The pattern generalizes: the left column is precise mechanism, the right
column is **consequence in the person's world**. When unsure, ask "what does
this mean for what the person can see or do?" and name that.

## 2. Copy patterns

- **Status + consequence:** "Invite pending — expires in 3 days",
  "Suspended — can't sign in", "Secret shown once — copy it now". The label
  answers the follow-up question before it's asked.
- **Errors — what happened, then what to do:** "That code didn't work. Check
  your authenticator app and try again." Never raw exception text; never
  "Error:" prefixes; sanitize anything that could contain secrets before it
  reaches a message.
- **Confirmations state impact, not operation:** "Remove access for Notes?
  It will ask again the next time you open it." rather than "Revoke consent
  grant".
- **Auto-generate + escape hatch:** derive what can be derived (an app's icon
  from its name) and offer a muted "change" instead of asking up front.
- **Empty states:** headline names the action ("Register your first app"),
  one-line plain explanation, single call to action, plus one line for the
  invited-person persona where relevant.
- **Degraded states say both halves:** what is shown and what is missing —
  "Email isn't set up, so invitations can't be sent. Ask the owner to add
  mail settings."

## 3. Error-UX code shapes

Follow the same shapes everywhere; don't invent variants.

**Shared result type** (per feature, in its actions module):

```ts
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
```

**Server action** — `(boundArgs..., prevState, formData)` signature so it
plugs into `useActionState`; expected failures return, unexpected ones throw
(the boundary catches those):

```ts
export async function cancelInvite(
  inviteId: string,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  // authorization failures still throw — not reachable from normal UI
  await requireCapability('user:manage');
  const invite = await findInvite(inviteId);
  if (!invite || invite.usedAt) {
    return { ok: false, error: 'That invite has already been used or cancelled.' };
  }
  await deleteInvite(inviteId);
  revalidatePath('/console/users');
  return { ok: true };
}
```

**Client form** — pending label on the button, inline error with
`role="status" aria-live="polite"`, input retained:

```tsx
const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

<form action={formAction}>
  {state && !state.ok ? (
    <p className={styles.feedbackError} role="status" aria-live="polite">
      {state.error}
    </p>
  ) : null}
  <Button type="submit" disabled={pending}>
    {pending ? 'Cancelling…' : 'Cancel invite'}
  </Button>
</form>;
```

**Inline error styling** — the de-facto `.feedbackError` convention (until a
design-system component exists):

```css
.feedbackError {
  margin: 0;
  font-size: var(--sv-font-size-sm);
  padding: var(--sv-space-2) var(--sv-space-3);
  border-radius: var(--sv-radius-md);
  border: 1px solid var(--sv-color-error-border);
  background-color: var(--sv-color-error-surface);
  color: var(--sv-color-error-text);
}
```

**Error boundary** — `error.tsx`, `'use client'`, logs the error, shows plain
copy and a "Try again" reset button styled with design-system tokens.

## 4. Live-verification habit

UI changes are verified by driving them, not by reading the diff:

- Start the dev server (your harness's browser/preview tooling); register a
  throwaway account if the flow needs auth.
- Reproduce the _failure_ paths on purpose (wrong code, expired invite,
  missing mail settings) — crashes hide on paths a happy-path test never
  touches.
- Read text and computed styles through the tooling; use screenshots only for
  layout.
- Re-check at mobile width (768px breakpoint) and in both themes.
