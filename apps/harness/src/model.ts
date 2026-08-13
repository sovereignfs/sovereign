import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { modelFilePath, modelSource } from './config';

/**
 * GGUF model download/verification/storage — real, non-optional scope for
 * this engine choice (Research 0015: llama.cpp server doesn't provide a
 * model registry/pull mechanism the way Ollama would have).
 *
 * Lazy and non-blocking (CURRENT_TASK.md's design decision): the `harness`
 * server itself never blocks startup on this. `/api/health` reports
 * status; `/api/chat` refuses with a clear error until `ready`. The
 * `harness-engine` (llama.cpp) sidecar's own Compose entrypoint polls for
 * the final file's existence separately — this module doesn't coordinate
 * with it directly, the shared volume + fixed filename is the only
 * contract between them.
 */

export type ModelStatus = 'not_downloaded' | 'downloading' | 'ready' | 'error';

let status: ModelStatus = 'not_downloaded';
let lastError: string | null = null;
let downloadPromise: Promise<void> | null = null;

export function getModelStatus(): { status: ModelStatus; error: string | null } {
  return { status, error: lastError };
}

/** @internal test-only reset. */
export function resetModelStateForTests(): void {
  status = 'not_downloaded';
  lastError = null;
  downloadPromise = null;
}

async function fileExistsWithSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

async function downloadOnce(): Promise<void> {
  const finalPath = modelFilePath();
  const tempPath = `${finalPath}.download`;
  const source = modelSource();

  status = 'downloading';
  lastError = null;

  try {
    await mkdir(dirname(finalPath), { recursive: true });

    const response = await fetch(source.url, { redirect: 'follow' });
    if (!response.ok || !response.body) {
      throw new Error(`download failed: HTTP ${response.status}`);
    }

    await rm(tempPath, { force: true });
    const writeStream = createWriteStream(tempPath);
    await finished(Readable.fromWeb(response.body as never).pipe(writeStream));

    // Coarse sanity check, not a full checksum — catches a truncated or
    // wildly-wrong download (e.g. an HTML error page saved as if it were
    // the model) without needing to track/verify a hash for every quant.
    const downloadedSize = await fileExistsWithSize(tempPath);
    if (!downloadedSize || downloadedSize < source.approxBytes * 0.9) {
      throw new Error(
        `downloaded file size (${downloadedSize ?? 0}) looks wrong for expected ~${source.approxBytes}`,
      );
    }

    // Atomic rename — harness-engine's wait-loop and any concurrent
    // ensureModelDownload() caller only ever observe the file at its final
    // name once it's genuinely complete, never a partial download.
    await rename(tempPath, finalPath);
    status = 'ready';
  } catch (error) {
    status = 'error';
    lastError = error instanceof Error ? error.message : String(error);
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

/** Idempotent, fire-and-forget: safe to call on every health check or
 *  server boot. Checks for an already-present file first (e.g. a prior
 *  container run already populated the persisted volume) before starting
 *  a fresh download. */
export function ensureModelDownload(): void {
  if (status === 'ready' || status === 'downloading') return;
  if (downloadPromise) return;

  downloadPromise = (async () => {
    const existingSize = await fileExistsWithSize(modelFilePath());
    const expected = modelSource().approxBytes;
    if (existingSize && existingSize >= expected * 0.9) {
      status = 'ready';
      return;
    }
    await downloadOnce();
  })()
    .catch(() => {
      // downloadOnce() already recorded status/lastError; nothing further
      // to do here except let the promise settle so a later call can retry.
    })
    .finally(() => {
      downloadPromise = null;
    });
}
