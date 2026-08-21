import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button/Button';
import { OverlayHeader } from './OverlayHeader';

const meta = {
  title: 'Components/OverlayHeader',
  component: OverlayHeader,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The shared fixed secondary header for `Dialog`’s mobile mode, `Sheet`, and `Drawer`: title + close, with an optional back button, trailing action, and a second row (e.g. a tab strip).',
      },
    },
  },
  render: (args) => (
    <div style={{ width: 360, border: '1px solid var(--sv-color-border)' }}>
      <OverlayHeader {...args} />
    </div>
  ),
} satisfies Meta<typeof OverlayHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { title: 'Settings', onClose: () => {} },
};

export const WithBackButton: Story = {
  args: { title: 'Security', onClose: () => {}, onBack: () => {} },
};

export const WithTrailingAction: Story = {
  args: {
    title: 'Edit list',
    onClose: () => {},
    action: (
      <Button size="sm" variant="primary">
        Save
      </Button>
    ),
  },
};

export const WithSecondRow: Story = {
  args: {
    title: 'Account',
    onClose: () => {},
    secondRow: (
      <div style={{ display: 'flex', gap: 16 }}>
        {['Profile', 'Security', 'Preferences'].map((tab) => (
          <span key={tab} style={{ fontSize: 14, color: 'var(--sv-color-text-primary)' }}>
            {tab}
          </span>
        ))}
      </div>
    ),
  },
};

export const NoTitle: Story = {
  args: { onClose: () => {} },
};
