import type { Meta, StoryObj } from '@storybook/react-vite';
import { Marker } from './Marker';

const meta = {
  title: 'Components/Marker',
  component: Marker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Inline citation/reference marker, for attributing part of an assistant answer to a source (Sovereign Harness "source trace").',
      },
    },
  },
  args: { index: 1, label: 'Source: Notes' },
} satisfies Meta<typeof Marker>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Static: Story = {};

export const Clickable: Story = {
  args: { onClick: () => {} },
};

export const InContext: Story = {
  render: () => (
    <p style={{ fontSize: 14, maxWidth: 400 }}>
      Your next task deadline is Thursday
      <Marker index={1} label="Source: Tasks" onClick={() => {}} />, and you have two unread
      messages from the team
      <Marker index={2} label="Source: Notes" onClick={() => {}} />.
    </p>
  ),
};
