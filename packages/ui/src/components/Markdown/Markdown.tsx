import type { ReactNode } from 'react';
import { Typography } from '../Typography/Typography';
import styles from './Markdown.module.css';

export interface MarkdownProps {
  /** Raw markdown source. Supports the subset used by Sovereign's own
   * long-form content pages: headings (#/##/###), paragraphs, **bold**,
   * *italic*, `code`, [links](url), unordered lists (-), and blockquotes
   * (>), including soft-wrapped continuation lines within a paragraph or
   * list item. Not a general-purpose CommonMark parser — no tables,
   * images, ordered lists, or nested blocks. */
  content: string;
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
/** A line that ends the current *paragraph* run — a blank line, or the
 * start of a heading, quote, or list block. Anything else (including an
 * indented continuation line) is folded into the paragraph, matching how
 * the source markdown soft-wraps prose across lines. */
const endsParagraph = (l: string) => l.trim() === '' || isHeading(l) || isQuote(l) || isListItem(l);
/** A line that ends the current *list* run — a blank line, or the start of
 * a heading or quote. Deliberately does NOT include `isListItem`: a list
 * item's own opening line legitimately satisfies `isListItem`, so reusing
 * `endsParagraph` here (which does) would treat the first line of every
 * list as ending the list before it started — the list-collection loop
 * would then never advance, looping forever. */
const endsList = (l: string) => l.trim() === '' || isHeading(l) || isQuote(l);

function parseBlocks(content: string): ReactNode[] {
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
          {parseInline(paraLines.join(' '))}
        </Typography>
      </div>,
    );
  }

  return blocks;
}

/** Renders a constrained markdown subset (see MarkdownProps) as styled React
 * elements built from Typography — no HTML string injection. Meant for
 * long-form, first-party content pages (privacy policy, terms of service)
 * sourced from a single markdown file, not for rendering arbitrary or
 * user-supplied markdown. */
export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>{parseBlocks(content)}</div>
  );
}
