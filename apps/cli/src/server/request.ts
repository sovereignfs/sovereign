import { Refused } from '../errors.js';

/** What the server is asked (operator-cli §8): a verb and the few words it takes, each checked against a pattern before anything is done. */
export type Request =
  | { verb: 'version' }
  | { verb: 'deploy'; commit: string }
  | { verb: 'status' }
  | { verb: 'doctor' }
  | { verb: 'logs'; target: string; lines: number }
  | { verb: 'app'; name: string; secret: boolean }
  | { verb: 'rotate'; name: string }
  | { verb: 'backup' }
  | { verb: 'restore'; commit: string }
  | { verb: 'rollback' };

const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const NAME = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;
const TARGETS = ['core', 'proxy', 'database', 'deploy'];

/** Reads one request. Anything not exactly of these shapes is refused: the words reach `docker` as arguments and are never given to a shell. */
export function parseRequest(line: string): Request {
  const words = line.trim().split(/ +/).filter(Boolean);
  const [verb, ...rest] = words;
  const usage = () =>
    new Refused(
      `The server does not understand “${words.slice(0, 4).join(' ').slice(0, 60)}”.`,
      'It answers: version, deploy, status, doctor, logs, app, rotate, backup, restore, rollback.',
    );
  switch (verb) {
    case 'version':
      if (rest.length === 0) return { verb };
      break;
    case 'deploy':
      if (rest.length === 1 && COMMIT.test(rest[0] as string))
        return { verb, commit: rest[0] as string };
      break;
    case 'status':
    case 'doctor':
    case 'backup':
    case 'rollback':
      if (rest.length === 0) return { verb };
      break;
    case 'logs': {
      const [target, lines, ...more] = rest;
      if (
        more.length === 0 &&
        target !== undefined &&
        (TARGETS.includes(target) || NAME.test(target)) &&
        (lines === undefined || /^[0-9]{1,5}$/.test(lines))
      ) {
        return { verb, target, lines: lines === undefined ? 200 : Number(lines) };
      }
      break;
    }
    case 'app': {
      const [name, flag, ...more] = rest;
      if (
        more.length === 0 &&
        name !== undefined &&
        NAME.test(name) &&
        (flag === undefined || flag === '--secret')
      ) {
        return { verb, name, secret: flag === '--secret' };
      }
      break;
    }
    case 'restore':
      if (rest.length === 1 && COMMIT.test(rest[0] as string))
        return { verb, commit: rest[0] as string };
      break;
    case 'rotate':
      if (rest.length === 1 && NAME.test(rest[0] as string))
        return { verb, name: rest[0] as string };
      break;
  }
  throw usage();
}

/** What the deployment key may ask for, and nothing more (operator-cli §8.3). */
export const DEPLOY_ONLY: Request['verb'][] = ['deploy', 'version'];
