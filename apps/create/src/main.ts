import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import pkg from '../package.json' with { type: 'json' };
import { CreateError, createInstance, readRequest, type CreateIo, type Exec } from './create.js';

const exec: Exec = (command, args, options) =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { cwd: options.cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          stdout,
          stderr: error && typeof error.code === 'string' ? error.message : stderr,
        });
      },
    );
  });

const io: CreateIo = {
  err: (line) => process.stderr.write(`${line}\n`),
  interactive: Boolean(process.stdin.isTTY && process.stderr.isTTY),
  async ask(question) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return (await rl.question(`${question} `)).trim();
    } finally {
      rl.close();
    }
  },
};

async function main(): Promise<number> {
  try {
    const request = readRequest(process.argv.slice(2), process.env);
    let { kind, dir } = request;
    if (kind === undefined) {
      if (!io.interactive)
        throw new CreateError('Say what to make.', 2, 'npm create @sovereignfs instance <folder>');
      kind = (await io.ask('What do you want to make (instance)?')) === 'app' ? 'app' : 'instance';
    }
    if (kind === 'app') {
      throw new CreateError(
        'Making an app is not available yet.',
        2,
        'An app is added to an instance with ./sv app add. Nothing was written.',
      );
    }
    if (dir === undefined) {
      if (!io.interactive)
        throw new CreateError(
          'Name the folder to make.',
          2,
          'npm create @sovereignfs instance <folder>',
        );
      dir = await io.ask('In which folder?');
      if (dir === '') throw new CreateError('No folder was named.', 2);
    }
    await createInstance(
      { dir, remote: request.remote, cliVersion: pkg.version },
      io,
      exec,
      process.cwd(),
    );
    return 0;
  } catch (error) {
    if (error instanceof CreateError) {
      io.err(error.message);
      if (error.hint) io.err(error.hint);
      return error.exitCode;
    }
    io.err(`create failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
