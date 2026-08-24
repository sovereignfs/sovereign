import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '../src/tokens/primitives.css';
import '../src/tokens/semantic.css';
import '../src/tokens/theme-presets.css';
import './preview-globals.css';
import { THEME_PRESETS, type ThemePresetName } from '../src/tokens/theme-presets';

// RFC 0077 corner-radius presets. Mirrors runtime/src/instance-style.ts's
// RADIUS_SCALE table — that's the canonical, production lookup (driven by
// InstanceConfig.instanceRadius); this is Storybook's own dev-tooling copy,
// not a second source of truth for the feature. packages/ui can't import it
// directly — runtime depends on packages/ui, never the reverse.
const RADIUS_SCALE: Record<string, number> = {
  none: 0,
  xs: 0.35,
  s: 0.65,
  m: 1,
  l: 2.75,
};

// Sets --sv-radius-scale directly on the preview iframe's <html> — the same
// cascade node primitives.css declares --sv-radius-sm/md/etc. on. A custom
// property that references another custom property inside calc() only
// re-resolves for overrides at that same declaring node, not for a scoped
// wrapper further down (confirmed while building the Token Gallery's own
// preset demo — see its comment for the full explanation), so this can't be
// a story-scoped decorator wrapper; it has to reach all the way to :root.
//
// RFC 0094 interaction: a theme preset (below) can ALSO define
// --sv-radius-scale, delivered via theme-presets.css's
// [data-theme-preset='...'] stylesheet rule. An inline style (what this
// decorator sets) always beats any stylesheet rule for the same property,
// regardless of selector specificity — so if this effect always ran
// unconditionally, it would permanently shadow the preset's own radius
// override and the Radius toolbar's last value would silently win instead,
// even while previewing a preset that's supposed to control it. When the
// active preset owns --sv-radius-scale, this decorator clears its own
// inline override instead, so the preset's stylesheet rule actually applies.
const withRadius: Decorator = (Story, context) => {
  const preset = (context.globals.radius as string | undefined) ?? 'm';
  const themePreset = (context.globals.themePreset as ThemePresetName | undefined) ?? 'default';
  const presetOwnsRadius = '--sv-radius-scale' in THEME_PRESETS[themePreset].light;
  useEffect(() => {
    if (presetOwnsRadius) {
      document.documentElement.style.removeProperty('--sv-radius-scale');
      return;
    }
    document.documentElement.style.setProperty(
      '--sv-radius-scale',
      String(RADIUS_SCALE[preset] ?? 1),
    );
  }, [preset, presetOwnsRadius]);
  return Story();
};

// RFC 0094 theme presets. Sets data-theme-preset on the preview iframe's
// <html> — the same document-root node data-theme is set on, and required
// for the same calc()-chain reason withRadius's comment above explains,
// since the neobrutalism preset overrides --sv-radius-scale too.
const withThemePreset: Decorator = (Story, context) => {
  const preset = (context.globals.themePreset as ThemePresetName | undefined) ?? 'default';
  useEffect(() => {
    if (preset === 'default') {
      document.documentElement.removeAttribute('data-theme-preset');
    } else {
      document.documentElement.setAttribute('data-theme-preset', preset);
    }
  }, [preset]);
  return Story();
};

const preview: Preview = {
  globalTypes: {
    radius: {
      description: 'RFC 0077 corner-radius preset',
      defaultValue: 'm',
      toolbar: {
        title: 'Radius',
        icon: 'outline',
        items: [
          { value: 'none', title: 'None — square corners' },
          { value: 'xs', title: 'XS' },
          { value: 's', title: 'S' },
          { value: 'm', title: 'M — default' },
          { value: 'l', title: 'L — full curvy UI' },
        ],
        dynamicTitle: true,
      },
    },
    themePreset: {
      description: 'RFC 0094 theme preset',
      defaultValue: 'default',
      toolbar: {
        title: 'Theme preset',
        icon: 'paintbrush',
        items: [
          { value: 'default', title: 'Default' },
          { value: 'neobrutalism', title: 'Neobrutalism' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    withRadius,
    withThemePreset,
    withThemeByDataAttribute({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
      attributeName: 'data-theme',
    }),
  ],
  parameters: {
    viewport: {
      viewports: {
        mobile: { name: 'Mobile', styles: { width: '375px', height: '812px' } },
        tablet: { name: 'Tablet', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop', styles: { width: '1280px', height: '800px' } },
      },
    },
    a11y: {
      // Treat a11y violations as errors so the CI --test flag catches them.
      element: '#storybook-root',
    },
    options: {
      // The object form ({ order: [...] }) only orders the named top-level
      // groups themselves — it does NOT alphabetize what's inside them, so
      // entries within e.g. "Components" fell back to file-registration
      // order (roughly "whenever that story file was added"), not
      // alphabetical, despite what that shorthand's own docs example implies.
      // A comparator function is required to get both: explicit group order
      // first, alphabetical by title within each group.
      // Storybook extracts this function via a naive source-text/eval
      // mechanism (getStorySortParameter), not a real parser, and evals it in
      // total isolation — no access to any outer scope at all (confirmed: a
      // module-level const reference threw "is not defined" here). It also
      // rejects a multi-statement block body ("Unexpected token" SyntaxError)
      // — Storybook's own docs example is a single self-contained expression,
      // so the group-order list has to be inlined into the expression itself
      // rather than pulled from a shared constant, however repetitive.
      storySort: (a, b) =>
        ['Overview', 'Design Tokens', 'Components'].indexOf(a.title.split('/')[0]) !==
        ['Overview', 'Design Tokens', 'Components'].indexOf(b.title.split('/')[0])
          ? ['Overview', 'Design Tokens', 'Components'].indexOf(a.title.split('/')[0]) -
            ['Overview', 'Design Tokens', 'Components'].indexOf(b.title.split('/')[0])
          : a.title.localeCompare(b.title, undefined, { numeric: true }),
    },
  },
};

export default preview;
