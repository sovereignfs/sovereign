import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { SwipableMobileCarouselDots } from './SwipableMobileCarouselDots';

function DotsDemo({ count = 4, density }: { count?: number; density?: 'default' | 'compact' }) {
  const [active, setActive] = useState(0);
  return (
    <SwipableMobileCarouselDots
      count={count}
      activeIndex={active}
      onJump={setActive}
      density={density}
      aria-label="Slides"
    />
  );
}

const meta = {
  title: 'Components/SwipableMobileCarouselDots',
  component: SwipableMobileCarouselDots,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A real, tappable, labeled slide indicator — standalone (not carousel-only) and also `SwipableMobileCarousel`’s default `renderIndicator`. Every dot is a real `role="tab"` button with its own accessible name.',
      },
    },
  },
} satisfies Meta<typeof SwipableMobileCarouselDots>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { count: 4, activeIndex: 0, onJump: () => {}, 'aria-label': 'Slides' },
  render: () => <DotsDemo />,
};

export const Compact: Story = {
  args: { count: 10, activeIndex: 2, onJump: () => {}, 'aria-label': 'Slides', density: 'compact' },
  render: () => <DotsDemo count={10} density="compact" />,
};

export const WithLabels: Story = {
  args: {
    count: 3,
    activeIndex: 0,
    onJump: () => {},
    'aria-label': 'Lists',
    labels: ['Starred', 'Groceries', 'Chores'],
  },
};

/** Play function clicks the second dot and asserts it becomes active. */
export const JumpViaInteraction: Story = {
  args: { count: 4, activeIndex: 0, onJump: () => {}, 'aria-label': 'Slides' },
  render: () => <DotsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [, secondTab] = canvas.getAllByRole('tab');
    await userEvent.click(secondTab as HTMLElement);
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
  },
};
