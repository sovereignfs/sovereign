/**
 * design-tokens-check: verifies every `--sv-*` token reference resolves to a real
 * definition, and that CSS Modules never hardcode a colour literal that should be
 * a token. The checks live in `scripts/lib/design-tokens.ts`.
 *
 * An undefined token is a silent bug: it resolves to nothing in the browser (or to
 * the fallback, if one is given), so the drift stays invisible until someone reads
 * the rendered page pixel by pixel.
 *
 * Run: `pnpm design:tokens:check`. Runs in CI with the other checks.
 */
import { fileURLToPath } from 'node:url';
import { checkDesignTokens } from './lib/design-tokens';

const root = fileURLToPath(new URL('..', import.meta.url));
const { violations, definedTokens } = checkDesignTokens(root);

if (violations.length > 0) {
  console.error(`\n[design-tokens-check] ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ${v.file}:${v.line} — ${v.message}`);
  console.error('');
  process.exit(1);
}

console.log(`[design-tokens-check] OK — ${definedTokens} tokens defined, no violations found.`);
