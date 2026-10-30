/**
 * Measures the package against the rules of `docs/specs/design-system.md` §6 that can be read from its files: a stylesheet and a
 * component's source in, the rules it breaks out. The checks are heuristics that err toward reporting: a component that gets a
 * behaviour from another it wraps says so in the exceptions of the test that uses this, and not by being missed here.
 */

/** Every rule with the at-rule preludes it sits inside, and the text of its declarations. */
export type Rule = { selector: string; inside: string[]; declarations: string };

export function rulesOf(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const walk = (source: string, inside: string[]) => {
    let at = 0;
    while (at < source.length) {
      const open = source.indexOf('{', at);
      if (open === -1) break;
      const prelude = source
        .slice(at, open)
        .replace(/^[\s;]+/, '')
        .trim();
      let depth = 1;
      let close = open + 1;
      while (close < source.length && depth > 0) {
        if (source[close] === '{') depth += 1;
        else if (source[close] === '}') depth -= 1;
        close += 1;
      }
      const body = source.slice(open + 1, close - 1);
      if (prelude.startsWith('@')) {
        // @keyframes holds steps, not rules a selector can be read from.
        if (/^@(media|supports|layer|container)/.test(prelude)) walk(body, [...inside, prelude]);
        else rules.push({ selector: prelude, inside, declarations: body });
      } else {
        rules.push({ selector: prelude, inside, declarations: body });
      }
      at = close;
    }
  };
  walk(text, []);
  return rules;
}

export type Gap = { rule: string; subject: string; detail?: string };

/** `:hover` outside `@media (hover: hover)` (§6.2, Touch). */
export function hoverGaps(subject: string, css: string): Gap[] {
  return rulesOf(css)
    .filter((rule) => /:hover\b/.test(rule.selector) && !rule.selector.startsWith('@'))
    .filter((rule) => !rule.inside.some((prelude) => /hover:\s*hover/.test(prelude)))
    .map((rule) => ({ rule: 'hover', subject, detail: rule.selector }));
}

/** A stylesheet that animates and does not say what happens under `prefers-reduced-motion: reduce` (§6.2, Motion). */
export function motionGaps(subject: string, css: string): Gap[] {
  const moves =
    rulesOf(css).some(
      (rule) =>
        !rule.selector.startsWith('@keyframes') &&
        /(^|[;\s])(transition|animation)(-[a-z]+)?\s*:/.test(rule.declarations),
    ) || /@keyframes/.test(css);
  if (!moves) return [];
  return /prefers-reduced-motion/.test(css) ? [] : [{ rule: 'reduced-motion', subject }];
}

/** A breakpoint other than the one (§6.1). */
export function breakpointGaps(subject: string, css: string): Gap[] {
  return [...css.matchAll(/@media[^{]*\((?:max|min)-width:\s*([0-9.]+)(?:px|rem|em)\)/g)]
    .filter((match) => match[1] !== '768')
    .map((match) => ({ rule: 'breakpoint', subject, detail: String(match[1]) }));
}

/** Whether the component's own markup has something a person can act on directly: a native control, or a role or tab stop. */
export function isInteractive(tsx: string): boolean {
  // Comments and strings of prose say `<button>` too; only the markup counts.
  const code = tsx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return (
    /<(button|a|input|select|textarea|summary)[\s>/]/.test(code) ||
    /\brole=\{?["'](button|menuitem|tab|switch|checkbox|radio|option|slider|combobox|link)["']/.test(
      code,
    ) ||
    /\btabIndex=(?!\{?-1\b)/.test(code)
  );
}

/** An interactive component whose own stylesheet never shows `:focus-visible` (§6.2, Focus). */
export function focusGaps(subject: string, tsx: string, css: string): Gap[] {
  if (!isInteractive(tsx)) return [];
  return /:focus-visible/.test(css) || /:focus-within/.test(css)
    ? []
    : [{ rule: 'focus-visible', subject }];
}

/** A component with no story of its own: a file named for it that is a story, wherever stories are kept (§6.4). */
export function storyGaps(components: readonly string[], files: readonly string[]): Gap[] {
  const stories = new Set(
    files
      .filter((file) => file.endsWith('.stories.tsx'))
      .map((file) => baseName(file).replace('.stories.tsx', '')),
  );
  return components
    .filter((name) => !stories.has(name))
    .map((name) => ({ rule: 'story', subject: name }));
}

/** A component with no test of its own: one in its folder, or a test file named for it (§6.4). */
export function testGaps(components: readonly string[], files: readonly string[]): Gap[] {
  const tests = files.filter((file) => /\.test\.tsx?$/.test(file));
  return components
    .filter(
      (name) =>
        !tests.some(
          (file) =>
            file.includes(`/components/${name}/`) ||
            new RegExp(`^${name}[.-]`).test(baseName(file)),
        ),
    )
    .map((name) => ({ rule: 'test', subject: name }));
}

const baseName = (file: string) => file.slice(file.lastIndexOf('/') + 1);
