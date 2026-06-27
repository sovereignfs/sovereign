import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tooltip } from '../components/Tooltip/Tooltip';
import { Button } from '../components/Button/Button';
import { Icon } from '../components/Icon/Icon';

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    content: 'This is a tooltip',
    children: <Button variant="secondary">Hover me</Button>,
  },
};

export const OnIcon: Story = {
  args: {
    content: 'More information',
    children: (
      <span style={{ color: 'var(--sv-color-text-muted)', cursor: 'default' }}>
        <Icon name="info" size="md" aria-label="Info" />
      </span>
    ),
  },
};

export const Sides: Story = {
  args: { content: '', children: <span /> },
  render: () => (
    <div style={{ display: 'flex', gap: 48, alignItems: 'center', padding: 48 }}>
      <Tooltip content="Top" side="top">
        <Button variant="ghost" size="sm">
          Top
        </Button>
      </Tooltip>
      <Tooltip content="Bottom" side="bottom">
        <Button variant="ghost" size="sm">
          Bottom
        </Button>
      </Tooltip>
      <Tooltip content="Left" side="left">
        <Button variant="ghost" size="sm">
          Left
        </Button>
      </Tooltip>
      <Tooltip content="Right" side="right">
        <Button variant="ghost" size="sm">
          Right
        </Button>
      </Tooltip>
    </div>
  ),
};
