import type { Meta, StoryObj } from '@storybook/react-vite';
import { FloatingActionButton } from '../components/FloatingActionButton/FloatingActionButton';
import { Icon } from '../components/Icon/Icon';

const meta = {
  title: 'Components/FloatingActionButton',
  component: FloatingActionButton,
  parameters: { layout: 'fullscreen' },
  args: { label: 'Check in', icon: <Icon name="plus" size="lg" aria-hidden /> },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 360, position: 'relative', transform: 'translateZ(0)' }}>
        <p style={{ padding: 16 }}>The button floats at the bottom, at the end of the line.</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FloatingActionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconOnly: Story = {};

export const Extended: Story = { args: { extended: true } };

export const AsLink: Story = { args: { href: '#check-in' } };
