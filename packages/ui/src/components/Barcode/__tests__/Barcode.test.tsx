// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Barcode } from '../Barcode';
import { encodeBarcode, gs1CheckDigit, type BarcodeFormat } from '../encode';

afterEach(cleanup);

const asText = (format: BarcodeFormat, value: string) =>
  encodeBarcode(format, value)
    ?.modules.map((bar) => (bar ? '1' : '0'))
    .join('');

// Every pattern below was checked bar for bar against bwip-js (BWIPP) and read back by ZXing, outside this repository: no
// encoder is a dependency here.
describe('the encoders, against known codes', () => {
  it('EAN-13', () => {
    expect(asText('ean13', '4006381333931')).toBe(
      '10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101',
    );
  });

  it('EAN-8', () => {
    expect(asText('ean8', '96385074')).toBe(
      '1010001011010111101111010110111010101001110111001010001001011100101',
    );
  });

  it('UPC-A', () => {
    expect(asText('upca', '036000291452')).toBe(
      '10100011010111101010111100011010001101000110101010110110011101001100110101110010011101101100101',
    );
  });

  it('Code 128, in set B for text and set C for digits', () => {
    expect(asText('code128', 'HELLO')).toBe(
      '110100100001100010100010001101000100011011101000110111010001110110110001010001100011101011',
    );
    expect(asText('code128', '1234567890')).toBe(
      '110100111001011001110010001011000111000101101100001010011011110110100111100101100011101011',
    );
  });

  it('Code 39, between its start and stop', () => {
    expect(asText('code39', 'CODE39')).toBe(
      '1000101110111010111011101000101011101011101000101010111000101110111010111000101011101110001010101011100010111010100010111011101',
    );
  });
});

describe('check digits', () => {
  it('are added when left out, and a wrong one is refused', () => {
    expect(gs1CheckDigit('400638133393')).toBe(1);
    expect(encodeBarcode('ean13', '400638133393')?.text).toBe('4006381333931');
    expect(encodeBarcode('ean13', '4006381333932')).toBeNull();
    expect(encodeBarcode('ean8', '9638507')?.text).toBe('96385074');
    expect(encodeBarcode('upca', '03600029145')?.text).toBe('036000291452');
    expect(encodeBarcode('upca', '036000291453')).toBeNull();
  });
});

describe('values a kind cannot hold', () => {
  it('are refused', () => {
    expect(encodeBarcode('ean13', '12345')).toBeNull();
    expect(encodeBarcode('ean13', '40063813339a')).toBeNull();
    expect(encodeBarcode('code39', 'lower')).toBeNull();
    expect(encodeBarcode('code39', 'A*B')).toBeNull();
    expect(encodeBarcode('code128', '')).toBeNull();
    expect(encodeBarcode('code128', 'café')).toBeNull();
  });

  it('a Code 128 of an odd number of digits ends in set B', () => {
    // Start C, 12, 34, CODE B, "5", the check symbol, then the stop: seven symbols of eleven modules and a stop of thirteen.
    expect(encodeBarcode('code128', '12345')?.modules).toHaveLength(6 * 11 + 13);
  });
});

describe('Barcode', () => {
  it('draws the bars as one labelled picture, black on white, with the value under it', () => {
    const { container } = render(
      <Barcode format="ean13" value="400638133393" label="Card barcode" />,
    );
    const svg = screen.getByRole('img', { name: 'Card barcode' });
    expect(svg.getAttribute('viewBox')).toBe('0 0 117 35');
    expect(container.querySelector('path')?.getAttribute('d')).toMatch(/^M11 0h1v35h-1z/);
    expect(screen.getByText('4006381333931')).toBeTruthy();
  });

  it('leaves the value out when asked', () => {
    render(<Barcode format="code39" value="ABC" label="Card" showText={false} />);
    expect(screen.queryByText('ABC')).toBeNull();
  });

  it('draws no bars for a value it cannot hold, and says so', () => {
    render(<Barcode format="ean8" value="123" label="Card" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('This code can’t be drawn.');
  });
});
