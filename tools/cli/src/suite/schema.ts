import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import manifestSchema from '../../../../spec/schemas/app-manifest-v1.schema.json' with { type: 'json' };
import lockSchema from '../../../../spec/schemas/suite-lock-v1.schema.json' with { type: 'json' };
import suiteSchema from '../../../../spec/schemas/suite-v1.schema.json' with { type: 'json' };

/** One thing wrong with a document, with where it is, in words an operator can act on. */
export type Problem = { at: string; message: string };

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validators = {
  suite: ajv.compile(suiteSchema),
  lock: ajv.compile(lockSchema),
  manifest: ajv.compile(manifestSchema),
};

export type SchemaName = keyof typeof validators;

/** What is wrong with a document against one of the schemas under `spec/schemas`, each thing once. */
export function schemaProblems(name: SchemaName, document: unknown): Problem[] {
  const validate = validators[name];
  if (validate(document)) return [];
  const seen = new Set<string>();
  const problems: Problem[] = [];
  for (const error of validate.errors ?? []) {
    // `if`/`then`/`oneOf` branches add errors that only repeat the real one.
    if (error.keyword === 'if' || error.keyword === 'oneOf') continue;
    const at =
      error.instancePath === '' ? '(top level)' : error.instancePath.slice(1).replace(/\//g, '.');
    const extra =
      error.keyword === 'additionalProperties'
        ? ` (${String((error.params as { additionalProperty?: string }).additionalProperty)} is not allowed)`
        : error.keyword === 'propertyNames'
          ? ` (${String((error.params as { propertyName?: string }).propertyName)})`
          : '';
    const message = `${error.message ?? 'is not valid'}${extra}`;
    const key = `${at}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push({ at, message });
  }
  return problems;
}
