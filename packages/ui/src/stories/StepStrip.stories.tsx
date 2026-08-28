import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { StepStrip, type StepStripItem } from '../components/StepStrip/StepStrip';

const meta: Meta<typeof StepStrip> = {
  title: 'Components/StepStrip',
  component: StepStrip,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof StepStrip>;

interface Stop extends StepStripItem {
  label: string;
  sublabel: string;
}

const STOPS: Stop[] = [
  { id: 'lisbon', label: 'Lisbon', sublabel: 'Aug 26 – 28 · 2 days' },
  { id: 'porto', label: 'Porto', sublabel: 'Aug 28 – 30 · 2 days' },
];

const chipStyle = (isActive: boolean) => ({
  boxSizing: 'border-box' as const,
  minWidth: '160px',
  padding: 'var(--sv-space-3) var(--sv-space-4)',
  borderRadius: 'var(--sv-radius-lg)',
  border: `1px solid ${isActive ? 'var(--sv-color-text-primary)' : 'var(--sv-color-border)'}`,
  background: isActive ? 'var(--sv-color-text-primary)' : 'var(--sv-color-surface-raised)',
  color: isActive ? 'var(--sv-color-surface)' : 'var(--sv-color-text-primary)',
  cursor: 'pointer',
  textAlign: 'left' as const,
});

function StopStripDemo() {
  const [activeId, setActiveId] = useState<string>('lisbon');

  return (
    <StepStrip
      items={STOPS}
      activeId={activeId}
      aria-label="Trip stops"
      onAdd={() => alert('Add a stop')}
      addLabel="Add a stop"
      renderItem={(stop, { isActive }) => (
        <button type="button" style={chipStyle(isActive)} onClick={() => setActiveId(stop.id)}>
          <div style={{ fontWeight: 600, fontSize: 'var(--sv-font-size-sm)' }}>{stop.label}</div>
          <div style={{ fontSize: 'var(--sv-font-size-xs)', opacity: 0.8 }}>{stop.sublabel}</div>
        </button>
      )}
    />
  );
}

export const Default: Story = {
  render: () => <StopStripDemo />,
  name: 'Stop strip (click to select, trailing add chip)',
};

export const NoAddAffordance: Story = {
  render: () => (
    <StepStrip
      items={STOPS}
      activeId="porto"
      aria-label="Trip stops"
      renderItem={(stop, { isActive }) => (
        <div style={chipStyle(isActive)}>
          <div style={{ fontWeight: 600, fontSize: 'var(--sv-font-size-sm)' }}>{stop.label}</div>
          <div style={{ fontSize: 'var(--sv-font-size-xs)', opacity: 0.8 }}>{stop.sublabel}</div>
        </div>
      )}
    />
  ),
};
