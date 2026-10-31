import { Refused } from '../errors.js';
import { IMAGE_BY_DIGEST } from './image.js';
import { WRAPPER, WRAPPER_PATH } from './wrapper.js';

const PUBLIC_KEY = /^ssh-ed25519 [A-Za-z0-9+/]+={0,2}$/;

/** The line the script prints with the server’s public key, which `sv server bootstrap` reads. */
export const SERVER_KEY_PREFIX = 'SV_SERVER_KEY=';
/** And the server's SSH host key, which a runner trusts instead of asking. */
export const HOST_KEY_PREFIX = 'SV_HOST_KEY=';
/** And whether it installed the deployment key or left the one that was there. */
export const DEPLOY_KEY_PREFIX = 'SV_DEPLOY_KEY=';

/**
 * The script `sv server bootstrap` runs on a new machine, as root (operator-cli §8.3). It is safe to run again: every step checks
 * before it acts. The two values it is given are checked here against patterns before they are put in, so nothing the operator’s files
 * hold can become more than a word of it.
 */
export function bootstrapScript(input: {
  image: string;
  deployKey?: string;
  rotate?: boolean;
}): string {
  if (!IMAGE_BY_DIGEST.test(input.image)) {
    throw new Refused(
      `${input.image} is not an image by digest.`,
      'Run sv push to refresh suite.lock.',
    );
  }
  if (input.deployKey !== undefined && !PUBLIC_KEY.test(input.deployKey)) {
    throw new Refused('The deployment key is not an ed25519 public key.');
  }
  return `set -eu
STATE=/var/lib/sovereign
IMAGE='${input.image}'
DEPLOY_KEY='${input.deployKey ?? ''}'
ROTATE='${input.rotate ? '1' : '0'}'
say() { printf 'sv: %s\\n' "$*" >&2; }

if [ "$(id -u)" != 0 ]; then
  say "This must run as root, or through sudo without a password."
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  . /etc/os-release
  case "\${ID:-}" in
    debian|ubuntu) ;;
    *)
      say "Docker is not installed, and bootstrap installs it only on Debian and Ubuntu."
      say "Install Docker 24 or newer with Compose 2.20 or newer, then run this again."
      exit 2
      ;;
  esac
  say "Installing Docker from Docker's own apt repository."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq </dev/null
  apt-get install -y -qq ca-certificates curl gnupg </dev/null
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc </dev/null
  chmod a+r /etc/apt/keyrings/docker.asc
  codename="\${UBUNTU_CODENAME:-\${VERSION_CODENAME:-}}"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $codename stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq </dev/null
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin </dev/null
fi

# Some images and provisioning tools stop a package from starting its service, so it is started here, and waited for.
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now docker </dev/null || true
fi
for _ in $(seq 1 30); do
  docker info >/dev/null 2>&1 </dev/null && break
  sleep 1
done

engine="$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
compose="$(docker compose version --short 2>/dev/null || true)"
compose="\${compose#v}"
if [ -z "$engine" ] || [ "\${engine%%.*}" -lt 24 ]; then
  say "Docker 24 or newer is needed, and this machine has \${engine:-none that is running}."
  exit 2
fi
cmajor="\${compose%%.*}"
cminor="\${compose#*.}"; cminor="\${cminor%%.*}"
if [ -z "$compose" ] || [ "$cmajor" -lt 2 ] || { [ "$cmajor" -eq 2 ] && [ "$cminor" -lt 20 ]; }; then
  say "Docker Compose 2.20 or newer is needed, and this machine has \${compose:-none}."
  exit 2
fi

say "Making $STATE."
mkdir -p "$STATE"
chmod 755 "$STATE"
for dir in releases proxy incoming; do mkdir -p "$STATE/$dir"; chmod 755 "$STATE/$dir"; done
for dir in secrets backups; do mkdir -p "$STATE/$dir"; chmod 700 "$STATE/$dir"; done

if [ ! -f /etc/docker/daemon.json ]; then
  say "Widening Docker's address pools, which run out after a few dozen networks."
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'JSON'
{
  "default-address-pools": [{ "base": "172.16.0.0/12", "size": 24 }]
}
JSON
  if command -v systemctl >/dev/null 2>&1; then systemctl restart docker </dev/null; fi
elif ! grep -q default-address-pools /etc/docker/daemon.json; then
  say "Warning: /etc/docker/daemon.json has no default-address-pools, and bootstrap does not edit a file it did not write."
  say 'Add "default-address-pools": [{ "base": "172.16.0.0/12", "size": 24 }] to it and restart Docker.'
fi

say "Pulling the toolkit."
docker pull "$IMAGE" >/dev/null </dev/null
printf '%s\\n' "$IMAGE" > "$STATE/toolkit-image"
cat > ${WRAPPER_PATH} <<'WRAPPER'
${WRAPPER}WRAPPER
chmod 755 ${WRAPPER_PATH}

say "Making the server's key."
key="$(docker run --rm --volume "$STATE:$STATE" --env SV_STATE_DIR="$STATE" "$IMAGE" server-key </dev/null)"
printf '${SERVER_KEY_PREFIX}%s\\n' "$key"

if [ -n "$DEPLOY_KEY" ]; then
  user="\${SUDO_USER:-root}"
  home="$(getent passwd "$user" | cut -d: -f6)"
  file="$home/.ssh/authorized_keys"
  if grep -q ' sovereign-deploy$' "$file" 2>/dev/null && [ "$ROTATE" != 1 ]; then
    say "A deployment key is already installed. Pass --new-deploy-key to replace it."
    printf 'SV_DEPLOY_KEY=kept\\n'
  else
    say "Installing the deployment key for $user."
    mkdir -p "$home/.ssh"
    chmod 700 "$home/.ssh"
    touch "$file"
    temporary="$file.sv.$$"
    grep -v ' sovereign-deploy$' "$file" > "$temporary" || true
    printf '%s\\n' "restrict,command=\\"${WRAPPER_PATH} --deploy-only\\" $DEPLOY_KEY sovereign-deploy" >> "$temporary"
    chmod 600 "$temporary"
    chown "$user" "$temporary"
    mv "$temporary" "$file"
    if [ "$user" != root ]; then usermod -aG docker "$user"; fi
    printf 'SV_DEPLOY_KEY=installed\\n'
  fi
fi
hostkey="$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null || true)"
printf 'SV_HOST_KEY=%s\\n' "$hostkey"
say "Ready."
`;
}
