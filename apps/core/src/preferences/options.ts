import { canonicalLocale } from '../auth/locale';
import { canonicalTimezone } from '../auth/timezone';

export type Option = { value: string; label: string };

/** Languages offered by name; any other valid tag already saved is kept and shown by its tag. */
const COMMON_LOCALES = [
  'en-US', 'en-GB', 'en-AU', 'en-CA', 'fr-FR', 'fr-CA', 'de-DE', 'de-AT', 'de-CH', 'es-ES',
  'es-MX', 'es-AR', 'pt-BR', 'pt-PT', 'it-IT', 'nl-NL', 'sv-SE', 'nb-NO', 'da-DK', 'fi-FI',
  'pl-PL', 'cs-CZ', 'tr-TR', 'ru-RU', 'uk-UA', 'el-GR', 'he-IL', 'ar-SA', 'hi-IN', 'th-TH',
  'vi-VN', 'id-ID', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW',
]; // prettier-ignore

/** The time zones the platform knows, plus the person's saved one when it is not among them. */
export function timezoneOptions(saved?: string | null): Option[] {
  const names = new Set<string>(['UTC', ...Intl.supportedValuesOf('timeZone')]);
  const keep = saved ? canonicalTimezone(saved) : undefined;
  if (keep) names.add(keep);
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      value: name,
      label: name.replaceAll('_', ' '),
    }));
}

/** Common languages with regions, named in English ("German (Germany)"), with the saved one added if needed. */
export function localeOptions(saved?: string | null): Option[] {
  const tags = new Set<string>(COMMON_LOCALES);
  const keep = saved ? canonicalLocale(saved) : undefined;
  if (keep) tags.add(keep);
  const names = new Intl.DisplayNames(['en'], { type: 'language', languageDisplay: 'standard' });
  return [...tags]
    .map((tag) => ({ value: tag, label: safeName(names, tag) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function safeName(names: Intl.DisplayNames, tag: string): string {
  try {
    return `${names.of(tag) ?? tag} (${tag})`;
  } catch {
    return tag;
  }
}
