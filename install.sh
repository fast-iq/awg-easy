#!/usr/bin/env bash
#
# install.sh — deploy awg-easy (AmneziaWG Web UI + VPN server) in a Docker
# container on a fresh Debian 13 / Ubuntu host.
#
# Idempotent: everything that is already installed is kept and updated to the
# latest version instead of stopping the script. Safe to re-run at any time.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/fast-iq/awg-easy/main/install.sh | bash
#   ./install.sh                # run from a repository checkout
#   ./install.sh --build        # build the image from this checkout (this build)
#   ./install.sh --tag edge     # image tag to deploy (default: latest)
#   ./install.sh --no-upgrade   # skip the full system upgrade
#   ./install.sh --dir /opt/awg # compose project directory
#   AWG_INSECURE=false ./install.sh  # behind a TLS reverse proxy (default: true)
#
set -euo pipefail

AWG_DIR="${AWG_DIR:-/etc/docker/containers/awg-easy}"
COMPOSE_URL="https://raw.githubusercontent.com/fast-iq/awg-easy/main/docker-compose.yml"
IMAGE_REPO="ghcr.io/fast-iq/awg-easy"
IMAGE_TAG="latest"
UI_PORT=51821
WG_PORT=51820
DO_BUILD=0
DO_SYSTEM_UPGRADE=1
# Without TLS (direct http://IP:51821) the session cookie must not be Secure,
# otherwise browsers drop it and the login loops. Set to false only when the
# UI is fronted by a TLS-terminating reverse proxy.
AWG_INSECURE="${AWG_INSECURE:-true}"

log() { printf '\033[1;32m[awg-easy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[awg-easy] warning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[awg-easy] error:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
awg-easy installer

Usage: install.sh [options]
  --build          build the image from the local repository checkout
  --tag TAG        image tag to deploy (default: latest)
  --dir DIR        compose project directory (default: /etc/docker/containers/awg-easy)
  --no-upgrade     skip the full system upgrade
  -h, --help       show this help
EOF
}

for a in "$@"; do
  case "$a" in -h|--help) usage; exit 0 ;; esac
done

# --- privileges -------------------------------------------------------------
# When run as a file, re-exec the whole script as root (no repeated password
# prompts). When piped via curl, validate sudo once and use root_cmd below.
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "run this script as root (sudo not found)"
  SELF="${BASH_SOURCE[0]:-}"
  if [ -n "$SELF" ] && [ -f "$SELF" ]; then
    exec sudo -E bash "$SELF" "$@"
  fi
  sudo -v || die "sudo authentication failed"
fi

root_cmd() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi
}
apt_get() {
  root_cmd env DEBIAN_FRONTEND=noninteractive \
    apt-get -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold -y "$@"
}
apt_update() { root_cmd apt-get update; }
apt_install() { apt_get install "$@"; }

# --- arguments --------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --build) DO_BUILD=1 ;;
    --no-upgrade) DO_SYSTEM_UPGRADE=0 ;;
    --dir) shift; [ $# -gt 0 ] || die "--dir requires a path"; AWG_DIR="$1" ;;
    --tag) shift; [ $# -gt 0 ] || die "--tag requires a tag"; IMAGE_TAG="$1" ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
  shift
done
case "$IMAGE_TAG" in
  ""|*[!A-Za-z0-9._-]*) die "invalid image tag: '$IMAGE_TAG'" ;;
esac
case "$AWG_INSECURE" in
  true|false) ;;
  *) die "AWG_INSECURE must be 'true' or 'false'" ;;
esac

