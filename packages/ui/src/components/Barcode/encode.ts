/**
 * Linear barcodes as bars: EAN-13, EAN-8, UPC-A, Code 128 and Code 39, each to a row of modules (`true` is a bar), with no
 * dependency. Pure, so that each kind is tested against known codes with no browser. The quiet zone is the drawer's.
 */
export type BarcodeFormat = 'ean13' | 'ean8' | 'upca' | 'code128' | 'code39';

export interface EncodedBarcode {
  /** The bars and spaces, one module each. */
  modules: boolean[];
  /** What is written under the bars: the value with its check digit, where the kind has one. */
  text: string;
  /** The quiet zone each side, in modules, as the kind's specification asks at least. */
  quiet: number;
}

const bits = (pattern: string): boolean[] => [...pattern].map((c) => c === '1');

// ── EAN and UPC ────────────────────────────────────────────────────────────────────────────────────────────────────────

const EAN_L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const EAN_R = EAN_L.map((p) => [...p].map((c) => (c === '1' ? '0' : '1')).join(''));
const EAN_G = EAN_R.map((p) => [...p].reverse().join(''));
/** Which of the left half's six digits are set from G (and the rest from L), by EAN-13's first digit. */
const EAN13_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

/** The GS1 check digit of the digits before it: weights 3 and 1 from the right. */
export function gs1CheckDigit(digits: string): number {
  let sum = 0;
  for (let fromRight = 0; fromRight < digits.length; fromRight++) {
    sum += Number(digits[digits.length - 1 - fromRight]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** The digits with their check digit: given without it, it is added; given with it, it must be right. */
function withCheck(value: string, length: number): string | null {
  if (!/^\d+$/.test(value)) return null;
  if (value.length === length - 1) return value + gs1CheckDigit(value);
  if (value.length === length && gs1CheckDigit(value.slice(0, -1)) === Number(value.at(-1)))
    return value;
  return null;
}

function ean13(value: string): EncodedBarcode | null {
  const digits = withCheck(value, 13);
  if (!digits) return null;
  const parity = EAN13_PARITY[Number(digits[0])] ?? '';
  let pattern = '101';
  for (let i = 1; i <= 6; i++) {
    const d = Number(digits[i]);
    pattern += (parity[i - 1] === 'G' ? EAN_G : EAN_L)[d];
  }
  pattern += '01010';
  for (let i = 7; i <= 12; i++) pattern += EAN_R[Number(digits[i])];
  pattern += '101';
  return { modules: bits(pattern), text: digits, quiet: 11 };
}

function ean8(value: string): EncodedBarcode | null {
  const digits = withCheck(value, 8);
  if (!digits) return null;
  let pattern = '101';
  for (let i = 0; i < 4; i++) pattern += EAN_L[Number(digits[i])];
  pattern += '01010';
  for (let i = 4; i < 8; i++) pattern += EAN_R[Number(digits[i])];
  pattern += '101';
  return { modules: bits(pattern), text: digits, quiet: 7 };
}

function upca(value: string): EncodedBarcode | null {
  const digits = withCheck(value, 12);
  if (!digits) return null;
  // UPC-A is EAN-13 with a leading 0, whose parity is all L.
  const drawn = ean13(`0${digits}`);
  return drawn && { modules: drawn.modules, text: digits, quiet: 9 };
}

// ── Code 128 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Bar and space widths of each of Code 128's 107 symbols (103 to 105 are the starts; the stop is apart). */
const C128 = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
];
const C128_STOP = '2331112';
const START_B = 104;
const START_C = 105;
const CODE_B = 100;

const widths = (pattern: string): boolean[] =>
  [...pattern].flatMap((w, i) => Array<boolean>(Number(w)).fill(i % 2 === 0));

/**
 * Code 128: printable ASCII in set B; a value of digits alone in set C (two to a symbol), with its last digit in set B when it
 * has an odd number. Anything outside printable ASCII is refused.
 */
function code128(value: string): EncodedBarcode | null {
  if (value.length === 0 || value.length > 80 || !/^[\x20-\x7e]+$/.test(value)) return null;
  const codes: number[] = [];
  if (/^\d+$/.test(value) && value.length >= 2) {
    codes.push(START_C);
    const pairs = value.length - (value.length % 2);
    for (let i = 0; i < pairs; i += 2) codes.push(Number(value.slice(i, i + 2)));
    if (pairs < value.length) codes.push(CODE_B, value.charCodeAt(pairs) - 32);
  } else {
    codes.push(START_B);
    for (const ch of value) codes.push(ch.charCodeAt(0) - 32);
  }
  let sum = codes[0] ?? 0;
  for (let i = 1; i < codes.length; i++) sum += (codes[i] ?? 0) * i;
  codes.push(sum % 103);
  const modules = codes.flatMap((c) => widths(C128[c] ?? '')).concat(widths(C128_STOP));
  return { modules, text: value, quiet: 10 };
}

// ── Code 39 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Which of each character's nine elements (bar, space, … bar) are wide. */
const C39: Readonly<Record<string, string>> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  A: '100001001',
  B: '001001001',
  C: '101001000',
  D: '000011001',
  E: '100011000',
  F: '001011000',
  G: '000001101',
  H: '100001100',
  I: '001001100',
  J: '000011100',
  K: '100000011',
  L: '001000011',
  M: '101000010',
  N: '000010011',
  O: '100010010',
  P: '001010010',
  Q: '000000111',
  R: '100000110',
  S: '001000110',
  T: '000010110',
  U: '110000001',
  V: '011000001',
  W: '111000000',
  X: '010010001',
  Y: '110010000',
  Z: '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  $: '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
  '*': '010010100',
};
const C39_WIDE = 3;

/** Code 39: digits, capitals, space and `-.$/+%`, between the start and stop `*`, a narrow space between characters. */
function code39(value: string): EncodedBarcode | null {
  if (value.length === 0 || value.length > 40 || value.includes('*')) return null;
  if (![...value].every((ch) => Object.hasOwn(C39, ch))) return null;
  const modules: boolean[] = [];
  [...`*${value}*`].forEach((ch, index) => {
    if (index > 0) modules.push(false);
    [...(C39[ch] ?? '')].forEach((wide, i) => {
      modules.push(...Array<boolean>(wide === '1' ? C39_WIDE : 1).fill(i % 2 === 0));
    });
  });
  return { modules, text: value, quiet: 10 };
}

/** The bars of a value in a kind, or null when the value cannot be that kind (a wrong check digit, a character it has not). */
export function encodeBarcode(format: BarcodeFormat, value: string): EncodedBarcode | null {
  switch (format) {
    case 'ean13':
      return ean13(value);
    case 'ean8':
      return ean8(value);
    case 'upca':
      return upca(value);
    case 'code128':
      return code128(value);
    case 'code39':
      return code39(value);
  }
}
