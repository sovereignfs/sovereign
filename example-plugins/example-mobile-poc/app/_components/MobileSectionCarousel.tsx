'use client';

import { useState } from 'react';
import {
  Icon,
  MobileAppsDrawer,
  MobileFooter,
  MobileHeader,
  SwipableMobileCarousel,
  SwipableMobileCarouselDots,
  SwipableMobileCarouselSlide,
  SwipableMobileCarouselSlideBody,
  SwipableMobileCarouselSlideHeader,
  useCarouselRouteSync,
} from '@sovereignfs/ui';
import { usePathname, useRouter } from 'next/navigation';
import SectionContent from './SectionContent';
import SectionsNav from './SectionsNav';
import { SECTIONS } from '../_lib/sections';
import styles from './MobileSectionCarousel.module.css';

const ROUTE_PREFIX = '/example-mobile-poc';

/** Matches plugins/launcher/icon.svg exactly — the real shell's own
 *  launcher icon (served at /plugin-icons/<launcher-id>.svg) is fixed, not
 *  configurable, so this POC's own launcher button reuses the same artwork
 *  inline rather than the generic grid-2x2 Icon fallback (which renders a
 *  visually different single-square-divided-in-4 glyph — see MobileFooter's
 *  own default). Sized to match MobileNav's .navIcon exactly.
 *
 *  Deliberately does NOT inherit currentColor from .navItem's muted state
 *  like the Home/Search icons do — the reference's own launcher icon is an
 *  <img>-sourced SVG, which can't inherit page CSS color at all, so it
 *  always paints at its own intrinsic (effectively full-contrast) stroke
 *  color regardless of the footer's muted/active icon states, only ever
 *  flipped by the dark-mode invert filter. --sv-color-text-primary is the
 *  equivalent always-full-contrast, theme-adaptive token for an inline SVG
 *  that CAN inherit color — see .launcherIcon in the module CSS. */
