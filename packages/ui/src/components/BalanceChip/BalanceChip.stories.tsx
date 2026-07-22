import type { Meta, StoryObj } from '@storybook/react-vite';
import { BalanceChip } from './BalanceChip';

const meta = {
  title: 'Components/BalanceChip',
  component: BalanceChip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Inline net-balance indicator — green when owed to them, red when they owe, neutral when settled. Not tied to expense-splitting specifically: any plugin tracking a signed balance between people can use it.',
      },
    },
  },
  args: {
    amountCents: 2500,
    currency: 'USD',
  },
} satisfies Meta<typeof BalanceChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Owed: Story = {
  args: { amountCents: 2500, currency: 'USD' },
};

export const Owes: Story = {
  args: { amountCents: -1350, currency: 'USD' },
};

export const SettledUp: Story = {
  args: { amountCents: 0, currency: 'USD' },
};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--sv-space-2)' }}>
      <BalanceChip amountCents={2500} currency="USD" />
      <BalanceChip amountCents={-1350} currency="USD" />
      <BalanceChip amountCents={0} currency="USD" />
    </div>
  ),
};
