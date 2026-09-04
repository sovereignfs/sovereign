import { extractText, getDocumentProxy } from 'unpdf';
import {
  classifyAttachmentType,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_EXTRACTED_CHARS,
} from './limits';

/**
 * Server-only file-attachment processing. Never import this from a client
 * component (`ChatView.tsx`) — it pulls in `unpdf` (a real dependency, not
 * a type-only one), which would drag pdf.js into the browser bundle.
 * Client-side code gets its own needs (constants, the type classifier, and
 * the two pure placeholder-string builders) from `limits.ts`, which has
 * zero imports and stays that way for exactly this reason.
 *
 * Images are deliberately never persisted — see RFC 0063's follow-up
 * decision log. `processAttachment` returns a `dataUrl` for the *current*
 * request only; nothing here writes to `sdk.storage` or any DB table.
 */

export interface ProcessedImageAttachment {
  kind: 'image';
  filename: string;
  /** `data:<mime>;base64,<data>` — used once, for the outgoing model
   *  request, then discarded. Never persisted. */
  dataUrl: string;
}

export interface ProcessedDocumentAttachment {
  kind: 'document';
  filename: string;
  extractedText: string;
  truncated: boolean;
}

export type ProcessedAttachment = ProcessedImageAttachment | ProcessedDocumentAttachment;

export type ProcessAttachmentResult =
  { ok: true; attachment: ProcessedAttachment } | { ok: false; error: string };

function truncateExtractedText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_ATTACHMENT_EXTRACTED_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_ATTACHMENT_EXTRACTED_CHARS), truncated: true };
}

export async function processAttachment(file: File): Promise<ProcessAttachmentResult> {
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `Attachments are limited to ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const kind = classifyAttachmentType(file.type, file.name);
  if (!kind) {
    return {
      ok: false,
      error:
        'That file type is not supported. Try an image (PNG/JPEG/WebP), a PDF, or a text file.',
    };
  }

  if (kind === 'image') {
    const bytes = Buffer.from(await file.arrayBuffer());
    return {
      ok: true,
      attachment: {
        kind: 'image',
        filename: file.name,
        dataUrl: `data:${file.type};base64,${bytes.toString('base64')}`,
      },
    };
  }

  // Everything below is anticipated failure, reported as a result — but
  // `getDocumentProxy`/`extractText` *throw* on a malformed, encrypted or
  // password-protected PDF, and `file.text()` can throw on a decoding
  // error. Uncaught, those escaped the route entirely and surfaced as an
  // opaque 500, which `ChatView` renders as "Warden is unavailable right
  // now." — blaming the model provider for what is actually a bad file.
  let extracted: string;
  if (file.type === 'application/pdf') {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const result = await extractText(pdf, { mergePages: true });
      extracted = typeof result.text === 'string' ? result.text : result.text.join('\n');
    } catch {
      return {
        ok: false,
        error: "This PDF couldn't be read. It may be corrupt, encrypted, or password-protected.",
      };
    }
    if (extracted.trim().length === 0) {
      return {
        ok: false,
        error: 'This PDF has no extractable text — it may be a scanned or image-only PDF.',
      };
    }
  } else {
    try {
      extracted = await file.text();
    } catch {
      return { ok: false, error: "This file couldn't be read as text." };
    }
  }

  const { text, truncated } = truncateExtractedText(extracted);
  return {
    ok: true,
    attachment: { kind: 'document', filename: file.name, extractedText: text, truncated },
  };
}

/**
 * The permanent, persisted representation of a document turn — replaces
 * the client's `describeDocumentPlaceholder` (`limits.ts`) once the server
 * has actually extracted the text. Used for *both* what's sent to the model
 * and what's written to `warden_messages` — a document attachment is just
 * text, so there's no separate "for the model" vs. "for history" shape the
 * way there is for images.
 */
export function composeDocumentContent(
  userTypedText: string,
  doc: ProcessedDocumentAttachment,
): string {
  const truncationNote = doc.truncated ? '\n...[truncated]' : '';
  return `${userTypedText}\n\n--- Attached: ${doc.filename} ---\n${doc.extractedText}${truncationNote}`;
}
