import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SplitPane } from './SplitPane';
import { CodeTextarea } from '../CodeTextarea/CodeTextarea';
import { StatusBadge } from '../StatusBadge/StatusBadge';

const editorText = `# Release plan

- Confirm copy
- Preview page
- Commit changes
`;

function PaneShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100%',
        flexDirection: 'column',
        gap: 'var(--sv-space-3)',
        padding: 'var(--sv-space-4)',
        fontFamily: 'var(--sv-font-family)',
      }}
    >
      <h3
        style={{
          margin: 0,
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
  title: 'Components/SplitPane',
  component: SplitPane,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Responsive two-pane layout for editor/preview and list/detail workflows. Drag or use arrow keys on the separator.',
      },
    },
  },
  args: {
    primary: <PaneShell title="Primary">Primary pane</PaneShell>,
    secondary: <PaneShell title="Secondary">Secondary pane</PaneShell>,
  },
} satisfies Meta<typeof SplitPane>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <SplitPane
      primary={
        <PaneShell title="Editor">
          <CodeTextarea aria-label="Markdown editor" defaultValue={editorText} />
        </PaneShell>
      }
      secondary={
        <PaneShell title="Preview">
          <article style={{ lineHeight: 1.6, color: 'var(--sv-color-text-primary)' }}>
            <h2 style={{ marginTop: 0 }}>Release plan</h2>
            <ul>
              <li>Confirm copy</li>
              <li>Preview page</li>
              <li>Commit changes</li>
            </ul>
          </article>
        </PaneShell>
      }
    />
  ),
};

export const FixedPanes: Story = {
  render: () => (
    <SplitPane
      resizable={false}
      defaultPrimarySize={38}
      primary={
        <PaneShell title="Files">
          {['index.md', 'release-notes.md', 'about.md'].map((file) => (
            <div
              key={file}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--sv-space-3)',
                padding: 'var(--sv-space-2) 0',
                borderBottom: '1px solid var(--sv-color-border)',
              }}
            >
              <span>{file}</span>
              <StatusBadge status={file === 'release-notes.md' ? 'draft' : 'synced'} />
            </div>
          ))}
        </PaneShell>
      }
      secondary={
        <PaneShell title="Details">
          <p style={{ margin: 0, color: 'var(--sv-color-text-muted)' }}>
            Select a file to inspect frontmatter, sync state, and publish history.
          </p>
        </PaneShell>
      }
    />
  ),
};

export const KeyboardResizable: Story = {
  render: () => (
    <SplitPane
      defaultPrimarySize={45}
      minPrimarySize={25}
      maxPrimarySize={75}
      resizeLabel="Resize editor and preview panes with arrow keys"
      primary={<PaneShell title="Keyboard">Focus the separator and press arrow keys.</PaneShell>}
      secondary={<PaneShell title="Preview">Shift+Arrow resizes in larger steps.</PaneShell>}
    />
  ),
};

export const LongContent: Story = {
  render: () => (
    <SplitPane
      primary={
        <PaneShell title="Long list">
          {Array.from({ length: 28 }, (_, index) => (
            <div key={index} style={{ paddingBlock: 'var(--sv-space-2)' }}>
              Content item {index + 1}
            </div>
          ))}
        </PaneShell>
      }
      secondary={<PaneShell title="Preview">Each pane scrolls independently.</PaneShell>}
    />
  ),
};

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: () => (
    <SplitPane
      primary={<PaneShell title="Editor">This pane appears first on narrow screens.</PaneShell>}
      secondary={<PaneShell title="Preview">The second pane stacks below it.</PaneShell>}
    />
  ),
};
