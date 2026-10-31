/** Where the wrapper is installed on the server, and what the deployment key is limited to run (operator-cli §8.3). */
export const WRAPPER_PATH = '/usr/local/sbin/sovereign-receive';

/**
 * The only program the server runs for `sv`: it starts the toolkit’s image with the request and hands it standard input. It does no
 * checking of its own. The request is one argument and reaches the toolkit as one, and the toolkit decides whether it is one it
 * answers, so this has no parsing to get wrong. The deployment key runs it with `--deploy-only`.
 */
export const WRAPPER = `#!/bin/sh
# Installed by sv server bootstrap. Do not edit it: bootstrap writes it again.
set -eu
STATE=/var/lib/sovereign
only=""
if [ "\${1:-}" = "--deploy-only" ]; then
  only="--deploy-only"
  shift
fi
request="\${SSH_ORIGINAL_COMMAND:-$*}"
request="\${request#${WRAPPER_PATH} }"
request="\${request#sovereign-receive }"
image="$(cat "$STATE/toolkit-image")"
exec docker run --rm --interactive --init \\
  --volume /var/run/docker.sock:/var/run/docker.sock --volume "$STATE:$STATE" \\
  --env SV_STATE_DIR="$STATE" "$image" receive $only -- "$request"
`;

/** The line that goes in `authorized_keys` for the deployment key: no shell, no terminal, no forwarding, and one program. */
export function authorizedKeysLine(publicKey: string): string {
  return `restrict,command="${WRAPPER_PATH} --deploy-only" ${publicKey} sovereign-deploy`;
}
