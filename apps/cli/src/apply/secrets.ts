import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Host } from './host.js';

/**
 * The secrets the server makes for itself (operator-cli §9.2), one file each. They are made once and never replaced, they leave the
 * server only in a backup, and they reach a container through the `_FILE` form. The directory is readable by root alone; the files in
 * it can be read by whoever can get to them, which is root, because a container’s own user must read what Docker mounts and is not root.
 */
export class GeneratedSecrets {
  readonly #dir: string;
  readonly #host: Host;
  /** How many secrets this run has made or changed, which tells a run that changed nothing from one that did. */
  created = 0;

  constructor(dir: string, host: Host) {
    this.#dir = dir;
    this.#host = host;
  }

  get dir(): string {
    return this.#dir;
  }

  pathOf(name: string): string {
    return path.join(this.#dir, name);
  }

  async #ensureDir(): Promise<void> {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
    await chmod(this.#dir, 0o700);
  }

  /** The secret’s value, made with `make` the first time and kept as it was after that. */
  async ensure(name: string, make: () => string): Promise<{ value: string; created: boolean }> {
    await this.#ensureDir();
    const file = this.pathOf(name);
    try {
      await stat(file);
      return { value: (await readFile(file, 'utf8')).replace(/\r?\n$/, ''), created: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const value = make();
    await writeFile(file, value, { mode: 0o444, flag: 'wx' });
    this.created += 1;
    return { value, created: true };
  }

  /** Writes a secret that is not made here but derived or decrypted (a URL that carries a password, an operator’s secret). */
  async write(name: string, value: string): Promise<void> {
    await this.#ensureDir();
    const file = this.pathOf(name);
    // Left alone when it is already right, so a deployment that changes nothing touches nothing; replaced whole when not.
    if ((await this.read(name)) === value) return;
    const temporary = `${file}.${this.#host.pid}.tmp`;
    await writeFile(temporary, value, { mode: 0o444 });
    await chmod(temporary, 0o444);
    await rename(temporary, file);
    this.created += 1;
  }

  async read(name: string): Promise<string | undefined> {
    try {
      return (await readFile(this.pathOf(name), 'utf8')).replace(/\r?\n$/, '');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  /** A random secret in base64url, `bytes` bytes long. */
  random(bytes: number): string {
    return this.#host.random(bytes).toString('base64url');
  }
}
