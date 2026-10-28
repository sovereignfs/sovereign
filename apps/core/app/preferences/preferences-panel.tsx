'use client';

import { type FormEvent, useState } from 'react';
import { Alert, Button, FormField, Select } from '@sovereignfs/ui';
import { authClient } from '../../src/auth/client';
import type { Option } from '../../src/preferences/options';
import styles from '../security/security.module.css';

type Props = {
  /** The saved time zone, or an empty string when none is saved. */
  timezone: string;
  locale: string;
  timezones: Option[];
  locales: Option[];
};

/** Where the person is and what language they use, as other apps see them (`zoneinfo`, `locale`). */
export function PreferencesPanel({ timezone, locale, timezones, locales }: Props) {
  const [zone, setZone] = useState(timezone);
  const [language, setLanguage] = useState(locale);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setSaved(false);
    // An empty choice is "not set", which is saved as nothing.
    const result = await authClient.updateUser({
      timezone: zone === '' ? null : zone,
      locale: language === '' ? null : language,
    } as { timezone?: string; locale?: string });
    setPending(false);
    if (result.error) {
      const code = result.error.code;
      setError(
        (code === 'INVALID_TIMEZONE' || code === 'INVALID_LOCALE') && result.error.message
          ? result.error.message
          : result.error.status === 429
            ? 'Too many attempts. Wait a minute, then try again.'
            : 'Your preferences could not be saved. Try again.',
      );
      return;
    }
    setSaved(true);
  }

  function useBrowsersZone() {
    const own = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezones.some((option) => option.value === own)) {
      setZone(own);
      setSaved(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {saved ? <Alert variant="success">Your preferences are saved.</Alert> : null}
      <FormField label="Time zone">
        {(field) => (
          <Select
            {...field}
            name="timezone"
            value={zone}
            onChange={(event) => {
              setZone(event.target.value);
              setSaved(false);
            }}
          >
            <option value="">Not set</option>
            {timezones.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <div className={styles.row}>
        <Button type="button" variant="secondary" onClick={useBrowsersZone}>
          Use this browser’s time zone
        </Button>
      </div>
      <FormField label="Language and region">
        {(field) => (
          <Select
            {...field}
            name="locale"
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value);
              setSaved(false);
            }}
          >
            <option value="">Not set</option>
            {locales.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <p className={styles.footer}>
        Apps you sign in to with this account can use these to show times and text the way you
        expect.
      </p>
      <div className={styles.row}>
        <Button type="submit" loading={pending}>
          {pending ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </form>
  );
}
