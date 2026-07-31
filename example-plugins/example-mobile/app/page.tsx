import { MobileShowcase } from './_components/MobileShowcase';

/**
 * Example: Mobile Layout — reference plugin demonstrating @sovereignfs/ui's
 * PWA/mobile layout primitives (ResponsiveSurface, SwipableMobileCarousel).
 * Resize below 768px (or view on a device) to see the swipeable carousel;
 * desktop shows a static notice instead, since this plugin has nothing to
 * show in a wide layout by design.
 */
export default function ExampleMobilePage() {
  return <MobileShowcase />;
}
