import { KEPT_MS, type ExportJob } from './jobs.js';

/** What a page shows of an export: never its file's name, nor whose session asked. */
export type ExportView =
  | { state: 'none' }
  | { state: 'making'; requestedAt: number }
  | { state: 'ready'; id: string; size: number; until: number; here: boolean }
  | { state: 'failed'; finishedAt: number }
  | { state: 'gone' };

export function viewOf(
  job: ExportJob | undefined,
  sessionId: string,
  now = Date.now(),
): ExportView {
  if (!job) return { state: 'none' };
  if (job.state === 'pending' || job.state === 'running')
    return { state: 'making', requestedAt: job.requestedAt };
  if (job.state === 'failed')
    return { state: 'failed', finishedAt: job.finishedAt ?? job.requestedAt };
  if (job.state === 'ready' && job.finishedAt !== null && job.finishedAt + KEPT_MS > now) {
    return {
      state: 'ready',
      id: job.id,
      size: job.size ?? 0,
      until: job.finishedAt + KEPT_MS,
      here: job.sessionId === sessionId,
    };
  }
  return { state: 'gone' };
}
