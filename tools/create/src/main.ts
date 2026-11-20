#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app.js';
import {
  CreateError,
  DEFAULT_APP_PORT,
  createInstance,
  parsePort,
  readRequest,
  type CreateIo,
  type Exec,
} from './create.js';
import { DEFAULT_PACKAGE_MANAGER, parsePackageManager } from './package-manager.js';
import { runTool, TOOL_COMMANDS } from './tools.js';

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
    const argv = process.argv.slice(2);
    // The commands an app's repository runs once it exists (research 0007): `app sync`, `app release …`, `app commits …`,
    // `app settings …`. Their words cannot name an app, so `app sync` is never read as making an app called sync.
    if (argv[0] === 'app' && (TOOL_COMMANDS as readonly string[]).includes(argv[1] ?? '')) {
      return await runTool(argv.slice(1), {
        io: { ...io, out: (line) => process.stdout.write(`${line}\n`) },
        exec,
        cwd: process.cwd(),
        env: process.env,
      });
    }
    const request = readRequest(argv, process.env);
    let { kind, dir } = request;
    if (kind === undefined) {
      if (!io.interactive)
        throw new CreateError(
          'Say what to make.',
          2,
          'npm create @sovereignfs instance <folder>, or app <folder>',
        );
      kind =
        (await io.ask('What do you want to make (instance or app)?')) === 'app'
          ? 'app'
          : 'instance';
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
    if (kind === 'app') {
      if (request.remote)
        throw new CreateError(
          '--remote is for an instance.',
          2,
          'Add a remote to an app with git remote add.',
        );
      let { port } = request;
      if (port === undefined && io.interactive) {
        const answer = await io.ask(`Which port should it listen on? (${DEFAULT_APP_PORT})`);
        port = answer === '' ? DEFAULT_APP_PORT : parsePort(answer);
      }
      let { packageManager } = request;
      if (packageManager === undefined && io.interactive) {
        const answer = await io.ask(
          `Which package manager (pnpm, npm or yarn)? (${DEFAULT_PACKAGE_MANAGER})`,
        );
        packageManager = answer === '' ? DEFAULT_PACKAGE_MANAGER : parsePackageManager(answer);
      }
      await createApp(
        { dir, port, encryption: request.encryption, packageManager },
        io,
        exec,
        process.cwd(),
      );
    } else {
      if (request.encryption)
        throw new CreateError('--encryption is for an app.', 2, 'Make an app with it instead.');
      if (request.packageManager !== undefined)
        throw new CreateError(
          '--package-manager is for an app.',
          2,
          'An instance installs its toolkit with npm, from the lockfile it is made with.',
        );
      if (request.port !== undefined)
        throw new CreateError(
          '--port is for an app.',
          2,
          'An instance’s apps each listen on the port their manifest names.',
        );
      await createInstance(
        { dir, remote: request.remote, cliVersion: pkg.version },
        io,
        exec,
        process.cwd(),
      );
    }
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
