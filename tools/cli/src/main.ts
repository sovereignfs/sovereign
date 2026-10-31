#!/usr/bin/env node
import { run } from './cli.js';
import { makeContext } from './context.js';
import { findRoot } from './suite/files.js';
import { terminal } from './io.js';

/** The entry the launcher runs: the real terminal, the repository it was run in, and the exit code set from how the command ended. */
const io = terminal();
run(process.argv.slice(2), io, () =>
  makeContext(findRoot(process.cwd(), process.env), io, process.env),
).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`sv failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
