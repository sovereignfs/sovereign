import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeviceOnlyGate } from '../components/DeviceOnlyGate/DeviceOnlyGate';

const sampleContent = (
  <div style={{ padding: 'var(--sv-space-4)' }}>
    <p style={{ margin: 0, fontFamily: 'var(--sv-font-family)' }}>
      The wrapped content — a wallet's card list, a health log, anything a `device-only` plugin
      keeps entirely on-device.
    </p>
  </div>
);

const meta = {
  title: 'Components/DeviceOnlyGate',
  component: DeviceOnlyGate,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DeviceOnlyGate>;

export default meta;
type Story = StoryObj<typeof meta>;

// `available` is the caller's own isDeviceOnlyTierAvailable() result — a
// real bridge-handshake check, not something this story can drive live, so
// it's passed directly as an arg here instead.
export const Available: Story = {
  args: { children: sampleContent, available: true, surfaceName: 'Wallet' },
};

export const Restricted: Story = {
  args: { children: sampleContent, available: false, surfaceName: 'Wallet' },
};

export const RestrictedGenericPhrasing: Story = {
  args: { children: sampleContent, available: false },
};
