import type { Meta, StoryObj } from '@storybook/react-vite';
import { Item } from './Item';
import { Icon } from '../Icon/Icon';

const meta = {
  title: 'Components/Item',
  component: Item,
  parameters: { layout: 'padded' },
  args: {
    title: 'Notifications',
  },
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {};

export const WithDescription: Story = {
  args: { description: 'Manage email and push alerts' },
};

export const Interactive: Story = {
  args: {
    description: 'Manage email and push alerts',
    leading: <Icon name="bell" aria-hidden />,
    trailing: <Icon name="chevron-right" size="sm" aria-hidden />,
    onClick: () => {},
  },
};

export const Disabled: Story = {
  args: {
    description: 'Requires admin role',
    onClick: () => {},
    disabled: true,
  },
};

export const List: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Item
        title="Notifications"
        description="Manage email and push alerts"
        leading={<Icon name="bell" aria-hidden />}
        trailing={<Icon name="chevron-right" size="sm" aria-hidden />}
        onClick={() => {}}
      />
      <Item
        title="Privacy"
        description="Control what others can see"
        leading={<Icon name="shield" aria-hidden />}
        trailing={<Icon name="chevron-right" size="sm" aria-hidden />}
        onClick={() => {}}
      />
      <Item title="Sign out" leading={<Icon name="log-out" aria-hidden />} onClick={() => {}} />
    </div>
  ),
};
