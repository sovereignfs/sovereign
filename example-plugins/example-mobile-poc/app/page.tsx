import { EmptyState } from '@sovereignfs/ui';

/**
 * Bare /example-mobile-poc route. Desktop only — on mobile,
 * MobileSectionCarousel never renders this page at all (its carousel is
 * self-contained; the bare route just lands on the first section slide, same
 * convention as sovereign-tasks' bare /tasks route).
 */
export default function ExampleMobileIndexPage() {
  return (
    <EmptyState
      heading="Select a section"
      description="Choose a section from the sidebar to see its dummy content."
    />
  );
}
