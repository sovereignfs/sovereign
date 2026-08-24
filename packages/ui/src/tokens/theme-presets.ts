/**
 * Sovereign Design System — theme presets (RFC 0094).
 *
 * The single source of truth for every built-in theme preset's token
 * overrides. Deliberately plain data (no CSS-in-JS, no build dependency) so
 * it can be consumed two ways with zero duplication:
 *   - `scripts/generate-theme-presets-css.ts` (`pnpm generate:theme-presets`)
 *     reads this file and emits `theme-presets.css` for Storybook/standalone
 *     consumers.
 *   - `runtime/src/instance-style.ts` (RFC 0095) imports `THEME_PRESETS`
 *     directly and flattens the selected preset into the existing
 *     `:root { ... }` instance-style injection — no CSS parsing, no second
 *     copy of these values to drift out of sync.
 *
 * Presets are closed and built-in (RFC 0094's "Alternatives considered") —
 * add a new one here and re-run the generator, never accept arbitrary
 * operator-supplied values into this shape.
 *
 * `'default'` MUST stay `{ light: {}, dark: {} }` — an empty override set is
 * what guarantees today's look stays byte-identical for every instance that
 * never opts into a different preset.
 */

export type ThemePresetName = 'default' | 'neobrutalism';

export const THEME_PRESET_NAMES: readonly ThemePresetName[] = ['default', 'neobrutalism'];

export interface ThemePresetTokens {
  /** Sparse — only tokens this preset overrides. Everything else falls through to the default. */
  light: Record<string, string>;
  dark: Record<string, string>;
}

export const THEME_PRESETS: Record<ThemePresetName, ThemePresetTokens> = {
  default: { light: {}, dark: {} },
  neobrutalism: {
    light: {
      // --sv-radius-scale is a calc()-chain root: --sv-radius-sm..-3xl are
      // all `calc(var(--sv-radius-scale) * ...)`, declared once at :root
      // (primitives.css). This ONLY cascades correctly if the selector this
      // override lands under matches :root itself (<html>) — a scoped
      // descendant selector would set --sv-radius-scale there, but the
      // dependent --sv-radius-* tokens were never re-declared at that node,
      // so they'd keep inheriting their :root-resolved value unchanged. See
      // the `withRadius` decorator comment in `.storybook/preview.ts` for
      // the same constraint, discovered independently while building RFC
      // 0077's Token Gallery preset demo.
      '--sv-radius-scale': '0',
      '--sv-border-width-hairline': '2px',
      '--sv-shadow-card': '4px 4px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-hover': '6px 6px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-popover': '4px 4px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-overlay': '8px 8px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-control': '2px 2px 0 0 var(--sv-color-border-strong)',
      '--sv-button-shadow': '4px 4px 0 0 var(--sv-color-border-strong)',
      '--sv-button-press-x': '4px',
      '--sv-button-press-y': '4px',
    },
    dark: {
      '--sv-radius-scale': '0',
      '--sv-border-width-hairline': '2px',
      '--sv-shadow-card': '4px 4px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-hover': '6px 6px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-popover': '4px 4px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-overlay': '8px 8px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-control': '2px 2px 0 0 var(--sv-color-border-strong)',
      '--sv-button-shadow': '4px 4px 0 0 var(--sv-color-border-strong)',
      '--sv-button-press-x': '4px',
      '--sv-button-press-y': '4px',
    },
  },
};
