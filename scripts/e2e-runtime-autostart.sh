#!/usr/bin/env bash
# E2E: open .app with runtimeAutostart, wait until sidecar engine is ready.
set -euo pipefail

APP="${1:-/tmp/orcAI-Desktop_0.1.22_aarch64.app}"
TIMEOUT_S="${E2E_TIMEOUT_S:-120}"
PREF_DIR="${HOME}/Library/Application Support/ch.ethz.orcai.desktop"
PREF_FILE="${PREF_DIR}/preferences.json"
LOG="${HOME}/Library/Logs/ch.ethz.orcai.desktop/sidecar.log"

if [[ ! -d "${APP}" ]]; then
  echo "E2E FAIL: app not found: ${APP}" >&2
  exit 1
fi

echo "=== E2E runtime autostart: ${APP} ==="

# Stop leftovers
killall orcai-desktop 2>/dev/null || true
pkill -f 'orcai_desktop_sidecar\.main' 2>/dev/null || true
sleep 1

mkdir -p "${PREF_DIR}"
python3 - <<'PY'
import json
from pathlib import Path
p = Path.home() / "Library/Application Support/ch.ethz.orcai.desktop/preferences.json"
prefs = {}
if p.exists():
    try:
        prefs = json.loads(p.read_text())
    except Exception:
        prefs = {}
inner = prefs.get("preferences") if isinstance(prefs.get("preferences"), dict) else prefs
if not isinstance(inner, dict):
    inner = {}
inner["runtimeAutostart"] = True
inner["computeDevice"] = inner.get("computeDevice") or "cpu"
inner["locale"] = inner.get("locale") or "ru"
# Keep file shape used by the app (wrapped or flat).
if "preferences" in prefs and isinstance(prefs["preferences"], dict):
    prefs["preferences"] = inner
else:
    prefs = {"preferences": inner}
p.write_text(json.dumps(prefs, indent=2) + "\n")
print("preferences runtimeAutostart=true")
PY

MARK="E2E_MARK_$(date +%s)"
echo "=== ${MARK} ===" >> "${LOG}"

open "${APP}"
echo "opened; waiting up to ${TIMEOUT_S}s for engine ready…"

deadline=$((SECONDS + TIMEOUT_S))
ready=0
port=""
while (( SECONDS < deadline )); do
  # Find listening orcai_desktop_sidecar / Python on localhost
  while read -r listen_port; do
    [[ -z "${listen_port}" ]] && continue
    health="$(curl -sf --max-time 2 "http://127.0.0.1:${listen_port}/health" || true)"
    if [[ -n "${health}" ]] && echo "${health}" | grep -q '"engine":"ready"'; then
      caps="$(curl -sf --max-time 10 "http://127.0.0.1:${listen_port}/v1/capabilities" || true)"
      if echo "${caps}" | grep -q '"orcai_installed":\s*true'; then
        port="${listen_port}"
        ready=1
        break 2
      fi
    fi
    if [[ -n "${health}" ]]; then
      echo "  :${listen_port} ${health}"
    fi
  done < <(/usr/sbin/lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/orcai-desktop|Python/{print $9}' | sed -n 's/.*://p' | sort -u)
  sleep 2
done

if [[ "${ready}" -ne 1 ]]; then
  echo "E2E FAIL: engine not ready within ${TIMEOUT_S}s" >&2
  echo "---- log after mark ----" >&2
  awk -v m="${MARK}" '$0 ~ m{p=1} p' "${LOG}" | tail -n 80 >&2
  # disable autostart again
  python3 - <<'PY'
import json
from pathlib import Path
p = Path.home() / "Library/Application Support/ch.ethz.orcai.desktop/preferences.json"
prefs = json.loads(p.read_text())
inner = prefs.get("preferences", prefs)
if isinstance(inner, dict):
    inner["runtimeAutostart"] = False
if "preferences" in prefs:
    prefs["preferences"] = inner
p.write_text(json.dumps(prefs, indent=2) + "\n")
PY
  exit 1
fi

echo "E2E PASS: engine ready on :${port}"
curl -sf "http://127.0.0.1:${port}/health"; echo
curl -sf --max-time 10 "http://127.0.0.1:${port}/v1/capabilities" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("orcai_installed",d.get("orcai_installed"),"tf",d.get("tensorflow_version"))'

# Restore manual-start preference for the user
python3 - <<'PY'
import json
from pathlib import Path
p = Path.home() / "Library/Application Support/ch.ethz.orcai.desktop/preferences.json"
prefs = json.loads(p.read_text())
inner = prefs.get("preferences", prefs)
if isinstance(inner, dict):
    inner["runtimeAutostart"] = False
if "preferences" in prefs:
    prefs["preferences"] = inner
p.write_text(json.dumps(prefs, indent=2) + "\n")
print("preferences runtimeAutostart=false (restored)")
PY

exit 0
