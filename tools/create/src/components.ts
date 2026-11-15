/**
 * What a repository releases (research 0007). An app at a repository's root releases one thing, described by its `package.json` (its
 * version, and `sovereign` for its settings). A repository that releases several (fjord: a Rust CLI and a web app) describes them in
 * `sovereign.json` at its root: each component's version file, tag prefix, changelog and publish workflow. Every command and the shared
 * workflows read it from here, so the two shapes are one model.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CreateError } from './create.js';
import { isPrefix } from './release.js';

/** One thing a repository releases. Paths are from the repository's root. */
export type Component = {
  name: string;
  /** The file its version is in: a `package.json` (`version`), or a `Cargo.toml` (`[workspace.package]` or `[package]` `version`). */
  version: string;
  /** What its tags start with before the `v`: empty for `vX.Y.Z`, or such as `web-` or `fjord-cli-`. */
  tagPrefix: string;
  /** Its Keep a Changelog file, whose version sections are its release notes. */
  changelog: string;
  /** Its publish workflow in `.github/workflows/`, called with the tag when it is released. */
  publish: string;
};

/** A repository's release settings: what it releases, the checks `main` requires, the shared files it keeps as its own. */
export type Releases = {
  /** The repository's name in words' source: an app's package name, or `name` in `sovereign.json`. */
  name: string;
  components: Component[];
  requiredChecks: string[];
  unmanaged: string[];
  /** The `@sovereignfs/create` version the repository pins. */
  create: string | undefined;
  /** Whether the settings came from `sovereign.json` (several components) or an app's `package.json`. */
  file: 'sovereign.json' | 'package.json';
};

export const COMPONENTS_FILE = 'sovereign.json';

const strings = (value: unknown, what: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new CreateError(`${what} must be a list of strings.`, 1);
  }
  return value as string[];
};

const text = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || value === '')
    throw new CreateError(`${what} must be a non-empty string.`, 1);
  return value;
};

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new CreateError(`${file} is not valid JSON.`, 1);
  }
}

/**
 * The release settings of the repository at `root`, or of the app at `appDir` in it: `sovereign.json` at the root when there is one,
 * otherwise the app's `package.json` (one component, at the app's folder, published by `publish.yml`).
 */
export async function readReleases(
  root: string,
  appDir: string = root,
  defaultChecks: readonly string[] = [],
): Promise<Releases> {
  const file = await readJson(path.join(root, COMPONENTS_FILE));
  if (file) {
    const list = file.components;
    if (!Array.isArray(list) || list.length === 0)
      throw new CreateError(`${COMPONENTS_FILE} must list its components.`, 1);
    const components = list.map((item, i): Component => {
      const entry = (item ?? {}) as Record<string, unknown>;
      const where = `${COMPONENTS_FILE} components[${i}]`;
      const tagPrefix = entry.tagPrefix === undefined ? '' : entry.tagPrefix;
      if (typeof tagPrefix !== 'string' || !isPrefix(tagPrefix)) {
        throw new CreateError(`${where}.tagPrefix must be empty or end in "-", such as web-.`, 1);
      }
      return {
        name: text(entry.name, `${where}.name`),
        version: text(entry.version, `${where}.version`),
        tagPrefix,
        changelog: text(entry.changelog, `${where}.changelog`),
        publish: text(entry.publish, `${where}.publish`),
      };
    });
    const prefixes = components.map((component) => component.tagPrefix);
    if (new Set(prefixes).size !== prefixes.length)
      throw new CreateError(`Two components in ${COMPONENTS_FILE} share a tag prefix.`, 1);
    return {
      name: text(file.name, `${COMPONENTS_FILE} name`),
      components,
      requiredChecks:
        file.requiredChecks === undefined
          ? [...defaultChecks]
          : strings(file.requiredChecks, `${COMPONENTS_FILE} requiredChecks`),
      unmanaged: strings(file.unmanaged, `${COMPONENTS_FILE} unmanaged`),
      create: typeof file.create === 'string' ? file.create : undefined,
      file: COMPONENTS_FILE,
    };
  }
  const manifest = await readJson(path.join(appDir, 'package.json'));
  if (!manifest)
    throw new CreateError(
      `There is no ${COMPONENTS_FILE} in ${root}, nor a package.json in ${appDir}.`,
      1,
    );
  const own = (manifest.sovereign ?? {}) as Record<string, unknown>;
  const tagPrefix = own.tagPrefix === undefined ? '' : own.tagPrefix;
  if (typeof tagPrefix !== 'string' || !isPrefix(tagPrefix)) {
    throw new CreateError(
      `package.json's sovereign.tagPrefix must be empty or end in "-", such as web-.`,
      1,
    );
  }
  const name =
    typeof manifest.name === 'string' ? manifest.name.replace(/^@sovereignfs\//, '') : '';
  const dir = path.relative(root, appDir);
  const at = (file: string) => (dir === '' ? file : path.join(dir, file).split(path.sep).join('/'));
  const dev = (manifest.devDependencies ?? {}) as Record<string, unknown>;
  return {
    name,
    components: [
      {
        name,
        version: at('package.json'),
        tagPrefix,
        changelog: at('CHANGELOG.md'),
        publish: 'publish.yml',
      },
    ],
    requiredChecks:
      own.requiredChecks === undefined
        ? [...defaultChecks]
        : strings(own.requiredChecks, "package.json's sovereign.requiredChecks"),
    unmanaged: strings(own.unmanaged, "package.json's sovereign.unmanaged"),
    create:
      typeof dev['@sovereignfs/create'] === 'string'
        ? (dev['@sovereignfs/create'] as string)
        : undefined,
    file: 'package.json',
  };
}

/** A version from a `package.json` or a `Cargo.toml`'s text: `[workspace.package]` first, then `[package]`; undefined when it has none. */
export function versionIn(file: string, content: string): string | undefined {
  if (file.endsWith('.json')) {
    try {
      const { version } = JSON.parse(content) as { version?: unknown };
      return typeof version === 'string' && version !== '' ? version : undefined;
    } catch {
      return undefined;
    }
  }
  if (file.endsWith('Cargo.toml')) {
    for (const table of ['workspace.package', 'package']) {
      let inside = false;
      for (const line of content.split('\n')) {
        const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
        if (header) inside = header[1] === table;
        else if (inside) {
          const found = /^\s*version\s*=\s*"([^"]+)"/.exec(line);
          if (found) return found[1];
        }
      }
    }
  }
  return undefined;
}

/** A component's current version, read from its file in the repository at `root`. */
export async function componentVersion(root: string, component: Component): Promise<string> {
  let content: string;
  try {
    content = await readFile(path.join(root, component.version), 'utf8');
  } catch {
    throw new CreateError(`There is no ${component.version} for ${component.name}.`, 1);
  }
  const version = versionIn(component.version, content);
  if (!version)
    throw new CreateError(`${component.version} has no version for ${component.name}.`, 1);
  return version;
}
