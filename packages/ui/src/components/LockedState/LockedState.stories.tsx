import type { Meta, StoryObj } from '@storybook/react-vite';
import { ButtonLink } from '../ButtonLink/ButtonLink';
import { LockedState } from './LockedState';

const meta = {
  title: 'Components/LockedState',
  component: LockedState,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LockedState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    reason: 'locked',
    appName: 'Notes',
    action: <ButtonLink href="#unlock">Unlock</ButtonLink>,
  },
};

export const AccessRemoved: Story = {
  args: {
    reason: 'removed',
    appName: 'Notes',
    sharedBy: 'Ada Lovelace',
    action: (
      <ButtonLink href="#notes" variant="secondary">
        Back to notes
      </ButtonLink>
    ),
  },
};
