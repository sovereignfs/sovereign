import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Page from '../../app/page';

describe('the home page', () => {
  const html = renderToStaticMarkup(<Page />);

  it('says what it is, in one level-one heading', () => {
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Sovereign Core');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', () => {
    expect(html).not.toMatch(/<script|<style|style="/);
  });
});
