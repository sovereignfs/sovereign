import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDatabase = vi.fn();
vi.mock('../database', () => ({ getDatabase: () => getDatabase() as unknown }));

const { GET } = await import('../../app/api/health/route');
const { healthReport } = await import('../health');

const databaseThatAnswers = { ping: vi.fn(() => Promise.resolve()) };
const databaseThatDoesNot = {
  ping: vi.fn(() => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432'))),
};

beforeEach(() => {
  getDatabase.mockReset();
});

describe('the health report', () => {
  it('says whether core and its database are up, and nothing else', async () => {
    getDatabase.mockResolvedValue(databaseThatAnswers);
    expect(Object.keys(await healthReport()).sort()).toEqual(['app', 'database', 'status']);
  });

  it('is ok, with the database up, when it answers', async () => {
    getDatabase.mockResolvedValue(databaseThatAnswers);
    expect(await healthReport()).toEqual({ status: 'ok', app: 'up', database: 'up' });
  });

  it('is an error, with the database down, when it does not answer', async () => {
    getDatabase.mockResolvedValue(databaseThatDoesNot);
    expect(await healthReport()).toEqual({ status: 'error', app: 'up', database: 'down' });
  });

  it('is an error, with the database down, when it cannot even be opened', async () => {
    getDatabase.mockRejectedValue(new Error('SQLITE_CANTOPEN'));
    expect(await healthReport()).toEqual({ status: 'error', app: 'up', database: 'down' });
  });
});

describe('GET /api/health', () => {
  it('answers 200 with the report as JSON, and is never cached', async () => {
    getDatabase.mockResolvedValue(databaseThatAnswers);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', app: 'up', database: 'up' });
  });

  it('answers 503 when the database is down', async () => {
    getDatabase.mockResolvedValue(databaseThatDoesNot);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'error', app: 'up', database: 'down' });
  });

  it('never repeats an error message from the database', async () => {
    getDatabase.mockResolvedValue(databaseThatDoesNot);
    const text = await (await GET()).text();
    expect(text).not.toContain('ECONNREFUSED');
    expect(text).not.toContain('10.0.0.5');
  });
});
