import {
  ClientRegistryError,
  DEFAULT_SCOPES,
  type ClientRegistry,
  type RegisterInput,
} from '../clients/registry';
import type { SystemActor } from '../clients/system-actor';
import type { Restored } from '../instance/restore';
import { parse, UsageError, USAGE, type Command } from './args';

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
    scopes: app.scopes.length > 0 ? app.scopes : [...DEFAULT_SCOPES],
    appScopes: app.appScopes,
    trusted: app.trusted,
    enabled: true,
    launcher: {
      description: app.description ?? '',
      icon: app.icon ?? '',
      launchUrl: app.launchUrl ?? '',
      show: true,
    },
  };
}

/**
 * Runs one command as the system actor and returns the exit code: 0 when it worked, 1 when core refused it (each
 * thing wrong, one to a line), 2 when the command line is wrong.
 *
 * `restore` records that the instance was restored from a backup (core-app §4.4). It is given only by the entry point, which has the
 * database; a command that needs it and is not given it is a bug, not a usage error.
 */
export async function runAdmin(
  argv: string[],
  registry: ClientRegistry,
  actor: SystemActor,
  { out, log }: Output,
  restore?: () => Promise<Restored>,
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
        if (!restore) throw new Error('the restore marker was not given to sovereign-admin');
        const { at, moved } = await restore();
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
      case 'remove': {
        await registry.remove(actor, await registry.clientIdOfKey(actor, command.key));
        log(`sovereign-admin: removed app ${command.key}`);
        return 0;
      }
    }
  } catch (error) {
    if (!(error instanceof ClientRegistryError)) throw error;
    log(`sovereign-admin: ${error.message}`);
    for (const problem of error.problems) log(`  ${problem.field}: ${problem.message}`);
    return 1;
  }
}
