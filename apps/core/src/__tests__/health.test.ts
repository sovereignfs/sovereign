import { describe, expect, it } from 'vitest';
import { GET } from '../../app/api/health/route';
import { healthReport } from '../health';

describe('the health report', () => {
  it('says whether core and its database are up, and nothing else', () => {
    expect(Object.keys(healthReport()).sort()).toEqual(['app', 'database', 'status']);
  });

  it('reports the database as not configured until the database package exists', () => {
    expect(healthReport()).toEqual({ status: 'ok', app: 'up', database: 'not-configured' });
  });
});

describe('GET /api/health', () => {
  it('answers 200 with the report as JSON, and is never cached', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(healthReport());
  });
});
