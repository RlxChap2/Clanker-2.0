#!/usr/bin/env bash
# ════════════════════════════════════════════
#   Clanker 2.0 — Shell Launcher
#   Usage: ./start.sh [TOKEN]
# ════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colors ──────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}  [INFO]${RESET}  $1"; }
success() { echo -e "${GREEN}  [OK]${RESET}    $1"; }
warn()    { echo -e "${YELLOW}  [WARN]${RESET}  $1"; }
error()   { echo -e "${RED}  [ERROR]${RESET} $1"; }

echo ""
echo -e "${CYAN}${BOLD}  ══════════════════════════════════════${RESET}"
echo -e "${CYAN}${BOLD}    Clanker 2.0 — Launcher             ${RESET}"
echo -e "${CYAN}${BOLD}  ══════════════════════════════════════${RESET}"
echo ""

# ── Check Node.js ────────────────────────────
if ! command -v node &> /dev/null; then
  error "Node.js is not installed."
  echo "  Install it from: https://nodejs.org"
  echo ""
  exit 1
fi

NODE_VER=$(node -v)
success "Node.js found: $NODE_VER"

# ── Check npm ────────────────────────────────
if ! command -v npm &> /dev/null; then
  error "npm is not found."
  exit 1
fi

# ── Install deps if needed ───────────────────
if [ ! -d "node_modules/discord.js" ]; then
  info "Installing dependencies..."
  echo ""
  npm install
  echo ""
  success "Dependencies installed."
  echo ""
fi

# ── Token via argument ───────────────────────
#    Usage: ./start.sh YOUR_TOKEN
if [ -n "$1" ]; then
  info "Token passed via argument — saving to .env"
  # Write or replace TOKEN line in .env
  if [ -f ".env" ]; then
    if grep -q "^TOKEN=" .env; then
      sed -i.bak "s/^TOKEN=.*/TOKEN=$1/" .env && rm -f .env.bak
    else
      echo "TOKEN=$1" >> .env
    fi
  else
    echo "TOKEN=$1" > .env
  fi
  success "Token saved to .env"
  echo ""
fi

# ── Set terminal title ───────────────────────
echo -ne "\033]0;Clanker 2.0\007"

# ── Launch CLI ───────────────────────────────
node cli.js

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -ne 0 ]; then
  error "Bot exited with code: $EXIT_CODE"
else
  success "Bot stopped cleanly."
fi
echo ""
