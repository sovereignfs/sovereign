/**
 * What an instance repository starts with (operator-cli §2.1), the guide for an agent among it. Every file here belongs to the operator from the first commit:
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
# Backups taken by sv backup, which are never committed: encrypted in .backups/, plain copies in .backups/unsafe/.
.backups/
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

/**
 * `AGENTS.md`: what an AI agent needs to look after the instance when its operator hands that over. Like every file here it is the
 * operator's from the first commit, to change as they see fit; `create` writes it once and nothing writes it again.
 */
export function agentsGuide(name: string): string {
  return `# AGENTS.md

Guidance for an AI agent looking after **${name}**, a [Sovereign](https://github.com/sovereignfs/sovereign) instance, when its operator
asks one to (Claude Code reads it through \`CLAUDE.md\`). The operator stays responsible for the instance: an agent prepares and explains,
and changes the server only when asked, each time. The last section is the operator's own.

## What this repository is

Everything that decides what runs is here; everything the server makes for itself (databases, generated secrets, its own age key) is on
the server and in its backups.

| File                 | What it is                                                                | How it changes                                              |
| -------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| \`suite.yml\`          | What the operator chose: the domain, the server, core's version, the apps | \`./sv\` commands, or by hand and then checked by \`./sv push\` |
| \`suite.lock\`         | The image digests those choices resolved to                               | Only by \`./sv\`; never by hand                               |
| \`secrets.age.yml\`    | Secrets the operator entered, encrypted to the recipients in \`suite.yml\`  | Only by \`./sv secret …\`                                     |
| \`package.json\`, lock | The toolkit this repository pins (\`@sovereignfs/cli\`)                     | \`./sv upgrade\`                                              |
| \`overrides/\`         | Additions to what the toolkit renders                                     | By hand, rarely                                             |
| \`.github/workflows/\` | The deployment workflow, when the instance deploys from GitHub            | \`./sv setup\`                                                |
| \`sv\`                 | The launcher: runs the pinned toolkit and nothing else                    | Never                                                       |

\`./sv push\` commits these files, \`README.md\`, \`.gitignore\` and this guide, and no others. The reference for every command is
[the operator toolkit's specification](https://github.com/sovereignfs/sovereign/blob/main/docs/specs/operator-cli.md); how to run an
instance is [Operating](https://github.com/sovereignfs/sovereign/blob/main/docs/operating.md).

## How a change is made

1. **Look first.** \`./sv status\` (what runs against what the repository says), \`./sv doctor\` (DNS, ports, certificates, versions),
   \`./sv logs [NAME]\`, \`git log\` and \`git diff\`.
2. **Change the repository** with the command for it (\`./sv app add\`, \`./sv app update\`, \`./sv database set\`, \`./sv upgrade\`, …), which
   checks what it writes. Show the operator the diff and say what it will do on the server.
3. **Push and deploy only when the operator says so:** \`./sv push -m "why"\` checks the files, commits them and pushes; \`./sv deploy\`
   applies the pushed commit on the server, backing up first when a version changes.
4. **Check it worked:** \`./sv status\` and \`./sv doctor\` again, and the logs of what changed. If it did not, say so, and offer
   \`./sv rollback\`, which returns the server to the release before.

Every command is run as \`./sv\`, from this repository. Never reach the server around it (\`ssh\`, \`docker\`, \`docker compose\` on the
server, editing its files): what is not in this repository is undone by the next deployment, and is in no backup's record.

## What an agent may do

- **On its own:** read anything here, and run what only reads: \`./sv status\`, \`./sv doctor\`, \`./sv logs\`, \`./sv app list\`,
  \`./sv database\`, \`./sv secret list\` (names, never values), \`./sv backups\`, \`./sv rollback --list\`.
- **Prepared, then shown:** commands that change only this repository: \`./sv app add\`, \`./sv app update\`, \`./sv app remove\` (without
  \`--purge\`), \`./sv app upgrade\`, \`./sv database set\`, \`./sv upgrade\`, and edits to \`suite.yml\`. Nothing reaches the server until it is
  pushed and deployed.
- **Only when the operator asks, for that one time:** \`./sv push\` (it publishes the commit), \`./sv deploy\`, \`./sv rollback\`,
  \`./sv backup\`, \`./sv secret rotate\`, \`./sv server bootstrap\`, \`./sv setup\`, \`./sv key recovery\`. An earlier yes is not a yes for
  the next one.
- **Never, even when asked; the operator runs these themselves:**
  - anything that shows or handles a secret's value: \`./sv app show --secret\`, \`./sv secret set\` (the operator types the value into
    its hidden prompt), \`./sv backup --unencrypted\`, and reading \`~/.config/sovereign/age.key\` or any other age key;
  - anything that destroys data: \`./sv app remove --purge\`, \`./sv restore\`;
  - \`./sv seed\`, whose answer holds passwords;
  - writing \`suite.lock\` or \`secrets.age.yml\` by hand, putting a secret in \`suite.yml\`, or committing a key, an \`.env\` file or a backup.

When a command refuses, read what it says and the hint it gives; do not work around it. A \`production\` instance (\`environment\` in
\`suite.yml\`) has people's accounts and data on it: say so before anything that reaches its server.

## Commits

\`./sv push\` makes the commit. Its message says why, not just what (\`-m "Move Tusk to 0.4.0 for the shared calendar"\`). An agent's
commit ends with its own model-agnostic trailer, such as \`Co-Authored-By: Claude Code <noreply@anthropic.com>\`. Never rewrite what has
been pushed: the server deploys from it.

## Rules of this instance

Say here what is particular to this instance: who uses it, when it may be changed, who to tell, what must never be touched.
`;
}

/** `CLAUDE.md`: Claude Code reads `AGENTS.md` through it, so there is one copy of the guidance. */
export const CLAUDE_GUIDE = `# CLAUDE.md

The guidance for an agent looking after this instance is in [AGENTS.md](AGENTS.md), the one copy every agent reads; Claude Code loads it
through the import below.

@AGENTS.md
`;
