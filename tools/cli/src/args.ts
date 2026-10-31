import { Refused } from './errors.js';

/** What a command accepts: a flag takes a value, several values, or none. */
export type OptionSpec = Record<string, 'value' | 'list' | 'switch'>;

export type Parsed = {
  positionals: string[];
  values: Map<string, string>;
  lists: Map<string, string[]>;
  switches: Set<string>;
};

/**
 * Reads a command's arguments against what it accepts. `--name value` and `--name=value` both work. A list flag may be given
 * again, and takes every word after it up to the next flag. An unknown flag is refused rather than ignored, since a flag that is
 * silently ignored is a setting that was not applied.
 */
export function parseArgs(words: readonly string[], spec: OptionSpec): Parsed {
  const parsed: Parsed = {
    positionals: [],
    values: new Map(),
    lists: new Map(),
    switches: new Set(),
  };
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] as string;
    if (!word.startsWith('--')) {
      parsed.positionals.push(word);
      continue;
    }
    const equals = word.indexOf('=');
    const name = word.slice(2, equals === -1 ? undefined : equals);
    const inline = equals === -1 ? undefined : word.slice(equals + 1);
    const kind = spec[name];
    if (kind === undefined) {
      throw new Refused(`There is no option --${name} here.`, 'Run the command with --help.');
    }
    if (kind === 'switch') {
      if (inline !== undefined) throw new Refused(`--${name} takes no value.`);
      parsed.switches.add(name);
    } else if (kind === 'value') {
      const value = inline ?? words[++i];
      if (value === undefined || (inline === undefined && value.startsWith('--'))) {
        throw new Refused(`--${name} needs a value.`);
      }
      if (parsed.values.has(name)) throw new Refused(`--${name} is given twice.`);
      parsed.values.set(name, value);
    } else {
      const list = parsed.lists.get(name) ?? [];
      if (inline !== undefined) list.push(inline);
      while (i + 1 < words.length && !(words[i + 1] as string).startsWith('--')) {
        list.push(words[++i] as string);
      }
      if (list.length === 0) throw new Refused(`--${name} needs a value.`);
      parsed.lists.set(name, list);
    }
  }
  return parsed;
}

/** Exactly `count` words that are not flags, or a refusal naming what was meant. */
export function positionals(parsed: Parsed, count: number, usage: string): string[] {
  if (parsed.positionals.length !== count) throw new Refused(`Usage: ${usage}`);
  return parsed.positionals;
}
