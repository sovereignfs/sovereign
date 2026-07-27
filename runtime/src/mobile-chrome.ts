import type { MobileChromeOverride } from './registry';
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
