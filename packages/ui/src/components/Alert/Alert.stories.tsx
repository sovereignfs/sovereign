import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert } from './Alert';

const meta = {
  title: 'Components/Alert',
  component: Alert,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Inline, non-dismissible banner. Distinct from Toast (transient) and SystemBanner (instance-wide) — for form-level errors or explaining an empty/blocked state. A leading icon defaults per variant (none for neutral) — pass `icon` to override it or `icon={false}` to suppress it.',
      },
    },
  },
  argTypes: {
    variant: { control: 'select', options: ['info', 'success', 'warning', 'error', 'neutral'] },
  },
  args: {
    variant: 'info',
    children: 'This is an informational message.',
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Info: Story = {
  args: { variant: 'info' },
};

export const Success: Story = {
  args: { variant: 'success', children: 'Your changes have been saved.' },
};

export const Warning: Story = {
  args: { variant: 'warning', children: 'This action cannot be undone.' },
};

export const ErrorVariant: Story = {
  name: 'Error',
  args: { variant: 'error', children: 'Select a size to continue.' },
};

export const Neutral: Story = {
  args: { variant: 'neutral', children: 'This project has no members yet.' },
};

export const WithHeading: Story = {
  args: {
    variant: 'error',
    heading: 'Something went wrong',
    children: 'We couldn’t save your changes. Check your connection and try again.',
  },
};

export const WithoutHeading: Story = {
  args: { variant: 'success', children: 'Invite sent.' },
};

/** Icon + heading + body — the pattern most alert examples use. */
export const IconHeadingAndBody: Story = {
  args: {
    variant: 'success',
    heading: 'Payment successful',
    children:
      'Your payment of $29.99 has been processed. A receipt has been sent to your email address.',
  },
};

export const CustomIcon: Story = {
  args: { variant: 'neutral', icon: 'bell', children: 'You have 3 unread notifications.' },
};

export const NoIcon: Story = {
  args: { variant: 'success', icon: false, children: 'Your changes have been saved.' },
};

/** Every variant with its default icon, at a glance. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
      <Alert variant="info" heading="New feature available">
        We’ve added dark mode support. You can enable it in your account settings.
      </Alert>
      <Alert variant="success" heading="Payment successful">
        Your payment of $29.99 has been processed. A receipt has been sent to your email address.
      </Alert>
      <Alert variant="warning">This action cannot be undone.</Alert>
      <Alert variant="error">Select a size to continue.</Alert>
      <Alert variant="neutral">This project has no members yet.</Alert>
    </div>
  ),
};
