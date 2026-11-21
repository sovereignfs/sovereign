/**
 * A client component is rendered on the server first and again in the browser, whose language and zone are not the server's. A date
 * written in the runtime's own language or zone differs between the two, and React throws the server's page away (error #418, seen on
 * /security). Dates in a client component are written by `writtenDate`, in the person's zone, never by `toLocale…String`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writtenDate } from '../time/written';

const appDir = fileURLToPath(new URL('../../app', import.meta.url));
const runtimeZone = process.env.TZ;

afterEach(() => {
  if (runtimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = runtimeZone;
});

describe('writtenDate', () => {
  it('writes the day in the zone it is given, whatever the runtime’s zone', () => {
    process.env.TZ = 'America/New_York';
    // 23:30 UTC on 20 November: still the 20th in UTC, already the 21st in Tokyo, whatever New York says.
    const at = Date.UTC(2026, 10, 20, 23, 30);
    expect(writtenDate(at, undefined)).toBe('20 Nov 2026');
    expect(writtenDate(at, null)).toBe('20 Nov 2026');
    expect(writtenDate(at, 'Asia/Tokyo')).toBe('21 Nov 2026');
    expect(writtenDate(new Date(at).toISOString(), 'Asia/Tokyo')).toBe('21 Nov 2026');
    expect(writtenDate(at, 'Not/AZone')).toBe('20 Nov 2026');
  });
});

describe('client components', () => {
  it('write no date in the runtime’s language or zone', () => {
    const found = readdirSync(appDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => {
        const source = readFileSync(path.join(appDir, file), 'utf8');
        return /^['"]use client['"]/m.test(source) && /\.toLocale(Date|Time)?String\(/.test(source);
      });
    expect(found).toEqual([]);
  });
});
