#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './command';

process.exitCode = run(process.argv.slice(2), {
  cwd: process.cwd(),
  read: (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return undefined;
    }
  },
  join,
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
});
