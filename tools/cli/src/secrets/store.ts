import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { armor, Decrypter, Encrypter } from 'age-encryption';
import { Document, parseDocument } from 'yaml';
import { Refused } from '../errors.js';
import { FILE, writeAtomically } from '../suite/files.js';

/** `secrets.age.yml`: who a secret belongs to (`core` or an app's name), then its variable name, then armored age ciphertext (contracts/suite.md §3). */
export type SecretsDocument = Record<string, Record<string, string>>;

const ARMOR_START = '-----BEGIN AGE ENCRYPTED FILE-----';

/** Whether a value is armored age ciphertext, which is all `secrets.age.yml` may hold. */
export function isCiphertext(value: unknown): boolean {
  return typeof value === 'string' && value.trimStart().startsWith(ARMOR_START);
}

/** Encrypts to every recipient given, so each of them can read it and nobody else can. */
export async function encryptValue(plain: string, recipients: readonly string[]): Promise<string> {
  const encrypter = new Encrypter();
  for (const recipient of recipients) encrypter.addRecipient(recipient);
  return armor.encode(await encrypter.encrypt(plain));
}

/** Decrypts with one identity. Refuses, saying whose key is needed, when it is not a recipient. */
export async function decryptValue(armored: string, identity: string): Promise<string> {
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  try {
    return await decrypter.decrypt(armor.decode(armored), 'text');
  } catch {
    throw new Refused(
      'Your key cannot decrypt this secret.',
      'Ask someone whose key is a recipient to run sv secret rekey after adding yours to secrets.recipients.',
    );
  }
}

/** The file, as a document that keeps the operator's comments, and its value. */
export class SecretsFile {
  readonly #file: string;
  #doc: Document;

  private constructor(file: string, doc: Document) {
    this.#file = file;
    this.#doc = doc;
  }

  static async load(root: string): Promise<SecretsFile> {
    const file = path.join(root, FILE.secrets);
    if (!existsSync(file)) return new SecretsFile(file, new Document({}));
    const doc = parseDocument(await readFile(file, 'utf8'));
    if (doc.errors.length > 0) {
      throw new Refused(
        `secrets.age.yml is not valid YAML: ${doc.errors[0]?.message ?? ''}`,
        'Restore it from git.',
      );
    }
    const value = doc.toJS() as unknown;
    if (
      value !== null &&
      value !== undefined &&
      (typeof value !== 'object' || Array.isArray(value))
    ) {
      throw new Refused(
        'secrets.age.yml is not a map of owners to secrets.',
        'Restore it from git.',
      );
    }
    if (value === null || value === undefined) return new SecretsFile(file, new Document({}));
    return new SecretsFile(file, doc);
  }

  get value(): SecretsDocument {
    return (this.#doc.toJS() as SecretsDocument | null) ?? {};
  }

  set(owner: string, name: string, ciphertext: string): void {
    this.#doc.setIn([owner, name], ciphertext);
  }

  remove(owner: string, name: string): boolean {
    const had = (this.value[owner] ?? {})[name] !== undefined;
    if (!had) return false;
    this.#doc.deleteIn([owner, name]);
    // An owner left with nothing is not kept.
    if (Object.keys(this.value[owner] ?? {}).length === 0) this.#doc.delete(owner);
    return true;
  }

  async save(): Promise<void> {
    await writeAtomically(this.#file, this.#doc.toString({ lineWidth: 0 }));
  }
}
