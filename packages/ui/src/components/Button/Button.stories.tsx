import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon } from '../Icon/Icon';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The primitive interactive control. RSC-safe (no state, forwards props). All styling references `--sv-*` tokens; no hardcoded values.',
      },
    },
  },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'destructive'] },
    size: { control: 'select', options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
    children: { control: 'text' },
  },
  args: {
    children: 'Button',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete account' } };

export const Small: Story = { args: { size: 'sm' } };
export const Medium: Story = { args: { size: 'md' } };

export const Disabled: Story = { args: { disabled: true } };
export const DisabledSecondary: Story = { args: { variant: 'secondary', disabled: true } };

export const WithLeadingIcon: Story = {
  args: {
    children: (
      <>
        <Icon name="plus" size="sm" aria-hidden />
        Add item
      </>
    ),
  },
};

export const IconOnly: Story = {
  args: {
    variant: 'ghost',
    'aria-label': 'Settings',
    children: <Icon name="settings" size="sm" aria-hidden />,
  },
};

/** All variant × size combinations at a glance. */
export const AllVariants: Story = {
  render: (_args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
      {(['primary', 'secondary', 'ghost', 'destructive'] as const).map((v) =>
        (['md', 'sm'] as const).map((s) => (
          <Button key={`${v}-${s}`} variant={v} size={s}>
            {v} / {s}
          </Button>
        )),
      )}
    </div>
  ),
};
