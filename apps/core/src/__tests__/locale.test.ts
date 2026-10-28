import { describe, expect, it } from 'vitest';
import { canonicalLocale } from '../auth/locale';
import { localeOptions, timezoneOptions } from '../preferences/options';

describe('canonicalLocale', () => {
  it.each([
    ['en', 'en'],
    ['en-GB', 'en-GB'],
    ['en-gb', 'en-GB'],
    ['DE-at', 'de-AT'],
    ['zh-Hant-TW', 'zh-Hant-TW'],
    ['sr-latn-rs', 'sr-Latn-RS'],
    ['es-419', 'es-419'],
  ])('accepts %s as %s', (given, kept) => {
    expect(canonicalLocale(given)).toBe(kept);
  });

  it.each([
    '',
    ' ',
    'e',
    'english',
    'en_GB',
    'en-',
    '-en',
    'en--GB',
    'en,fr',
    'en-GB ',
    'und',
    'und-DE',
    'i-klingon',
    'x-private',
    'en-GB-x-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'en\n',
    5,
    null,
    undefined,
    {},
    ['en-GB'],
  ])('refuses %j', (given) => {
    expect(canonicalLocale(given)).toBeUndefined();
  });
});

describe('what the preferences page offers', () => {
  it('lists the time zones the platform knows, in order, with UTC', () => {
    const zones = timezoneOptions().map((option) => option.value);
    expect(zones).toContain('Europe/London');
    expect(zones).toContain('UTC');
    expect(zones).toEqual([...zones].sort((a, b) => a.localeCompare(b)));
    expect(new Set(zones).size).toBe(zones.length);
  });

  it('shows a zone without underscores, and keeps its real name as the value', () => {
    expect(timezoneOptions().find((option) => option.value === 'America/New_York')).toEqual({
      value: 'America/New_York',
      label: 'America/New York',
    });
  });

  it('keeps a saved zone the list does not have, and ignores a saved one that is not a zone', () => {
    expect(timezoneOptions('Etc/GMT+5').map((option) => option.value)).toContain('Etc/GMT+5');
    expect(timezoneOptions('Mars/Phobos').map((option) => option.value)).not.toContain(
      'Mars/Phobos',
    );
  });

  it('names common languages in English with their tag, in order', () => {
    const locales = localeOptions();
    expect(locales.find((option) => option.value === 'de-DE')?.label).toBe(
      'German (Germany) (de-DE)',
    );
    const labels = locales.map((option) => option.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it('keeps a saved language the list does not name, by its tag', () => {
    expect(localeOptions('sr-Latn-RS').map((option) => option.value)).toContain('sr-Latn-RS');
    expect(localeOptions('nonsense').map((option) => option.value)).not.toContain('nonsense');
  });
});
