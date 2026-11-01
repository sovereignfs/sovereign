import {
  ClientRegistryError,
  DEFAULT_SCOPES,
  type ClientRegistry,
  type RegisterInput,
} from '../clients/registry';
import type { SystemActor } from '../clients/system-actor';
import { LedgerError, type Applied } from '../accounts/deletion-ledger';
import { SeedError, type SeedReport } from '../dev/seed';
import type { Restored } from '../instance/restore';
import { parse, UsageError, USAGE, type Command } from './args';

/** What `sovereign-admin instance ...` does, given by the entry point. */
export type InstanceOperations = {
  restore(): Promise<Restored>;
  /** The deletions this core remembers, as JSON text. */
  exportDeletions(): Promise<string>;
  /** Applies deletions read from `file`, or from standard input when there is none. */
  applyDeletions(file: string | undefined): Promise<Applied>;
  /** Seeds a development or staging instance (core-app §3.15.1). `local` also requires core's address to be on this machine. */
  seed(options: { local: boolean }): Promise<SeedReport>;
};

/** Where the command writes: what it answers on `out`, and a line for each write on `log`, never a secret. */
export type Output = { out: (line: string) => void; log: (line: string) => void };

/**
 * What `ensure` asks for, whole: an option left out is the default, so the app ends up matching exactly what was
 * given, and running it again with the same arguments changes nothing (core-app §3.7.4).
 */
export function inputOf(app: Extract<Command, { name: 'ensure' }>['app']): RegisterInput {
  return {
    name: app.name,
    type: app.isPublic ? 'public' : 'confidential',
    redirectUris: app.redirect,
    postLogoutRedirectUris: app.postLogout,
    backchannelLogoutUri: app.backChannel ?? '',
    accountDeletedUri: app.accountDeleted ?? '',
    scopes: app.scopes.length > 0 ? app.scopes : [...DEFAULT_SCOPES],
    appScopes: app.appScopes,
    trusted: app.trusted,
    enabled: true,
    launcher: {
      description: app.description ?? '',
      icon: app.icon ?? '',
      launchUrl: app.launchUrl ?? '',
      show: !app.hidden,
    },
  };
}

/**
 * Runs one command as the system actor and returns the exit code: 0 when it worked, 1 when core refused it (each
 * thing wrong, one to a line), 2 when the command line is wrong, 3 when the seed was refused.
 *
 * `instance` is what the instance commands do (core-app §4.4, §4.5): record a restore, and carry deletions across one. It is given only
 * by the entry point, which has the database; a command that needs it and is not given it is a bug, not a usage error.
 */
export async function runAdmin(
  argv: string[],
  registry: ClientRegistry,
  actor: SystemActor,
  { out, log }: Output,
  instance?: InstanceOperations,
): Promise<number> {
  let command: Command;
  try {
    command = parse(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    log(`sovereign-admin: ${error.message}\n${USAGE}`);
    return 2;
  }
  try {
    switch (command.name) {
      case 'ensure': {
        const { client, secret, created } = await registry.ensure(
          actor,
          command.key,
          inputOf(command.app),
        );
        log(`sovereign-admin: ${created ? 'made' : 'kept'} app ${command.key}`);
        if (command.json) {
          out(
            JSON.stringify({
              key: command.key,
              clientId: client.clientId,
              ...(secret ? { secret } : {}),
            }),
          );
        } else {
          out(`client id: ${client.clientId}`);
          if (secret) out(`secret: ${secret}`);
        }
        return 0;
      }
      case 'list': {
        const apps = await registry.managed(actor);
        if (command.json) {
          out(
            JSON.stringify(
              apps.map(({ key, client }) => ({
                key,
                clientId: client.clientId,
                name: client.name,
                type: client.type,
                enabled: client.enabled,
              })),
            ),
          );
        } else {
          for (const { key, client } of apps) out(`${key}\t${client.clientId}\t${client.name}`);
        }
        return 0;
      }
      case 'rotate-secret': {
        const clientId = await registry.clientIdOfKey(actor, command.key);
        const secret = await registry.rotateSecret(actor, clientId);
        log(`sovereign-admin: gave app ${command.key} a new secret`);
        out(
          command.json
            ? JSON.stringify({ key: command.key, clientId, secret })
            : `secret: ${secret}`,
        );
        return 0;
      }
      case 'restored': {
        if (!instance) throw new Error('the instance operations were not given to sovereign-admin');
        const { at, moved } = await instance.restore();
        log(
          moved
            ? 'sovereign-admin: recorded the restore; every session and token from before it is ended'
            : 'sovereign-admin: the restore was already recorded at that time or later; nothing changed',
        );
        out(
          command.json
            ? JSON.stringify({ restoredAt: new Date(at).toISOString(), moved })
            : `restored at: ${new Date(at).toISOString()}`,
        );
        return 0;
      }
      case 'seed': {
        if (!instance) throw new Error('the instance operations were not given to sovereign-admin');
        const report = await instance.seed({ local: command.local });
        // The log holds what was done and never a password: those go to the answer, once, and nowhere else.
        for (const { email, role } of report.accounts.created)
          log(`sovereign-admin: made ${role} ${email}`);
        for (const email of report.accounts.existing) log(`sovereign-admin: kept ${email}`);
        log(`sovereign-admin: ${report.app.created ? 'made' : 'kept'} app ${report.app.key}`);
        if (command.json) {
          out(JSON.stringify(report));
        } else {
          for (const { email, role, password } of report.accounts.created)
            out(`${email}\t${role}\tpassword: ${password}`);
          for (const email of report.accounts.existing) out(`${email}\tkept`);
          out(
            `app ${report.app.key}\tclient id: ${report.app.clientId}\tredirect: ${report.app.redirect}`,
          );
        }
        return 0;
      }
      case 'deletions-export': {
        if (!instance) throw new Error('the instance operations were not given to sovereign-admin');
        out(await instance.exportDeletions());
        return 0;
      }
      case 'deletions-apply': {
        if (!instance) throw new Error('the instance operations were not given to sovereign-admin');
        const done = await instance.applyDeletions(command.file);
        log(
          done.skipped
            ? 'sovereign-admin: these deletions were already applied; nothing changed'
            : `sovereign-admin: applied the deletions: ${done.deletedAgain} accounts deleted again, ${done.alreadyGone} already gone, ${done.kept} kept, ${done.notices} notices made`,
        );
        out(JSON.stringify(done));
        return 0;
      }
      case 'remove': {
        await registry.remove(actor, await registry.clientIdOfKey(actor, command.key));
        log(`sovereign-admin: removed app ${command.key}`);
        return 0;
      }
    }
  } catch (error) {
    if (error instanceof SeedError) {
      // Its own code: a refusal made before anything was written, which `sv seed` reports as one.
      log(`sovereign-admin: ${error.message}`);
      return 3;
    }
    if (error instanceof LedgerError) {
      log(`sovereign-admin: ${error.message}`);
      return 1;
    }
    if (!(error instanceof ClientRegistryError)) throw error;
    log(`sovereign-admin: ${error.message}`);
    for (const problem of error.problems) log(`  ${problem.field}: ${problem.message}`);
    return 1;
  }
}
