'use client';

import Link from 'next/link';
import { EmptyState, NavList, ResponsiveSurface } from '@sovereignfs/ui';
import { ACCOUNT_SECTIONS } from './_lib/sections';

// The bare /account route never redirects (task 14.6) — forking a *content*
// swap by viewport here is safe (neither branch below has a navigation side
// effect), unlike forking a *redirect* decision, which would race
// ResponsiveSurface's SSR-default-false viewport detection: a redirect
// effect in the desktop branch would fire on every load, including real
// mobile devices, before useIsMobile's own effect ever corrects itself —
// permanently defeating the mobile index. Mirrors Console's own bare
// /console route (OverviewClient.tsx), which never redirects either.
export default function AccountIndex() {
  return (
    <ResponsiveSurface
      web={
        <EmptyState heading="Select a section" description="Choose a section from the sidebar." />
      }
      mobile={
        <NavList
          groups={[{ id: 'account', items: ACCOUNT_SECTIONS }]}
          variant="drilldown"
          aria-label="Account sections"
          renderLink={(item, linkProps) => (
            // replace, not push — same reason as layout.tsx's back-link and
            // desktop rail: this is a navigation hop inside an overlay
            // Dialog dismissed via router.back(), so push-based navigation
            // would stack history and require two backs to exit the dialog.
            <Link
              href={item.href}
              replace
              className={linkProps.className}
              aria-current={linkProps['aria-current']}
            >
              {linkProps.children}
            </Link>
          )}
        />
      }
    />
  );
}
