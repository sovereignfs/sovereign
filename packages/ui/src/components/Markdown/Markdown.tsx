import { Fragment, type ReactNode } from 'react';
import { Typography } from '../Typography/Typography';
import styles from './Markdown.module.css';

export interface MarkdownProps {
  /** Raw markdown source. Supports: headings (#/##/###), paragraphs,
   * **bold**, *italic*, `code`, [links](url), unordered lists (-), ordered
   * lists (1. / 1)), fenced code blocks (```), and blockquotes (>),
   * including soft-wrapped continuation lines within a paragraph or list
   * item. Not a general-purpose CommonMark parser — no tables, images, or
   * nested blocks. */
  content: string;
  /** Renders every line within a paragraph on its own visual line (a
   * `<br>` between them) instead of the default CommonMark-style soft-wrap
   * (consecutive lines joined with a single space, requiring a blank line
   * for a new paragraph). Off by default — the soft-wrap behavior is
   * correct for this component's primary use (long-form, first-party
   * content authored *as* markdown, where a hard line break is a
   * deliberate `\`  ` or blank-line choice). Turn this on when rendering
   * plain, user-typed multi-line text that happens to be passed through
   * this component (e.g. a card description or comment body edited in an
   * ordinary `<textarea>`) — there, every Enter press is a real,
   * intentional line break the user typed, and silently collapsing it
   * into one run-on paragraph reads as broken, not as "markdown
   * formatting applied." */
  preserveLineBreaks?: boolean;
  className?: string;
}

let inlineKey = 0;

/** Parses **bold**, *italic*, `code`, and [text](url) within a line of text. */
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/;
  let remaining = text;

  while (remaining.length > 0) {
    const match = pattern.exec(remaining);
    if (!match) {
      nodes.push(remaining);
      break;
    }
    if (match.index > 0) nodes.push(remaining.slice(0, match.index));

    const [full, linkText, linkHref, boldText, italicText, codeText] = match;
    const key = `md-inline-${inlineKey++}`;
    if (linkHref !== undefined) {
      nodes.push(
        <a key={key} href={linkHref}>
          {linkText}
        </a>,
      );
    } else if (boldText !== undefined) {
      nodes.push(<strong key={key}>{boldText}</strong>);
    } else if (italicText !== undefined) {
      nodes.push(<em key={key}>{italicText}</em>);
    } else if (codeText !== undefined) {
      nodes.push(<code key={key}>{codeText}</code>);
    }
    remaining = remaining.slice(match.index + full.length);
  }

  return nodes;
}

