/**
 * Request limits (RFC 0063 §6/§7, epic task 22.5) — carried forward from
 * the first rewrite's posture: enforced server-side, not left to the
 * client. Hardcoded rather than new plugin-scoped env vars — conservative,
 * sane phase-1 defaults; not worth a new operator-facing config surface
 * (and the self-hosting.md doc-parity update that would require) until a
 * real need for tuning them shows up.
 *
 * Deliberately no concurrency cap for external-provider requests here,
 * unlike the original local-only design. The local path still has its own
 * cap, unchanged, inside `apps/harness` itself — that matters because
 * excess concurrent *local* requests compete for this server's own
 * CPU/GPU, affecting every user. An external provider request's blast
 * radius if a user fires off many at once is the user's own account/rate
 * limit with a service they configured themselves, not shared instance
 * infrastructure — a meaningfully lower-severity case that isn't worth the
 * added complexity of a per-user semaphore in this phase.
 */
export const MAX_INPUT_CHARS = 4000;
export const MAX_OUTPUT_TOKENS = 1024;
export const MAX_RECENT_TURNS = 20;
export const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Bounds for the manual "delete sessions inactive for over N days" action.
 * Shared by the stepper's own `min`/`max` and the server action's guard —
 * the stepper alone is not enforcement, since a `'use server'` function is a
 * public POST endpoint dispatched by action id. Unbounded, a `0` or negative
 * value puts the cutoff at or after "now" and deletes every unpinned
 * session, including ones used seconds ago.
 */
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 365;

/** A single file per message, checked before any bytes are read. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Generous vs. `MAX_INPUT_CHARS` on purpose — this budgets reference
 *  material (an attached document's extracted text), not a typed chat
 *  message. Past this, `attachments.ts`'s `composeDocumentContent` truncates
 *  and notes it rather than rejecting the whole attachment. */
export const MAX_ATTACHMENT_EXTRACTED_CHARS = 20_000;

export type AttachmentKind = 'image' | 'document';

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DOCUMENT_MIME_TYPES = new Set(['application/pdf', 'text/plain', 'text/markdown']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.txt', '.md']);

/**
 * Shared by both `ChatView.tsx` (client-side pre-validation) and
 * `attachments.ts` (server-side authority) — this file has zero imports and
 * must stay that way, since a client component imports it directly and can
 * never pull in `unpdf`/`@sovereignfs/sdk`/anything server-only.
 *
 * Falls back to the filename extension when `mimeType` is empty or the
 * generic `application/octet-stream` — `.md` (and sometimes `.txt`) report
 * an empty/wrong `File.type` on some browsers/OSes since there's no
 * registered system UTI for it, not because the file is actually untyped.
 */
export function classifyAttachmentType(mimeType: string, filename: string): AttachmentKind | null {
  if (IMAGE_MIME_TYPES.has(mimeType)) return 'image';
  if (DOCUMENT_MIME_TYPES.has(mimeType)) return 'document';
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (
    DOCUMENT_EXTENSIONS.has(ext) &&
    (mimeType === '' || mimeType === 'application/octet-stream')
  ) {
    return 'document';
  }
  return null;
}

/**
 * The in-session optimistic placeholder for an image turn — also what gets
 * permanently persisted (images themselves are never stored; see RFC 0063
 * follow-up decision log). Both `ChatView.tsx` and `route.ts` use this same
 * function so the live-rendered turn and the reloaded-from-history turn are
 * byte-identical.
 */
export function describeImageForHistory(userTypedText: string, filename: string): string {
  return `${userTypedText}\n\n[Image attached: ${filename}]`;
}

/**
 * The in-session optimistic placeholder for a document turn. Unlike images,
 * this is *not* what gets persisted — the server replaces it with the full
 * extracted text (`composeDocumentContent`, in `attachments.ts`) once
 * `unpdf`/`file.text()` has actually run. The client can't compose the real
 * value up front since only the server extracts document text.
 */
export function describeDocumentPlaceholder(userTypedText: string, filename: string): string {
  return `${userTypedText}\n\n[Document attached: ${filename}]`;
}
