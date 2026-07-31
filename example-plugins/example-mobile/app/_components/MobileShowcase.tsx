'use client';

import { useState } from 'react';
import {
  Button,
  PageContainer,
  ResponsiveSurface,
  SwipableMobileCarousel,
  SwipableMobileCarouselSlide,
  SwipableMobileCarouselSlideHeader,
  SwipableMobileCarouselSlideBody,
  SwipableMobileCarouselSlideFooter,
} from '@sovereignfs/ui';
import styles from './MobileShowcase.module.css';

interface DemoSlide {
  key: string;
  label: string;
  title: string;
  body: string;
  action: string;
}

// Stand-ins for what a real plugin's slides would be (a task list, a
// shopping list, ...). This plugin is a layout showcase, not a data app —
// there is deliberately no fetch, no SDK call, no persistence here.
const SLIDES: DemoSlide[] = [
  {
    key: 'home',
    label: 'Home',
    title: 'Home',
    body: "A plugin's landing view — a dashboard, a feed, an index of records. This slide's title renders immediately; only a slide's own data-dependent content should ever gate on a loading state (see SwipableMobileCarouselSlideBody's `loading` prop).",
    action: 'Open',
  },
  {
    key: 'gallery',
    label: 'Gallery',
    title: 'Gallery',
    body: 'A list or grid view — items, records, a media gallery. Swipe left/right to move between slides; the native scroll-snap container supplies the gesture, not hand-rolled touch handling.',
    action: 'Browse',
  },
  {
    key: 'settings',
    label: 'Settings',
    title: 'Settings',
    body: "A detail or settings view. Each slide's Header/Body/Footer are independent regions — a detail overlay (Sheet, Dialog) for a record picked from a slide belongs as a sibling of the carousel, never nested inside a slide's own children.",
    action: 'Configure',
  },
];

function MobileCarouselDemo() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className={styles.carouselFrame}>
      <SwipableMobileCarousel
        activeIndex={activeIndex}
        onSettle={setActiveIndex}
        aria-label="Example mobile layout"
      >
        {SLIDES.map((slide) => (
          <SwipableMobileCarouselSlide key={slide.key} slideKey={slide.key} label={slide.label}>
            <SwipableMobileCarouselSlideHeader>
              <div className={styles.header}>{slide.title}</div>
            </SwipableMobileCarouselSlideHeader>
            <SwipableMobileCarouselSlideBody>
              <p className={styles.body}>{slide.body}</p>
            </SwipableMobileCarouselSlideBody>
            <SwipableMobileCarouselSlideFooter>
              <div className={styles.footer}>
                <Button size="sm" variant="secondary">
                  {slide.action}
                </Button>
              </div>
            </SwipableMobileCarouselSlideFooter>
          </SwipableMobileCarouselSlide>
        ))}
      </SwipableMobileCarousel>
    </div>
  );
}

function DesktopNotice() {
  return (
    <PageContainer maxWidth="md">
      <div className={styles.desktopNotice}>
        <h1 className={styles.title}>Example: Mobile Layout</h1>
        <p className={styles.lead}>
          This plugin only has a mobile layout — resize the browser below 768px, or open on a real
          device, to see it.
        </p>
        <p className={styles.lead}>Demonstrated below that breakpoint:</p>
        <ul className={styles.list}>
          <li>
            <code>ResponsiveSurface</code> — this exact desktop/mobile fork, one tree mounted at a
            time
          </li>
          <li>
            <code>SwipableMobileCarousel</code> — a swipeable, route-style filmstrip of slides
          </li>
          <li>
            <code>SwipableMobileCarouselSlideHeader</code>/<code>Body</code>/<code>Footer</code> — a
            slide's header/footer render independent of its body&apos;s own loading state
          </li>
        </ul>
      </div>
    </PageContainer>
  );
}

export function MobileShowcase() {
  return <ResponsiveSurface web={<DesktopNotice />} mobile={<MobileCarouselDemo />} />;
}
