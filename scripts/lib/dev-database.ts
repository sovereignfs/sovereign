/**
 * What `pnpm dev` needs to know about the database before it starts core: which one the development environment
 * chooses, so that a persistent sqld can be started when it is sqld. Reads the environment files the way Next does
 * in development (`.env.local` before `.env`) and the process environment before either.
 */

/** The value of `name` in the text of an environment file, or nothing when it is not there or is empty. */
export function valueIn(text: string, name: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match?.[1] !== name) continue;
    let value = (match[2] ?? '').trim();
    const quoted = /^(['"])(.*)\1/.exec(value);
    value = quoted ? (quoted[2] ?? '') : value.replace(/\s+#.*$/, '');
    return value === '' ? undefined : value;
  }
  return undefined;
}

/** The database dialect development chooses: the process environment, then `.env.local`, then `.env`. */
export function chosenDialect(
  environment: Record<string, string | undefined>,
  files: { local?: string; env?: string },
): string | undefined {
  const fromProcess = environment.SV_DB_DIALECT;
  if (fromProcess) return fromProcess;
  return (
    (files.local !== undefined ? valueIn(files.local, 'SV_DB_DIALECT') : undefined) ??
    (files.env !== undefined ? valueIn(files.env, 'SV_DB_DIALECT') : undefined)
  );
}