SCRIPT_DIR=""
SCRIPT_PATH="${BASH_SOURCE[0]:-}"
if [ -n "$SCRIPT_PATH" ] && [ -f "$SCRIPT_PATH" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
fi
if [ "$DO_BUILD" -eq 1 ] && [ ! -f "$SCRIPT_DIR/Dockerfile" ]; then
  die "--build requires running install.sh from a checkout that contains a Dockerfile"
fi

# --- OS / architecture detection -------------------------------------------
[ -r /etc/os-release ] || die "cannot detect the OS (/etc/os-release is missing)"
# shellcheck disable=SC1091
. /etc/os-release
RAW_ID="${ID:-unknown}"
OS_CODENAME="${VERSION_CODENAME:-}"
OS_NAME="${PRETTY_NAME:-$RAW_ID}"

DOCKER_REPO_ID=""
case "$RAW_ID" in
  debian|raspbian) DOCKER_REPO_ID=debian ;;
  ubuntu) DOCKER_REPO_ID=ubuntu ;;
  *)
    # derivatives (Linux Mint, Pop!_OS, ...) — use the upstream repo + codename
    case " ${ID_LIKE:-} " in
      *" ubuntu "*) DOCKER_REPO_ID=ubuntu; OS_CODENAME="${UBUNTU_CODENAME:-$OS_CODENAME}" ;;
      *" debian "*) DOCKER_REPO_ID=debian ;;
      *) die "unsupported OS '$OS_NAME' — Debian or Ubuntu is required" ;;
    esac
    ;;
esac
[ -n "$OS_CODENAME" ] || OS_CODENAME="$(lsb_release -sc 2>/dev/null || true)"
[ -n "$OS_CODENAME" ] || die "cannot detect the distribution codename"
ARCH="$(dpkg --print-architecture 2>/dev/null || true)"
case "$ARCH" in
  amd64|arm64) ;;
  *) die "unsupported architecture '${ARCH:-unknown}' (supported: amd64, arm64)" ;;
esac
log "Detected: $OS_NAME ($DOCKER_REPO_ID/$OS_CODENAME, $ARCH)"

if command -v docker >/dev/null 2>&1; then
  root_cmd docker --version 2>/dev/null | grep -qi docker ||
    die "'docker' exists but is not Docker Engine (Podman shim?) — install Docker Engine first"
fi

# --- base packages + system update -----------------------------------------
log "Updating package lists"
apt_update
apt_install ca-certificates curl gnupg

if [ "$DO_SYSTEM_UPGRADE" -eq 1 ]; then
  log "Upgrading system packages to the latest versions (--no-upgrade to skip)"
  apt_get upgrade
else
  log "Skipping system upgrade (--no-upgrade)"
fi

# --- Docker Engine + Compose plugin -----------------------------------------
ensure_docker_repo() {
  # Docker's own installer uses the DEB822 format (docker.sources) — adding
  # docker.list in that case would make apt warn about a duplicate source.
  if [ -f /etc/apt/sources.list.d/docker.sources ]; then
    # drop the duplicate one-line list written by earlier script versions
    if [ -f /etc/apt/sources.list.d/docker.list ] &&
      grep -q "download\.docker\.com" /etc/apt/sources.list.d/docker.list 2>/dev/null; then
      root_cmd rm -f /etc/apt/sources.list.d/docker.list
      log "Removed the duplicate docker.list apt source (keeping docker.sources)"
    fi
    log "Docker apt repository already configured (docker.sources)"
    return 0
  fi
  log "Configuring the official Docker apt repository"
  root_cmd install -m 0755 -d /etc/apt/keyrings
  root_cmd curl -fsSL "https://download.docker.com/linux/${DOCKER_REPO_ID}/gpg" \
    -o /etc/apt/keyrings/docker.asc
  root_cmd chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${DOCKER_REPO_ID} ${OS_CODENAME} stable" |
    root_cmd tee /etc/apt/sources.list.d/docker.list >/dev/null
  apt_update
}

install_compose_binary() {
  local barch
  case "$ARCH" in amd64) barch=x86_64 ;; arm64) barch=aarch64 ;; esac
  log "Installing the Docker Compose plugin binary from GitHub releases"
  root_cmd install -m 0755 -d /usr/local/lib/docker/cli-plugins
  root_cmd curl -fsSL \
    "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${barch}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  root_cmd chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose
}

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine, containerd, Buildx and Compose (latest)"
  ensure_docker_repo
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
elif ! root_cmd docker compose version >/dev/null 2>&1; then
  log "Docker found, Compose v2 plugin missing — installing it"
  if dpkg -s docker.io >/dev/null 2>&1; then
    apt_install docker-compose-v2 2>/dev/null || apt_install docker-compose-plugin 2>/dev/null || true
  else
    ensure_docker_repo
    apt_install docker-compose-plugin 2>/dev/null || true
  fi
  root_cmd docker compose version >/dev/null 2>&1 || install_compose_binary
