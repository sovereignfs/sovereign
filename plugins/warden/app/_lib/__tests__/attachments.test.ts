import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_EXTRACTED_CHARS } from '../limits';

const getDocumentProxy = vi.fn();
const extractText = vi.fn();
vi.mock('unpdf', () => ({
  getDocumentProxy: (...args: unknown[]) => getDocumentProxy(...args),
  extractText: (...args: unknown[]) => extractText(...args),
}));

const { composeDocumentContent, processAttachment } = await import('../attachments');

function makeFile(content: string | Uint8Array, name: string, type: string): File {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return new File([bytes], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  getDocumentProxy.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('processAttachment — size', () => {
  it('rejects an empty file', async () => {
    const file = makeFile('', 'empty.txt', 'text/plain');
    const result = await processAttachment(file);
    expect(result).toEqual({ ok: false, error: 'That file is empty.' });
  });

  it('accepts a file exactly at the byte limit', async () => {
    const file = makeFile('a'.repeat(MAX_ATTACHMENT_BYTES), 'big.txt', 'text/plain');
    const result = await processAttachment(file);
    expect(result.ok).toBe(true);
  });

  it('rejects a file one byte over the limit', async () => {
    const file = makeFile('a'.repeat(MAX_ATTACHMENT_BYTES + 1), 'toobig.txt', 'text/plain');
    const result = await processAttachment(file);
    expect(result).toEqual({
      ok: false,
      error: `Attachments are limited to ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
    });
  });
});

describe('processAttachment — type allowlist', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s as an image', async (mime) => {
    const file = makeFile(new Uint8Array([1, 2, 3]), 'photo', mime);
    const result = await processAttachment(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attachment.kind).toBe('image');
  });

  it('accepts text/plain as a document', async () => {
    const file = makeFile('hello world', 'notes.txt', 'text/plain');
    const result = await processAttachment(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attachment.kind).toBe('document');
  });

  it('rejects an arbitrary unsupported type', async () => {
    const file = makeFile('PK', 'archive.zip', 'application/zip');
    const result = await processAttachment(file);
    expect(result).toEqual({
      ok: false,
      error:
        'That file type is not supported. Try an image (PNG/JPEG/WebP), a PDF, or a text file.',
    });
  });

  it('falls back to the .md extension when file.type is empty', async () => {
    const file = makeFile('# Heading', 'readme.md', '');
    const result = await processAttachment(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attachment.kind).toBe('document');
  });

  it('falls back to the .txt extension when file.type is application/octet-stream', async () => {
    const file = makeFile('plain notes', 'notes.txt', 'application/octet-stream');
    const result = await processAttachment(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attachment.kind).toBe('document');
  });
});

describe('processAttachment — image', () => {
  it('produces a base64 data URL', async () => {
    const file = makeFile(new Uint8Array([1, 2, 3]), 'photo.png', 'image/png');
    const result = await processAttachment(file);
    expect(result.ok).toBe(true);
    if (result.ok && result.attachment.kind === 'image') {
      expect(result.attachment.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(result.attachment.filename).toBe('photo.png');
    }
  });
});

describe('processAttachment — PDF', () => {
  it('extracts text via unpdf and merges pages', async () => {
    extractText.mockResolvedValue({ totalPages: 2, text: 'Hello from the PDF.' });
    const file = makeFile(new Uint8Array([1]), 'report.pdf', 'application/pdf');
    const result = await processAttachment(file);
    expect(getDocumentProxy).toHaveBeenCalled();
    expect(extractText).toHaveBeenCalledWith({}, { mergePages: true });
    expect(result.ok).toBe(true);
    if (result.ok && result.attachment.kind === 'document') {
      expect(result.attachment.extractedText).toBe('Hello from the PDF.');
      expect(result.attachment.truncated).toBe(false);
    }
  });

  it('rejects a PDF with no extractable text', async () => {
    extractText.mockResolvedValue({ totalPages: 1, text: '   ' });
    const file = makeFile(new Uint8Array([1]), 'scanned.pdf', 'application/pdf');
    const result = await processAttachment(file);
    expect(result).toEqual({
      ok: false,
      error: 'This PDF has no extractable text — it may be a scanned or image-only PDF.',
    });
  });
});

describe('processAttachment — plain text/Markdown', () => {
  it('reads the file content directly, unchanged', async () => {
    const file = makeFile('line one\nline two', 'notes.txt', 'text/plain');
    const result = await processAttachment(file);
    expect(result.ok).toBe(true);
    if (result.ok && result.attachment.kind === 'document') {
      expect(result.attachment.extractedText).toBe('line one\nline two');
    }
  });
});

describe('processAttachment — truncation', () => {
  it('truncates extracted text past the limit and flags it', async () => {
    const longText = 'x'.repeat(MAX_ATTACHMENT_EXTRACTED_CHARS + 500);
    const file = makeFile(longText, 'long.txt', 'text/plain');
    const result = await processAttachment(file);
    expect(result.ok).toBe(true);
    if (result.ok && result.attachment.kind === 'document') {
      expect(result.attachment.extractedText).toHaveLength(MAX_ATTACHMENT_EXTRACTED_CHARS);
      expect(result.attachment.truncated).toBe(true);
    }
  });
});

describe('composeDocumentContent', () => {
  it('composes the caption, filename, and extracted text', () => {
    const content = composeDocumentContent('Please summarize this', {
      kind: 'document',
      filename: 'report.pdf',
      extractedText: 'Q3 revenue grew 10%.',
      truncated: false,
    });
    expect(content).toBe(
      'Please summarize this\n\n--- Attached: report.pdf ---\nQ3 revenue grew 10%.',
    );
  });

  it('appends a truncation note only when truncated', () => {
    const content = composeDocumentContent('', {
      kind: 'document',
      filename: 'long.txt',
      extractedText: 'partial text',
      truncated: true,
    });
    expect(content).toBe('\n\n--- Attached: long.txt ---\npartial text\n...[truncated]');
  });
});
