import { CronExpressionParser } from 'cron-parser';

/** Thrown for a cron expression that fails to parse. Callers should surface this at schedule-creation time, not at run time. */
export class InvalidCronExpressionError extends Error {
  constructor(expression: string, cause: unknown) {
    super(
      `invalid cron expression "${expression}": ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'InvalidCronExpressionError';
  }
}

/**
 * The next epoch-second occurrence of `cron` (5- or 6-field, `cron-parser`
 * syntax) strictly after `afterSeconds`, evaluated in `timezone` (IANA name,
 * e.g. `"America/New_York"`; defaults to `"UTC"`). Throws
 * `InvalidCronExpressionError` for a malformed expression or unknown
 * timezone — validate at `sdk.jobs.schedule()` time so a plugin author sees
 * the error immediately rather than a schedule that silently never fires.
 */
export function computeNextCronRun(
  cron: string,
  timezone: string | undefined,
  afterSeconds: number,
): number {
  try {
    const interval = CronExpressionParser.parse(cron, {
      currentDate: new Date(afterSeconds * 1000),
      tz: timezone ?? 'UTC',
    });
    return Math.floor(interval.next().toDate().getTime() / 1000);
  } catch (err) {
    throw new InvalidCronExpressionError(cron, err);
  }
}
