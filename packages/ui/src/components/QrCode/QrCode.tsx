import styles from './QrCode.module.css';

/** Squares around the code that a scanner needs to find its edges. */
const QUIET_ZONE = 2;

export interface QrCodeProps {
  /** The code's squares, row by row: `true` is dark. Made by a QR encoder; this component only draws them. */
  modules: readonly (readonly boolean[])[];
  /** What the picture is, for a screen reader: a QR code is read by a camera, not a person. */
  label: string;
}

/**
 * QrCode — draws a QR code's squares as an inline SVG: nothing is sent anywhere to make it, and nothing is injected
 * as markup. It is black on white in every theme, since a camera reads contrast, not a theme. The encoding is the
 * caller's (so this package carries no encoder): pass the module matrix an encoder such as `uqr` gives.
 */
export function QrCode({ modules, label }: QrCodeProps) {
  const size = modules.length + QUIET_ZONE * 2;
  let path = '';
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    });
  });
  return (
    <div className={styles.qr}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={path} />
      </svg>
    </div>
  );
}
