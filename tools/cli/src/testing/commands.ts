import { run } from '../cli.js';
import type { World } from './world.js';

/** Runs `sv ...` in a world, and returns how it ended and what it said. */
export async function sv(world: World, ...argv: string[]) {
  const before = { out: world.said.out.length, err: world.said.err.length };
  const code = await run(argv, world.ctx.io, () => world.ctx);
  return {
    code,
    out: world.said.out.slice(before.out),
    err: world.said.err.slice(before.err),
    text: [...world.said.out.slice(before.out), ...world.said.err.slice(before.err)].join('\n'),
  };
}

export const NOTES_IMAGE = 'ghcr.io/example/notes:1.2.0';

/** A world with an instance already set up with `sv setup`, as an operator would have it. */
export async function setUpWorld(world: World, ...extra: string[]) {
  const done = await sv(
    world,
    'setup',
    '--domain',
    'sovereign.example.com',
    '--host',
    '203.0.113.7',
    ...extra,
  );
  if (done.code !== 0) throw new Error(`setup failed: ${done.text}`);
  return done;
}
