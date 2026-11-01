import { readFileSync } from 'node:fs';

/**
 * Reads a setting the instance gives this app (contracts/app-manifest.md §3). A secret arrives as a file named by `NAME_FILE`, so it is
 * never in the process list or a log; the plain `NAME` is read as well, for running it on your own machine.
 */
export function setting(name: string): string | undefined {
  const file = process.env[`${name}_FILE`];
  if (file) return readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  return process.env[name] || undefined;
}

export function required(name: string): string {
  const value = setting(name);
  if (!value)
    throw new Error(
      `${name} is not set. The instance gives it to the app; see .env.example to run it yourself.`,
    );
  return value;
}
