/**
 * Holds the design system to the rules of `docs/specs/design-system.md` §6 that can be read from its files, and only lets the list
 * of what it still falls short of get shorter. A gap that is not listed fails (a new component must meet the rules), and so does a
 * listed one that has been closed (so the list says what is true). The checks are in `scripts/lib/design-system-audit.ts`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  breakpointGaps,
  focusGaps,
  hoverGaps,
  motionGaps,
  rulesOf,
  storyGaps,
  testGaps,
  type Gap,
} from '../lib/design-system-audit';

const root = fileURLToPath(new URL('../..', import.meta.url));
const src = path.join(root, 'packages/ui/src');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const file = path.join(dir, entry);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
const files = walk(src).map((file) => file.split(path.sep).join('/'));
const components = readdirSync(path.join(src, 'components'))
  .filter((name) => statSync(path.join(src, 'components', name)).isDirectory())
  .sort();
const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

/**
 * What the package falls short of and has a reason to. Nothing is added without one, written here, why a component cannot meet
 * the rule; and a line goes when its gap does.
 */
const EXCEPTIONS: Readonly<Record<string, string>> = {
  'focus-visible:ButtonLink': 'It draws with Button’s own stylesheet, which shows the focus ring.',
};

const gaps = (): Gap[] => [
  ...components.flatMap((name) => {
    const dir = path.join(src, 'components', name);
    const css = read(path.join(dir, `${name}.module.css`));
    const tsx = read(path.join(dir, `${name}.tsx`));
    return [
      ...hoverGaps(name, css),
      ...motionGaps(name, css),
      ...breakpointGaps(name, css),
      ...focusGaps(name, tsx, css),
    ];
  }),
  ...storyGaps(components, files),
  ...testGaps(components, files),
];
const key = (gap: Gap) => `${gap.rule}:${gap.subject}`;

describe('the design system meets the rules it can be checked against', () => {
  it('finds the components it is meant to check', () => {
    expect(components.length).toBeGreaterThan(90);
  });

  it('has no gap that is not known, and lists none that has been closed', () => {
    const found = [...new Set(gaps().map(key))].sort();
    expect(found).toEqual(Object.keys(EXCEPTIONS).sort());
  });

  it('reads a stylesheet’s rules the way the checks assume', () => {
    const css = `.a { color: red } @media (hover: hover) { .a:hover { color: blue } } .b:hover { color: green } @keyframes spin { from { opacity: 0 } to { opacity: 1 } }`;
    expect(rulesOf(css).map((rule) => rule.selector)).toEqual([
      '.a',
      '.a:hover',
      '.b:hover',
      '@keyframes spin',
    ]);
    expect(hoverGaps('X', css).map((gap) => gap.detail)).toEqual(['.b:hover']);
    expect(motionGaps('X', css)).toHaveLength(1);
    expect(
      motionGaps('X', `${css} @media (prefers-reduced-motion: reduce) { .a { animation: none } }`),
    ).toEqual([]);
    expect(
      breakpointGaps(
        'X',
        '@media (max-width: 640px) { .a { x: y } } @media (max-width: 768px) { .a { x: y } }',
      ),
    ).toHaveLength(1);
  });
});
