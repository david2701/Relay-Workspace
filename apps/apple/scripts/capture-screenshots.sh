#!/usr/bin/env bash
# Capture Atención screenshots for iPhone simulator + macOS.
# Primary: XCUITest (XCTAttachment + PNG files). Fallback: simctl / screencapture.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROJECT="${ROOT}/apps/apple/Relay.xcodeproj"
OUT="${RELAY_SCREENSHOT_DIR:-${ROOT}/artifacts/apple-screenshots}"
mkdir -p "${OUT}"
export RELAY_SCREENSHOT_DIR="${OUT}"
export RELAY_UI_SCREENSHOTS=1

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

have_png() {
  local name="$1"
  [[ -f "${OUT}/${name}.png" ]] && file "${OUT}/${name}.png" | grep -qi 'PNG'
}

echo "=== Screenshot output: ${OUT} ==="
UDID="$(resolve_iphone_udid)"
IOS_DEST="platform=iOS Simulator,id=${UDID}"
echo "iOS destination: ${IOS_DEST}"

echo "=== XCUITest RelayiOS screenshots ==="
set -o pipefail
rm -rf /tmp/relay-ios-screenshots.xcresult
xcodebuild \
  -project "${PROJECT}" \
  -scheme RelayiOS \
  -destination "${IOS_DEST}" \
  -configuration Debug \
  -resultBundlePath /tmp/relay-ios-screenshots.xcresult \
  CODE_SIGN_IDENTITY=- \
  CODE_SIGNING_REQUIRED=NO \
  test \
  -only-testing:RelayiOSUITests/RelayiOSScreenshotTests \
  2>&1 | tee /tmp/xcode-ios-screenshots.log || true

if ! have_png iphone-attention-light || ! have_png iphone-attention-dark || ! have_png iphone-attention-detail-light; then
  echo "=== simctl fallback for iPhone screenshots ==="
  xcrun simctl boot "${UDID}" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "${UDID}" -b
  # Ensure Debug build is installed.
  DERIVED="$(ls -d "${HOME}/Library/Developer/Xcode/DerivedData"/Relay-*/Build/Products/Debug-iphonesimulator/RelayiOS.app 2>/dev/null | head -n 1 || true)"
  if [[ -z "${DERIVED}" ]]; then
    xcodebuild \
      -project "${PROJECT}" \
      -scheme RelayiOS \
      -destination "${IOS_DEST}" \
      -configuration Debug \
      CODE_SIGN_IDENTITY=- \
      CODE_SIGNING_REQUIRED=NO \
      build
    DERIVED="$(ls -d "${HOME}/Library/Developer/Xcode/DerivedData"/Relay-*/Build/Products/Debug-iphonesimulator/RelayiOS.app 2>/dev/null | head -n 1)"
  fi
  xcrun simctl uninstall "${UDID}" app.relay.ios >/dev/null 2>&1 || true
  xcrun simctl install "${UDID}" "${DERIVED}"

  capture_ios() {
    local appearance="$1"
    local screen="$2"
    local name="$3"
    xcrun simctl terminate "${UDID}" app.relay.ios >/dev/null 2>&1 || true
    xcrun simctl ui "${UDID}" appearance "${appearance}"
    xcrun simctl launch "${UDID}" app.relay.ios \
      -RelayUIScreenshots \
      -RelayAppearance "${appearance}" \
      -RelayScreenshotScreen "${screen}"
    # Give SwiftUI a moment to settle with DEBUG samples.
    sleep 4
    xcrun simctl io "${UDID}" screenshot "${OUT}/${name}.png"
    xcrun simctl terminate "${UDID}" app.relay.ios >/dev/null 2>&1 || true
  }

  have_png iphone-attention-light || capture_ios light list iphone-attention-light
  have_png iphone-attention-dark || capture_ios dark list iphone-attention-dark
  have_png iphone-attention-detail-light || capture_ios light detail iphone-attention-detail-light
fi

echo "=== XCUITest RelayMac screenshots ==="
rm -rf /tmp/relay-mac-screenshots.xcresult
xcodebuild \
  -project "${PROJECT}" \
  -scheme RelayMac \
  -destination 'platform=macOS' \
  -configuration Debug \
  -resultBundlePath /tmp/relay-mac-screenshots.xcresult \
  CODE_SIGN_IDENTITY=- \
  CODE_SIGNING_REQUIRED=NO \
  test \
  -only-testing:RelayMacUITests/RelayMacScreenshotTests \
  2>&1 | tee /tmp/xcode-mac-screenshots.log || true

if ! have_png mac-attention-light || ! have_png mac-attention-dark; then
  echo "=== macOS screencapture fallback ==="
  MAC_APP="$(ls -d "${HOME}/Library/Developer/Xcode/DerivedData"/Relay-*/Build/Products/Debug/RelayMac.app 2>/dev/null | head -n 1 || true)"
  if [[ -z "${MAC_APP}" ]]; then
    xcodebuild \
      -project "${PROJECT}" \
      -scheme RelayMac \
      -destination 'platform=macOS' \
      -configuration Debug \
      CODE_SIGN_IDENTITY=- \
      CODE_SIGNING_REQUIRED=NO \
      build
    MAC_APP="$(ls -d "${HOME}/Library/Developer/Xcode/DerivedData"/Relay-*/Build/Products/Debug/RelayMac.app 2>/dev/null | head -n 1)"
  fi

  capture_mac() {
    local appearance="$1"
    local name="$2"
    pkill -x RelayMac >/dev/null 2>&1 || true
    sleep 1
    open "${MAC_APP}" --args -RelayUIScreenshots -RelayAppearance "${appearance}"
    # Wait for the process + first window.
    for _ in $(seq 1 30); do
      if pgrep -x RelayMac >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
    sleep 4
    local wid
    wid="$(osascript -e 'tell application "System Events" to tell process "RelayMac" to get unix id' 2>/dev/null || true)"
    # Prefer window id capture when available.
    local window_id
    window_id="$(osascript <<'APPLESCRIPT' 2>/dev/null || true
tell application "System Events"
  if not (exists process "RelayMac") then return ""
  tell process "RelayMac"
    set frontmost to true
    if (count of windows) is 0 then return ""
    return id of window 1
  end tell
end tell
APPLESCRIPT
)"
    if [[ -n "${window_id}" ]]; then
      screencapture -x -l"${window_id}" "${OUT}/${name}.png"
    else
      # Full display fallback (still a PNG for CI artifact).
      screencapture -x "${OUT}/${name}.png"
    fi
    pkill -x RelayMac >/dev/null 2>&1 || true
    echo "mac capture ${name} (pid hint=${wid:-none}, window=${window_id:-none})"
  }

  have_png mac-attention-light || capture_mac light mac-attention-light
  have_png mac-attention-dark || capture_mac dark mac-attention-dark
fi

expected=(
  iphone-attention-light.png
  iphone-attention-dark.png
  iphone-attention-detail-light.png
  mac-attention-light.png
  mac-attention-dark.png
)

echo "=== PNGs in ${OUT} ==="
ls -la "${OUT}" || true
for name in "${expected[@]}"; do
  if [[ ! -f "${OUT}/${name}" ]]; then
    echo "ERROR: required screenshot missing: ${name}" >&2
    exit 1
  fi
  if ! file "${OUT}/${name}" | grep -qi 'PNG'; then
    echo "ERROR: ${name} is not a PNG" >&2
    exit 1
  fi
done
echo "All required Apple screenshots present."
