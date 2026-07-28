import type { Meta, StoryObj } from '@storybook/react-vite';
import { AspectRatio } from './AspectRatio';

const meta = {
  title: 'Components/AspectRatio',
  component: AspectRatio,
  parameters: { layout: 'padded' },
  args: {
    ratio: 16 / 9,
    children: (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--sv-color-surface-sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--sv-color-text-muted)',
          fontSize: 'var(--sv-font-size-sm)',
        }}
      >
        16:9
      </div>
    ),
  },
} satisfies Meta<typeof AspectRatio>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Widescreen: Story = {};

export const Square: Story = {
  args: {
    ratio: 1,
    children: (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--sv-color-surface-sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--sv-color-text-muted)',
          fontSize: 'var(--sv-font-size-sm)',
        }}
      >
        1:1
      </div>
    ),
  },
};

export const Portrait: Story = {
  args: {
    ratio: 3 / 4,
    children: (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--sv-color-surface-sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--sv-color-text-muted)',
          fontSize: 'var(--sv-font-size-sm)',
        }}
      >
        3:4
      </div>
    ),
  },
};
