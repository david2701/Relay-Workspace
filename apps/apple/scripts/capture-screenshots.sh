#!/usr/bin/env bash
# Capture Atención screenshots for iPhone simulator + macOS.
# Matrix (6 PNGs):
#   iphone-attention-light|dark|detail-light
#   mac-attention-light|dark|detail-light
# iPhone: XCUITest only (must succeed; no || true / no simctl fallback).
# Mac: in-app ImageRenderer primary path (Mac XCUITest a11y is unreliable on CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROJECT="${ROOT}/apps/apple/Relay.xcodeproj"
OUT="${RELAY_SCREENSHOT_DIR:-${ROOT}/artifacts/apple-screenshots}"
XCRESULT_OUT="${RELAY_XCRESULT_DIR:-${ROOT}/artifacts/apple-xcresults}"
TMP_SHOTS="/tmp/relay-apple-screenshots"
PINNED_IOS_DEVICE="${RELAY_IOS_SIM_DEVICE:-iPhone 17}"
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
  local preferred=(
    "${PINNED_IOS_DEVICE}"
    "iPhone 17"
    "iPhone 17 Pro"
    "iPhone 16"
    "iPhone 16 Pro"
    "iPhone 16e"
    "iPhone 15"
    "iPhone 15 Pro"
  )
  local name line udid runtime_id runtime_name
  pick_from_line() {
    local raw="$1"
    local want_name="$2"
    udid="$(printf '%s\n' "${raw}" | sed -nE 's/.*\(([A-F0-9-]{36})\).*/\1/p')"
    if [[ -z "${udid}" ]]; then
      return 1
    fi
    # Exact device-name match (avoid "iPhone 16" matching "iPhone 16e").
    if [[ -n "${want_name}" ]]; then
      if ! printf '%s\n' "${raw}" | grep -Eq "[[:space:]]${want_name// /[[:space:]]}[[:space:]]*\\("; then
        # Fallback: line starts with the name after indent.
        if ! printf '%s\n' "${raw}" | grep -Fq "${want_name} ("; then
          return 1
        fi
      fi
    else
      want_name="$(printf '%s\n' "${raw}" | sed -nE 's/^[[:space:]]*([^(]+).*/\1/p' | sed -E 's/[[:space:]]+$//')"
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
    echo "${udid}|${want_name}|${runtime_name}"
    return 0
  }
  for name in "${preferred[@]}"; do
    # Match "Name (" but not longer prefixes (iPhone 16 vs iPhone 16e).
    line="$(xcrun simctl list devices available | grep -E "^[[:space:]]*${name} \\(" | grep -E 'Shutdown|Booted' | head -n 1 || true)"
    if [[ -z "${line}" ]]; then
      continue
    fi
    if pick_from_line "${line}" "${name}"; then
      return 0
    fi
  done
  # Last resort: any available iPhone.
  line="$(xcrun simctl list devices available | grep -E '^[[:space:]]*iPhone .+\(' | grep -E 'Shutdown|Booted' | head -n 1 || true)"
  if [[ -n "${line}" ]] && pick_from_line "${line}" ""; then
    return 0
  fi
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

have_png() {
  local name="$1"
  collect_png "${name}" || true
  [[ -f "${OUT}/${name}.png" ]] && file "${OUT}/${name}.png" | grep -qi 'PNG'
}

wait_for_png() {
  local name="$1"
  local seconds="${2:-60}"
  local i
  for i in $(seq 1 "${seconds}"); do
    if have_png "${name}"; then
      return 0
    fi
    sleep 1
  done
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

build_mac_noddebug() {
  local do_clean="${1:-}"
  local stale
  for stale in "${HOME}/Library/Developer/Xcode/DerivedData"/Relay-*/Build/Products/Debug/RelayMac.app; do
    [[ -d "${stale}" ]] || continue
    rm -f "${stale}/Contents/MacOS/"*.debug.dylib 2>/dev/null || true
  done
  local args=(
    -project "${PROJECT}"
    -scheme RelayMac
    -destination 'platform=macOS'
    -configuration Debug
    CODE_SIGNING_ALLOWED=NO
    ENABLE_DEBUG_DYLIB=NO
  )
  if [[ "${do_clean}" == "clean" ]]; then
    xcodebuild "${args[@]}" clean build | tee /tmp/xcode-mac-noddebug.log
  else
    xcodebuild "${args[@]}" build | tee /tmp/xcode-mac-noddebug.log
  fi
  grep -q "BUILD SUCCEEDED" /tmp/xcode-mac-noddebug.log
}

expected=(
  iphone-attention-light.png
  iphone-attention-dark.png
  iphone-attention-detail-light.png
  mac-attention-light.png
  mac-attention-dark.png
  mac-attention-detail-light.png
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

# H4: CODE_SIGNING_ALLOWED=NO (not CODE_SIGN_IDENTITY=- / CODE_SIGNING_REQUIRED=NO).
# Simulator + Mac CI hosts do not need ad-hoc codesign; skipping signing avoids
# leftover RelayMac.debug.dylib codesign failures when ENABLE_DEBUG_DYLIB flips.
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
  echo "::error::RelayiOS UITests failed (exit ${ios_status}); refusing simctl fallback"
  exit "${ios_status}"
fi

for name in \
  iphone-attention-light \
  iphone-attention-dark \
  iphone-attention-detail-light
do
  collect_png "${name}"
done

echo "=== Mac in-app ImageRenderer screenshots (primary; not XCUITest fallback) ==="
# Rebuild a launchable Debug binary (ENABLE_DEBUG_DYLIB=NO) for CI capture.
# Prefer incremental rebuild; fall back to clean if a debug dylib is still present.
echo "Building RelayMac without debug dylib for in-app capture…"
build_mac_noddebug
MAC_APP="$(ls -d "${HOME}/Library/Developer/Xcode/DerivedData"/Relay-*/Build/Products/Debug/RelayMac.app 2>/dev/null | head -n 1 || true)"
if [[ -n "${MAC_APP}" ]] && { grep -q '__debug_blank_executor_main\|RelayMac.debug.dylib' \
  <(otool -L "${MAC_APP}/Contents/MacOS/RelayMac" 2>/dev/null || true) \
  || [[ -f "${MAC_APP}/Contents/MacOS/RelayMac.debug.dylib" ]]; }; then
  echo "Debug dylib still present — clean rebuild…"
  build_mac_noddebug clean
fi
MAC_APP="$(ls -d "${HOME}/Library/Developer/Xcode/DerivedData"/Relay-*/Build/Products/Debug/RelayMac.app 2>/dev/null | head -n 1)"
if [[ -z "${MAC_APP}" ]]; then
  echo "ERROR: RelayMac.app missing after noddebug rebuild" >&2
  exit 1
fi
if grep -q '__debug_blank_executor_main\|RelayMac.debug.dylib' \
  <(otool -L "${MAC_APP}/Contents/MacOS/RelayMac" 2>/dev/null || true) \
  || [[ -f "${MAC_APP}/Contents/MacOS/RelayMac.debug.dylib" ]]; then
  echo "ERROR: RelayMac still links debug dylib after ENABLE_DEBUG_DYLIB=NO build" >&2
  otool -L "${MAC_APP}/Contents/MacOS/RelayMac" >&2 || true
  exit 1
fi
echo "Using ${MAC_APP}"
file "${MAC_APP}/Contents/MacOS/RelayMac" || true
otool -L "${MAC_APP}/Contents/MacOS/RelayMac" | head -20 || true

capture_mac_inapp() {
  local appearance="$1"
  local screen="$2"
  local name="$3"
  local bin="${MAC_APP}/Contents/MacOS/RelayMac"
  pkill -x RelayMac >/dev/null 2>&1 || true
  sleep 1
  rm -f "${TMP_SHOTS}/${name}.png" "${TMP_SHOTS}/${name}.done" "${OUT}/${name}.png"
  RELAY_SCREENSHOT_DIR="${OUT}" RELAY_UI_SCREENSHOTS=1 \
    "${bin}" \
      -RelayUIScreenshots \
      -RelayAppearance "${appearance}" \
      -RelayScreenshotScreen "${screen}" \
    >/tmp/relay-mac-${name}.log 2>&1 &
  local pid=$!
  if wait_for_png "${name}" 60; then
    echo "Mac in-app capture ok: ${name} (pid ${pid})"
  else
    echo "::error::Mac in-app capture timed out: ${name}"
    echo "---- relay-mac-${name}.log ----" >&2
    cat "/tmp/relay-mac-${name}.log" >&2 || true
    ps -p "${pid}" -o pid,stat,command >&2 || true
    kill "${pid}" >/dev/null 2>&1 || true
    pkill -x RelayMac >/dev/null 2>&1 || true
    exit 1
  fi
  kill "${pid}" >/dev/null 2>&1 || true
  pkill -x RelayMac >/dev/null 2>&1 || true
  sleep 1
}

have_png mac-attention-light || capture_mac_inapp light list mac-attention-light
have_png mac-attention-dark || capture_mac_inapp dark list mac-attention-dark
have_png mac-attention-detail-light || capture_mac_inapp light detail mac-attention-detail-light

# Optional Mac XCUITest for diagnostics only — must not soft-pass a failed UITest.
# Skipped by default; set RELAY_MAC_UITEST=1 to run (failure fails the job).
if [[ "${RELAY_MAC_UITEST:-0}" == "1" ]]; then
  echo "=== XCUITest RelayMac screenshots (opt-in; failure fails job) ==="
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
    echo "::error::RelayMac UITests failed (exit ${mac_status}); no silent fallback"
    exit "${mac_status}"
  fi
fi

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
if [[ "${png_count}" -ne 6 ]]; then
  echo "ERROR: expected exactly 6 PNGs, found ${png_count}" >&2
  ls -la "${OUT}" >&2
  exit 1
fi

if cmp -s "${OUT}/mac-attention-light.png" "${OUT}/mac-attention-dark.png"; then
  echo "ERROR: Mac light/dark screenshots are byte-identical" >&2
  exit 1
fi

echo "All required Apple screenshots present (6 PNGs)."
echo "Simulator used: ${IOS_DEVICE_NAME} (${UDID}) runtime=${IOS_RUNTIME}"
md5sum "${OUT}"/*.png 2>/dev/null || md5 "${OUT}"/*.png
