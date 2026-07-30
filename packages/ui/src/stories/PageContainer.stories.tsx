import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageContainer } from '../components/PageContainer/PageContainer';

const demoBlock = (
  <div
    style={{
      background: 'var(--sv-color-surface-raised)',
      border: '1px dashed var(--sv-color-border)',
      borderRadius: 'var(--sv-radius-md)',
      padding: 'var(--sv-space-4)',
    }}
  >
    Page content goes here. The runtime shell already pads this area — this component only
    constrains and centers width, it adds no padding of its own.
  </div>
);

const meta = {
  title: 'Components/PageContainer',
  component: PageContainer,
  parameters: { layout: 'fullscreen' },
  args: { children: demoBlock },
} satisfies Meta<typeof PageContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {};

export const Small: Story = { args: { maxWidth: 'sm' } };
export const Large: Story = { args: { maxWidth: 'lg' } };
export const Full: Story = { args: { maxWidth: 'full' } };

export const MobileViewport: Story = {
  args: { maxWidth: 'md' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