const isQuote = (l: string) => l.startsWith('> ') || l === '>';
const isListItem = (l: string) => l.startsWith('- ');
const isHeading = (l: string) => /^#{1,3}\s+/.test(l);
/** ```` ```lang ```` — an opening (or closing) code fence. */
const isFence = (l: string) => /^\s*`{3,}/.test(l);
/** `1. item` or `1) item`. Bounded digit count so a long numeric line
 *  can't be mistaken for a list marker. */
const isOrderedItem = (l: string) => /^\d{1,9}[.)]\s+/.test(l);
/** A line that ends the current *paragraph* run — a blank line, or the
 * start of a heading, quote, list, or code block. Anything else (including
 * an indented continuation line) is folded into the paragraph, matching how
 * the source markdown soft-wraps prose across lines. */
const endsParagraph = (l: string) =>
  l.trim() === '' || isHeading(l) || isQuote(l) || isListItem(l) || isOrderedItem(l) || isFence(l);
/** A line that ends the current *unordered list* run — a blank line, or the
 * start of a heading, quote, code block, or an *ordered* item. Deliberately
 * does NOT include `isListItem`: a list item's own opening line legitimately
 * satisfies `isListItem`, so reusing `endsParagraph` here (which does) would
 * treat the first line of every list as ending the list before it started —
 * the list-collection loop would then never advance, looping forever. */
const endsList = (l: string) =>
  l.trim() === '' || isHeading(l) || isQuote(l) || isFence(l) || isOrderedItem(l);
/** The ordered-list mirror of `endsList` — excludes `isOrderedItem` for the
 *  same reason, and treats an unordered item as the start of a new block. */
const endsOrderedList = (l: string) =>
  l.trim() === '' || isHeading(l) || isQuote(l) || isFence(l) || isListItem(l);

function parseBlocks(content: string, preserveLineBreaks: boolean): ReactNode[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Checked before every other block type: everything between the fences
    // is verbatim, including blank lines and lines that would otherwise
    // read as headings, quotes, or list items.
    if (isFence(line)) {
      const fenceMatch = /^\s*(`{3,})(.*)$/.exec(line);
      const fence = fenceMatch?.[1] ?? '```';
      const language = (fenceMatch?.[2] ?? '').trim();
      const closing = new RegExp(`^\\s*${fence}\\s*$`);
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !closing.test(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      // Steps past the closing fence; a no-op at end of input, so an
      // unterminated fence renders the remainder as code (as CommonMark
      // does) rather than looping.
      i++;
      blocks.push(
        <div key={blockKey++} className={styles.block}>
          <pre className={styles.codeBlock}>
            <code data-language={language || undefined}>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1]?.length ?? 1) as 1 | 2 | 3;
      blocks.push(
        <div key={blockKey++} className={styles.block} data-heading>
          <Typography variant={`h${level}` as 'h1' | 'h2' | 'h3'}>
            {parseInline(heading[2] ?? '')}
          </Typography>
        </div>,
      );
      i++;
      continue;
    }

    if (isQuote(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && isQuote(lines[i] ?? '')) {
        quoteLines.push((lines[i] ?? '').slice(2));
        i++;
      }
      blocks.push(
        <div key={blockKey++} className={styles.block}>
          <blockquote className={styles.blockquote}>
            <Typography variant="body" as="p">
              {parseInline(quoteLines.join(' '))}
            </Typography>
          </blockquote>
        </div>,
      );
      continue;
    }

    if (isOrderedItem(line)) {
      const items: string[] = [];
      let start: number | undefined;
      while (i < lines.length && !endsOrderedList(lines[i] ?? '')) {
        const current = lines[i] ?? '';
        const match = /^(\d{1,9})[.)]\s+(.*)$/.exec(current);
        if (match) {
          // Honour the author's own starting number (a list resuming at 4),
          // but let the browser number the rest — markdown's own numbers
          // are conventionally ignored after the first.
          if (start === undefined) start = Number(match[1]);
          items.push(match[2] ?? '');
        } else {
          const lastIndex = items.length - 1;
          items[lastIndex] = `${items[lastIndex] ?? ''} ${current.trim()}`;
        }
        i++;
      }
      blocks.push(
        <div key={blockKey++} className={styles.block}>
          <ol
            className={styles.list}
            start={start !== undefined && start !== 1 ? start : undefined}
          >
            {items.map((item, idx) => (
              <Typography key={idx} variant="body" as="li">
                {parseInline(item)}
              </Typography>
            ))}
          </ol>
        </div>,
      );
      continue;
    }

    if (isListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && !endsList(lines[i] ?? '')) {
        const current = lines[i] ?? '';
        if (isListItem(current)) {
          items.push(current.slice(2));
        } else {
          // Continuation of the previous item's wrapped text.
          const lastIndex = items.length - 1;
          items[lastIndex] = `${items[lastIndex] ?? ''} ${current.trim()}`;
        }
        i++;
      }
      blocks.push(
        <div key={blockKey++} className={styles.block}>
          <ul className={styles.list}>
            {items.map((item, idx) => (
              <Typography key={idx} variant="body" as="li">
                {parseInline(item)}
              </Typography>
            ))}
          </ul>
        </div>,
      );
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && !endsParagraph(lines[i] ?? '')) {
      paraLines.push((lines[i] ?? '').trim());
      i++;
    }
    blocks.push(
      <div key={blockKey++} className={styles.block}>
        <Typography variant="body" as="p">
          {preserveLineBreaks
            ? paraLines.map((paraLine, lineIdx) => (
                <Fragment key={lineIdx}>
                  {lineIdx > 0 && <br />}
                  {parseInline(paraLine)}
                </Fragment>
              ))
            : parseInline(paraLines.join(' '))}
        </Typography>
      </div>,
    );
  }

  return blocks;
}

/** Renders a constrained markdown subset (see MarkdownProps) as styled React
 * elements built from Typography — no HTML string injection. Primarily
 * meant for long-form, first-party content pages (privacy policy, terms of
 * service) sourced from a single markdown file — not a general-purpose
 * CommonMark renderer for arbitrary markdown. Also fine for plain,
 * user-typed multi-line text (a card description, a comment body) edited
 * in an ordinary `<textarea>` and passed through unchanged, as long as
 * `preserveLineBreaks` is set — see that prop's own doc comment for why it
 * isn't the default. */
export function Markdown({ content, preserveLineBreaks = false, className }: MarkdownProps) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {parseBlocks(content, preserveLineBreaks)}
    </div>
  );
}