else
  log "Docker + Compose already installed — updating them to the latest versions"
  if dpkg -s docker.io >/dev/null 2>&1; then
    apt_install docker.io || true  # distro package, repo comes from the OS
  else
    ensure_docker_repo
    apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || true
  fi
fi

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  root_cmd systemctl enable --now docker
else
  warn "systemd not detected — make sure the Docker daemon (dockerd) is running"
fi
for _ in $(seq 1 15); do
  root_cmd docker info >/dev/null 2>&1 && break
  sleep 2
done
root_cmd docker info >/dev/null 2>&1 || die "Docker daemon is not running — check 'journalctl -u docker'"

if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  root_cmd getent group docker >/dev/null 2>&1 || root_cmd groupadd docker
  root_cmd usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  log "User '$SUDO_USER' added to the docker group (log out/in to use docker without sudo)"
fi

# --- compose project --------------------------------------------------------
COMPOSE_FILE="$AWG_DIR/docker-compose.yml"
compose() { root_cmd docker compose -p awg-easy -f "$COMPOSE_FILE" "$@"; }

log "Preparing the compose project in $AWG_DIR"
root_cmd install -m 0755 -d "$AWG_DIR"
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
  root_cmd install -m 0644 "$SCRIPT_DIR/docker-compose.yml" "$COMPOSE_FILE"
elif [ -f "$COMPOSE_FILE" ]; then
  log "Keeping the existing $COMPOSE_FILE"
else
  root_cmd curl -fsSL "$COMPOSE_URL" -o "$COMPOSE_FILE"
fi
root_cmd sed -i -E \
  "s|image:[[:space:]]*${IMAGE_REPO//\//\\/}:.*|image: ${IMAGE_REPO}:${IMAGE_TAG}|" \
  "$COMPOSE_FILE"
# session cookie must not be Secure for plain-HTTP access (see header)
if grep -qE '^[[:space:]]*-[[:space:]]*INSECURE=' "$COMPOSE_FILE"; then
  root_cmd sed -i -E "s|^([[:space:]]*-[[:space:]]*INSECURE=).*|\1${AWG_INSECURE}|" "$COMPOSE_FILE"
elif [ "$AWG_INSECURE" = "true" ]; then
  root_cmd sed -i "/^[[:space:]]*environment:/a\\       - INSECURE=true" "$COMPOSE_FILE"
fi

# --- /dev/net/tun (amneziawg-go userspace fallback) -------------------------
if [ ! -c /dev/net/tun ]; then
  log "Creating the missing /dev/net/tun device node on the host"
  root_cmd mkdir -p /dev/net
  root_cmd modprobe tun 2>/dev/null ||
    root_cmd mknod -m 666 /dev/net/tun c 10 200 2>/dev/null ||
    warn "/dev/net/tun is still missing — the amneziawg-go userspace fallback will not work"
fi
if ! grep -q '/dev/net/tun' "$COMPOSE_FILE"; then
  if grep -qE '^[[:space:]]*cap_add:' "$COMPOSE_FILE"; then
    root_cmd sed -i $'/^[[:space:]]*cap_add:/i\\\n    devices:\\\n      - /dev/net/tun:/dev/net/tun' "$COMPOSE_FILE"
    log "Added the /dev/net/tun device to $COMPOSE_FILE"
  else
    warn "no cap_add found in $COMPOSE_FILE — add 'devices: [/dev/net/tun:/dev/net/tun]' manually for AmneziaWG userspace mode"
  fi
fi

