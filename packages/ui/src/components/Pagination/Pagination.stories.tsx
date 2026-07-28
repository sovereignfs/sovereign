import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pagination } from './Pagination';

const meta = {
  title: 'Components/Pagination',
  component: Pagination,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Page-number / prev-next control. Shows first, last, and pages near the current one, with an ellipsis for gaps once the page count grows.',
      },
    },
  },
  args: {
    page: 1,
    totalPages: 5,
    onChange: () => {},
  },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const FewPages: Story = {
  render: (args) => {
    const [page, setPage] = useState(args.page);
    return <Pagination {...args} page={page} totalPages={5} onChange={setPage} />;
  },
};

export const ManyPagesWithEllipsis: Story = {
  render: (_args) => {
    const [page, setPage] = useState(8);
    return <Pagination page={page} totalPages={40} onChange={setPage} />;
  },
};

export const FirstPage: Story = {
  args: { page: 1, totalPages: 10 },
};

export const LastPage: Story = {
  args: { page: 10, totalPages: 10 },
};
