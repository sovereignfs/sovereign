import type { Meta, StoryObj } from '@storybook/react-vite';
import { InstallHint } from './InstallPrompt';

const meta = {
  title: 'Components/InstallPrompt',
  component: InstallHint,
  parameters: {
    docs: {
      description: {
        component:
          'Offers to install the site as an app. `InstallPrompt` decides on the device whether to show it (the browser’s `beforeinstallprompt`, iPhone and iPad Safari, never in an installed window, never once dismissed); `InstallHint` is what it shows.',
      },
    },
  },
  args: {
    appName: 'Sovereign',
    kind: 'prompt',
    onInstall: () => undefined,
    onDismiss: () => undefined,
  },
  argTypes: { kind: { control: 'select', options: ['prompt', 'ios'] } },
} satisfies Meta<typeof InstallHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BrowserPrompt: Story = {};

export const IPhone: Story = { args: { kind: 'ios' } };
