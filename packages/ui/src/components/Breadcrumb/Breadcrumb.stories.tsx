import type { Meta, StoryObj } from '@storybook/react-vite';
import { Breadcrumb } from './Breadcrumb';

const meta = {
  title: 'Components/Breadcrumb',
  component: Breadcrumb,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Link trail. The last item (no href) renders as plain text with aria-current="page". Pass renderLink to use a client-side router Link instead of a plain <a> — matters inside overlay-shell plugins, where a full page reload breaks the dismiss flow.',
      },
    },
  },
  args: {
    items: [
      { label: 'Console', href: '/console' },
      { label: 'Plugins', href: '/console/plugins' },
      { label: 'sovereign-tasks' },
    ],
  },
} satisfies Meta<typeof Breadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {};

export const TwoLevels: Story = {
  args: {
    items: [{ label: 'Console', href: '/console' }, { label: 'Settings' }],
  },
};

export const WithRenderLink: Story = {
  name: 'With custom renderLink',
  args: {
    renderLink: (item, children) => (
      <a href={item.href} data-client-side-nav="true">
        {children}
      </a>
    ),
  },
};
