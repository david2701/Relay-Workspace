#!/usr/bin/env bash
# Capture Atención screenshots for iPhone simulator + macOS via XCUITest only.
# Matrix: iPhone and Mac × Attention light/dark + detail light/dark (8 PNGs).
# UITest failure fails the job; no simctl/screencapture fallbacks.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROJECT="${ROOT}/apps/apple/Relay.xcodeproj"
OUT="${RELAY_SCREENSHOT_DIR:-${ROOT}/artifacts/apple-screenshots}"
XCRESULT_OUT="${RELAY_XCRESULT_DIR:-${ROOT}/artifacts/apple-xcresults}"
TMP_SHOTS="/tmp/relay-apple-screenshots"
# Pin preferred simulator device name (override with RELAY_IOS_SIM_DEVICE).
PINNED_IOS_DEVICE="${RELAY_IOS_SIM_DEVICE:-iPhone 16}"
mkdir -p "${OUT}" "${XCRESULT_OUT}" "${TMP_SHOTS}"
export RELAY_SCREENSHOT_DIR="${OUT}"
export RELAY_UI_SCREENSHOTS=1
rm -f "${TMP_SHOTS}"/*.png "${TMP_SHOTS}"/*.done "${OUT}"/*.png 2>/dev/null || true
rm -rf "${XCRESULT_OUT}"/*.xcresult 2>/dev/null || true

echo "=== Tooling ==="
xcodebuild -version
xcode-select -p
sw_vers

resolve_iphone_device() {
  # Prints: <udid>|<name>|<runtime>
  local preferred=("${PINNED_IOS_DEVICE}" "iPhone 16 Pro" "iPhone 15" "iPhone 15 Pro")
  local name line udid runtime_id runtime_name
  for name in "${preferred[@]}"; do
    line="$(xcrun simctl list devices available | grep -F "${name} (" | grep -E 'Shutdown|Booted' | head -n 1 || true)"
    if [[ -z "${line}" ]]; then
      continue
    fi
    udid="$(printf '%s\n' "${line}" | sed -nE 's/.*\(([A-F0-9-]{36})\).*/\1/p')"
    if [[ -z "${udid}" ]]; then
      continue
    fi
    runtime_id="$(xcrun simctl list devices -j 2>/dev/null | python3 -c "
import json,sys
data=json.load(sys.stdin)
want='${udid}'
for rt, devices in data.get('devices', {}).items():
    for d in devices:
        if d.get('udid')==want:
            print(rt)
            raise SystemExit
" 2>/dev/null || true)"
    runtime_name="${runtime_id##*.}"
    runtime_name="${runtime_name//-/.}"
    if [[ -z "${runtime_name}" ]]; then
      runtime_name="unknown"
    fi
    echo "${udid}|${name}|${runtime_name}"
    return 0
  done
  echo "ERROR: pinned/preferred iPhone simulator not found (wanted ${PINNED_IOS_DEVICE})." >&2
  echo "Available devices:" >&2
  xcrun simctl list devices available >&2 || true
  echo "Available runtimes:" >&2
  xcrun simctl list runtimes >&2 || true
  exit 1
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

preserve_xcresult() {
  local src="$1"
  local dest_name="$2"
  if [[ -d "${src}" ]]; then
    rm -rf "${XCRESULT_OUT}/${dest_name}"
    cp -R "${src}" "${XCRESULT_OUT}/${dest_name}"
    echo "Saved xcresult: ${XCRESULT_OUT}/${dest_name}"
  else
    echo "WARNING: xcresult missing at ${src}" >&2
  fi
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

echo "=== Screenshot output: ${OUT} ==="
echo "=== xcresult output: ${XCRESULT_OUT} ==="
echo "=== Available iOS Simulator runtimes ==="
xcrun simctl list runtimes
echo "=== Available iPhone simulators ==="
xcrun simctl list devices available | grep -E 'iPhone|== ' || true

DEVICE_INFO="$(resolve_iphone_device)"
UDID="${DEVICE_INFO%%|*}"
REST="${DEVICE_INFO#*|}"
IOS_DEVICE_NAME="${REST%%|*}"
IOS_RUNTIME="${REST##*|}"
IOS_DEST="platform=iOS Simulator,id=${UDID}"

echo "=== Pinned iOS Simulator ==="
echo "RELAY_IOS_SIM_DEVICE=${PINNED_IOS_DEVICE}"
echo "Selected device name: ${IOS_DEVICE_NAME}"
echo "Selected device UDID: ${UDID}"
echo "Selected runtime: ${IOS_RUNTIME}"
echo "xcodebuild destination: ${IOS_DEST}"

echo "=== XCUITest RelayiOS screenshots ==="
rm -rf /tmp/relay-ios-screenshots.xcresult
set -o pipefail
set +e
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
ios_status=${PIPESTATUS[0]}
set -e
preserve_xcresult /tmp/relay-ios-screenshots.xcresult relay-ios-screenshots.xcresult
if [[ "${ios_status}" -ne 0 ]]; then
  echo "ERROR: RelayiOS UITests failed (exit ${ios_status})" >&2
  exit "${ios_status}"
fi

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
set +e
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
mac_status=${PIPESTATUS[0]}
set -e
preserve_xcresult /tmp/relay-mac-screenshots.xcresult relay-mac-screenshots.xcresult
if [[ "${mac_status}" -ne 0 ]]; then
  echo "ERROR: RelayMac UITests failed (exit ${mac_status})" >&2
  exit "${mac_status}"
fi

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
echo "=== xcresults in ${XCRESULT_OUT} ==="
ls -la "${XCRESULT_OUT}"

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
echo "Simulator used: ${IOS_DEVICE_NAME} (${UDID}) runtime=${IOS_RUNTIME}"
md5sum "${OUT}"/*.png 2>/dev/null || md5 "${OUT}"/*.png
