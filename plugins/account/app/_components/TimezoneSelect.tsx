'use client';

import { useEffect, useState, useTransition } from 'react';
import { updateTimezoneAction } from '../actions';
import styles from '../account.module.css';

/** Timezone picker (ACC-07). Native select gives type-ahead search for free. */
export function TimezoneSelect({ value, id }: { value: string; id?: string }) {
  const [tz, setTz] = useState(value);
  const [zones, setZones] = useState<string[]>([value]); // safe SSR initial — expanded after mount
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supported =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
    setZones(supported.includes(value) ? supported : [value, ...supported]);
  }, [value]);

  return (
    <select
      id={id}
      className={styles.select}
      value={tz}
      disabled={pending}
      aria-label={id ? undefined : 'Timezone'}
      onChange={(e) => {
        const next = e.target.value;
        setTz(next);
        startTransition(() => {
          void updateTimezoneAction(next);
        });
      }}
    >
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {zone}
        </option>
      ))}
    </select>
  );
}
