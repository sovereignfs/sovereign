import { describe, expect, it } from 'vitest';
import { formatInstanceDetails, formatUptime } from '../instance/about';

describe('the instance details line', () => {
  it('reads Sovereign and core versions, the database, Node and the uptime', () => {
    expect(
      formatInstanceDetails({
        platform: '0.108.0',
        core: '0.70.0',
        database: 'PostgreSQL',
        node: '24.15',
        uptimeSeconds: 3 * 86_400 + 5,
      }),
    ).toBe('Sovereign 0.108.0 / 0.70.0 (Core) · PostgreSQL · Node 24.15 · up 3 days');
  });

  it('gives the uptime in its largest whole unit, singular for one', () => {
    expect(formatUptime(0)).toBe('up 0 seconds');
    expect(formatUptime(1)).toBe('up 1 second');
    expect(formatUptime(59)).toBe('up 59 seconds');
    expect(formatUptime(60)).toBe('up 1 minute');
    expect(formatUptime(3_599)).toBe('up 59 minutes');
    expect(formatUptime(3_600)).toBe('up 1 hour');
    expect(formatUptime(86_399)).toBe('up 23 hours');
    expect(formatUptime(86_400)).toBe('up 1 day');
    expect(formatUptime(10 * 86_400)).toBe('up 10 days');
  });
});
