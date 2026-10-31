import { createInterface } from 'node:readline/promises';
import { Refused } from './errors.js';

/**
 * What a command may do with the terminal. Commands take this and never reach for `process`, so a test can give them a
 * conversation and read what they said.
 */
export interface Io {
  /** Standard output: what a command answers, which `--json` makes a document and nothing else. */
  out(line: string): void;
  /** Standard error: what a command did, and why it refused. */
  err(line: string): void;
  /** Whether there is a person to ask. With none a command that would ask refuses and says what to pass. */
  readonly interactive: boolean;
  /** Asks a question with an optional default. Only called when `interactive`. */
  ask(question: string, fallback?: string): Promise<string>;
  /** Asks for something that must not be shown or kept: a secret. Only called when `interactive`. */
  askHidden(question: string): Promise<string>;
  /** Reads everything standard input holds, for a value piped in. */
  readStdin(): Promise<string>;
}

/** The real terminal. */
export function terminal(): Io {
  const interactive = Boolean(process.stdin.isTTY && process.stderr.isTTY);
  return {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    interactive,
    async ask(question, fallback) {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        const answer = (
          await rl.question(fallback ? `${question} [${fallback}] ` : `${question} `)
        ).trim();
        return answer === '' && fallback !== undefined ? fallback : answer;
      } finally {
        rl.close();
      }
    },
    askHidden(question) {
      return new Promise((resolve, reject) => {
        const input = process.stdin;
        process.stderr.write(`${question} `);
        input.setRawMode(true);
        input.resume();
        input.setEncoding('utf8');
        let value = '';
        const done = (error?: Error) => {
          input.setRawMode(false);
          input.pause();
          input.removeListener('data', onData);
          process.stderr.write('\n');
          if (error) reject(error);
          else resolve(value);
        };
        const onData = (chunk: string) => {
          for (const char of chunk) {
            if (char === '\r' || char === '\n') return done();
            if (char === '\u0003') return done(new Refused('Cancelled.'));
            if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
            else value += char;
          }
        };
        input.on('data', onData);
      });
    },
    async readStdin() {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
      return Buffer.concat(chunks).toString('utf8');
    },
  };
}

/** Asks a question, or refuses and says which flag answers it when there is nobody to ask (operator-cli §11). */
export async function askOrRefuse(
  io: Io,
  question: string,
  flag: string,
  fallback?: string,
): Promise<string> {
  if (!io.interactive) {
    throw new Refused(`${question} There is no terminal to ask in.`, `Pass ${flag}.`);
  }
  return io.ask(question, fallback);
}

/** Asks for a yes, or refuses and says to pass `--yes` when there is nobody to ask. */
export async function confirm(io: Io, question: string, assumeYes: boolean): Promise<void> {
  if (assumeYes) return;
  if (!io.interactive) {
    throw new Refused(`${question} There is no terminal to ask in.`, 'Pass --yes to confirm.');
  }
  const answer = (await io.ask(`${question} (yes/no)`, 'no')).toLowerCase();
  if (answer !== 'y' && answer !== 'yes') throw new Refused('Not confirmed. Nothing was changed.');
}
