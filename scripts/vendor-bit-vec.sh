#!/usr/bin/env bash
# Cargo cannot unpack bit-vec 0.8.0 in some sandboxes (.vscode in crate). Vendor a stripped copy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${ROOT}/vendor/bit-vec"
CRATE="${ROOT}/vendor/bit-vec-0.8.0.crate"
URL="https://static.crates.io/crates/bit-vec/bit-vec-0.8.0.crate"

if [[ -f "${DEST}/Cargo.toml" ]]; then
  exit 0
fi

mkdir -p "${ROOT}/vendor"
if [[ ! -f "${CRATE}" ]]; then
  echo "Downloading bit-vec 0.8.0 crate…"
  curl -fsSL -o "${CRATE}" "${URL}"
fi

rm -rf "${DEST}"
mkdir -p "${DEST}"
python3 - "${CRATE}" "${DEST}" <<'PY'
import sys, tarfile
from pathlib import Path
crate, dest = Path(sys.argv[1]), Path(sys.argv[2])
with tarfile.open(crate) as tar:
    for m in tar.getmembers():
        if ".vscode" in m.name:
            continue
        parts = m.name.split("/", 1)
        if len(parts) != 2 or not parts[1]:
            continue
        m.name = parts[1]
        tar.extract(m, dest, filter="data")
PY
echo "Vendored bit-vec at ${DEST}"
