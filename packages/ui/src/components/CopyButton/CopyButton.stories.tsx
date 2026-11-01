import type { Meta, StoryObj } from '@storybook/react-vite';
import { CopyButton } from './CopyButton';

const meta = {
  title: 'Components/CopyButton',
  component: CopyButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Copies text to the clipboard and says so. The clipboard is touched only on press; if the browser refuses, the button says "Could not copy" instead of pretending.',
      },
    },
  },
  args: { text: 'https://core.sovereign.local/invite/abc123', label: 'Copy link' },
  argTypes: {
    variant: { control: 'radio', options: ['primary', 'secondary', 'ghost'] },
    size: { control: 'radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const CustomLabels: Story = {
  args: { label: 'Copy ID', copiedLabel: 'ID copied', failedLabel: 'Copy it by hand' },
};
export const Ghost: Story = { args: { variant: 'ghost' } };
