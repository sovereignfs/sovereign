import { readFileSync } from 'node:fs';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import { generateOperations, generateSchema, readContract } from './api-client-generator';

export const CONTRACT = 'spec/core-api/openapi.yaml';
export const OUTPUT_DIRECTORY = 'packages/api-client/src/generated';

/** The files the contract produces, formatted the way the repository formats its code, keyed by their path. */
export async function generatedFiles(root: string): Promise<Record<string, string>> {
  const contract = readContract(readFileSync(path.join(root, CONTRACT), 'utf8'));
  const raw: Record<string, string> = {
    [`${OUTPUT_DIRECTORY}/schema.ts`]: generateSchema(contract),
    [`${OUTPUT_DIRECTORY}/operations.ts`]: generateOperations(contract),
  };
  const formatted: Record<string, string> = {};
  for (const [file, text] of Object.entries(raw)) {
    const options = (await resolveConfig(path.join(root, file))) ?? {};
    formatted[file] = await format(text, { ...options, filepath: path.join(root, file) });
  }
  return formatted;
}
