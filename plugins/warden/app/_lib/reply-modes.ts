/**
 * The four things a chat request can ask for, shared by `ChatView` (client)
 * and `app/api/chat/route.ts` (server). Zero imports — a client component
 * imports this directly, same rule as `limits.ts`.
 *
 * - `send` — a new user message; the default, and the only mode that ever
 *   creates a session.
 * - `continue` — extend the *last assistant reply* where it left off, for a
 *   reply the model cut short at its output cap. Nothing new is said by the
 *   user; the continuation is appended onto the existing reply, on screen
 *   and in the database, rather than becoming a second bubble.
 * - `regenerate` — replace the last assistant reply with a fresh one to the
 *   same user message. The old reply is overwritten only once the new one
 *   has finished, so a failed attempt changes nothing.
 * - `edit` — resend the last user message with different text. The old
 *   user turn and its reply are removed and the new text is sent as if it
 *   had been the message all along. Only the *last* user message can be
 *   edited: editing an earlier one would fork the conversation, which the
 *   single-thread session model deliberately has no shape for.
 */
export type ReplyMode = 'send' | 'continue' | 'regenerate' | 'edit';

export const REPLY_MODES: readonly ReplyMode[] = ['send', 'continue', 'regenerate', 'edit'];

export function isReplyMode(value: unknown): value is ReplyMode {
  return typeof value === 'string' && (REPLY_MODES as readonly string[]).includes(value);
}

/**
 * What the model is told when asked to continue. Sent as a user turn for the
 * request only — never persisted, never shown — because a conversation that
 * simply ends on an assistant message is treated inconsistently across
 * OpenAI-compatible providers (some continue it, some start over), while an
 * explicit instruction is honoured by all of them and by the local model.
 */
export const CONTINUE_INSTRUCTION =
  'Continue your previous reply exactly where it left off. Do not repeat anything you already said, and do not add a preamble.';
