import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '../src/tokens/primitives.css';
import '../src/tokens/semantic.css';
import './preview-globals.css';

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
const withRadius: Decorator = (Story, context) => {
  const preset = (context.globals.radius as string | undefined) ?? 'm';
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sv-radius-scale',
      String(RADIUS_SCALE[preset] ?? 1),
    );
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
  },
  decorators: [
    withRadius,
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
      storySort: {
        // Overview first, then token reference, then components alphabetically.
        order: ['Overview', 'Design Tokens', 'Components'],
      },
    },
  },
};

export default preview;
