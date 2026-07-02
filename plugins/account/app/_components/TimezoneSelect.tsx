'use client';

import { useEffect, useState, useTransition } from 'react';
import { Select, type SelectProps } from '@sovereignfs/ui';
import { updateTimezoneAction } from '../actions';

type TimezoneSelectProps = Omit<SelectProps, 'value' | 'onChange' | 'children'> & {
  value: string;
};

/** Timezone picker (ACC-07). Native select gives type-ahead search for free. */
export function TimezoneSelect({ value, id, ...rest }: TimezoneSelectProps) {
  const [tz, setTz] = useState(value);
  const [zones, setZones] = useState<string[]>([value]); // safe SSR initial — expanded after mount
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supported =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
    setZones(supported.includes(value) ? supported : [value, ...supported]);
  }, [value]);

  return (
    <Select
      id={id}
      value={tz}
      disabled={pending}
      aria-label={id ? undefined : 'Timezone'}
      {...rest}
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
    </Select>
  );
}
