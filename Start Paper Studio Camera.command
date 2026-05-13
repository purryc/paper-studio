#!/bin/zsh
set -e

cd "$(dirname "$0")"

echo "Starting Paper Studio from Terminal so macOS can grant Camera permission."
echo "Keep this window open while using Desk View capture."
echo

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export npm_config_scripts_prepend_node_path=true

/usr/local/bin/npm run dev:stop >/dev/null 2>&1 || true
/usr/local/bin/npm run dev
