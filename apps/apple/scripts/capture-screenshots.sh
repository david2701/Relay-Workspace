#!/usr/bin/env bash
# Capture Atención screenshots for iPhone simulator + macOS via XCUITest.
# Writes PNGs into RELAY_SCREENSHOT_DIR (default: artifacts/apple-screenshots).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROJECT="${ROOT}/apps/apple/Relay.xcodeproj"
OUT="${RELAY_SCREENSHOT_DIR:-${ROOT}/artifacts/apple-screenshots}"
mkdir -p "${OUT}"
export RELAY_SCREENSHOT_DIR="${OUT}"

resolve_iphone_destination() {
  local preferred=("iPhone 16" "iPhone 16 Pro" "iPhone 15" "iPhone 15 Pro")
  local name line udid
  for name in "${preferred[@]}"; do
    line="$(xcrun simctl list devices available | grep -F "${name} (" | grep -E 'Shutdown|Booted' | head -n 1 || true)"
    if [[ -n "${line}" ]]; then
      udid="$(printf '%s\n' "${line}" | sed -nE 's/.*\(([A-F0-9-]{36})\).*/\1/p')"
      if [[ -n "${udid}" ]]; then
        echo "platform=iOS Simulator,id=${udid}"
        return 0
      fi
    fi
  done
  line="$(xcrun simctl list devices available | grep -E 'iPhone .*\(([A-F0-9-]{36})\)' | grep -E 'Shutdown|Booted' | head -n 1 || true)"
  udid="$(printf '%s\n' "${line}" | sed -nE 's/.*\(([A-F0-9-]{36})\).*/\1/p')"
  if [[ -z "${udid}" ]]; then
    echo "ERROR: no available iPhone simulator found." >&2
    xcrun simctl list devices available >&2 || true
    exit 1
  fi
  echo "platform=iOS Simulator,id=${udid}"
}

echo "=== Screenshot output: ${OUT} ==="
IOS_DEST="$(resolve_iphone_destination)"
echo "iOS destination: ${IOS_DEST}"

echo "=== XCUITest RelayiOS screenshots ==="
set -o pipefail
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
  2>&1 | tee /tmp/xcode-ios-screenshots.log
ios_status=${PIPESTATUS[0]}
if [[ "${ios_status}" -ne 0 ]]; then
  echo "ERROR: RelayiOS UI screenshot tests failed (exit ${ios_status})" >&2
  exit "${ios_status}"
fi

echo "=== XCUITest RelayMac screenshots ==="
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
  2>&1 | tee /tmp/xcode-mac-screenshots.log
mac_status=${PIPESTATUS[0]}
if [[ "${mac_status}" -ne 0 ]]; then
  echo "ERROR: RelayMac UI screenshot tests failed (exit ${mac_status})" >&2
  exit "${mac_status}"
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
