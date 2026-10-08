#!/usr/bin/env bash
# Local / agent mirror of .depot/workflows/ci.yml gates.
# Runs from a clean checkout after install. Prints EXIT:<step>=<code> for each step.
set -u
cd "$(dirname "$0")/.."

step() {
  local name="$1"
  shift
  echo ""
  echo "======== ${name} ========"
  set +e
  "$@"
  local code=$?
  set -e
  echo "EXIT:${name}=${code}"
  if [[ "${code}" -ne 0 ]]; then
    echo "CI failed at step: ${name}" >&2
    exit "${code}"
  fi
}

step "install" pnpm install --frozen-lockfile
step "build" pnpm build
step "typecheck" pnpm typecheck
step "lint" pnpm lint
step "test" pnpm test
step "playwright-install" pnpm exec playwright install chromium
step "test:e2e" pnpm test:e2e
step "check:mcp-docs" pnpm check:mcp-docs
step "check:i18n-missing-keys" pnpm run check:i18n-missing-keys

echo ""
echo "CI OK — all steps exit 0"