function LauncherIcon() {
  return (
    <svg
      className={styles.launcherIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/** Slide 0 is the Sections index (mirrors sovereign-tasks' Lists index
 *  slide); slide n (n>=1) is SECTIONS[n-1]. */
function indexForPathname(pathname: string): number {
  const match = pathname.match(/^\/example-mobile-poc\/([^/]+)/);
  if (match) {
    const idx = SECTIONS.findIndex((s) => s.slug === match[1]);
    if (idx !== -1) return idx + 1;
  }
  // Bare route, or an unknown slug: land on the first section rather than
  // the index slide — matches the desktop sidebar + content pane both being
  // visible together (see sovereign-tasks' MobileTasksCarousel for the same
  // convention). The index slide is reached only by swiping.
  return 1;
}

function pathForIndex(index: number): string {
  if (index === 0) return ROUTE_PREFIX;
  const section = SECTIONS[index - 1];
  return section ? `${ROUTE_PREFIX}/${section.slug}` : ROUTE_PREFIX;
}

/**
 * The shell's own mobile header/footer are turned off for this plugin
 * (manifest.json's shellConfig.mobileHeader/mobileFooter, RFC 0075)
 * specifically so this POC can mount @sovereignfs/ui's MobileHeader and
 * MobileFooter itself and exercise them directly — header title synced to
 * the active carousel slide, footer icons jumping straight to a slide (via
 * useCarouselRouteSync's onSettle, the same "external navigation" path a
 * dot-indicator jump uses) with the centered Apps button opening a
 * MobileAppsDrawer over the full section list, mirroring the runtime
 * shell's own Home/Apps/Search convention (MobileNav) exactly, including
 * its launcher icon (see LauncherIcon below). No `logo` prop is passed to
 * MobileHeader — its default "S" badge (matching the shell's own fallback
 * brand icon) is used as-is.
 */
export default function MobileSectionCarousel() {
  const router = useRouter();
  const pathname = usePathname();
  const [bellOpen, setBellOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { activeIndex, onSettle } = useCarouselRouteSync({
    indexForPathname,
    pathForIndex,
    pathname,
    onNavigate: (path) => router.replace(path, { scroll: false }),
  });

  const activeSection = activeIndex > 0 ? SECTIONS[activeIndex - 1] : undefined;
  const headerTitle = activeSection ? activeSection.label : 'Sections';

  return (
    <div className={styles.wrap}>
      <MobileHeader
        title={headerTitle}
        bell={
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Notifications"
            aria-expanded={bellOpen}
            onClick={() => setBellOpen((v) => !v)}
          >
            <Icon name="bell" size="lg" aria-hidden />
          </button>
        }
        avatarMenu={
          <span className={styles.avatar} aria-label="Account">
            PO
          </span>
        }
      />

      {bellOpen && (
        <div className={styles.banner}>
          No notifications — this POC has no data layer to generate any.
        </div>
      )}

      <div className={styles.carouselWrap}>
        <SwipableMobileCarousel
          activeIndex={activeIndex}
          onSettle={onSettle}
          aria-label="Example mobile sections"
          // Option A (see conversation): the Sections index (slide 0) is a
          // menu, not a numbered section — swipe-left-from-the-first-section
          // reveals it and swipe-right closes it for free via the carousel's
          // own native scroll-snap, but it shouldn't count as a dot. Re-index
          // the default indicator to start at slide 1 so only real sections
          // get a dot; no dot is active while the menu itself is open.
          renderIndicator={({ count, activeIndex: dotIndex, labels, onJump }) => (
            <SwipableMobileCarouselDots
              className={styles.dots}
              count={count - 1}
              activeIndex={dotIndex - 1}
              labels={labels.slice(1)}
              aria-label="Sections"
              onJump={(i) => onJump(i + 1)}
            />
          )}
        >
          <SwipableMobileCarouselSlide slideKey="index" label="Sections">
            <SwipableMobileCarouselSlideHeader>
              <div className={styles.slideHeading}>Sections</div>
            </SwipableMobileCarouselSlideHeader>
            <SwipableMobileCarouselSlideBody>
              <SectionsNav />
            </SwipableMobileCarouselSlideBody>
          </SwipableMobileCarouselSlide>

          {SECTIONS.map((section) => (
            <SwipableMobileCarouselSlide
              key={section.slug}
              slideKey={section.slug}
              label={section.label}
            >
              <SwipableMobileCarouselSlideHeader>
                <div className={styles.slideHeading}>{section.label}</div>
              </SwipableMobileCarouselSlideHeader>
              <SwipableMobileCarouselSlideBody>
                <div className={styles.slideBody}>
                  <SectionContent section={section} />
                </div>
              </SwipableMobileCarouselSlideBody>
            </SwipableMobileCarouselSlide>
          ))}
        </SwipableMobileCarousel>
      </div>

      <MobileFooter
        onOpenApps={() => setAppsOpen(true)}
        launcherIcon={<LauncherIcon />}
        launcherOpen={appsOpen}
        leftIcons={[
          {
            // Always jumps to the carousel's first (leftmost) slide — the
            // Sections index — not a "home" section, so a house glyph would
            // misrepresent the destination; a menu/hamburger glyph reads as
            // "open the index" regardless of which slide is currently active.
            icon: <Icon name="menu" size="md" aria-hidden />,
            label: 'Sections',
            active: activeIndex === 0,
            onClick: () => onSettle(0),
          },
        ]}
        rightIcons={[
          {
            icon: <Icon name="search" size="md" aria-hidden />,
            label: 'Search',
            active: searchOpen,
            onClick: () => setSearchOpen((v) => !v),
          },
        ]}
      />

      {searchOpen && (
        <div className={styles.banner}>Search — this POC has no data layer to search.</div>
      )}

      <MobileAppsDrawer
        open={appsOpen}
        onClose={() => setAppsOpen(false)}
        aria-label="Sections"
        items={SECTIONS.map((section, i) => ({
          key: section.slug,
          icon: <Icon name={section.icon} size="lg" aria-hidden />,
          label: section.label,
          onClick: () => {
            setAppsOpen(false);
            onSettle(i + 1);
          },
        }))}
      />
    </div>
  );
}
