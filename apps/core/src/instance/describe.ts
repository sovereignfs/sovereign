import type { BrandingKind, BrandingStore, BrandingSummary } from '../branding/store';
import { SETTINGS, type SettingDefinition } from '../settings/definitions';
import type { SettingSource, SettingsStore } from '../settings/store';

/** One value as the Console shows it: what applies, and whether it was saved here or comes from elsewhere. */
export type ShownSetting<T> = { value: T | undefined; source: SettingSource };

/** The mail server's settings as shown. The password is never here: only whether one is kept. */
export type ShownSmtp = {
  host: ShownSetting<string>;
  port: ShownSetting<number>;
  user: ShownSetting<string>;
  from: ShownSetting<string>;
  password: { source: SettingSource; hasValue: boolean; unreadable: boolean };
};

export type ShownInstance = {
  name: ShownSetting<string>;
  inviteOnly: ShownSetting<boolean>;
  images: Record<BrandingKind, BrandingSummary | undefined>;
  /** Present only when the caller may see the mail settings (`instance:configure-secrets`). */
  smtp: ShownSmtp | undefined;
};

/**
 * Everything the Console's instance page shows (core-app §3.12), read in one place. The mail settings are
 * only read when `withMail` is true: a page for someone who may not see them never loads them, so they
 * cannot leak into what it renders. A saved secret is described, never revealed.
 */
export async function describeInstance(
  settings: SettingsStore,
  branding: BrandingStore,
  options: { withMail: boolean },
): Promise<ShownInstance> {
  const shown = async <T extends string | number | boolean>(
    setting: SettingDefinition<T>,
  ): Promise<ShownSetting<T>> => {
    const { value, source } = await settings.get(setting);
    return { value, source };
  };
  const [name, inviteOnly, images] = await Promise.all([
    shown(SETTINGS.instanceName),
    shown(SETTINGS.inviteOnly),
    branding.describe(),
  ]);
  let smtp: ShownSmtp | undefined;
  if (options.withMail) {
    const [host, port, user, from, password] = await Promise.all([
      shown(SETTINGS.smtpHost),
      shown(SETTINGS.smtpPort),
      shown(SETTINGS.smtpUser),
      shown(SETTINGS.smtpFrom),
      settings.describe(SETTINGS.smtpPassword),
    ]);
    smtp = {
      host,
      port,
      user,
      from,
      password: {
        source: password.source,
        hasValue: password.hasValue,
        unreadable: password.unreadable,
      },
    };
  }
  return { name, inviteOnly, images, smtp };
}
