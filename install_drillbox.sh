#!/usr/bin/env bash
set -euo pipefail

# =========================
# DrillBox One-Click Installer (no nginx)
# Ubuntu only
# =========================

# ---- Defaults (override via env vars) ----
REPO_URL="${REPO_URL:-https://github.com/dalaohuuu/drillbox.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/var/www/drillbox}"
PORT="${PORT:-16666}"
DB_PATH="${DB_PATH:-./data/data.db}"
RUN_USER="${RUN_USER:-www-data}"
SERVICE_NAME="${SERVICE_NAME:-drillbox}"

# If APP_PASSCODE not provided, generate a random one
if [[ -z "${APP_PASSCODE:-}" ]]; then
  # 16 chars random (safe-ish). You can change length.
  APP_PASSCODE="$(tr -dc 'A-Za-z0-9!@#%^_-+' </dev/urandom | head -c 16 || true)"
fi

# ---- Helpers ----
log() { echo -e "\033[1;32m[drillbox]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*"; }
die() { echo -e "\033[1;31m[error]\033[0m $*"; exit 1; }

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Please run as root: sudo bash -c 'curl -fsSL ... | bash'"
  fi
}

is_ubuntu() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    [[ "${ID}" == "ubuntu" ]]
  else
    return 1
  fi
}

ensure_user() {
  if ! id -u "${RUN_USER}" >/dev/null 2>&1; then
    log "Creating user: ${RUN_USER}"
    useradd -r -s /usr/sbin/nologin "${RUN_USER}" || true
  fi
}

install_node_20() {
  if command -v node >/dev/null 2>&1; then
    local v
    v="$(node -v | sed 's/^v//')"
    log "Node already installed: v${v}"
    return
  fi

  log "Installing Node.js 20 LTS..."
  export DEBIAN_FRONTEND=noninteractive
  export NEEDRESTART_MODE=a

  apt-get update -y
  apt-get install -y curl ca-certificates gnupg

  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs

  log "Node: $(node -v), npm: $(npm -v)"
}

clone_or_update_repo() {
  log "Preparing install dir: ${INSTALL_DIR}"
  mkdir -p "$(dirname "${INSTALL_DIR}")"

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log "Repo already exists, updating..."
    git -C "${INSTALL_DIR}" fetch --all
    git -C "${INSTALL_DIR}" checkout "${BRANCH}" >/dev/null 2>&1 || true
    git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
  else
    log "Cloning repo: ${REPO_URL} (branch: ${BRANCH})"
    apt-get install -y git
    git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
  fi
}

write_env_file() {
  local env_file="${INSTALL_DIR}/.env"
  if [[ -f "${env_file}" ]]; then
    log ".env already exists, keeping it (won't overwrite)."
    return
  fi

  log "Creating .env"
  cat > "${env_file}" <<EOF
PORT=${PORT}
DB_PATH=${DB_PATH}
APP_PASSCODE=${APP_PASSCODE}
EOF
}

install_deps_and_init() {
  log "Installing npm dependencies..."
  cd "${INSTALL_DIR}"
  npm install

  log "Initializing DB (safe to run multiple times)..."
  npm run initdb

  # If sample file exists, import once only if DB seems empty
  if [[ -f "${INSTALL_DIR}/data/sample_questions.csv" ]]; then
    local count
    count="$(node -e "const Database=require('better-sqlite3');const db=new Database('${INSTALL_DIR}/data/data.db');try{console.log(db.prepare('select count(*) c from questions').get().c)}catch(e){console.log(0)}")"
    if [[ "${count}" == "0" ]]; then
      log "Importing sample questions..."
      npm run import:csv -- ./data/sample_questions.csv
    else
      log "Questions already exist (${count}), skip importing sample."
    fi
  else
    warn "No ./data/sample_questions.csv found; skipping import."
  fi
}

write_systemd_service() {
  log "Setting up systemd service: ${SERVICE_NAME}"

  ensure_user

  # Ensure write permissions for DB
  mkdir -p "${INSTALL_DIR}/data"
  chown -R "${RUN_USER}:${RUN_USER}" "${INSTALL_DIR}"

  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=DrillBox Quiz App
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
User=${RUN_USER}
Group=${RUN_USER}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  systemctl restart "${SERVICE_NAME}"

  log "Service status:"
  systemctl status "${SERVICE_NAME}" --no-pager || true
}

print_result() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  log "✅ Installed successfully!"
  echo "------------------------------------------------------------"
  echo "Install dir : ${INSTALL_DIR}"
  echo "Port        : ${PORT}"
  echo "Passcode    : ${APP_PASSCODE}"
  echo "Service     : ${SERVICE_NAME}"
  echo "Local test  : curl -I http://127.0.0.1:${PORT}/"
  echo "LAN test    : http://${ip}:${PORT}/   (if firewall allows)"
  echo "Logs        : journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
  echo "------------------------------------------------------------"
  echo
  warn "This script does NOT configure nginx/https. Use your existing nginx reverse proxy to https."
}

main() {
  need_root
  is_ubuntu || die "This installer currently supports Ubuntu only."

  install_node_20
  clone_or_update_repo
  write_env_file
  install_deps_and_init
  write_systemd_service
  print_result
}

main "$@"
