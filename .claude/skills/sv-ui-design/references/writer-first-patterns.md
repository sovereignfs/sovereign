# Writer-first patterns — worked examples

Concrete patterns backing `sv-ui-design`. These come from the Plainwrite
redesign (`plugins/sovereign-plainwrite/docs/adhoc/plainwrite-ui-redesign.md`,
wireframes in `plainwrite-ui-redesign/`) and the QA-audit fixes that
established the error-UX convention.

## 1. Jargon-translation table (worked example)

Build one of these per feature with technical internals, before writing any
user-facing string. Internal terms stay in code, schema, and developer docs.

| Internal (code, schema, git)    | User-facing                                             |
| ------------------------------- | ------------------------------------------------------- |
| project                         | site                                                    |
| content file / `post-1.md`      | post (title from frontmatter)                           |
| collection                      | section                                                 |
| draft status `draft`            | Writing / "Draft — only you see this"                   |
| draft status `committed`        | Ready to publish                                        |
| draft status `published`        | Live on site                                            |
| pending-delete                  | "Removes from site on next publish · undo"              |
| sync                            | "Check for site updates" (automatic; quiet status chip) |
| commit message                  | auto-generated "Update ⟨title⟩"; Advanced only          |
| base revision / SHA             | never shown (Advanced only)                             |
| repo URL / branch / path prefix | "Where your site lives" (setup only)                    |
| PAT / OAuth credential          | "Publishing access"                                     |
| credential `needs_reauth`       | "Publishing access expired — reconnect"                 |
| publish conflict                | "This post changed on your site while you were editing" |
| roles viewer / editor / owner   | display Reader / Writer / Owner (same stored roles)     |

The pattern generalizes: the left column is precise mechanism, the right
column is **consequence in the user's world**. When unsure, ask "what does
this mean for what the user can see or do?" and name that.

## 2. Copy patterns

- **Status + consequence:** "Draft — only you see this", "Live on site",
  "Publishing access expired — reconnect". The label answers the follow-up
  question before it's asked.
- **Errors — what happened, then what to do:** "Couldn't reach that branch.
  Check the repository and branch name." Never raw exception text; never
  "Error:" prefixes; sanitize anything that could contain secrets before it
  reaches a message.
- **Confirmations state impact, not operation:** "Put 2 posts on your site —
  they'll be visible to anyone who visits" rather than "Execute publish
  (skipConflicts=false)".
- **Auto-generate + escape hatch:** derive filenames from titles, commit
  messages from actions; show a muted "will be saved as `blog/my-post.md` ·
  change" line instead of asking up front.
- **Empty states:** headline names the action ("Connect your first site"),
  one-line plain explanation, single CTA, plus one line for the invited-user
  persona ("Writing for someone else's site? Ask the owner to add you.").
- **Degraded states say both halves:** what is shown and what is missing —
  "Connect a GitHub token to see the full file list. Showing your local
  drafts only."

## 3. Error-UX code shapes

Established in `plugins/account`, `plugins/console`, and
`plugins/sovereign-plainwrite` — follow the same shapes, don't invent
variants.

**Shared result type** (per plugin, in its actions module):

```ts
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
```

**Server action** — `(boundArgs..., prevState, formData)` signature so it
plugs into `useActionState`; expected failures return, unexpected ones throw
(the boundary catches those):

```ts
export async function syncProjectContent(
  projectId: string,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  // authz failures still throw — not reachable from normal UI
  await requireProjectRole(db, tenantId, projectId, userId, 'editor');
  if (project.isPrivate && !credential.token) {
    return { ok: false, error: 'Connect a GitHub token before syncing a private repository.' };
  }
  try {
    await refreshProjectContentCache(db, tenantId, project, credential.token);
  } catch (error) {
    return { ok: false, error: sanitizeError(error) };
  }
  revalidateProject(projectId);
  return { ok: true };
}
```

**Client form** — pending label on the button, inline error with
`role="status" aria-live="polite"`, user input retained:

```tsx
const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

<form action={formAction}>
  {state && !state.ok ? (
    <p className={styles.feedbackError} role="status" aria-live="polite">
      {state.error}
    </p>
  ) : null}
  <Button type="submit" disabled={pending}>
    {pending ? 'Syncing…' : 'Sync content'}
  </Button>
</form>;
```

**Inline error styling** — the de-facto `.feedbackError` convention (until a
DS component exists):

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

**Plugin error boundary** — `app/error.tsx`, `'use client'`, logs the error,
shows plain copy and a "Try again" reset button styled with DS tokens.
Mirror `plugins/sovereign-plainwrite/app/error.tsx`.

## 4. Live-verification habit

UI changes are verified by driving them, not by reading the diff:

- Start the dev server with the preview tools; register a throwaway account
  if the flow needs auth.
- Reproduce the _failure_ paths on purpose (wrong branch, missing token,
  empty project) — the audit that produced this skill found every crash on
  paths a happy-path test never touches.
- Use `preview_snapshot`/`preview_inspect` for text and computed styles;
  screenshots only for layout.
- Re-check at mobile width (`preview_resize`, 768px breakpoint).
