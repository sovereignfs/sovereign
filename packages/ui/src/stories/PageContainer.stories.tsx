import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageContainer } from '../components/PageContainer/PageContainer';

const demoBlock = (
  <div
    style={{
      background: 'var(--sv-color-surface-raised)',
      border: '1px dashed var(--sv-color-border)',
      borderRadius: 'var(--sv-radius-md)',
      padding: 'var(--sv-space-4)',
    }}
  >
    Page content goes here. This component supplies the page&apos;s gutter and constrains its width
    — the runtime shell contributes neither.
  </div>
);

const meta = {
  title: 'Components/PageContainer',
  component: PageContainer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The wrapper every plugin page renders through. `padding` is the page gutter (the ' +
          'runtime shell no longer applies one) and `maxWidth` constrains content, padding ' +
          'included. Both default to the common case: a full-width page with the standard ' +
          '32px/16px gutter.',
      },
    },
  },
  args: { children: demoBlock },
} satisfies Meta<typeof PageContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Defaults: full width, `md` gutter. */
export const Default: Story = {};

// ── maxWidth ──────────────────────────────────────────────────────────────

export const WidthSmall: Story = { args: { maxWidth: 'sm' } };
export const WidthMedium: Story = { args: { maxWidth: 'md' } };
export const WidthLarge: Story = { args: { maxWidth: 'lg' } };

// ── padding ───────────────────────────────────────────────────────────────

/** For a page whose ancestor already supplies the gutter, or a full-bleed layout. */
export const PaddingNone: Story = { args: { padding: 'none' } };
export const PaddingSmall: Story = { args: { padding: 'sm' } };
export const PaddingLarge: Story = { args: { padding: 'lg' } };

/** Every gutter step tightens below 768px. */
export const MobileViewport: Story = {
  args: { maxWidth: 'md' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/**
 * An ancestor that already pads its content sets `--sv-page-gutter: 0` and
 * PageContainer stands its own gutter down — how `Dialog` keeps an overlay
 * plugin from being padded twice when the same page renders inside it.
 */
export const GutterSuppressedByAncestor: Story = {
  args: { maxWidth: 'md' },
  decorators: [
    (Story) => (
      <div
        style={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CSS custom property
          ['--sv-page-gutter' as any]: '0px',
          border: '1px solid var(--sv-color-border)',
          padding: 'var(--sv-space-6)',
        }}
      >
        <Story />
      </div>
    ),
  ],
};