# --- host sysctls (persistent packet forwarding) -----------------------------
log "Enabling packet forwarding on the host"
root_cmd tee /etc/sysctl.d/99-awg-easy.conf >/dev/null <<'EOF'
# awg-easy: packet forwarding for the VPN
net.ipv4.ip_forward=1
net.ipv4.conf.all.src_valid_mark=1
net.ipv6.conf.all.forwarding=1
net.ipv6.conf.default.forwarding=1
EOF
root_cmd sysctl --system >/dev/null 2>&1 ||
  root_cmd sysctl -p /etc/sysctl.d/99-awg-easy.conf >/dev/null 2>&1 ||
  warn "could not apply sysctls automatically — apply them manually"

# --- firewall ---------------------------------------------------------------
if command -v ufw >/dev/null 2>&1 && root_cmd ufw status 2>/dev/null | grep -q "Status: active"; then
  log "UFW is active — opening UDP/${WG_PORT} (VPN) and TCP/${UI_PORT} (Web UI)"
  root_cmd ufw allow "${WG_PORT}/udp" >/dev/null 2>&1 || warn "failed to add UFW rule for UDP/${WG_PORT}"
  root_cmd ufw allow "${UI_PORT}/tcp" >/dev/null 2>&1 || warn "failed to add UFW rule for TCP/${UI_PORT}"
fi

# --- pre-existing container (docker run, old deploy) ------------------------
if root_cmd docker ps -a --filter "name=awg-easy" --format '{{.Names}}' 2>/dev/null | grep -qx "awg-easy"; then
  PROJ="$(root_cmd docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' awg-easy 2>/dev/null || true)"
  if [ "$PROJ" != "awg-easy" ]; then
    warn "a container named 'awg-easy' exists (project '${PROJ:-none}'). If compose reports a name conflict, remove it: docker rm -f awg-easy"
  fi
fi

# --- build or pull + start ---------------------------------------------------
if [ "$DO_BUILD" -eq 1 ]; then
  log "Building ${IMAGE_REPO}:${IMAGE_TAG} from the local checkout"
  root_cmd docker build -t "${IMAGE_REPO}:${IMAGE_TAG}" "$SCRIPT_DIR"
else
  log "Pulling the latest ${IMAGE_REPO}:${IMAGE_TAG} image"
  compose pull
fi
log "Starting the container"
compose up -d

# --- health check ------------------------------------------------------------
log "Waiting for the Web UI on port ${UI_PORT}..."
HEALTHY=0
for _ in $(seq 1 30); do
  if curl -fsSL --max-time 3 -o /dev/null "http://127.0.0.1:${UI_PORT}/api/information" 2>/dev/null; then
    HEALTHY=1
    break
  fi
  sleep 2
done
if [ "$HEALTHY" -ne 1 ]; then
  warn "the Web UI did not answer within 60s — recent container logs:"
  root_cmd docker logs --tail 20 awg-easy >&2 || true
  exit 1
fi

if [ -d "/lib/modules/$(uname -r)" ] &&
  ! find "/lib/modules/$(uname -r)" -name 'amneziawg.ko*' 2>/dev/null | grep -q .; then
  warn "no amneziawg kernel module for kernel $(uname -r) — userspace fallback will be used (see docs/content/advanced/config/amneziawg-kernel-module.md)"
fi

HOST_IP="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)"
HOST_IP="${HOST_IP:-<server-ip>}"

cat <<EOF

============================================================
 awg-easy is up and running
   Web UI:      http://${HOST_IP}:${UI_PORT}
   VPN (UDP):   ${WG_PORT}
   Compose dir: ${AWG_DIR}
   Image:       ${IMAGE_REPO}:${IMAGE_TAG}
   Logs:        docker logs -f awg-easy
   Update:      re-run this script (or: docker compose -p awg-easy -f ${COMPOSE_FILE} pull && docker compose -p awg-easy -f ${COMPOSE_FILE} up -d)
============================================================
EOF
if [ -f /var/run/reboot-required ]; then
  warn "a reboot is required to finish the system upgrade (/var/run/reboot-required)"
fi
if ! command -v ufw >/dev/null 2>&1 ||
  ! root_cmd ufw status 2>/dev/null | grep -q "Status: active"; then
  log "If a firewall runs in front of the host, open UDP/${WG_PORT} and TCP/${UI_PORT}"
fi
