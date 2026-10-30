import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button/Button';
import { Tabs } from '../Tabs/Tabs';
import { OverlayHeader } from './OverlayHeader';

const meta = {
  title: 'Components/OverlayHeader',
  component: OverlayHeader,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The fixed header row of a full-screen overlay (`Dialog` on a narrow screen, `Sheet`, `Drawer`): a title and a close button, with an optional back button, a trailing action and a second row.',
      },
    },
  },
  args: { title: 'Edit profile', onClose: () => {} },
} satisfies Meta<typeof OverlayHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithBack: Story = { args: { onBack: () => {} } };
export const WithAction: Story = {
  args: { action: <Button size="sm">Save</Button> },
};
export const CloseOnly: Story = { args: { title: undefined } };
export const WithSecondRow: Story = {
  args: {
    secondRow: (
      <Tabs
        aria-label="Sections"
        value="details"
        onChange={() => {}}
        items={[
          { value: 'details', label: 'Details' },
          { value: 'activity', label: 'Activity' },
        ]}
      />
    ),
  },
};
