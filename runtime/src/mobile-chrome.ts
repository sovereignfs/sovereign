import type { MobileChromeOverride, MobileFooterLeftAction } from './registry';
import { underPrefix } from './route-guard';

/** Resolve a pathname's mobile header visibility against the plugin overrides
 *  (`shellConfig.mobileHeader`, RFC 0075) — mirrors the default-true
 *  resolution `getMobileChromeConfig()` already applies server-side. Shared
 *  between `middleware.ts` and `ClientShell.tsx` the same way `underPrefix`
 *  is, so both sides resolve visibility identically. */
export function mobileHeaderVisible(pathname: string, config: MobileChromeOverride[]): boolean {
  return config.find((c) => underPrefix(pathname, c.routePrefix))?.mobileHeader ?? true;
}

/** Resolve a pathname's mobile footer visibility — see `mobileHeaderVisible`. */
export function mobileFooterVisible(pathname: string, config: MobileChromeOverride[]): boolean {
  return config.find((c) => underPrefix(pathname, c.routePrefix))?.mobileFooter ?? true;
}

/** Resolve a pathname's mobile footer left-icon override
 *  (`shellConfig.mobileFooterLeftAction`) — `null` when the active plugin
 *  (if any) doesn't declare one, meaning "use the default Home icon." See
 *  `mobileHeaderVisible`. */
export function mobileFooterLeftAction(
  pathname: string,
  config: MobileChromeOverride[],
): MobileFooterLeftAction | null {
  return config.find((c) => underPrefix(pathname, c.routePrefix))?.footerLeftAction ?? null;
}
