import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChangePasswordForm } from './ChangePasswordForm';
import { SessionsPanel } from './SessionsPanel';
import { TwoFactorPanel } from './TwoFactorPanel';
import { ProfilePanel } from './ProfilePanel';

const meta = {
  title: 'Components/Account',
  component: SessionsPanel,
  parameters: {
    docs: {
      description: {
        component:
          'The panels of a person’s own account, the same in core and every app (RFC 0007): `SessionsPanel` (their sessions, each ended by a server action of the app’s) and `ChangePasswordForm`. They draw and collect; the app does the work and passes back what happened.',
      },
    },
  },
  args: {
    sessions: [],
    endSession: () => Promise.resolve({ ok: true }),
    endOthers: () => Promise.resolve({ ok: true }),
  },
} satisfies Meta<typeof SessionsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = Date.UTC(2026, 10, 19, 9, 30);

export const Sessions: Story = {
  args: {
    sessions: [
      {
        id: 'a',
        current: true,
        device: 'Safari on iOS',
        ipAddress: '192.0.2.10',
        signedInAt: now,
        lastActiveAt: now,
      },
      {
        id: 'b',
        current: false,
        device: 'Chrome on macOS',
        ipAddress: null,
        signedInAt: now - 86_400_000,
        lastActiveAt: now - 3_600_000,
      },
    ],
  },
};

export const OnlyThisDevice: Story = {
  args: {
    sessions: [
      {
        id: 'a',
        current: true,
        device: 'Firefox on Linux',
        ipAddress: null,
        signedInAt: now,
        lastActiveAt: now,
      },
    ],
  },
};

export const ChangePassword: Story = {
  render: () => <ChangePasswordForm onSubmit={() => undefined} />,
};

export const ChangePasswordRefused: Story = {
  render: () => (
    <ChangePasswordForm error="Your current password is not right." onSubmit={() => undefined} />
  ),
};

const twoFactor = {
  start: () => Promise.resolve({ codes: ['abcd-efgh', 'ijkl-mnop'] }),
  confirm: () => Promise.resolve({}),
  renderQr: () => <p>QR code</p>,
  onDone: () => undefined,
};

export const TwoFactorOff: Story = {
  render: () => <TwoFactorPanel enabled={false} verified {...twoFactor} />,
};

export const TwoFactorOn: Story = {
  render: () => <TwoFactorPanel enabled verified {...twoFactor} />,
};

const profile = {
  saveName: () => Promise.resolve({}),
  preparePicture: (file: Blob) => Promise.resolve(file),
  savePicture: () => Promise.resolve({ image: null }),
};

export const Profile: Story = {
  render: () => (
    <ProfilePanel name="Ada Lovelace" email="ada@example.com" image={null} {...profile} />
  ),
};
