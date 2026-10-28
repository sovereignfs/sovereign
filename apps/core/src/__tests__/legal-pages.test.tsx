import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = vi.fn();
vi.mock('next/server', () => ({ connection: () => connection() as unknown }));

const { default: PrivacyPage, metadata: privacyMetadata } =
  await import('../../app/(legal)/privacy/page');
const { default: TermsPage, metadata: termsMetadata } = await import('../../app/(legal)/tos/page');
const { PRIVACY, TERMS } = await import('../legal/content');

beforeEach(() => connection.mockReset().mockResolvedValue(undefined));

/** The page is a plain function returning an async component: call both, as the server would. */
const render = async (page: () => React.ReactElement) => {
  const element = page();
  const component = element.type as (props: unknown) => Promise<React.ReactElement>;
  return renderToStaticMarkup(await component(element.props));
};

describe.each([
  ['the privacy page', PrivacyPage, privacyMetadata, PRIVACY, '/tos', 'Terms of Service'],
  ['the terms page', TermsPage, termsMetadata, TERMS, '/privacy', 'Privacy Policy'],
])('%s', (_name, Page, metadata, document, otherHref, otherLabel) => {
  it('shows the whole document: one heading, every section, every item', async () => {
    const html = await render(Page);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain(document.title);
    expect(html.match(/<h2[ >]/g)).toHaveLength(document.sections.length);
    for (const section of document.sections) {
      expect(html).toContain(section.heading);
      for (const block of section.blocks) {
        for (const text of typeof block === 'string' ? [block] : block.list) {
          // The renderer escapes; the text has apostrophes and quotes as typographic characters.
          expect(html).toContain(text);
        }
      }
    }
  });

  it('is titled for the browser, and links to the other document and back to sign-in', async () => {
    expect(metadata.title).toBe(document.title);
    const html = await render(Page);
    expect(html).toContain(`href="${otherHref}"`);
    expect(html).toContain(otherLabel);
    expect(html).toContain('href="/sign-in"');
  });

  it('is rendered on every request, because the nonce in its policy exists only for one', async () => {
    await render(Page);
    expect(connection).toHaveBeenCalledOnce();
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    expect(await render(Page)).not.toMatch(/<script|<style|style="/);
  });
});
