import type { InstanceConfig, RadiusPreset } from '@sovereignfs/db';

/** Fixed lightness delta used to derive --sv-color-accent-hover from the instance accent. */
const ACCENT_HOVER_LIGHTNESS_DELTA = 8;

/** RFC 0077 — corner-radius intensity presets, applied as --sv-radius-scale.
 * 'm' (scale 1) matches the primitive token's own default in primitives.css —
 * setting it explicitly here is a no-op visually, kept for a single source
 * of truth rather than special-casing 'm' as "don't emit a line". */
const RADIUS_SCALE: Record<RadiusPreset, number> = {
  none: 0,
  xs: 0.35,
  s: 0.65,
  m: 1,
  l: 2.75,
};

/** Parse a validated 6-digit hex colour to HSL triple (all 0–100 for L). */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Build the inline style block that injects instance CSS custom properties at
 * :root. Pure string-building logic — kept in its own plain `.ts` file (no
 * JSX) so it's importable from Vitest without hitting `runtime`'s
 * `jsx: "preserve"` tsconfig, which Vitest's esbuild transform can't parse.
 */
export function buildInstanceStyle(config: InstanceConfig): string {
  const lines: string[] = [];

  if (config.instanceLogo) {
    lines.push(`  --sv-instance-logo: url(${JSON.stringify(config.instanceLogo)});`);
  }
  if (config.instanceLogoDark) {
    lines.push(`  --sv-instance-logo-dark: url(${JSON.stringify(config.instanceLogoDark)});`);
  }
  if (config.instanceFavicon) {
    lines.push(`  --sv-instance-favicon: url(${JSON.stringify(config.instanceFavicon)});`);
  }
  if (config.instanceRadius) {
    lines.push(`  --sv-radius-scale: ${RADIUS_SCALE[config.instanceRadius]};`);
  }

  if (config.instancePrimary) {
    const [h, s, l] = hexToHsl(config.instancePrimary);
    // Hover: shift lightness toward background (darker on light theme, lighter on dark).
    // Clamped so the result stays in [0, 100].
    const hoverLLight = Math.max(0, Math.min(100, l - ACCENT_HOVER_LIGHTNESS_DELTA));
    const hoverLDark = Math.max(0, Math.min(100, l + ACCENT_HOVER_LIGHTNESS_DELTA));
    lines.push(`  --sv-color-accent: hsl(${h}, ${s}%, ${l}%);`);
    lines.push(`  --sv-color-accent-hover: hsl(${h}, ${s}%, ${hoverLLight}%);`);
    // On dark theme the accent-hover lightens instead of darkens.
    // We append a [data-theme='dark'] block separately.
    return (
      `:root {\n${lines.join('\n')}\n}` +
      `\n[data-theme='dark'] {\n  --sv-color-accent-hover: hsl(${h}, ${s}%, ${hoverLDark}%);\n}`
    );
  }

  return lines.length > 0 ? `:root {\n${lines.join('\n')}\n}` : '';
}
