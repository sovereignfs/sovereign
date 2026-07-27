import type { Meta, StoryObj } from '@storybook/react-vite';
import { Progress } from './Progress';

const meta = {
  title: 'Components/Progress',
  component: Progress,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Determinate progress bar. role="progressbar" with aria-valuenow/min/max so screen readers announce the current value. Indeterminate state is out of scope.',
      },
    },
  },
  args: {
    value: 40,
    label: 'Upload progress',
  },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {};

export const Empty: Story = {
  args: { value: 0 },
};

export const Complete: Story = {
  args: { value: 100 },
};

export const OverMax: Story = {
  name: 'Clamped (value > 100)',
  args: { value: 140 },
};
