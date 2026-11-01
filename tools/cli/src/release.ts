/**
 * What this release of the toolkit supports and uses (operator-cli §5). A toolkit that does not support the instance's core version
 * or `schema` refuses, and names the version that does.
 */
export const RELEASE = {
  /** The toolkit's own version: the one in `package.json`, written here so a test can hold the two together. */
  version: '0.4.0',
  /** The `schema` versions of `suite.yml`, `suite.lock` and `secrets.age.yml` it reads. */
  schemas: [1],
  /** The core versions it can deploy, as an npm-style range. */
  core: '>=0.49.0 <1.0.0',
  /** The newest core it was made for, which `sv setup` writes. */
  newestCore: '0.83.0',
  /** The oldest app manifest version it reads, and the newest. */
  manifests: [1],
  images: {
    /** The toolkit's own image, which runs `sv apply` on the server (operator-cli §6). */
    cli: 'ghcr.io/sovereignfs/cli',
    core: 'ghcr.io/sovereignfs/sovereign',
    database: 'postgres',
    proxy: 'caddy:2.10',
    /** The inbox that catches mail on a development or staging instance (operator-cli §6.4.2). */
    mail: 'axllent/mailpit:v1.33.0',
  },
  /** The PostgreSQL major version `sv setup` writes. */
  database: '18',
} as const;

/** The label an app's image carries its manifest in (contracts/app-manifest.md §1). */
export const MANIFEST_LABEL = 'io.github.sovereignfs.app-manifest';
