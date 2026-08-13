import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let workDir: string;

beforeEach(async () => {
  process.env.SOVEREIGN_HARNESS_ENGINE = 'fake';
  workDir = await mkdtemp(join(tmpdir(), 'harness-health-test-'));
  process.env.SOVEREIGN_HARNESS_MODEL_DIR = workDir;
});

afterEach(async () => {
  delete process.env.SOVEREIGN_HARNESS_ENGINE;
  delete process.env.SOVEREIGN_HARNESS_MODEL_DIR;
  vi.unstubAllGlobals();
  vi.resetModules();
  await rm(workDir, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('reports ready unconditionally for the fake engine, no model download attempted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('../route');
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', modelStatus: 'ready', modelError: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the real model download status for the llamacpp engine', async () => {
    process.env.SOVEREIGN_HARNESS_ENGINE = 'llamacpp';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { GET } = await import('../route');
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(['not_downloaded', 'downloading', 'error']).toContain(body.modelStatus);
  });
});
