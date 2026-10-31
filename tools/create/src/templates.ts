/**
 * What an instance repository starts with (operator-cli §2.1). Every file here belongs to the operator from the first commit:
 * nothing upstream owns is copied in, so an update can never conflict with it. `suite.yml`, `suite.lock` and `secrets.age.yml` are
 * not here: `sv setup` writes them.
 */

/** The launcher. It runs the toolkit this repository pins and nothing else, and installs it from the lockfile if it is missing. */
export const LAUNCHER = `#!/bin/sh
# Runs the toolkit this repository pins (@sovereignfs/cli in package.json), and nothing else.
# It never uses npx, which can fetch an unrelated package of the same name from the registry.
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)

if ! command -v node >/dev/null 2>&1; then
  echo "sv needs Node 24 or newer, and node was not found. Install it from https://nodejs.org." >&2
  exit 2
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 24 ]; then
  echo "sv needs Node 24 or newer, and this is Node $(node -v). Install a newer one from https://nodejs.org." >&2
  exit 2
fi

cli="$here/node_modules/@sovereignfs/cli/dist/sv.mjs"
if [ ! -f "$cli" ]; then
  echo "Installing the toolkit this repository pins (npm ci)..." >&2
  if ! (cd "$here" && npm ci --ignore-scripts --no-audit --no-fund >&2); then
    echo "npm ci failed. Check your network, then run ./sv again." >&2
    exit 1
  fi
fi

SV_ROOT="$here" exec node "$cli" "$@"
`;

export const GITIGNORE = `node_modules/
.DS_Store
# Keys never belong here. The operator's key is kept outside the repository (~/.config/sovereign/age.key).
*.key
age.key
.env
.env.*
`;

export function readme(name: string): string {
  return `# ${name}

A Sovereign instance. Everything that decides what runs is in this repository; everything the server makes for itself (databases,
generated secrets) is on the server, and in your backups.

\`\`\`bash
./sv setup            # the domain, the server, how to deploy
./sv server bootstrap # prepare a fresh machine
./sv push             # check, commit and push
./sv deploy           # put it on the server
\`\`\`

\`./sv\` runs the toolkit pinned in \`package.json\`. To move to a newer release: \`./sv upgrade\`, then review the change.
`;
}

/** `package.json`, pinning the toolkit to an exact version. */
export function packageJson(name: string, cliVersion: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.0.0',
      private: true,
      description: 'A Sovereign instance. Run ./sv.',
      engines: { node: '>=24.15' },
      dependencies: { '@sovereignfs/cli': cliVersion },
    },
    null,
    2,
  )}\n`;
}
