'use client';

import { useMemo, useState, useTransition } from 'react';
import { updateTimezoneAction } from '../actions';
import styles from '../account.module.css';

/** All IANA zones the runtime knows, with the current value guaranteed present. */
function useZones(current: string): string[] {
  return useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
    return supported.includes(current) ? supported : [current, ...supported];
  }, [current]);
}

/** Timezone picker (ACC-07). Native select gives type-ahead search for free. */
export function TimezoneSelect({ value, id }: { value: string; id?: string }) {
  const [tz, setTz] = useState(value);
  const [pending, startTransition] = useTransition();
  const zones = useZones(value);

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
