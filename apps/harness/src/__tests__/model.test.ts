import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let workDir: string;
const APPROX_BYTES = 1000;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'harness-model-test-'));
  process.env.SOVEREIGN_HARNESS_MODEL_DIR = workDir;
  vi.resetModules();
  const { setModelSourceOverrideForTests } = await import('../config');
  setModelSourceOverrideForTests({
    url: 'https://example.test/model.gguf',
    approxBytes: APPROX_BYTES,
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const { setModelSourceOverrideForTests } = await import('../config');
  setModelSourceOverrideForTests(null);
  await rm(workDir, { recursive: true, force: true });
});

function fakeModelBody(size: number): ReadableStream<Uint8Array> {
  const bytes = new Uint8Array(size).fill(1);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const TERMINAL_STATUSES = new Set(['ready', 'error']);

async function waitUntilSettled(getModelStatus: () => { status: string }) {
  for (let i = 0; i < 100 && !TERMINAL_STATUSES.has(getModelStatus().status); i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('ensureModelDownload', () => {
  it('downloads and atomically installs the model, reporting ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(fakeModelBody(APPROX_BYTES), { status: 200 })),
    );

    const { ensureModelDownload, getModelStatus } = await import('../model');
    expect(getModelStatus().status).toBe('not_downloaded');

    ensureModelDownload();
    await waitUntilSettled(getModelStatus);
    expect(getModelStatus()).toEqual({ status: 'ready', error: null });
  });

  it('reports error status on a truncated download without leaving a ready state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(fakeModelBody(10), { status: 200 })),
    );

    const { ensureModelDownload, getModelStatus } = await import('../model');
    ensureModelDownload();
    await waitUntilSettled(getModelStatus);

    const result = getModelStatus();
    expect(result.status).toBe('error');
    expect(result.error).toContain('looks wrong');
  });

  it('reports error status when the engine host is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { ensureModelDownload, getModelStatus } = await import('../model');
    ensureModelDownload();
    await waitUntilSettled(getModelStatus);
    expect(getModelStatus().status).toBe('error');
  });

  it('reports error status on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));

    const { ensureModelDownload, getModelStatus } = await import('../model');
    ensureModelDownload();
    await waitUntilSettled(getModelStatus);
    expect(getModelStatus().status).toBe('error');
  });

  it('is idempotent — calling twice while downloading does not start a second download', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(fakeModelBody(APPROX_BYTES), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { ensureModelDownload, getModelStatus } = await import('../model');
    ensureModelDownload();
    ensureModelDownload();
    ensureModelDownload();

    await waitUntilSettled(getModelStatus);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips re-downloading when a sufficiently-sized file already exists at the final path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(fakeModelBody(APPROX_BYTES), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { ensureModelDownload, getModelStatus } = await import('../model');
    ensureModelDownload();
    await waitUntilSettled(getModelStatus);
    expect(getModelStatus().status).toBe('ready');

    const { resetModelStateForTests } = await import('../model');
    resetModelStateForTests();
    ensureModelDownload();
    await waitUntilSettled(getModelStatus);

    expect(getModelStatus().status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
