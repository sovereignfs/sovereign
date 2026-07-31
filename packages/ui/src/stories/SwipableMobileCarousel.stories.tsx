import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SwipableMobileCarousel } from '../components/SwipableMobileCarousel/SwipableMobileCarousel';
import { SwipableMobileCarouselSlide } from '../components/SwipableMobileCarousel/SwipableMobileCarouselSlide';
import { SwipableMobileCarouselSlideHeader } from '../components/SwipableMobileCarousel/SwipableMobileCarouselSlideHeader';
import { SwipableMobileCarouselSlideBody } from '../components/SwipableMobileCarousel/SwipableMobileCarouselSlideBody';
import { SwipableMobileCarouselSlideFooter } from '../components/SwipableMobileCarousel/SwipableMobileCarouselSlideFooter';
import { SwipableMobileCarouselDots } from '../components/SwipableMobileCarouselDots/SwipableMobileCarouselDots';

const SLIDES = [
  { key: 'lists', label: 'Lists' },
  { key: 'groceries', label: 'Groceries' },
  { key: 'errands', label: 'Errands' },
  { key: 'work', label: 'Work' },
];

function slideBodyStyle(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontFamily: 'var(--sv-font-family)',
    color: 'var(--sv-color-text-primary)',
  };
}

function headerStyle(): React.CSSProperties {
  return {
    padding: 'var(--sv-space-4)',
    fontFamily: 'var(--sv-font-family)',
    fontWeight: 'var(--sv-font-weight-semibold)',
    color: 'var(--sv-color-text-primary)',
    borderBottom: '1px solid var(--sv-color-border)',
  };
}

function CarouselFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: 480,
        maxWidth: 375,
        margin: '0 auto',
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function DefaultDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <CarouselFrame>
      <SwipableMobileCarousel
        activeIndex={activeIndex}
        onSettle={setActiveIndex}
        aria-label="Task lists"
      >
        {SLIDES.map((slide) => (
          <SwipableMobileCarouselSlide key={slide.key} slideKey={slide.key} label={slide.label}>
            <SwipableMobileCarouselSlideHeader>
              <div style={headerStyle()}>{slide.label}</div>
            </SwipableMobileCarouselSlideHeader>
            <SwipableMobileCarouselSlideBody>
              <div style={slideBodyStyle()}>{slide.label} content</div>
            </SwipableMobileCarouselSlideBody>
          </SwipableMobileCarouselSlide>
        ))}
      </SwipableMobileCarousel>
    </CarouselFrame>
  );
}

function LazyLoadingBodyDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(new Set(['lists']));

  function simulateLoad(key: string) {
    setTimeout(() => setLoadedKeys((s) => new Set(s).add(key)), 1200);
  }

  return (
    <CarouselFrame>
      <SwipableMobileCarousel
        activeIndex={activeIndex}
        onSettle={(i) => {
          setActiveIndex(i);
          const key = SLIDES[i]?.key;
          if (key && !loadedKeys.has(key)) simulateLoad(key);
        }}
        aria-label="Task lists (simulated fetch)"
      >
        {SLIDES.map((slide) => (
          <SwipableMobileCarouselSlide key={slide.key} slideKey={slide.key} label={slide.label}>
            {/* The title renders immediately from already-known metadata —
                only the Body below waits on its own simulated 1.2s fetch. */}
            <SwipableMobileCarouselSlideHeader>
              <div style={headerStyle()}>{slide.label}</div>
            </SwipableMobileCarouselSlideHeader>
            <SwipableMobileCarouselSlideBody loading={!loadedKeys.has(slide.key)}>
              <div style={slideBodyStyle()}>{slide.label} content (loaded)</div>
            </SwipableMobileCarouselSlideBody>
          </SwipableMobileCarouselSlide>
        ))}
      </SwipableMobileCarousel>
    </CarouselFrame>
  );
}

function CustomIndicatorDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <CarouselFrame>
      <SwipableMobileCarousel
        activeIndex={activeIndex}
        onSettle={setActiveIndex}
        aria-label="Task lists"
        renderIndicator={({ count, activeIndex: i, onJump }) => (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              fontFamily: 'var(--sv-font-family)',
              fontSize: 'var(--sv-font-size-sm)',
              color: 'var(--sv-color-text-primary)',
              background: 'var(--sv-color-surface-raised)',
              borderRadius: 'var(--sv-radius-md)',
              padding: 'var(--sv-space-1) var(--sv-space-2)',
            }}
          >
            <button type="button" onClick={() => onJump(Math.max(0, i - 1))}>
              ‹
            </button>{' '}
            {i + 1} / {count}{' '}
            <button type="button" onClick={() => onJump(Math.min(count - 1, i + 1))}>
              ›
            </button>
          </div>
        )}
      >
        {SLIDES.map((slide) => (
          <SwipableMobileCarouselSlide key={slide.key} slideKey={slide.key} label={slide.label}>
            <SwipableMobileCarouselSlideHeader>
              <div style={headerStyle()}>{slide.label}</div>
            </SwipableMobileCarouselSlideHeader>
            <SwipableMobileCarouselSlideBody>
              <div style={slideBodyStyle()}>{slide.label} content</div>
            </SwipableMobileCarouselSlideBody>
          </SwipableMobileCarouselSlide>
        ))}
      </SwipableMobileCarousel>
    </CarouselFrame>
  );
}

function NoIndicatorDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <CarouselFrame>
      <SwipableMobileCarousel
        activeIndex={activeIndex}
        onSettle={setActiveIndex}
        aria-label="Task lists"
        renderIndicator={null}
      >
        {SLIDES.map((slide) => (
          <SwipableMobileCarouselSlide key={slide.key} slideKey={slide.key} label={slide.label}>
            <SwipableMobileCarouselSlideHeader>
              <div style={headerStyle()}>{slide.label}</div>
            </SwipableMobileCarouselSlideHeader>
            <SwipableMobileCarouselSlideBody>
              <div style={slideBodyStyle()}>{slide.label} content</div>
            </SwipableMobileCarouselSlideBody>
          </SwipableMobileCarouselSlide>
        ))}
      </SwipableMobileCarousel>
    </CarouselFrame>
  );
}

function FooterDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <CarouselFrame>
      <SwipableMobileCarousel
        activeIndex={activeIndex}
        onSettle={setActiveIndex}
        aria-label="Task lists"
      >
        {SLIDES.map((slide) => (
          <SwipableMobileCarouselSlide key={slide.key} slideKey={slide.key} label={slide.label}>
            <SwipableMobileCarouselSlideHeader>
              <div style={headerStyle()}>{slide.label}</div>
            </SwipableMobileCarouselSlideHeader>
            <SwipableMobileCarouselSlideBody>
              <div style={slideBodyStyle()}>{slide.label} content</div>
            </SwipableMobileCarouselSlideBody>
            <SwipableMobileCarouselSlideFooter>
              <div
                style={{
                  padding: 'var(--sv-space-3) var(--sv-space-4)',
                  borderTop: '1px solid var(--sv-color-border)',
                  fontFamily: 'var(--sv-font-family)',
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-muted)',
                }}
              >
                + Add to {slide.label}
              </div>
            </SwipableMobileCarouselSlideFooter>
          </SwipableMobileCarouselSlide>
        ))}
      </SwipableMobileCarousel>
    </CarouselFrame>
  );
}

function DotsStandaloneDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <SwipableMobileCarouselDots
      count={4}
      activeIndex={activeIndex}
      onJump={setActiveIndex}
      labels={['Lists', 'Groceries', 'Errands', 'Work']}
      aria-label="Task lists"
    />
  );
}

const meta = {
  title: 'Components/SwipableMobileCarousel',
  component: SwipableMobileCarousel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "A compound component for swiping between full-width slides (each an independent route/view on mobile), wrapping useSnapCarousel. Owns rendering and mount-window mechanics only — it has no opinion on where slide data lives. Do NOT aggregate cross-slide data or mount a detail overlay (Sheet, Dialog) inside a Slide's children; see docs/design-system.md's carousel section.",
      },
    },
  },
  // Every story below supplies its own render(), which is stateful (activeIndex
  // lives in useState) — these args only satisfy the required-prop typing.
  args: {
    activeIndex: 0,
    onSettle: () => {},
    'aria-label': 'Task lists',
    children: null,
  },
} satisfies Meta<typeof SwipableMobileCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <DefaultDemo /> };

export const LazyLoadingBody: Story = {
  render: () => <LazyLoadingBodyDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Swipe to a new slide — its title renders immediately from already-known metadata, while only the Body region shows a brief loading placeholder for its simulated 1.2s fetch. This is the fix for the "whole slide blanks out, title included, until its own fetch resolves" bug.',
      },
    },
  },
};

export const CustomIndicator: Story = { render: () => <CustomIndicatorDemo /> };

export const NoIndicator: Story = { render: () => <NoIndicatorDemo /> };

export const WithFooter: Story = { render: () => <FooterDemo /> };

export const MobileViewport: Story = {
  render: () => <DefaultDemo />,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

// ---------------------------------------------------------------------------
// SwipableMobileCarouselDots — standalone, also this carousel's default
// indicator. Grouped in this file rather than its own (Table's sub-parts
// share one story file too), though it has its own component subfolder and
// barrel export for independent reuse.
// ---------------------------------------------------------------------------

export const DotsStandalone: Story = {
  render: () => <DotsStandaloneDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'SwipableMobileCarouselDots used on its own, outside a carousel — a real role="tablist"/role="tab" component (tappable, labeled, focusable), unlike the aria-hidden decorative dots both sovereign-tasks and sovereign-shopper currently hand-roll.',
      },
    },
  },
};
