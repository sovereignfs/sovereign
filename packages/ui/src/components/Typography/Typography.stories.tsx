import type { Meta, StoryObj } from '@storybook/react-vite';
import { Typography } from './Typography';

const meta = {
  title: 'Components/Typography',
  component: Typography,
  parameters: { layout: 'padded' },
  args: {
    variant: 'body',
    children: 'The quick brown fox',
  },
} satisfies Meta<typeof Typography>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const H1: Story = {
  args: { variant: 'h1' },
};

export const H2: Story = {
  args: { variant: 'h2' },
};

export const H3: Story = {
  args: { variant: 'h3' },
};

export const H4: Story = {
  args: { variant: 'h4' },
};

export const Body: Story = {
  args: { variant: 'body' },
};

export const Caption: Story = {
  args: { variant: 'caption' },
};

export const LabelVariant: Story = {
  name: 'Label',
  args: { variant: 'label', children: 'Section label' },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Typography variant="h1">Heading 1</Typography>
      <Typography variant="h2">Heading 2</Typography>
      <Typography variant="h3">Heading 3</Typography>
      <Typography variant="h4">Heading 4</Typography>
      <Typography variant="body">
        Body copy — the default reading size for paragraphs and descriptions.
      </Typography>
      <Typography variant="caption">Caption — secondary, supporting copy.</Typography>
      <Typography variant="label">Section label</Typography>
    </div>
  ),
};
