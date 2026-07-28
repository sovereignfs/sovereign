import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollArea } from './ScrollArea';

const meta = {
  title: 'Components/ScrollArea',
  component: ScrollArea,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Vertical: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <ScrollArea maxHeight={160}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{ fontSize: 14 }}>
              Row {i + 1}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea maxWidth={320}>
      <div style={{ display: 'flex', gap: 8, padding: 4, width: 'max-content' }}>
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            style={{
              width: 80,
              height: 60,
              flexShrink: 0,
              background: 'var(--sv-color-surface-sunken)',
              borderRadius: 'var(--sv-radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};
