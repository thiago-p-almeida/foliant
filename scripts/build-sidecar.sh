#!/usr/bin/env bash
# Empacota foliant.py com PyInstaller e copia o binário resultante para
# desktop/src-tauri/binaries/ com o sufixo de target triple que o Tauri
# espera para um external binary (sidecar). Ver desktop/src-tauri/tauri.conf.json
# (bundle.externalBin) e docs/tauri sidecar.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET_TRIPLE="$(rustc --print host-tuple)"
DEST_DIR="desktop/src-tauri/binaries"

source .venv/bin/activate
pyinstaller --onefile --name foliant-core foliant.py

mkdir -p "$DEST_DIR"
cp "dist/foliant-core" "$DEST_DIR/foliant-core-${TARGET_TRIPLE}"
chmod +x "$DEST_DIR/foliant-core-${TARGET_TRIPLE}"

echo "Sidecar pronto: $DEST_DIR/foliant-core-${TARGET_TRIPLE}"
