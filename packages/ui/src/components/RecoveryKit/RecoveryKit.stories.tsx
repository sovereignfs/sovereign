import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecoveryKit } from './RecoveryKit';

const meta = {
  title: 'Components/RecoveryKit',
  component: RecoveryKit,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RecoveryKit>;

export default meta;
type Story = StoryObj<typeof meta>;

const kit = '000G-40R4-0M30-E209-185G-R38E-1W81-24GK-2GAH-C5RR-34D1-P70X-3RFG-K7Q2';

export const Default: Story = {
  args: { kit, instanceName: 'Rohr', onContinue: () => {} },
};

export const Continuing: Story = {
  args: { kit, instanceName: 'Rohr', onContinue: () => {}, continuing: true },
};

/** The instance's owner turned on recovery (escrow): the kit is the person's own way back, and not the only one. */
export const OwnerCanRecover: Story = {
  args: { kit, instanceName: 'Rohr', onContinue: () => {}, ownerCanRecover: true },
};
