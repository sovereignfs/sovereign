/**
 * The structured logger's signature is `(msg, meta)` — the opposite order from
 * pino's `(obj, msg)`. Four call sites in `runtime/instrumentation.ts` were
 * written pino-style, so `emit()` spread the message string into
 * character-indexed keys and the boot log read
 * `{"0":"N","1":"o","2":"t",...,"msg":{"transport":"sse"}}`.
 *
 * Typechecking `instrumentation.ts` (see tsconfig-coverage.test.ts) is what
 * actually stops that recurring. These tests pin the contract that fix relies
 * on: `msg` is always the string, `meta` is always spread alongside it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../logger';

type LogLine = Record<string, unknown>;

function capture(stream: 'stdout' | 'stderr', fn: () => void): LogLine[] {
  const lines: LogLine[] = [];
  const spy = vi.spyOn(process[stream], 'write').mockImplementation((chunk) => {
    lines.push(JSON.parse(String(chunk)) as LogLine);
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

/** Capture exactly one emitted line, failing loudly on none or several. */
function captureOne(stream: 'stdout' | 'stderr', fn: () => void): LogLine {
  const lines = capture(stream, fn);
  expect(lines).toHaveLength(1);
  return lines[0] as LogLine;
}

afterEach(() => {
  delete process.env.LOG_LEVEL;
});

describe('logger emit contract', () => {
  it('puts the message in msg and spreads meta alongside it', () => {
    process.env.LOG_LEVEL = 'info';
    const line = captureOne('stdout', () =>
      logger.info('Notification broker: in-process SSE', { transport: 'sse' }),
    );

    expect(line.msg).toBe('Notification broker: in-process SSE');
    expect(line.transport).toBe('sse');
    expect(line.level).toBe('info');
    expect(typeof line.ts).toBe('string');
  });

  it('emits a usable line with no meta at all', () => {
    process.env.LOG_LEVEL = 'error';
    const line = captureOne('stderr', () =>
      logger.error('NOTIFICATION_TRANSPORT=redis requires REDIS_URL — falling back to polling'),
    );

    expect(line.msg).toBe(
      'NOTIFICATION_TRANSPORT=redis requires REDIS_URL — falling back to polling',
    );
    expect(Object.keys(line).sort()).toEqual(['level', 'msg', 'ts']);
  });

  it('never spreads the message into character-indexed keys', () => {
    process.env.LOG_LEVEL = 'error';
    const line = captureOne('stderr', () =>
      logger.error('Failed to initialise Redis broker — falling back to polling.', {
        err: new Error('boom'),
      }),
    );

    // The signature of the regression: '0', '1', '2', … one key per character.
    expect(Object.keys(line).filter((k) => /^\d+$/.test(k))).toEqual([]);
    expect(line.msg).toBe('Failed to initialise Redis broker — falling back to polling.');
  });

  it('honours LOG_LEVEL, dropping anything below the active rank', () => {
    process.env.LOG_LEVEL = 'warn';
    expect(capture('stdout', () => logger.info('should not appear'))).toEqual([]);
    expect(capture('stdout', () => logger.debug('should not appear either'))).toEqual([]);
  });
});
