#!/usr/bin/env bash
# Install Crypto Tracker onto the BUSY Bar (on-device JS app).
# Usage:  ./install_crypto.sh [HOST]
#   HOST defaults to 10.0.4.20 (USB). For Wi-Fi, pass the bar IP and set
#   BAR_TOKEN=<http-access-password> in the environment.
set -euo pipefail

HOST="${1:-10.0.4.20}"
ID="community.crypto_tracker"
DIR="$(cd "$(dirname "$0")/$ID" && pwd)"

AUTH=()
if [[ -n "${BAR_TOKEN:-}" ]]; then AUTH=(-H "X-API-Token: ${BAR_TOKEN}"); fi

upload() { # <relative-path>
  local rel="$1"
  echo "  upload $rel"
  curl -fsS ${AUTH[@]+"${AUTH[@]}"} -X POST \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@${DIR}/${rel}" \
    "http://${HOST}/api/assets/upload?application_name=${ID}&file=${rel}" >/dev/null
}

echo "Installing ${ID} to ${HOST}"

echo "- wiping previous copy (ignore errors if first install)"
curl -fsS ${AUTH[@]+"${AUTH[@]}"} -X DELETE \
  "http://${HOST}/api/assets/upload?application_name=${ID}" >/dev/null || true

echo "- uploading files"
# upload every file in the package, preserving its relative path
while IFS= read -r abs; do
  rel="${abs#"$DIR"/}"
  upload "$rel"
done < <(find "$DIR" -type f ! -name '.DS_Store' | sort)

echo "- enabling JS apps in the Apps menu"
curl -fsS ${AUTH[@]+"${AUTH[@]}"} -X POST \
  "http://${HOST}/api/storage/mkdir?path=/ext/apps_data/apps_menu" >/dev/null || true
printf '1' | curl -fsS ${AUTH[@]+"${AUTH[@]}"} -X POST \
  -H "Content-Type: application/octet-stream" --data-binary @- \
  "http://${HOST}/api/storage/write?path=/ext/apps_data/apps_menu/js_apps_enabled" >/dev/null

echo
echo "Done. On the bar: flip the mode switch to Apps -> Crypto Tracker -> Start."
echo "Turn the encoder to switch coins; press OK to force a refresh."
