import type { Meta, StoryObj } from '@storybook/react-vite';
import { DragHandleRow } from '../components/DragHandleRow/DragHandleRow';

const meta: Meta<typeof DragHandleRow> = {
  title: 'Components/DragHandleRow',
  component: DragHandleRow,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DragHandleRow>;

const rowStyle = {
  padding: 'var(--sv-space-3) var(--sv-space-2)',
  borderBottom: '1px solid var(--sv-color-border)',
  fontSize: 'var(--sv-font-size-sm)',
  color: 'var(--sv-color-text-primary)',
  width: '320px',
};

export const Default: Story = {
  render: () => (
    <div>
      {['Buy groceries', 'Call the dentist', 'Review pull request'].map((label) => (
        <DragHandleRow key={label}>
          <div style={rowStyle}>{label}</div>
        </DragHandleRow>
      ))}
    </div>
  ),
  name: 'List of rows (hover to reveal handle)',
};

export const Dragging: Story = {
  render: () => (
    <DragHandleRow isDragging>
      <div style={rowStyle}>This row is being dragged</div>
    </DragHandleRow>
  ),
};
