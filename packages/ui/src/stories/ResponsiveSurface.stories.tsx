import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResponsiveSurface } from '../components/ResponsiveSurface/ResponsiveSurface';

function demoTree(label: string) {
  return (
    <div
      style={{
        padding: 'var(--sv-space-6)',
        textAlign: 'center',
        fontFamily: 'var(--sv-font-family)',
        fontSize: 'var(--sv-font-size-sm)',
        color: 'var(--sv-color-text-primary)',
        border: '1px dashed var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
      }}
    >
      {label}
    </div>
  );
}

const meta = {
  title: 'Components/ResponsiveSurface',
  component: ResponsiveSurface,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Renders an entirely different component tree below a breakpoint, not a CSS squeeze of the same one — only the active side is ever mounted. See also the useResponsiveLayout hook for non-JSX values.',
      },
    },
  },
  args: {
    web: demoTree('Web tree — e.g. a three-column layout'),
    mobile: demoTree('Mobile tree — an entirely different component'),
  },
} satisfies Meta<typeof ResponsiveSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MobileViewport: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
