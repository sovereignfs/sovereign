import Ajv2020 from 'ajv/dist/2020';
import { schemas, supportedVersions, versionOf, type ManifestVersion } from './schemas';
import type { Manifest, Problem } from './types';

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validators = {
  1: ajv.compile(schemas[1]),
} satisfies Record<ManifestVersion, unknown>;

export type Validated = { ok: true; manifest: Manifest } | { ok: false; problems: Problem[] };

/**
 * Whether a document is a manifest, by the schema of the version it says it is and by the rules a schema cannot say
 * (`contracts/app-manifest.md`): every problem, each once, none naming a value that is not the author's own. A document that says no
 * version, or one this package does not read, is held to the newest schema it does, which names the `manifest` field as the problem.
 */
export function validate(document: unknown): Validated {
  const version = versionOf(document) ?? newest();
  const validator = validators[version];
  const problems = validator(document) ? [] : schemaProblems(validator.errors ?? []);
  if (problems.length === 0) problems.push(...ruleProblems(document as Manifest));
  return problems.length === 0
    ? { ok: true, manifest: document as Manifest }
    : { ok: false, problems };
}

function newest(): ManifestVersion {
  return supportedVersions[supportedVersions.length - 1] as ManifestVersion;
}

type SchemaError = {
  keyword: string;
  instancePath: string;
  message?: string;
  params: Record<string, unknown>;
};

function schemaProblems(errors: readonly SchemaError[]): Problem[] {
  const seen = new Set<string>();
  const problems: Problem[] = [];
  for (const error of errors) {
    // `if`/`then`/`oneOf` branches add errors that only repeat the real one.
    if (error.keyword === 'if' || error.keyword === 'oneOf') continue;
    const at =
      error.instancePath === '' ? '(top level)' : error.instancePath.slice(1).replace(/\//g, '.');
    const extra =
      error.keyword === 'additionalProperties'
        ? ` (${String(error.params.additionalProperty)} is not allowed)`
        : error.keyword === 'propertyNames'
          ? ` (${String(error.params.propertyName)})`
          : '';
    // The one `not` in the prefix is core’s own, and saying so is kinder than "must NOT be valid".
    const message =
      error.keyword === 'not' && at === 'prefix'
        ? 'is core’s own prefix and cannot be used by an app'
        : error.keyword === 'uniqueItems'
          ? `has the same item twice (at ${Math.min(Number(error.params.i), Number(error.params.j))} and ${Math.max(Number(error.params.i), Number(error.params.j))}, counting from 0)`
          : `${error.message ?? 'is not valid'}${extra}`;
    const key = `${at}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push({ at, message });
  }
  return problems;
}

/** What a schema cannot say: each name a secret is made for begins with the app’s variable prefix (§2.5). */
function ruleProblems(manifest: Manifest): Problem[] {
  const variablePrefix = manifest.prefix.toUpperCase();
  const problems: Problem[] = [];
  (manifest.generate ?? []).forEach((name, index) => {
    if (!name.startsWith(`${variablePrefix}_`)) {
      problems.push({
        at: `generate.${index}`,
        message: `must begin with ${variablePrefix}_, the app’s prefix`,
      });
    }
  });
  return problems;
}
