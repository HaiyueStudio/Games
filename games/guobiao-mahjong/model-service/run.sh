#!/usr/bin/env bash
set -euo pipefail
mahjong_service_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
python3 "$mahjong_service_dir/fetch_models.py"
if [[ ! -x "$mahjong_service_dir/.venv/bin/python" ]]; then
  python3 -m venv "$mahjong_service_dir/.venv"
fi
"$mahjong_service_dir/.venv/bin/python" -m pip install -r "$mahjong_service_dir/requirements.txt"
exec "$mahjong_service_dir/.venv/bin/python" "$mahjong_service_dir/server.py" "$@"
