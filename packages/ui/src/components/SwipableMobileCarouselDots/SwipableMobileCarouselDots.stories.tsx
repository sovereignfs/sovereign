import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SwipableMobileCarouselDots } from './SwipableMobileCarouselDots';

function DotsDemo({ density = 'default' as 'default' | 'compact', count = 4 }) {
  const [active, setActive] = useState(0);
  return (
    <SwipableMobileCarouselDots
      count={count}
      activeIndex={active}
      onJump={setActive}
      density={density}
      aria-label="Slides"
      labels={['Lists', 'Starred', 'Groceries', 'Archive']}
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
          'A slide indicator whose dots are real, labelled `tab` buttons a person can tap or reach with the keyboard. It stands alone, and is also the carousel’s default indicator.',
      },
    },
  },
  args: { count: 4, activeIndex: 0, onJump: () => {}, 'aria-label': 'Slides' },
} satisfies Meta<typeof SwipableMobileCarouselDots>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <DotsDemo /> };
export const Compact: Story = { render: () => <DotsDemo density="compact" count={8} /> };
