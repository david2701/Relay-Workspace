#!/usr/bin/env bash
# Capture Atención screenshots for iPhone simulator + macOS via XCUITest only.
# Matrix: iPhone and Mac × Attention light/dark + detail light/dark (8 PNGs).
# UITest failure fails the job; no simctl/screencapture fallbacks.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROJECT="${ROOT}/apps/apple/Relay.xcodeproj"
OUT="${RELAY_SCREENSHOT_DIR:-${ROOT}/artifacts/apple-screenshots}"
TMP_SHOTS="/tmp/relay-apple-screenshots"
mkdir -p "${OUT}" "${TMP_SHOTS}"
export RELAY_SCREENSHOT_DIR="${OUT}"
export RELAY_UI_SCREENSHOTS=1
rm -f "${TMP_SHOTS}"/*.png "${TMP_SHOTS}"/*.done "${OUT}"/*.png 2>/dev/null || true

resolve_iphone_udid() {
  local preferred=("iPhone 16" "iPhone 16 Pro" "iPhone 15" "iPhone 15 Pro")
  local name line udid
  for name in "${preferred[@]}"; do
    line="$(xcrun simctl list devices available | grep -F "${name} (" | grep -E 'Shutdown|Booted' | head -n 1 || true)"
    if [[ -n "${line}" ]]; then
      udid="$(printf '%s\n' "${line}" | sed -nE 's/.*\(([A-F0-9-]{36})\).*/\1/p')"
      if [[ -n "${udid}" ]]; then
        echo "${udid}"
        return 0
      fi
    fi
  done
  line="$(xcrun simctl list devices available | grep 'iPhone' | grep -E 'Shutdown|Booted' | head -n 1 || true)"
  udid="$(printf '%s\n' "${line}" | sed -nE 's/.*\(([A-F0-9-]{36})\).*/\1/p')"
  if [[ -z "${udid}" ]]; then
    echo "ERROR: no available iPhone simulator found." >&2
    xcrun simctl list devices available >&2 || true
    exit 1
  fi
  echo "${udid}"
}

collect_png() {
  local name="$1"
  if [[ -f "${OUT}/${name}.png" ]]; then
    return 0
  fi
  if [[ -f "${TMP_SHOTS}/${name}.png" ]]; then
    cp "${TMP_SHOTS}/${name}.png" "${OUT}/${name}.png"
    return 0
  fi
  return 1
}

expected=(
  iphone-attention-light.png
  iphone-attention-dark.png
  iphone-attention-detail-light.png
  iphone-attention-detail-dark.png
  mac-attention-light.png
  mac-attention-dark.png
  mac-attention-detail-light.png
  mac-attention-detail-dark.png
)

echo "=== Screenshot output: ${OUT} (tmp ${TMP_SHOTS}) ==="
UDID="$(resolve_iphone_udid)"
IOS_DEST="platform=iOS Simulator,id=${UDID}"
echo "iOS destination: ${IOS_DEST}"

echo "=== XCUITest RelayiOS screenshots ==="
rm -rf /tmp/relay-ios-screenshots.xcresult
set -o pipefail
xcodebuild \
  -project "${PROJECT}" \
  -scheme RelayiOS \
  -destination "${IOS_DEST}" \
  -configuration Debug \
  -resultBundlePath /tmp/relay-ios-screenshots.xcresult \
  CODE_SIGNING_ALLOWED=NO \
  test \
  -only-testing:RelayiOSUITests/RelayiOSScreenshotTests \
  2>&1 | tee /tmp/xcode-ios-screenshots.log

for name in \
  iphone-attention-light \
  iphone-attention-dark \
  iphone-attention-detail-light \
  iphone-attention-detail-dark
do
  collect_png "${name}"
done

echo "=== XCUITest RelayMac screenshots ==="
rm -rf /tmp/relay-mac-screenshots.xcresult
xcodebuild \
  -project "${PROJECT}" \
  -scheme RelayMac \
  -destination 'platform=macOS' \
  -configuration Debug \
  -resultBundlePath /tmp/relay-mac-screenshots.xcresult \
  CODE_SIGNING_ALLOWED=NO \
  ENABLE_DEBUG_DYLIB=NO \
  test \
  -only-testing:RelayMacUITests/RelayMacScreenshotTests \
  2>&1 | tee /tmp/xcode-mac-screenshots.log

for name in \
  mac-attention-light \
  mac-attention-dark \
  mac-attention-detail-light \
  mac-attention-detail-dark
do
  collect_png "${name}"
done

echo "=== PNGs in ${OUT} ==="
ls -la "${OUT}"
ls -la "${TMP_SHOTS}" || true

missing=0
for name in "${expected[@]}"; do
  if [[ ! -f "${OUT}/${name}" ]]; then
    echo "ERROR: required screenshot missing: ${name}" >&2
    missing=1
    continue
  fi
  if ! file "${OUT}/${name}" | grep -qi 'PNG'; then
    echo "ERROR: ${name} is not a PNG" >&2
    missing=1
  fi
done
if [[ "${missing}" -ne 0 ]]; then
  exit 1
fi

png_count="$(find "${OUT}" -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')"
if [[ "${png_count}" -ne 8 ]]; then
  echo "ERROR: expected exactly 8 PNGs, found ${png_count}" >&2
  ls -la "${OUT}" >&2
  exit 1
fi

echo "All required Apple screenshots present (8 PNGs)."
md5sum "${OUT}"/*.png 2>/dev/null || md5 "${OUT}"/*.png
