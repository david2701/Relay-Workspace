#!/usr/bin/env bash
# Capture Atención screenshots for iPhone simulator + macOS.
# Primary: XCUITest (XCTAttachment + PNG files under /tmp/relay-apple-screenshots).
# Fallback: simctl (iPhone) / screencapture (Mac).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROJECT="${ROOT}/apps/apple/Relay.xcodeproj"
OUT="${RELAY_SCREENSHOT_DIR:-${ROOT}/artifacts/apple-screenshots}"
TMP_SHOTS="/tmp/relay-apple-screenshots"
mkdir -p "${OUT}" "${TMP_SHOTS}"
export RELAY_SCREENSHOT_DIR="${OUT}"
export RELAY_UI_SCREENSHOTS=1
rm -f "${TMP_SHOTS}"/*.png "${OUT}"/*.png 2>/dev/null || true

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

have_png() {
  local name="$1"
  collect_png "${name}" || true
  [[ -f "${OUT}/${name}.png" ]] && file "${OUT}/${name}.png" | grep -qi 'PNG'
}

echo "=== Screenshot output: ${OUT} (tmp ${TMP_SHOTS}) ==="
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

collect_png iphone-attention-light || true
collect_png iphone-attention-dark || true
collect_png iphone-attention-detail-light || true

if ! have_png iphone-attention-light || ! have_png iphone-attention-dark || ! have_png iphone-attention-detail-light; then
  echo "=== simctl fallback for iPhone screenshots ==="
  xcrun simctl boot "${UDID}" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "${UDID}" -b
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

collect_png mac-attention-light || true
collect_png mac-attention-dark || true

if ! have_png mac-attention-light || ! have_png mac-attention-dark; then
  echo "=== macOS XCUIScreen/screencapture fallback ==="
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
    # Launch via open; args after --args reach the app.
    open "${MAC_APP}" --args -RelayUIScreenshots -RelayAppearance "${appearance}"
    for _ in $(seq 1 40); do
      if pgrep -x RelayMac >/dev/null 2>&1; then
        break
      fi
      sleep 0.25
    done
    # Activate and wait for a window via System Events.
    osascript <<'APPLESCRIPT' >/dev/null 2>&1 || true
tell application "System Events"
  repeat 40 times
    if exists process "RelayMac" then exit repeat
    delay 0.25
  end repeat
  if exists process "RelayMac" then
    tell process "RelayMac"
      set frontmost to true
    end tell
  end if
end tell
APPLESCRIPT
    sleep 3
    local window_id=""
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
      # Capture the main display after bringing the app forward.
      screencapture -x -m "${OUT}/${name}.png"
    fi
    pkill -x RelayMac >/dev/null 2>&1 || true
    echo "mac capture ${name} (window=${window_id:-none})"
  }

  have_png mac-attention-light || capture_mac light mac-attention-light
  have_png mac-attention-dark || capture_mac dark mac-attention-dark
fi

# Reject byte-identical Mac light/dark if both came from a failed fallback.
if have_png mac-attention-light && have_png mac-attention-dark; then
  if cmp -s "${OUT}/mac-attention-light.png" "${OUT}/mac-attention-dark.png"; then
    echo "WARNING: Mac light/dark screenshots are byte-identical; re-running Mac UI test only." >&2
    rm -f "${OUT}/mac-attention-light.png" "${OUT}/mac-attention-dark.png" "${TMP_SHOTS}"/mac-attention-*.png
    xcodebuild \
      -project "${PROJECT}" \
      -scheme RelayMac \
      -destination 'platform=macOS' \
      -configuration Debug \
      CODE_SIGN_IDENTITY=- \
      CODE_SIGNING_REQUIRED=NO \
      test \
      -only-testing:RelayMacUITests/RelayMacScreenshotTests \
      2>&1 | tee /tmp/xcode-mac-screenshots-retry.log || true
    collect_png mac-attention-light || true
    collect_png mac-attention-dark || true
  fi
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
ls -la "${TMP_SHOTS}" || true
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
md5sum "${OUT}"/*.png || md5 "${OUT}"/*.png
