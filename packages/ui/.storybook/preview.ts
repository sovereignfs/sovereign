import type { Preview } from '@storybook/react-vite';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '../src/tokens/primitives.css';
import '../src/tokens/semantic.css';
import './preview-globals.css';

const preview: Preview = {
  decorators: [
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
