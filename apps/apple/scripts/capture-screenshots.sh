#!/usr/bin/env bash
# Capture Atención screenshots for iPhone simulator + macOS.
# iPhone: XCUITest then simctl fallback.
# Mac: DEBUG in-app CGWindow capture (no Accessibility TCC), then XCUITest fallback.
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

have_png() {
  local name="$1"
  collect_png "${name}" || true
  [[ -f "${OUT}/${name}.png" ]] && file "${OUT}/${name}.png" | grep -qi 'PNG'
}

wait_for_png() {
  local name="$1"
  local seconds="${2:-40}"
  local i
  for i in $(seq 1 "${seconds}"); do
    if have_png "${name}"; then
      return 0
    fi
    sleep 1
  done
  return 1
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

echo "=== Mac in-app window screenshots ==="
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

capture_mac_inapp() {
  local appearance="$1"
  local name="mac-attention-${appearance}"
  local bin="${MAC_APP}/Contents/MacOS/RelayMac"
  pkill -x RelayMac >/dev/null 2>&1 || true
  sleep 1
  rm -f "${TMP_SHOTS}/${name}.png" "${TMP_SHOTS}/${name}.done" "${OUT}/${name}.png"
  # Launch binary directly so RELAY_SCREENSHOT_DIR is inherited.
  RELAY_SCREENSHOT_DIR="${OUT}" RELAY_UI_SCREENSHOTS=1 \
    "${bin}" -RelayUIScreenshots -RelayAppearance "${appearance}" \
    >/tmp/relay-mac-${appearance}.log 2>&1 &
  local pid=$!
  if wait_for_png "${name}" 45; then
    echo "Mac in-app capture ok: ${name} (pid ${pid})"
  else
    echo "Mac in-app capture timed out: ${name}" >&2
    echo "---- relay-mac-${appearance}.log ----" >&2
    tail -50 "/tmp/relay-mac-${appearance}.log" >&2 || true
  fi
  kill "${pid}" >/dev/null 2>&1 || true
  pkill -x RelayMac >/dev/null 2>&1 || true
  sleep 1
}

have_png mac-attention-light || capture_mac_inapp light
have_png mac-attention-dark || capture_mac_inapp dark

if ! have_png mac-attention-light || ! have_png mac-attention-dark; then
  echo "=== XCUITest RelayMac screenshots (fallback) ==="
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

if cmp -s "${OUT}/mac-attention-light.png" "${OUT}/mac-attention-dark.png"; then
  echo "ERROR: Mac light/dark screenshots are byte-identical" >&2
  exit 1
fi

echo "All required Apple screenshots present."
md5sum "${OUT}"/*.png 2>/dev/null || md5 "${OUT}"/*.png
