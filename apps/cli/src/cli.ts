import { app } from './commands/app.js';
import { applyCommand } from './commands/apply.js';
import { backup, restore, rollback } from './commands/backup.js';
import { deploy } from './commands/deploy.js';
import { push } from './commands/push.js';
import { doctor, logs, status } from './commands/remote.js';
import { server } from './commands/server.js';
import { receiveCommand, serverKeyCommand } from './commands/serve.js';
import { secret } from './commands/secret.js';
import { setup } from './commands/setup.js';
import type { Context } from './context.js';
import { SvError } from './errors.js';
import type { Io } from './io.js';
import { RELEASE } from './release.js';

export const USAGE = `sv ${RELEASE.version}: deploys core, with or without apps, to one machine with Docker

Usage: sv <command> [options]

Setting up
  setup                         write suite.yml and suite.lock, and make your key
Apps
  app add|update|remove|list    change which apps the instance has
Secrets
  secret set|remove|list|rekey  keep secrets in secrets.age.yml, encrypted
Deploying
  push                          check the repository, commit its files, and push
  server bootstrap              prepare a new machine: Docker, folders, keys
  deploy                        put the pushed commit on the server
  status | logs | doctor        what is running, what it printed, what to fix
Recovering
  backup | restore PATH         a backup encrypted to your key alone, and bringing one back
  rollback                      run the previous release again
  apply                         on the server: make it match one commit (sv deploy starts it)

Every command says what it changed. Exit codes: 0 done, 1 failed partway (run it again), 2 refused (nothing changed), 3 locked.`;

type Command = (ctx: Context, argv: string[]) => Promise<void>;

const COMMANDS: Record<string, Command> = {
  setup,
  app,
  secret,
  push,
  server,
  deploy,
  backup,
  restore,
  rollback,
  status,
  logs,
  doctor,
};

/**
 * Runs one command line and returns how it ended (operator-cli §11). A command refuses or fails by throwing; this turns that into
 * the lines an operator reads and the exit code, and anything else into a failure that says it is a bug.
 */
export async function run(argv: string[], io: Io, contextFor: () => Context): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    io.out(USAGE);
    return 0;
  }
  if (name === '--version' || name === '-v' || name === 'version') {
    io.out(RELEASE.version);
    return 0;
  }
  // `apply` runs on the server, where there is no instance repository.
  if (name === 'apply') {
    try {
      await applyCommand(io, rest);
      return 0;
    } catch (error) {
      return report(io, error);
    }
  }
  // So do these two, which the server’s wrapper starts.
  if (name === 'receive') {
    try {
      return await receiveCommand(io, rest);
    } catch (error) {
      return report(io, error);
    }
  }
  if (name === 'server-key') {
    try {
      await serverKeyCommand(io, rest);
      return 0;
    } catch (error) {
      return report(io, error);
    }
  }
  const command = COMMANDS[name];
  if (!command) {
    io.err(`There is no command ${name}.\n\n${USAGE}`);
    return 2;
  }
  try {
    // The repository is looked for only now, so help and the version work anywhere.
    await command(contextFor(), rest);
    return 0;
  } catch (error) {
    return report(io, error);
  }
}

function report(io: Io, error: unknown): number {
  if (error instanceof SvError) {
    io.err(error.message);
    if (error.hint) io.err(error.hint);
    return error.exitCode;
  }
  io.err(
    `sv failed in a way it did not expect: ${error instanceof Error ? error.message : String(error)}`,
  );
  io.err('This is a bug in the toolkit. Running the command again is safe.');
  return 1;
}
