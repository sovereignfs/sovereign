import type { Meta, StoryObj } from '@storybook/react-vite';
import { LegalLinks } from './LegalLinks';

const meta = {
  title: 'Components/LegalLinks',
  component: LegalLinks,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LegalLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {};

export const CustomHrefs: Story = {
  args: {
    privacyHref: 'https://example.com/legal/privacy',
    termsHref: 'https://example.com/legal/terms',
  },
};
