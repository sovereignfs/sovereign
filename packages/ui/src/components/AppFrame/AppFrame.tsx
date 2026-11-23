'use client';

import { type ReactNode, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { usePublishShellChromeHeight } from '../../hooks/usePublishShellChromeHeight';
import { AppSidebar, type AppSidebarBlock, type AppSidebarProps } from '../AppSidebar/AppSidebar';
import { useAppSidebar } from '../AppSidebar/useAppSidebar';
import type { SidebarState } from '../AppSidebar/sidebar-state';
import { Drawer } from '../Drawer/Drawer';
import { Header } from '../Header/Header';
import { Icon } from '../Icon/Icon';
import { MobileFooter, type MobileFooterProps } from '../MobileFooter/MobileFooter';
import { MobileHeader } from '../MobileHeader/MobileHeader';
import styles from './AppFrame.module.css';

/** The phone's footer: `MobileFooter`'s icons and middle button. Without `onOpenApps`, the middle button opens the navigation drawer. */
export type AppFrameFooter = Omit<MobileFooterProps, 'onOpenApps' | 'launcherOpen'> & {
  onOpenApps?: () => void;
  launcherOpen?: boolean;
};

export interface AppFrameLabels {
  /** The header's sidebar button, when it hides the sidebar. */
  hideSidebar: string;
  /** The header's sidebar button, when it shows the sidebar again. */
  showSidebar: string;
  /** The phone header's button that opens the navigation drawer. */
  openNavigation: string;
}

const LABELS: AppFrameLabels = {
  hideSidebar: 'Hide the sidebar',
  showSidebar: 'Show the sidebar',
  openNavigation: 'Open the navigation',
};

export interface AppFrameProps {
  /** The app's id: its sidebar's choices are kept on the device under it. */
  appId: string;
  /** The app's name: the navigation's accessible name and the header's home for assistive technology. */
  name: string;
  /** The app's wordmark, already a link home. Drawn in the header on every screen. */
  brand: ReactNode;
  /** The kind of page shown (`'home'`, `'page'`, as the app names them): the sidebar is remembered per kind. */
  pageKind: string;
  /** How the sidebar is shown on a kind of page until a person chooses. `full` by default. */
  defaultSidebar?: SidebarState;
  /** The sidebar's blocks, which the phone's drawer shows too. */
  blocks: AppSidebarBlock[];
  renderLink?: AppSidebarProps['renderLink'];
  /** Under the sidebar's blocks. */
  sidebarFooter?: ReactNode;
  /** The suite's launcher, the bell and the avatar menu: each drawn only when given, in that order. On a phone there is no launcher. */
  launcher?: ReactNode;
  notifications?: ReactNode;
  avatarMenu?: ReactNode;
  /** The phone's footer. Omit for none. */
  footer?: AppFrameFooter;
  /** The right column (an item, a card): beside the content on a wide screen, over it on a phone. */
  detail?: ReactNode;
  /** The frame's own words; English by default. */
  labels?: Partial<AppFrameLabels>;
  /** Where the header's home is when no `brand` link is followed (core's badge falls back to it). `/` by default. */
  homeHref?: string;
  children: ReactNode;
}

/**
 * AppFrame — the frame of every app's signed-in page: on a wide screen `Header`, `AppSidebar`, the content and an optional right
 * column; on a phone `MobileHeader`, the content, `MobileFooter` and a `Drawer` with the sidebar's blocks. Only what is drawn
 * differs by the screen: the routes, the blocks and what each row opens are the same, and nothing here changes an address.
 *
 * It is the shell root (`#sv-app-shell`) that overlays portal into, and it publishes the header's and the footer's heights
 * (`--sv-shell-header-height`, `--sv-shell-footer-height`) so that dialogs, drawers, toasts and a floating button clear them, as
 * Tusk's and Shopper's own frames did.
 */
export function AppFrame({
  appId,
  name,
  brand,
  pageKind,
  defaultSidebar = 'full',
  blocks,
  renderLink,
  sidebarFooter,
  launcher,
  notifications,
  avatarMenu,
  footer,
  detail,
  labels,
  homeHref = '/',
  children,
}: AppFrameProps) {
  const words = { ...LABELS, ...labels };
  const mobile = useIsMobile();
  const sidebar = useAppSidebar(appId, pageKind, defaultSidebar);
  const [navOpen, setNavOpen] = useState(false);

  const hidden = sidebar.state === 'hidden';
  const sidebarButton = (
    <button
      type="button"
      className={styles.toggle}
      aria-label={hidden ? words.showSidebar : words.hideSidebar}
      aria-expanded={!hidden}
      onClick={sidebar.toggleHidden}
    >
      <Icon name="menu" aria-hidden />
    </button>
  );
  const menuButton = (
    <button
      type="button"
      className={styles.toggle}
      aria-label={words.openNavigation}
      aria-haspopup="dialog"
      aria-expanded={navOpen}
      onClick={() => setNavOpen(true)}
    >
      <Icon name="menu" aria-hidden />
    </button>
  );

  return (
    <div id="sv-app-shell" className={styles.shell}>
      {mobile ? (
        <MobileHeader
          className={styles.mobileHeader}
          logo={
            <span className={styles.lead}>
              {menuButton}
              {brand}
            </span>
          }
          bell={notifications ?? null}
          avatarMenu={avatarMenu ?? null}
        />
      ) : (
        <HeaderRow>
          <Header
            instanceName={name}
            homeHref={homeHref}
            brand={brand}
            leading={sidebarButton}
            launcher={launcher}
            notifications={notifications}
            avatarMenu={avatarMenu}
          />
        </HeaderRow>
      )}
      <div className={styles.main}>
        {!mobile && (
          <AppSidebar
            aria-label={name}
            blocks={blocks}
            state={sidebar.state}
            onToggleRail={sidebar.toggleRail}
            footer={sidebarFooter}
            {...(renderLink ? { renderLink } : {})}
          />
        )}
        <div className={[styles.content, detail ? styles.covered : ''].filter(Boolean).join(' ')}>
          {children}
        </div>
        {detail ? <aside className={styles.detail}>{detail}</aside> : null}
      </div>
      {mobile && footer ? (
        <MobileFooter
          {...footer}
          onOpenApps={footer.onOpenApps ?? (() => setNavOpen(true))}
          launcherOpen={footer.onOpenApps ? footer.launcherOpen : navOpen}
        />
      ) : null}
      {mobile ? (
        <Drawer
          open={navOpen}
          onClose={() => setNavOpen(false)}
          aria-label={name}
          snapHeight="half"
        >
          <AppSidebar
            aria-label={name}
            blocks={blocks}
            state="full"
            placement="drawer"
            footer={sidebarFooter}
            onNavigate={() => setNavOpen(false)}
            {...(renderLink ? { renderLink } : {})}
          />
        </Drawer>
      ) : null}
    </div>
  );
}

/** The wide screen's header row, publishing its height while it is drawn and taking it back when the phone's header replaces it. */
function HeaderRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishShellChromeHeight(ref, '--sv-shell-header-height');
  return (
    <div ref={ref} className={styles.headerRow}>
      {children}
    </div>
  );
}
