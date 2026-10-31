import { describe, expect, it } from 'vitest';
import { tarballProblems, type PackedManifest } from '../lib/package-check';

const manifest = (overrides: Partial<PackedManifest> = {}): PackedManifest => ({
  name: '@sovereignfs/thing',
  version: '1.2.3',
  license: 'MPL-2.0',
  repository: { type: 'git', url: 'git+https://github.com/sovereignfs/sovereign.git' },
  files: ['dist', 'LICENSE', 'README.md'],
  types: './dist/index.d.ts',
  exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
  ...overrides,
});

const files = [
  'package/package.json',
  'package/LICENSE',
  'package/README.md',
  'package/dist/index.js',
  'package/dist/index.d.ts',
];

describe('tarballProblems', () => {
  it('finds nothing wrong with a well-formed package', () => {
    expect(tarballProblems(manifest(), files)).toEqual([]);
  });

  it.each([
    [
      'a missing LICENSE',
      files.filter((f) => !f.endsWith('LICENSE')),
      'LICENSE is not in the tarball',
    ],
    [
      'a missing README',
      files.filter((f) => !f.endsWith('README.md')),
      'README.md is not in the tarball',
    ],
    [
      'an entry point that was not built',
      files.filter((f) => !f.endsWith('index.js')),
      './dist/index.js is not in the tarball',
    ],
  ])('flags %s', (_name, list, expected) => {
    expect(tarballProblems(manifest(), list)).toContain(expected);
  });

  it('flags a licence that is not MPL-2.0', () => {
    expect(tarballProblems(manifest({ license: 'AGPL-3.0-or-later' }), files)).toContain(
      'the licence is AGPL-3.0-or-later, not MPL-2.0',
    );
    expect(tarballProblems(manifest({ license: undefined }), files)).toContain(
      'the licence is missing, not MPL-2.0',
    );
  });

  it('flags a private package, a wrong scope and a version that is not x.y.z', () => {
    const found = tarballProblems(
      manifest({ private: true, name: 'thing', version: '1.2' }),
      files,
    );
    expect(found).toContain('the package is private, so it cannot be published');
    expect(found).toContain('the name is not under @sovereignfs/');
    expect(found).toContain('the version is not a plain x.y.z');
  });

  it('flags a repository that is missing or another one, which npm refuses with provenance', () => {
    expect(tarballProblems(manifest({ repository: undefined }), files)).toEqual([
      'repository.url is missing, not https://github.com/sovereignfs/sovereign, so npm refuses its provenance',
    ]);
    expect(
      tarballProblems(
        manifest({ repository: 'https://github.com/sovereignfs/sovereign-legacy' }),
        files,
      ),
    ).toHaveLength(1);
    expect(
      tarballProblems(manifest({ repository: 'https://github.com/sovereignfs/sovereign' }), files),
    ).toEqual([]);
  });

  it('flags an exports map that points at source, or at nothing', () => {
    expect(
      tarballProblems(manifest({ exports: { '.': './src/index.ts' }, types: undefined }), files),
    ).toContain('./src/index.ts points outside dist/');
    expect(tarballProblems(manifest({ exports: undefined, types: undefined }), files)).toContain(
      'there is no exports map',
    );
  });

  it('flags a file named in "files" that is not there', () => {
    const found = tarballProblems(
      manifest({ files: ['dist', 'LICENSE', 'NOTICE', 'README.md'] }),
      files,
    );
    expect(found).toContain('NOTICE is listed in "files" but is not in the tarball');
  });

  it.each([
    'package/src/index.ts',
    'package/dist/__tests__/a.js',
    'package/dist/Button.test.js',
    'package/dist/Button.stories.js',
    'package/.storybook/main.ts',
    'package/.env.local',
    'package/tsconfig.json',
    'package/tsup.config.ts',
    'package/node_modules/x/index.js',
  ])('flags %s in the tarball', (extra) => {
    expect(
      tarballProblems(manifest(), [...files, extra]).some((p) =>
        p.includes(extra.replace('package/', '')),
      ),
    ).toBe(true);
  });

  it('flags a dependency on the workspace, which npm cannot resolve', () => {
    const found = tarballProblems(
      manifest({
        dependencies: { '@sovereignfs/config': 'workspace:*' },
        peerDependencies: { react: 'catalog:' },
      }),
      files,
    );
    expect(found.some((p) => p.startsWith('dependencies.@sovereignfs/config'))).toBe(true);
    expect(found.some((p) => p.startsWith('peerDependencies.react'))).toBe(true);
  });

  it('accepts ordinary version ranges', () => {
    expect(tarballProblems(manifest({ peerDependencies: { react: '^19.0.0' } }), files)).toEqual(
      [],
    );
  });

  it("flags a LICENSE in the tarball that is not MPL-2.0, such as the workspace root's that pnpm adds", () => {
    expect(
      tarballProblems(manifest(), files, { licenseText: 'GNU AFFERO GENERAL PUBLIC LICENSE\n' }),
    ).toContain(
      'the LICENSE in the tarball is not the MPL-2.0 text (does the package have its own LICENSE file?)',
    );
    expect(
      tarballProblems(manifest(), files, {
        licenseText: 'Mozilla Public License Version 2.0\n===',
      }),
    ).toEqual([]);
  });

  it('flags a dependency on a @sovereignfs package that is not published, which npm could not install', () => {
    const published = new Set(['@sovereignfs/thing', '@sovereignfs/other']);
    const found = tarballProblems(
      manifest({ dependencies: { '@sovereignfs/config': '0.0.0', '@sovereignfs/other': '1.0.0' } }),
      files,
      { publishedNames: published },
    );
    expect(found).toEqual([
      'dependencies.@sovereignfs/config is not a published package, so npm could not install it',
    ]);
  });

  it('lets a development dependency be unpublished, because it never ships', () => {
    expect(
      tarballProblems(manifest({ devDependencies: { '@sovereignfs/tsconfig': '0.0.0' } }), files, {
        publishedNames: new Set(),
      }),
    ).toEqual([]);
  });

  it('does not mistake a directory in "files" for a missing file', () => {
    expect(
      tarballProblems(manifest({ files: ['dist', 'docs', 'LICENSE', 'README.md'] }), [
        ...files,
        'package/docs/a.md',
      ]),
    ).toEqual([]);
  });
});

