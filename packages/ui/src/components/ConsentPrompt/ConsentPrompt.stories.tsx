import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsentPrompt } from './ConsentPrompt';

const meta = {
  title: 'Components/ConsentPrompt',
  component: ConsentPrompt,
  parameters: { layout: 'padded' },
  args: {
    consumerName: 'Ledger',
    providerName: 'Finance Tracker',
    contract: 'expenses',
    description: 'Monthly expense totals by category, no transaction-level detail.',
    onAllow: () => {},
    onDeny: () => {},
  },
} satisfies Meta<typeof ConsentPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {};

export const NoDescription: Story = {
  args: { description: null },
};

export const Pending: Story = {
  args: { pending: true },
};
