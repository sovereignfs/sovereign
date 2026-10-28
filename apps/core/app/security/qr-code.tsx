import { encode } from 'uqr';

/** Squares around the code that a scanner needs to find its edges. */
const QUIET_ZONE = 2;

/**
 * A QR code as an inline SVG, drawn from the data's modules: nothing is sent anywhere to make it,
 * and nothing is injected as markup. Colours come from the stylesheet.
 */
export function QrCode({ text, label }: { text: string; label: string }) {
  const modules = encode(text, { ecc: 'M', border: 0 }).data;
  const size = modules.length + QUIET_ZONE * 2;
  let path = '';
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    });
  });
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={path} />
    </svg>
  );
}
