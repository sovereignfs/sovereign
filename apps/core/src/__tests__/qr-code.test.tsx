import { renderToStaticMarkup } from 'react-dom/server';
import { encode } from 'uqr';
import { describe, expect, it } from 'vitest';
import { QrCode } from '@sovereignfs/ui';

const URI = 'otpauth://totp/Sovereign:ada%40example.com?secret=GEZDGNBVGY3TQOJQ&issuer=Sovereign';

/** Reads the squares back out of the drawn path: the picture as a scanner would see it. */
function squaresOf(html: string, quiet: number): Set<string> {
  const path = /<path d="([^"]*)"/.exec(html)?.[1] ?? '';
  const squares = new Set<string>();
  for (const [, x, y] of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    squares.add(`${Number(x) - quiet},${Number(y) - quiet}`);
  }
  return squares;
}

describe('the QR code', () => {
  const html = renderToStaticMarkup(
    <QrCode modules={encode(URI, { ecc: 'M', border: 0 }).data} label="QR code for an app" />,
  );
  const { data } = encode(URI, { ecc: 'M', border: 0 });

  it('is an image with a label, so a screen reader says what it is', () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="QR code for an app"');
  });

  it('draws exactly the dark squares of the code, with room around it for a scanner', () => {
    const expected = new Set<string>();
    data.forEach((row, y) => row.forEach((dark, x) => dark && expected.add(`${x},${y}`)));
    expect(squaresOf(html, 2)).toEqual(expected);
    expect(html).toContain(`viewBox="0 0 ${data.length + 4} ${data.length + 4}"`);
  });

  it('is the same every time for the same text, and different for different text', () => {
    expect(
      renderToStaticMarkup(
        <QrCode modules={encode(URI, { ecc: 'M', border: 0 }).data} label="a" />,
      ),
    ).toBe(
      renderToStaticMarkup(
        <QrCode modules={encode(URI, { ecc: 'M', border: 0 }).data} label="a" />,
      ),
    );
    expect(
      renderToStaticMarkup(
        <QrCode modules={encode(`${URI}x`, { ecc: 'M', border: 0 }).data} label="a" />,
      ),
    ).not.toBe(html);
  });

  it('carries no script, style or colour of its own: it is drawn from the stylesheet', () => {
    expect(html).not.toMatch(/<script|<style|style=|fill=|#[0-9a-f]{3,6}/i);
  });
});
