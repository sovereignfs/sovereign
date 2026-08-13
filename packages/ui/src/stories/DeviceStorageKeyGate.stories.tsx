import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeviceStorageKeyGate } from '../components/DeviceStorageKeyGate/DeviceStorageKeyGate';

const sampleContent = (
  <div style={{ padding: 'var(--sv-space-4)' }}>
    <p style={{ margin: 0, fontFamily: 'var(--sv-font-family)' }}>
      The wrapped content — a notes list, a health log, anything a `device-only` plugin keeps
      entirely on-device.
    </p>
  </div>
);

const setupAction = (
  <a href="/account/security" style={{ color: 'var(--sv-color-accent)' }}>
    Go to Account → Security
  </a>
);

const meta = {
  title: 'Components/DeviceStorageKeyGate',
  component: DeviceStorageKeyGate,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DeviceStorageKeyGate>;

export default meta;
type Story = StoryObj<typeof meta>;

// `status` is the caller's own getDeviceStorageKeyStatus() result — an OPFS
// read this story can't drive live, so it's passed directly as an arg here.
export const SetUp: Story = {
  args: { children: sampleContent, status: 'set-up', surfaceName: 'Notes' },
};

export const NotSetUp: Story = {
  args: {
    children: sampleContent,
    status: 'not-set-up',
    surfaceName: 'Notes',
    setupAction,
  },
};

export const NotSetUpGenericPhrasing: Story = {
  args: { children: sampleContent, status: 'not-set-up', setupAction },
};

export const Unsupported: Story = {
  args: { children: sampleContent, status: 'unsupported', surfaceName: 'Notes' },
};

export const NoDeviceAuth: Story = {
  args: { children: sampleContent, status: 'no-device-auth', surfaceName: 'Notes' },
};

export const Checking: Story = {
  args: { children: sampleContent, status: 'checking', surfaceName: 'Notes' },
};
