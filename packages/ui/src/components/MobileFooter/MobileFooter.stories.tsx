import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MobileFooter } from './MobileFooter';
import { Icon } from '../Icon/Icon';

const homeIcon = { icon: <Icon name="house" size="md" aria-hidden />, label: 'Home', active: true };
const searchIcon = { icon: <Icon name="search" size="md" aria-hidden />, label: 'Search' };
const calendarIcon = { icon: <Icon name="calendar" size="md" aria-hidden />, label: 'Calendar' };
const activityIcon = { icon: <Icon name="activity" size="md" aria-hidden />, label: 'Activity' };

const meta = {
  title: 'Components/MobileFooter',
  component: MobileFooter,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Mobile shell footer nav row (RFC 0088). The centered launcher (onOpenApps) is always rendered; leftIcons/rightIcons take 1 or 2 items each, symmetric so the launcher stays centered. Presentational only, no data fetching.',
      },
    },
  },
  args: {
    onOpenApps: () => {},
    leftIcons: [homeIcon],
    rightIcons: [searchIcon],
  },
} satisfies Meta<typeof MobileFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FiveIcons: Story = {
  args: {
    leftIcons: [homeIcon, calendarIcon],
    rightIcons: [searchIcon, activityIcon],
  },
};

export const LauncherOpen: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(true);
    return <MobileFooter {...args} launcherOpen={open} onOpenApps={() => setOpen((v) => !v)} />;
  },
};
