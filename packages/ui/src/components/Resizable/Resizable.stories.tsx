import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './Resizable';

const meta = {
  title: 'Components/Resizable',
  component: ResizablePanelGroup,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A row or column of resizable panes. Each handle resizes only its two immediate neighbor panels, clamped to their own min/max. Desktop-oriented — panels render at their default sizes on touch.',
      },
    },
  },
  args: { direction: 'horizontal', children: null },
} satisfies Meta<typeof ResizablePanelGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

const paneStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: 'var(--sv-space-4)',
  fontSize: 14,
  color: 'var(--sv-color-text-muted)',
};

export const Horizontal: Story = {
  render: () => (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
        <div style={paneStyle}>Sidebar</div>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize sidebar" />
      <ResizablePanel defaultSize={75}>
        <div style={paneStyle}>Content</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};

export const ThreePanels: Story = {
  render: () => (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
        <div style={paneStyle}>Files</div>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize files panel" />
      <ResizablePanel defaultSize={50}>
        <div style={paneStyle}>Editor</div>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize editor panel" />
      <ResizablePanel defaultSize={30} minSize={15} maxSize={50}>
        <div style={paneStyle}>Preview</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};

export const Vertical: Story = {
  render: () => (
    // Vertical orientation needs a definite-height ancestor for the
    // percentage-based flex-basis on each panel to resolve.
    <div style={{ height: 400 }}>
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel defaultSize={30}>
          <div style={paneStyle}>Console output</div>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize console" />
        <ResizablePanel defaultSize={70}>
          <div style={paneStyle}>Editor</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ),
};
