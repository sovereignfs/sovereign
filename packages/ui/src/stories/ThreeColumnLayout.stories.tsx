import type { Meta, StoryObj } from '@storybook/react-vite';
import { ThreeColumnLayout } from '../components/ThreeColumnLayout/ThreeColumnLayout';

const panel = (label: string, tone: 'raised' | 'base') => (
  <div
    style={{
      padding: 'var(--sv-space-4)',
      height: '100%',
      background: tone === 'raised' ? 'var(--sv-color-surface-raised)' : 'var(--sv-color-surface)',
      color: 'var(--sv-color-text-primary)',
      fontFamily: 'var(--sv-font-family)',
      fontSize: 'var(--sv-font-size-sm)',
    }}
  >
    {label}
  </div>
);

const meta = {
  title: 'Components/ThreeColumnLayout',
  component: ThreeColumnLayout,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: '320px', border: '1px solid var(--sv-color-border)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ThreeColumnLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two columns — a sidebar and the main content area. */
export const Default: Story = {
  args: {
    children: [panel('Sidebar', 'raised'), panel('Main', 'base')],
  },
};

/** Three columns — the detail pane only takes up space once it is rendered. */
export const WithDetail: Story = {
  args: {
    children: [panel('Sidebar', 'raised'), panel('Main', 'base'), panel('Detail', 'raised')],
  },
};

/**
 * `sidebarHidden` collapses the sidebar to nothing — no width, no border,
 * and out of the accessibility tree and tab order — while keeping it
 * mounted and every sibling in the same position.
 *
 * Reach for this instead of conditionally omitting the sidebar child or
 * swapping to a different wrapper when collapsed: dropping the child shifts
 * `main` into the sidebar slot, and changing the surrounding element type
 * unmounts `main`'s whole subtree, discarding its React state on every
 * toggle.
 */
export const SidebarHidden: Story = {
  args: {
    sidebarHidden: true,
    children: [panel('Sidebar', 'raised'), panel('Main (full width)', 'base')],
  },
};
