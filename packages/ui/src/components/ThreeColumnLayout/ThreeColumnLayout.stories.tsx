import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ThreeColumnLayout } from './ThreeColumnLayout';

function Block({
  title,
  children,
  padded = true,
}: {
  title: string;
  children?: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      style={{
        height: '100%',
        padding: padded ? 'var(--sv-space-4)' : 0,
        fontFamily: 'var(--sv-font-family)',
      }}
    >
      <h3
        style={{
          margin: '0 0 var(--sv-space-2)',
          fontSize: 'var(--sv-font-size-sm)',
          color: 'var(--sv-color-text-primary)',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

const meta = {
  title: 'Components/ThreeColumnLayout',
  component: ThreeColumnLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Sidebar + main + optional detail column, for the common "list app" shape. Purely positional: pass 2 children for sidebar+main, or 3 for sidebar+main+detail. The layout has no awareness of what is inside each slot and no responsive behavior of its own.',
      },
    },
  },
  args: {
    children: [<Block key="sidebar" title="Sidebar" />, <Block key="main" title="Main" />],
  },
} satisfies Meta<typeof ThreeColumnLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The canonical two-child usage — sidebar + main, no detail column. */
export const Default: Story = {
  render: () => (
    <div style={{ height: '480px' }}>
      <ThreeColumnLayout>
        <Block title="Sidebar">
          <ul style={{ margin: 0, paddingLeft: 'var(--sv-space-4)' }}>
            <li>Groceries</li>
            <li>Work</li>
            <li>Personal</li>
          </ul>
        </Block>
        <Block title="Main">No item selected — main fills the full remaining width.</Block>
      </ThreeColumnLayout>
    </div>
  ),
};

export const ThreeColumns: Story = {
  render: () => (
    <div style={{ height: '480px' }}>
      <ThreeColumnLayout>
        <Block title="Sidebar">
          <ul style={{ margin: 0, paddingLeft: 'var(--sv-space-4)' }}>
            <li>Groceries</li>
            <li>Work</li>
            <li>Personal</li>
          </ul>
        </Block>
        <Block title="Main">
          <ul style={{ margin: 0, paddingLeft: 'var(--sv-space-4)' }}>
            <li>Buy milk</li>
            <li>Buy eggs</li>
          </ul>
        </Block>
        <Block title="Detail">Editing "Buy milk" — notes, due date, etc.</Block>
      </ThreeColumnLayout>
    </div>
  ),
};

export const CustomWidths: Story = {
  render: () => (
    <div style={{ height: '480px' }}>
      <ThreeColumnLayout sidebarWidth={200} detailWidth={440}>
        <Block title="Sidebar (200px)">Narrower nav column.</Block>
        <Block title="Main">Fills whatever space is left.</Block>
        <Block title="Detail (440px)">Wider detail column for a richer editor.</Block>
      </ThreeColumnLayout>
    </div>
  ),
};

/** Demonstrates the intended usage: the detail column appears only once
 *  something is selected, by conditionally including the third child. */
export const ConditionalDetail: Story = {
  render: function Render() {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const items = ['Buy milk', 'Buy eggs', 'Call plumber'];

    return (
      <div style={{ height: '480px' }}>
        <ThreeColumnLayout>
          <Block title="Sidebar">Lists</Block>
          <Block title="Main" padded={false}>
            <div style={{ padding: 'var(--sv-space-4)' }}>
              {items.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSelectedId(item)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: 'var(--sv-space-2)',
                    marginBottom: 'var(--sv-space-1)',
                    background:
                      selectedId === item ? 'var(--sv-color-accent-subtle)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--sv-radius-sm)',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'var(--sv-color-text-primary)',
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </Block>
          {selectedId && <Block title="Detail">Editing "{selectedId}"</Block>}
        </ThreeColumnLayout>
      </div>
    );
  },
};