describe('tarballProblems for a tool that is run and not imported', () => {
  const tool = (extra: Partial<PackedManifest> = {}): PackedManifest => ({
    name: '@sovereignfs/cli',
    version: '1.2.3',
    license: 'AGPL-3.0-or-later',
    repository: { type: 'git', url: 'git+https://github.com/sovereignfs/sovereign.git' },
    files: ['dist'],
    bin: { sv: './dist/sv.mjs' },
    ...extra,
  });
  const toolFiles = [
    'package/package.json',
    'package/LICENSE',
    'package/README.md',
    'package/dist/sv.mjs',
  ];
  const facts = {
    kind: 'tool' as const,
    licenseText: '                    GNU AFFERO GENERAL PUBLIC LICENSE\n',
  };

  it('accepts a bin under dist, an AGPL licence, and no exports map', () => {
    expect(tarballProblems(tool(), toolFiles, facts)).toEqual([]);
  });

  it('wants the AGPL licence and its text, and not the MPL', () => {
    expect(tarballProblems(tool({ license: 'MPL-2.0' }), toolFiles, facts)).toContain(
      'the licence is MPL-2.0, not AGPL-3.0-or-later',
    );
    expect(
      tarballProblems(tool(), toolFiles, {
        ...facts,
        licenseText: 'Mozilla Public License Version 2.0',
      }),
    ).toContain(
      'the LICENSE in the tarball is not the AGPL-3.0-or-later text (does the package have its own LICENSE file?)',
    );
  });

  it('wants a bin, that points into dist, at a file that is in the tarball', () => {
    expect(tarballProblems(tool({ bin: undefined }), toolFiles, facts)).toContain(
      'there is no bin',
    );
    expect(tarballProblems(tool({ bin: { sv: './src/main.ts' } }), toolFiles, facts)).toContain(
      './src/main.ts points outside dist/',
    );
    expect(tarballProblems(tool(), toolFiles.slice(0, 3), facts)).toContain(
      './dist/sv.mjs is not in the tarball',
    );
  });

  it('still refuses what never belongs in a tarball', () => {
    expect(tarballProblems(tool(), [...toolFiles, 'package/src/main.ts'], facts)).toContain(
      'src/main.ts is in the tarball: source files do not ship',
    );
  });
});
