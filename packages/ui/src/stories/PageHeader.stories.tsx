import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { Button } from '../components/Button/Button';

const meta = {
  title: 'Components/PageHeader',
  component: PageHeader,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "A page's title section. Web: title + description on the left, action on the right. Mobile: an optional back button, a single-line title (description drops out), the same action slot, and an optional vertical-ellipsis menu trigger — a compact single row, generalized from Kanban's own hand-rolled MobileBoardHeader. The web/mobile fork is ResponsiveSurface; only one tree is ever mounted.",
      },
    },
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: 'Users' },
};

export const WithDescription: Story = {
  args: {
    title: 'Users',
    description: 'Manage who has access to this instance.',
  },
};

export const WithAction: Story = {
  args: {
    title: 'Users',
    description: 'Manage who has access to this instance.',
    action: <Button size="sm">Invite user</Button>,
  },
};

/** For use under a shell/plugin that already renders its own `<h1>` — e.g.
 * Console's per-page headers sitting below `<h1>Console</h1>`. Visually
 * identical to the default story; only the rendered tag changes. */
export const NestedHeadingLevel: Story = {
  args: {
    title: 'Users',
    description: 'Manage who has access to this instance.',
    headingLevel: 2,
  },
};

/** Below the mobile breakpoint: description drops out of the compact row
 * (generalized from Kanban's own hand-rolled MobileBoardHeader, which has
 * no subtitle handling either), action stays — same content, adapts itself
 * if it needs to look different at this width. */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  args: {
    title: 'Users',
    description: 'Manage who has access to this instance.',
    action: <Button size="sm">Invite user</Button>,
  },
};

/** onBack shows a back button to the left of the title — mobile only, no
 * web equivalent. */
export const MobileWithBack: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  args: {
    title: 'Sv Wallet',
    onBack: () => undefined,
  },
};

/** onMenuClick shows a vertical-ellipsis trigger at the far right — mobile
 * only, no web equivalent. Typically opens a drawer/menu; PageHeader has no
 * opinion on what it contains. */
export const MobileWithMenu: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  args: {
    title: 'Sovereign Platform',
    onBack: () => undefined,
    onMenuClick: () => undefined,
  },
};
