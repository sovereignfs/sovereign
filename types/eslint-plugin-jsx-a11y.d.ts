/**
 * eslint-plugin-jsx-a11y ships no types, and its DefinitelyTyped package depends
 * on ESLint 9 (end-of-life), which would put a second ESLint in the tree. This
 * declares only what eslint.config.ts uses; widen it if the config grows.
 */
declare module 'eslint-plugin-jsx-a11y' {
  import type { ESLint, Linter } from 'eslint';

  const plugin: ESLint.Plugin & {
    flatConfigs: { recommended: { rules: Linter.RulesRecord } };
  };
  export default plugin;
}
