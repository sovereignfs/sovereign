/**
 * An app's repository settings as code (research 0007): `.github/repository.json` holds its merge settings and its rulesets, which
 * `npm create @sovereignfs settings apply` makes GitHub match and `settings check` holds GitHub to. Nothing is set in GitHub's interface.
 */

/** The check every app's `main` requires: the shared promotion check, as GitHub names a called workflow's job. */
export const PROMOTION_CHECK = 'Promotion / Promotion title';

/** The checks a new app's `main` requires besides the promotion check: its CI's one job. */
export const DEFAULT_REQUIRED_CHECKS = ['Check'] as const;

export type Ruleset = {
  name: string;
  target: string;
  enforcement: string;
  conditions: unknown;
  bypass_actors: unknown[];
  rules: { type: string; parameters?: Record<string, unknown> }[];
};

export type RepositoryFile = {
  settings: Record<string, string | boolean>;
  rulesets: Ruleset[];
};

/**
 * The template's settings file with an app's required checks: the promotion check first, then the app's own. Written in one layout, and
 * compared by content (`sync --check`), so an app's formatter cannot make it drift.
 */
export function repositorySettings(text: string, requiredChecks: readonly string[]): string {
  const file = JSON.parse(text) as RepositoryFile;
  for (const ruleset of file.rulesets) {
    for (const rule of ruleset.rules) {
      if (rule.type !== 'required_status_checks' || !rule.parameters) continue;
      const contexts = [...new Set([PROMOTION_CHECK, ...requiredChecks])];
      rule.parameters.required_status_checks = contexts.map((context) => ({ context }));
    }
  }
  return `${JSON.stringify(file, null, 2)}\n`;
}
