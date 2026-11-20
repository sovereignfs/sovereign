import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button/Button';
import { PushControl } from './PushControl';

const meta = {
  title: 'Components/PushControl',
  component: PushControl,
  parameters: {
    docs: {
      description: {
        component:
          '“Notifications on this device”, for an app’s settings. It says what this device can do and offers one switch; the state and the actions come from `usePush` in `@sovereignfs/pwa/client`. `checking` and `unavailable` render nothing.',
      },
    },
  },
  args: {
    appName: 'Tasks',
    state: 'off',
    onTurnOn: () => undefined,
    onTurnOff: () => undefined,
  },
  argTypes: {
    state: {
      control: 'select',
      options: [
        'checking',
        'unavailable',
        'unsupported',
        'insecure',
        'install-first',
        'blocked',
        'off',
        'on',
      ],
    },
  },
} satisfies Meta<typeof PushControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};

export const On: Story = {
  args: {
    state: 'on',
    children: (
      <Button size="sm" variant="secondary">
        Send me a test notification
      </Button>
    ),
  },
};

export const Working: Story = { args: { state: 'off', working: true } };

export const Failed: Story = {
  args: { state: 'off', error: 'Notifications couldn’t be turned on. Try again.' },
};

export const InstallFirst: Story = { args: { state: 'install-first' } };

export const Blocked: Story = { args: { state: 'blocked' } };

export const Unsupported: Story = { args: { state: 'unsupported' } };

export const Insecure: Story = { args: { state: 'insecure' } };

export const Unavailable: Story = {
  args: { state: 'unavailable' },
  parameters: {
    docs: { description: { story: 'The app sends no notifications: nothing shows.' } },
  },
};
