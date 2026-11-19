#!/usr/bin/env bash
# Take the screenshots of the website (docs/images/*.webp) from the installed
# Galley. Galley runs in a virtual X display (Xvfb) with its own data
# directory, so the screenshots do not use the windows or the settings of the
# desktop. Requires Xvfb, xdotool, ImageMagick and Python with numpy and
# matplotlib. The click positions fit a window of 1600x1000 pixels.
#
# Usage: scripts/screenshots/capture.sh [path/to/galley-binary]
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="${1:-${PREFIX:-$HOME/.local}/lib/galley/galley}"
WORK="$(mktemp -d)"
OUT="$REPO/docs/images"
DISP=:77

cleanup() {
  [[ -n "${GALLEY_PID:-}" ]] && kill "$GALLEY_PID" 2>/dev/null || true
  [[ -n "${XVFB_PID:-}" ]] && kill "$XVFB_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

python3 "$REPO/scripts/screenshots/demo.py" "$WORK/demo"
mkdir -p "$WORK/data/galley" "$WORK/config" "$WORK/cache" "$WORK/shots" "$OUT"
cat > "$WORK/data/galley/settings.json" <<'EOF'
{ "zoom": 1.0, "paper_width": 860, "sidebar_left_width": 290,
  "sidebar_right_width": 400, "contents_height": 300, "doc_font": "inter" }
EOF

Xvfb "$DISP" -screen 0 1600x1000x24 >/dev/null 2>&1 &
XVFB_PID=$!
sleep 1
export DISPLAY="$DISP"
XDG_DATA_HOME="$WORK/data" XDG_CONFIG_HOME="$WORK/config" XDG_CACHE_HOME="$WORK/cache" \
  GDK_BACKEND=x11 "$BIN" "$WORK/demo" >/dev/null 2>&1 &
GALLEY_PID=$!
sleep 7

W=$(xdotool search --name Galley | tail -1)
xdotool windowmove "$W" 0 0 windowsize "$W" 1600 1000
sleep 2
shot() { xdotool mousemove 1590 990; sleep 0.5; import -window root "$WORK/shots/$1.png"; }

# Snapshot 02 with its annotations
xdotool mousemove 700 500 click 1
shot main

# Diff of snapshot 02 against snapshot 01
xdotool mousemove 906 53 click 1; sleep 2
shot diff
xdotool mousemove 906 53 click 1; sleep 1

# A new annotation on snapshot 01
xdotool mousemove 70 240 click 1; sleep 2
xdotool mousemove 700 500
for _ in $(seq 1 12); do xdotool click 5; done
sleep 1
xdotool mousemove 866 453 mousedown 1 mousemove 700 465 sleep 0.2 mousemove 478 481 sleep 0.2 mouseup 1
sleep 1
xdotool mousemove 400 508 click 1; sleep 1
xdotool windowfocus "$W" 2>/dev/null || true
xdotool type --delay 20 "Also remove the tiles from Redis."
sleep 1
shot annotate

for f in main diff annotate; do
  convert "$WORK/shots/$f.png" -quality 90 -define webp:method=6 "$OUT/$f.webp"
done
echo "Wrote the screenshots to $OUT"
