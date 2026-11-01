import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Document, isMap, parseDocument, YAMLParseError } from 'yaml';
import { Refused } from '../errors.js';
import { schemaProblems, type Problem } from './schema.js';
import { suiteProblems } from './rules.js';
import type { Lock, Suite } from './types.js';

export const FILE = {
  suite: 'suite.yml',
  lock: 'suite.lock',
  secrets: 'secrets.age.yml',
  package: 'package.json',
  launcher: 'sv',
} as const;

/** The files an instance repository holds, which `sv push` may stage and nothing else (operator-cli §2.1, §4.5). */
export const KNOWN_FILES = [
  'package.json',
  'package-lock.json',
  'sv',
  'suite.yml',
  'suite.lock',
  'secrets.age.yml',
  '.gitignore',
  'README.md',
] as const;
export const KNOWN_DIRECTORIES = ['overrides/', '.github/workflows/'] as const;

/** Whether a path in the repository is one `sv push` may stage. */
export function isKnownPath(file: string): boolean {
  return (
    (KNOWN_FILES as readonly string[]).includes(file) ||
    KNOWN_DIRECTORIES.some((directory) => file.startsWith(directory))
  );
}

/** Whether a folder is an instance repository: it holds the launcher and a `package.json` that pins the toolkit. */
function isInstanceRoot(dir: string): boolean {
  try {
    if (!existsSync(path.join(dir, FILE.launcher))) return false;
    const pkg = JSON.parse(readFileSync(path.join(dir, FILE.package), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(
      pkg.dependencies?.['@sovereignfs/cli'] ?? pkg.devDependencies?.['@sovereignfs/cli'],
    );
  } catch {
    return false;
  }
}

/** The instance repository a command runs in: `SV_ROOT` when the launcher sets it, else the nearest folder above `from` that is one. */
export function findRoot(from: string, env: NodeJS.ProcessEnv): string {
  if (env.SV_ROOT) return path.resolve(env.SV_ROOT);
  let dir = path.resolve(from);
  for (;;) {
    if (isInstanceRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Refused(
        'This is not inside an instance repository.',
        'Run sv from inside one, or make one with: npm create @sovereignfs instance <folder>',
      );
    }
    dir = parent;
  }
}

/** Writes a file whole or not at all. */
export async function writeAtomically(file: string, text: string, mode?: number): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text, mode === undefined ? undefined : { mode });
  if (mode !== undefined) await chmod(temporary, mode);
  await rename(temporary, file);
}

const describe = (problems: Problem[]) => problems.map((p) => `  ${p.at}: ${p.message}`).join('\n');

/** Reads a YAML file, saying where its syntax is wrong. */
function readDocument(file: string, text: string): Document {
  const doc = parseDocument(text, { prettyErrors: true });
  const error = doc.errors[0];
  if (error instanceof YAMLParseError) {
    throw new Refused(
      `${path.basename(file)} is not valid YAML: ${error.message}`,
      'Fix the line it names, or restore the file from git.',
    );
  }
  return doc;
}

/** `suite.yml`, kept as a document so a change keeps the operator's comments and order. */
export class SuiteFile {
  readonly #file: string;
  #doc: Document;

  private constructor(file: string, doc: Document) {
    this.#file = file;
    this.#doc = doc;
  }

  /** Reads and checks `suite.yml`: its schema, then what the schema cannot say. Refuses, listing every problem, when it fails. */
  static async load(root: string): Promise<SuiteFile> {
    const file = path.join(root, FILE.suite);
    if (!existsSync(file)) {
      throw new Refused('There is no suite.yml here.', 'Run sv setup to make one.');
    }
    const doc = readDocument(file, await readFile(file, 'utf8'));
    const loaded = new SuiteFile(file, doc);
    loaded.check();
    return loaded;
  }

  /** Starts a file that does not exist yet. */
  static create(root: string, suite: Suite): SuiteFile {
    const doc = new Document(suite);
    const created = new SuiteFile(path.join(root, FILE.suite), doc);
    created.check();
    return created;
  }

  get value(): Suite {
    return this.#doc.toJS() as Suite;
  }

  /** What the file would hold after a change, checked, without writing it: so a lock can be resolved for it before anything is written. */
  preview(change: (doc: Document) => void): Suite {
    const copy = new SuiteFile(this.#file, this.#doc.clone());
    change(copy.#doc);
    copy.check();
    return copy.value;
  }

  /** Changes the document and writes it, but only if what results is still a valid `suite.yml`: it never writes a broken one. */
  async edit(change: (doc: Document) => void): Promise<void> {
    const before = this.#doc.toString();
    change(this.#doc);
    try {
      this.check();
    } catch (error) {
      this.#doc = parseDocument(before);
      throw error;
    }
    await this.save();
  }

  async save(): Promise<void> {
    await writeAtomically(this.#file, this.#doc.toString({ lineWidth: 0 }));
  }

  /** Makes sure `apps` is a map in the document, and returns it. */
  appsMap(): import('yaml').YAMLMap {
    let apps = this.#doc.get('apps', true);
    if (!isMap(apps)) {
      this.#doc.set('apps', this.#doc.createNode({}));
      apps = this.#doc.get('apps', true);
    }
    return apps as import('yaml').YAMLMap;
  }

  private check(): void {
    const value = this.#doc.toJS() as unknown;
    const problems = schemaProblems('suite', value);
    if (problems.length === 0) problems.push(...suiteProblems(value as Suite));
    if (problems.length > 0) {
      throw new Refused(
        `suite.yml is not valid:\n${describe(problems)}`,
        'Fix it by hand, or restore it from git.',
      );
    }
  }
}

/** `suite.lock`, or nothing when there is none yet. */
export async function readLock(root: string): Promise<Lock | undefined> {
  const file = path.join(root, FILE.lock);
  if (!existsSync(file)) return undefined;
  const doc = readDocument(file, await readFile(file, 'utf8'));
  const value = doc.toJS() as unknown;
  const problems = schemaProblems('lock', value);
  if (problems.length > 0) {
    throw new Refused(
      `suite.lock is not valid:\n${describe(problems)}`,
      'Do not edit it by hand: restore it from git. sv push writes it again when suite.yml changes, but not when it is damaged.',
    );
  }
  return value as Lock;
}

const LOCK_HEADER =
  '# Written by sv. Do not edit it by hand: sv refreshes it whenever suite.yml changes what runs.\n';

export async function writeLock(root: string, lock: Lock): Promise<void> {
  const doc = new Document(lock);
  await writeAtomically(
    path.join(root, FILE.lock),
    `${LOCK_HEADER}${doc.toString({ lineWidth: 0 })}`,
  );
}
