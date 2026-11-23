import { type BarcodeFormat, encodeBarcode } from './encode';
import styles from './Barcode.module.css';

export interface BarcodeProps {
  format: BarcodeFormat;
  /** The value. EAN-13, EAN-8 and UPC-A take it with or without its check digit; a wrong one is refused. */
  value: string;
  /** What the picture is, for a screen reader: a barcode is read by a scanner, not a person. */
  label: string;
  /** Whether the value is written under the bars, as a cashier reads it when the scanner cannot. On by default. */
  showText?: boolean;
  /** Said in place of the bars when the value cannot be drawn in its kind. English by default. */
  invalidText?: string;
}

/** How tall the bars are, as a share of the code's width: enough for a hand-held scanner at a till. */
const HEIGHT_RATIO = 0.3;
const MIN_HEIGHT = 30;

/**
 * Barcode — a linear barcode (EAN-13, EAN-8, UPC-A, Code 128, Code 39) drawn as an inline SVG, as `QrCode` draws a QR code: no
 * dependency, nothing requested, nothing injected as markup. Black on white in every theme, with its quiet zone, scaled to its
 * width. A value its kind cannot hold draws no bars and says so.
 */
export function Barcode({
  format,
  value,
  label,
  showText = true,
  invalidText = 'This code can’t be drawn.',
}: BarcodeProps) {
  const encoded = encodeBarcode(format, value);
  if (!encoded) {
    return (
      <p className={styles.invalid} role="status">
        {invalidText}
      </p>
    );
  }
  const width = encoded.modules.length + encoded.quiet * 2;
  const height = Math.max(MIN_HEIGHT, Math.round(width * HEIGHT_RATIO));
  let path = '';
  let x = 0;
  while (x < encoded.modules.length) {
    if (!encoded.modules[x]) {
      x++;
      continue;
    }
    let run = 1;
    while (encoded.modules[x + run]) run++;
    path += `M${x + encoded.quiet} 0h${run}v${height}h-${run}z`;
    x += run;
  }
  return (
    <figure className={styles.barcode}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={path} />
      </svg>
      {showText && <figcaption className={styles.text}>{encoded.text}</figcaption>}
    </figure>
  );
}
