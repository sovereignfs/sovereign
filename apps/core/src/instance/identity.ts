import type { BrandingStore } from '../branding/store';
import { SETTINGS } from '../settings/definitions';
import type { SettingsStore } from '../settings/store';

export const DEFAULT_INSTANCE_NAME = 'Sovereign';

/** How the instance presents itself: its name, and the addresses of the pictures it has (core-app §3.12). */
export type InstanceIdentity = {
  name: string;
  /** The logo for a light page, or for both when only one was given. */
  logoLight: string | undefined;
  /** The logo for a dark page, or for both when only one was given. */
  logoDark: string | undefined;
  favicon: string | undefined;
  /**
   * The logo for an email, as an absolute address: a mail client shows a picture from the open web, and shows
   * only the kinds it can be trusted with, so an SVG is never one.
   */
  emailLogo: string | undefined;
};

/** What the instance looks like with nothing set, and what stands in when the settings cannot be read. */
export const PLAIN_IDENTITY: InstanceIdentity = {
  name: DEFAULT_INSTANCE_NAME,
  logoLight: undefined,
  logoDark: undefined,
  favicon: undefined,
  emailLogo: undefined,
};

export async function loadIdentity(
  settings: SettingsStore,
  branding: BrandingStore,
  baseUrl: string,
): Promise<InstanceIdentity> {
  const [name, images] = await Promise.all([
    settings.value(SETTINGS.instanceName),
    branding.describe(),
  ]);
  const light = images['logo-light'];
  const dark = images['logo-dark'];
  const raster = light && light.contentType !== 'image/svg+xml' ? light : undefined;
  return {
    name: name ?? DEFAULT_INSTANCE_NAME,
    logoLight: (light ?? dark)?.path,
    logoDark: (dark ?? light)?.path,
    favicon: images.favicon?.path,
    emailLogo: raster ? new URL(raster.path, baseUrl).toString() : undefined,
  };
}
