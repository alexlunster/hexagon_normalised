#!/usr/bin/env bash
# Find node (handles nvm, fnm, Homebrew, or PATH) and run the dev server.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi
  # Ensure NVM_DIR is set so nvm.sh can run
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -f "${NVM_DIR}/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "${NVM_DIR}/nvm.sh" 2>/dev/null
    command -v node 2>/dev/null && return
  fi
  # Direct nvm paths (when sourcing didn't run or find a version)
  if [ -d "$HOME/.nvm/versions/node" ]; then
    for dir in "$HOME/.nvm/versions/node"/default "$HOME/.nvm/versions/node"/v*; do
      if [ -x "${dir}/bin/node" ]; then
        echo "${dir}/bin/node"
        return
      fi
    done
    # any version dir
    first=$(ls -1d "$HOME/.nvm/versions/node"/*/bin/node 2>/dev/null | head -1)
    if [ -n "$first" ] && [ -x "$first" ]; then
      echo "$first"
      return
    fi
  fi
  # fnm: try env first, then direct paths
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash 2>/dev/null)" 2>/dev/null
    command -v node 2>/dev/null && return
  fi
  for fnm_base in "$HOME/.local/share/fnm" "$HOME/.fnm" "${FNM_DIR:-}"; do
    [ -z "$fnm_base" ] || [ ! -d "$fnm_base" ] && continue
    first=$(ls -1d "$fnm_base"/node-versions/*/installation/bin/node 2>/dev/null | head -1)
    if [ -n "$first" ] && [ -x "$first" ]; then
      echo "$first"
      return
    fi
  done
  # Homebrew and common system paths
  for path in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$path" ]; then
      echo "$path"
      return
    fi
  done
  return 1
}

NODE=$(find_node) || {
  echo "Node.js not found." >&2
  echo "" >&2
  echo "Install Node.js first:" >&2
  echo "  • From https://nodejs.org (LTS), or" >&2
  echo "  • With Homebrew:  brew install node" >&2
  echo "" >&2
  echo "If you use nvm/fnm, run 'nvm use' or 'fnm use' in this terminal first, then run 'pnpm dev' again." >&2
  exit 1
}

export NODE_ENV=development
exec "$NODE" "$ROOT/node_modules/tsx/dist/cli.mjs" watch server/_core/index.ts
