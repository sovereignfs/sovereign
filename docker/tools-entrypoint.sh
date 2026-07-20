#!/bin/sh
# Entrypoint for the `tools` image (see Dockerfile's `tools` stage).
#
# The tools container runs as root — unlike the runtime/auth runner images,
# it never serves traffic and only exists for the duration of an
# operator-invoked one-off command (`sv db encrypt`, `sv user reset-mfa`,
# etc.), so root is the simplest way to guarantee read/write access to a
# named volume regardless of which UID created it.
#
# The one thing root breaks: files it creates or rewrites land owned by
# root:root, which the non-root runner/auth containers (uid `nextjs`) can no
# longer read on their next start. So this wrapper snapshots the data
# directory's existing ownership before running the command and restores it
# afterward — correct regardless of what UID actually created those files,
# no hardcoded/guessed UID needed.
set -e

DATA_DIR="${SOVEREIGN_DATA_DIR:-/app/data}"

OWNER="0:0"
if [ -d "$DATA_DIR" ]; then
  OWNER=$(stat -c '%u:%g' "$DATA_DIR")
fi

set +e
"$@"
STATUS=$?
set -e

if [ -d "$DATA_DIR" ]; then
  chown -R "$OWNER" "$DATA_DIR"
fi

exit "$STATUS"
