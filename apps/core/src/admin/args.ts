/**
 * The command line of `sovereign-admin` (core-app §3.7.4, §4.4): `apps ensure|list|rotate-secret|remove` and
 * `instance restored`. Parsing only, so it
 * can be tested without a database. A flag that takes several values takes every word after it up to the next flag,
 * and may also be given again.
 */
export type Command =
  | {
      name: 'ensure';
      key: string;
      json: boolean;
      app: {
        name: string;
        redirect: string[];
        postLogout: string[];
        backChannel: string | undefined;
        accountDeleted: string | undefined;
        scopes: string[];
        appScopes: string[];
        isPublic: boolean;
        trusted: boolean;
        launchUrl: string | undefined;
        description: string | undefined;
        icon: string | undefined;
      };
    }
  | { name: 'list'; json: boolean }
  | { name: 'rotate-secret'; key: string; json: boolean }
  | { name: 'remove'; key: string }
  | { name: 'restored'; json: boolean }
  | { name: 'deletions-export' }
  | { name: 'deletions-apply'; file: string | undefined };

export class UsageError extends Error {
  override name = 'UsageError';
}

export const USAGE = `Usage:
  sovereign-admin apps ensure KEY --name NAME --redirect URL... [--post-logout URL...]
                  [--back-channel URL] [--account-deleted URL] [--scope SCOPE...] [--app-scope SCOPE...] [--public] [--trusted]
                  [--launch-url URL] [--description TEXT] [--icon URL] [--json]
  sovereign-admin apps list [--json]
  sovereign-admin apps rotate-secret KEY [--json]
  sovereign-admin apps remove KEY
  sovereign-admin instance restored [--json]
  sovereign-admin instance deletions export
  sovereign-admin instance deletions apply [FILE]`;

const VALUE = new Set([
  'name',
  'back-channel',
  'account-deleted',
  'launch-url',
  'description',
  'icon',
]);
const LIST = new Set(['redirect', 'post-logout', 'scope', 'app-scope']);
const SWITCH = new Set(['public', 'trusted', 'json']);

type Flags = {
  values: Map<string, string>;
  lists: Map<string, string[]>;
  switches: Set<string>;
};

function flagsOf(words: string[], allowed: ReadonlySet<string>): { rest: string[]; flags: Flags } {
  const flags: Flags = { values: new Map(), lists: new Map(), switches: new Set() };
  const rest: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    if (!word.startsWith('--')) {
      rest.push(word);
      continue;
    }
    const equals = word.indexOf('=');
    const name = word.slice(2, equals === -1 ? undefined : equals);
    if (!allowed.has(name)) throw new UsageError(`unknown option --${name}`);
    const inline = equals === -1 ? undefined : word.slice(equals + 1);
    if (SWITCH.has(name)) {
      if (inline !== undefined) throw new UsageError(`--${name} takes no value`);
      flags.switches.add(name);
    } else if (VALUE.has(name)) {
      const value = inline ?? words[++i];
      if (value === undefined || (inline === undefined && value.startsWith('--'))) {
        throw new UsageError(`--${name} needs a value`);
      }
      if (flags.values.has(name)) throw new UsageError(`--${name} is given twice`);
      flags.values.set(name, value);
    } else {
      const list = flags.lists.get(name) ?? [];
      if (inline !== undefined) list.push(inline);
      while (i + 1 < words.length && !(words[i + 1] as string).startsWith('--')) {
        list.push(words[++i] as string);
      }
      if (list.length === 0) throw new UsageError(`--${name} needs a value`);
      flags.lists.set(name, list);
    }
  }
  return { rest, flags };
}

const ALL = new Set([...VALUE, ...LIST, ...SWITCH]);
const JSON_ONLY = new Set(['json']);
const NONE = new Set<string>();

function one(rest: string[], what: string): string {
  if (rest.length !== 1) throw new UsageError(`${what} needs exactly one KEY`);
  return rest[0] as string;
}

export function parse(argv: string[]): Command {
  const [group, verb, ...words] = argv;
  if (group === 'instance') {
    if (verb === 'deletions') {
      const [what, ...more] = words;
      const { rest } = flagsOf(more, NONE);
      if (what === 'export') {
        if (rest.length > 0) throw new UsageError('deletions export takes no argument');
        return { name: 'deletions-export' };
      }
      if (what === 'apply') {
        if (rest.length > 1)
          throw new UsageError('deletions apply takes one FILE, or reads standard input');
        return { name: 'deletions-apply', file: rest[0] };
      }
      throw new UsageError('deletions is export or apply');
    }
    if (verb !== 'restored') {
      throw new UsageError(
        verb === undefined ? 'a command is needed' : `unknown instance command ${verb}`,
      );
    }
    const { rest, flags } = flagsOf(words, JSON_ONLY);
    if (rest.length > 0) throw new UsageError('restored takes no argument');
    return { name: 'restored', json: flags.switches.has('json') };
  }
  if (group !== 'apps') throw new UsageError('the groups are apps and instance');
  switch (verb) {
    case 'ensure': {
      const { rest, flags } = flagsOf(words, ALL);
      const key = one(rest, 'ensure');
      const name = flags.values.get('name');
      const redirect = flags.lists.get('redirect') ?? [];
      if (name === undefined) throw new UsageError('ensure needs --name');
      if (redirect.length === 0) throw new UsageError('ensure needs --redirect');
      return {
        name: 'ensure',
        key,
        json: flags.switches.has('json'),
        app: {
          name,
          redirect,
          postLogout: flags.lists.get('post-logout') ?? [],
          backChannel: flags.values.get('back-channel'),
          accountDeleted: flags.values.get('account-deleted'),
          scopes: flags.lists.get('scope') ?? [],
          appScopes: flags.lists.get('app-scope') ?? [],
          isPublic: flags.switches.has('public'),
          trusted: flags.switches.has('trusted'),
          launchUrl: flags.values.get('launch-url'),
          description: flags.values.get('description'),
          icon: flags.values.get('icon'),
        },
      };
    }
    case 'list': {
      const { rest, flags } = flagsOf(words, JSON_ONLY);
      if (rest.length > 0) throw new UsageError('list takes no KEY');
      return { name: 'list', json: flags.switches.has('json') };
    }
    case 'rotate-secret': {
      const { rest, flags } = flagsOf(words, JSON_ONLY);
      return {
        name: 'rotate-secret',
        key: one(rest, 'rotate-secret'),
        json: flags.switches.has('json'),
      };
    }
    case 'remove': {
      const { rest } = flagsOf(words, NONE);
      return { name: 'remove', key: one(rest, 'remove') };
    }
    default:
      throw new UsageError(verb === undefined ? 'a command is needed' : `unknown command ${verb}`);
  }
}
