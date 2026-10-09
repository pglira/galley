#!/usr/bin/env bash
# Builds Galley in release mode and installs it for the current user:
#
#   bin/galley                            launcher, starts Galley detached from the terminal
#   lib/galley/galley                     the binary
#   share/applications/galley.desktop     desktop entry (Linux), so Galley shows in the app menu
#   share/icons/hicolor/*/apps/galley.png icons (Linux)
#
# All paths are below $PREFIX (default: ~/.local).
#
# Usage: scripts/install.sh [--no-build] [--no-desktop] [--uninstall]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${PREFIX:-$HOME/.local}"
BIN_DIR="$PREFIX/bin"
LIB_DIR="$PREFIX/lib/galley"
APP_DIR="$PREFIX/share/applications"
ICON_DIR="$PREFIX/share/icons/hicolor"

build=1
desktop=1
uninstall=0
for arg in "$@"; do
  case "$arg" in
    --no-build) build=0 ;;
    --no-desktop) desktop=0 ;;
    --uninstall) uninstall=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "error: unknown option $arg" >&2; exit 1 ;;
  esac
done

refresh_caches() {
  if command -v update-desktop-database >/dev/null; then update-desktop-database -q "$APP_DIR" || true; fi
}

if [[ $uninstall == 1 ]]; then
  rm -f "$BIN_DIR/galley" "$APP_DIR/galley.desktop"
  rm -rf "$LIB_DIR"
  rm -f "$ICON_DIR/128x128/apps/galley.png" "$ICON_DIR/512x512/apps/galley.png"
  refresh_caches
  echo "Galley is uninstalled from $PREFIX."
  exit 0
fi

if [[ $build == 1 ]]; then
  (cd "$ROOT" && pnpm install --frozen-lockfile && pnpm tauri build --no-bundle)
fi

BINARY="$ROOT/src-tauri/target/release/galley"
if [[ ! -x "$BINARY" ]]; then
  echo "error: $BINARY does not exist. Run without --no-build." >&2
  exit 1
fi

install -Dm755 "$BINARY" "$LIB_DIR/galley"

# The launcher makes relative path arguments absolute, then starts Galley in
# the background, so that the terminal is free at once.
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/galley" <<LAUNCHER
#!/usr/bin/env bash
args=()
for arg in "\$@"; do
  if [[ "\$arg" != -* && -e "\$arg" ]]; then
    args+=("\$(realpath "\$arg")")
  else
    args+=("\$arg")
  fi
done
nohup "$LIB_DIR/galley" "\${args[@]}" >/dev/null 2>&1 &
disown >/dev/null 2>&1 || true
LAUNCHER
chmod 755 "$BIN_DIR/galley"
echo "Installed: $BIN_DIR/galley"

if [[ $desktop == 1 && "$(uname -s)" == "Linux" ]]; then
  install -Dm644 "$ROOT/src-tauri/icons/128x128.png" "$ICON_DIR/128x128/apps/galley.png"
  install -Dm644 "$ROOT/src-tauri/icons/icon.png" "$ICON_DIR/512x512/apps/galley.png"
  mkdir -p "$APP_DIR"
  cat > "$APP_DIR/galley.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Galley
GenericName=Report Reviewer
Comment=Review Markdown reports from AI agents
Exec="$LIB_DIR/galley" %f
Icon=galley
Terminal=false
Categories=Office;Viewer;
StartupWMClass=galley
DESKTOP
  refresh_caches
  echo "Installed: $APP_DIR/galley.desktop"
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Note: $BIN_DIR is not on your PATH." ;;
esac
