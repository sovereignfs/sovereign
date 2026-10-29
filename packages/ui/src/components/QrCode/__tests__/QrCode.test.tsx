import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QrCode } from '../QrCode';

const MODULES = [
  [true, false, true],
  [false, true, false],
  [true, false, true],
];

/** The squares in the drawn path, as the code's own coordinates. */
function squares(html: string, quiet: number): string[] {
  const path = /<path d="([^"]*)"/.exec(html)?.[1] ?? '';
  return [...path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(
    ([, x, y]) => `${Number(x) - quiet},${Number(y) - quiet}`,
  );
}

describe('QrCode', () => {
  const html = renderToStaticMarkup(<QrCode modules={MODULES} label="QR code for an app" />);

  it('is an image with a label, so a screen reader says what it is', () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="QR code for an app"');
  });

  it('draws exactly the dark squares, with room round them for a scanner', () => {
    expect(squares(html, 2)).toEqual(['0,0', '2,0', '1,1', '0,2', '2,2']);
    expect(html).toContain('viewBox="0 0 7 7"');
  });

  it('draws nothing for a matrix with no dark square, and does not throw for an empty one', () => {
    expect(squares(renderToStaticMarkup(<QrCode modules={[[false]]} label="x" />), 2)).toEqual([]);
    expect(() => renderToStaticMarkup(<QrCode modules={[]} label="x" />)).not.toThrow();
  });

  it('is the same every time for the same squares', () => {
    expect(renderToStaticMarkup(<QrCode modules={MODULES} label="QR code for an app" />)).toBe(
      html,
    );
  });

  it('injects no markup of its own from the label', () => {
    const hostile = renderToStaticMarkup(
      <QrCode modules={MODULES} label={'"><script>x</script>'} />,
    );
    expect(hostile).not.toContain('<script>');
  });
});
