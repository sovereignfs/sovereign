import type { Meta, StoryObj } from '@storybook/react-vite';
import { UpdateNotice } from './UpdateNotice';

const meta = {
  title: 'Components/UpdateNotice',
  component: UpdateNotice,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A quiet notice, fixed at the bottom of the window, that a new version is ready. The consumer shows it when a service worker is waiting, and Reload activates it.',
      },
    },
  },
  args: { appName: 'Sovereign', onReload: () => undefined },
} satisfies Meta<typeof UpdateNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLater: Story = { args: { onDismiss: () => undefined } };

export const Reloading: Story = { args: { reloading: true } };
