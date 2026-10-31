import { describe, expect, it } from 'vitest';
import { parseArgs, positionals } from './args.js';
import { Refused } from './errors.js';

const SPEC = { image: 'value', env: 'list', yes: 'switch' } as const;

describe('reading arguments', () => {
  it('reads values, lists and switches, with the name and the value apart or together', () => {
    const parsed = parseArgs(
      ['notes', '--image', 'a:1', '--env=A=1', '--env', 'B=2', 'C=3', '--yes'],
      SPEC,
    );
    expect(parsed.positionals).toEqual(['notes']);
    expect(parsed.values.get('image')).toBe('a:1');
    expect(parsed.lists.get('env')).toEqual(['A=1', 'B=2', 'C=3']);
    expect(parsed.switches.has('yes')).toBe(true);
  });

  it('refuses a flag it does not know, rather than ignoring a setting', () => {
    expect(() => parseArgs(['--imge', 'a'], SPEC)).toThrow(Refused);
    expect(() => parseArgs(['--imge', 'a'], SPEC)).toThrow('There is no option --imge');
  });

  it.each([
    [['--image']],
    [['--image', '--yes']],
    [['--env']],
    [['--image', 'a', '--image', 'b']],
    [['--yes=1']],
  ])('refuses %j', (words) => {
    expect(() => parseArgs(words, SPEC)).toThrow(Refused);
  });

  it('wants exactly the words that are not flags that it is told to', () => {
    expect(positionals(parseArgs(['a'], SPEC), 1, 'usage')).toEqual(['a']);
    expect(() => positionals(parseArgs([], SPEC), 1, 'sv x NAME')).toThrow('Usage: sv x NAME');
    expect(() => positionals(parseArgs(['a', 'b'], SPEC), 1, 'sv x NAME')).toThrow(Refused);
  });
});
