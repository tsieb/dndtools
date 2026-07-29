#!/usr/bin/env bash
set -Eeuo pipefail

APK_PATH=${1:?usage: scripts/android-emulator-acceptance.sh path/to/app.apk}
PACKAGE_ID=${ANDROID_PACKAGE_ID:-com.dndtools.gm}
MAIN_ACTIVITY=${ANDROID_MAIN_ACTIVITY:-.MainActivity}
COMPONENT="$PACKAGE_ID/$MAIN_ACTIVITY"
APKSIGNER=${ANDROID_APKSIGNER:-${ANDROID_HOME:?ANDROID_HOME is required}/build-tools/36.0.0/apksigner}
NETWORK_DISABLED=0
PRIVATE_ACCESS=''
PRIVATE_ROOT="/data/user/0/$PACKAGE_ID"

case "$PACKAGE_ID" in
	*[!A-Za-z0-9._]*) echo "invalid Android package id: $PACKAGE_ID" >&2; exit 2 ;;
esac

fail() {
	echo "Android emulator acceptance failed: $*" >&2
	adb shell dumpsys activity activities 2>/dev/null | tail -120 >&2 || true
	adb logcat -d -t 300 '*:E' >&2 || true
	exit 1
}

step() {
	printf 'Android acceptance: %s\n' "$1"
}

cleanup() {
	if [[ "$NETWORK_DISABLED" == 1 ]]; then
		adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
		adb shell svc data enable >/dev/null 2>&1 || true
		adb shell svc wifi enable >/dev/null 2>&1 || true
	fi
	adb shell settings put system accelerometer_rotation 1 >/dev/null 2>&1 || true
	adb shell settings put system user_rotation 0 >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_pid() {
	local pid=''
	for _ in {1..30}; do
		pid=$(adb shell pidof "$PACKAGE_ID" 2>/dev/null | tr -d '\r' || true)
		if [[ -n "$pid" ]]; then
			printf '%s\n' "$pid"
			return 0
		fi
		sleep 1
	done
	return 1
}

wait_until_not_foreground() {
	local activities=''
	for _ in {1..20}; do
		activities=$(adb shell dumpsys activity activities 2>/dev/null || true)
		if ! grep -Eq "(mResumedActivity|topResumedActivity).*${PACKAGE_ID}" <<<"$activities"; then
			return 0
		fi
		sleep 1
	done
	return 1
}

wait_until_foreground() {
	local activities=''
	for _ in {1..20}; do
		activities=$(adb shell dumpsys activity activities 2>/dev/null || true)
		if grep -Eq "(mResumedActivity|topResumedActivity).*${PACKAGE_ID}" <<<"$activities"; then
			return 0
		fi
		sleep 1
	done
	return 1
}

dump_ui() {
	adb shell uiautomator dump /sdcard/dndtools-window.xml >/dev/null 2>&1 || return 1
	adb exec-out cat /sdcard/dndtools-window.xml 2>/dev/null | tr -d '\r'
}

wait_for_ui_text() {
	local expected=$1
	local expected_folded=${expected,,}
	local ui=''
	for _ in {1..45}; do
		ui=$(dump_ui || true)
		if [[ "${ui,,}" == *"$expected_folded"* ]]; then
			return 0
		fi
		sleep 1
	done
	return 1
}

wait_for_ui_text_absent() {
	local unexpected=$1
	local unexpected_folded=${unexpected,,}
	local ui=''
	for _ in {1..20}; do
		ui=$(dump_ui || true)
		if [[ "${ui,,}" != *"$unexpected_folded"* ]]; then
			return 0
		fi
		sleep 1
	done
	return 1
}

tap_ui_button() {
	local label=$1
	local node bounds left top right bottom
	node=$(dump_ui | sed 's/></>\n</g' | grep -F 'class="android.widget.Button"' \
		| grep -F "$label" | tail -1 || true)
	[[ -n "$node" ]] || return 1
	bounds=$(sed -n 's/.*bounds="\[\([0-9][0-9]*\),\([0-9][0-9]*\)\]\[\([0-9][0-9]*\),\([0-9][0-9]*\)\]".*/\1 \2 \3 \4/p' <<<"$node")
	read -r left top right bottom <<<"$bounds"
	[[ -n "${bottom:-}" ]] || return 1
	adb shell input tap "$(((left + right) / 2))" "$(((top + bottom) / 2))"
	sleep 0.25
}

# Tap any accessibility node containing the label (class-agnostic — the WebView surfaces
# radio/option roles with varying native classes, unlike the Button-only helper above).
tap_ui_node() {
	local label=$1
	local node bounds left top right bottom
	node=$(dump_ui | sed 's/></>\n</g' | grep -F "$label" | grep -F 'bounds="[' | tail -1 || true)
	[[ -n "$node" ]] || return 1
	bounds=$(sed -n 's/.*bounds="\[\([0-9][0-9]*\),\([0-9][0-9]*\)\]\[\([0-9][0-9]*\),\([0-9][0-9]*\)\]".*/\1 \2 \3 \4/p' <<<"$node")
	read -r left top right bottom <<<"$bounds"
	[[ -n "${bottom:-}" ]] || return 1
	adb shell input tap "$(((left + right) / 2))" "$(((top + bottom) / 2))"
	sleep 0.25
}

ui_contains_text() {
	local expected_folded=${1,,}
	local ui=''
	ui=$(dump_ui || true)
	[[ "${ui,,}" == *"$expected_folded"* ]]
}

tap_ui_button_until_text() {
	local label=$1
	local expected=$2
	for _ in {1..5}; do
		ui_contains_text "$expected" && return 0
		tap_ui_button "$label" || true
		sleep 0.5
		ui_contains_text "$expected" && return 0
	done
	return 1
}

# Android exposes HTML selects and their native option rows with different widget classes across
# WebView and API revisions. CheckedTextView option rows report clickable=false even though their
# parent list handles taps, so accept those enabled named rows alongside explicitly clickable nodes.
# Coordinates still come from the matching accessibility node, never from a fixed screen position.
tap_ui_control() {
	local label=$1
	local node bounds left top right bottom
	node=$(dump_ui | sed 's/></>\n</g' \
		| grep -E 'clickable="true"|class="android.widget.CheckedTextView"' \
		| grep -F 'enabled="true"' | grep -F "$label" | tail -1 || true)
	[[ -n "$node" ]] || return 1
	bounds=$(sed -n 's/.*bounds="\[\([0-9][0-9]*\),\([0-9][0-9]*\)\]\[\([0-9][0-9]*\),\([0-9][0-9]*\)\]".*/\1 \2 \3 \4/p' <<<"$node")
	read -r left top right bottom <<<"$bounds"
	[[ -n "${bottom:-}" ]] || return 1
	adb shell input tap "$(((left + right) / 2))" "$(((top + bottom) / 2))"
	sleep 0.25
}

wait_for_ui_control_enabled() {
	local label=$1
	local node=''
	for _ in {1..45}; do
		node=$(dump_ui | sed 's/></>\n</g' | grep -F 'clickable="true"' \
			| grep -F 'enabled="true"' | grep -F "$label" | tail -1 || true)
		if [[ -n "$node" ]]; then
			return 0
		fi
		sleep 1
	done
	return 1
}

launch_app() {
	local output
	output=$(adb shell am start -W -n "$COMPONENT" | tr -d '\r')
	grep -q 'Status: ok' <<<"$output" || fail "activity launch did not report Status: ok"
	wait_for_pid >/dev/null || fail "app process did not start"
}

private_path_exists() {
	local path=$1
	if [[ "$PRIVATE_ACCESS" == run-as ]]; then
		adb shell "run-as $PACKAGE_ID sh -c 'test -e \"$path\"'" >/dev/null 2>&1
	else
		adb shell "test -e \"$PRIVATE_ROOT/$path\"" >/dev/null 2>&1
	fi
}

[[ -f "$APK_PATH" ]] || fail "APK does not exist: $APK_PATH"
adb get-state >/dev/null 2>&1 || fail 'adb device is unavailable'
SIGNATURE_OUTPUT=$("$APKSIGNER" verify --verbose --print-certs "$APK_PATH") \
	|| fail 'APK signature verification failed'
if [[ -n "${ANDROID_EXPECTED_SIGNER_SHA256:-}" ]]; then
	EXPECTED_SIGNER=$(tr '[:upper:]' '[:lower:]' <<<"${ANDROID_EXPECTED_SIGNER_SHA256//:/}" | tr -d '[:space:]')
	ACTUAL_SIGNER=$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' <<<"$SIGNATURE_OUTPUT" \
		| head -1 | tr '[:upper:]' '[:lower:]' | tr -d ':[:space:]')
	[[ -n "$ACTUAL_SIGNER" && "$ACTUAL_SIGNER" == "$EXPECTED_SIGNER" ]] \
		|| fail 'APK signer does not match the permanent dndtools-alpha certificate'
fi

# Instrumentation may have installed the debug target. Remove both packages so the alpha-signed
# release install is a true fresh install and cannot silently inherit debug-signed state.
adb uninstall "$PACKAGE_ID.test" >/dev/null 2>&1 || true
adb uninstall "$PACKAGE_ID" >/dev/null 2>&1 || true
adb install --no-streaming "$APK_PATH" | grep -q 'Success' || fail 'fresh APK installation failed'
step 'fresh signed install and cold launch'
launch_app

# Fresh installs open the first-run dialog. ADR-026: setup is NOT dismissible until the vault
# privacy mode is explicitly decided — the first Back must keep the app foreground and land on the
# forced privacy step instead of dismissing. After an explicit choice (Cloud-Enhanced needs no
# typed acknowledgment), Back routes to skip and dismisses only that topmost overlay.
wait_for_ui_text 'Skip setup' || fail 'first-run setup did not become accessible'
adb shell input keyevent KEYCODE_BACK
wait_until_foreground || fail 'Back minimized the app instead of routing to the privacy step'
wait_for_pid >/dev/null || fail 'the refused Back dismissal terminated the app process'
wait_for_ui_text 'Who can read your world' || fail 'Back did not land on the forced privacy step'
tap_ui_node 'Cloud-Enhanced vault' || fail 'the Cloud-Enhanced privacy option was not tappable'
sleep 0.5
adb shell input keyevent KEYCODE_BACK
wait_until_foreground || fail 'Back minimized the app instead of dismissing decided first-run setup'
wait_for_pid >/dev/null || fail 'dismissing first-run setup terminated the app process'
wait_for_ui_text_absent 'Skip setup' || fail 'Back did not dismiss the decided first-run setup'
wait_for_ui_text 'Open scene' || fail 'root destination did not render after first-run setup'

# Exercise renderer history and commit a real Core command before the final root-level minimize
# check. "players see" is rendered only after session.set-workflow was accepted, so observing it now
# and after process death proves more than the presence of an IndexedDB directory.
step 'accepted session command and router Back'
tap_ui_button 'Session' || fail 'Session navigation control was not reachable'
wait_for_ui_text 'LIVE SESSION' || fail 'Session destination did not render'
tap_ui_button 'Go live' || fail 'the session.set-workflow command was not reachable'
wait_for_ui_text_absent 'Session is in standby' \
	|| fail 'the session.set-workflow command was not accepted'
adb shell input keyevent KEYCODE_BACK
wait_until_foreground || fail 'Back minimized the app instead of returning through router history'
wait_for_ui_text 'Enter scene' || fail 'Back did not return from Session to Command Center'

# The fullscreen quick-map editor is above router history but below dialogs/sheets in the Back
# stack. The first Back must leave that editor without changing the Maps route.
step 'fullscreen editor Back ordering'
tap_ui_button 'Maps' || fail 'Maps navigation control was not reachable'
wait_for_ui_text 'Open in map editor' || fail 'Maps destination did not render'
tap_ui_button_until_text 'Open in map editor' 'Navigate map' \
	|| fail 'fullscreen quick-map editor did not open'
step 'fullscreen editor opened'
adb shell input keyevent KEYCODE_BACK
wait_until_foreground || fail 'Back minimized the app instead of leaving the fullscreen editor'
wait_for_ui_text_absent 'Navigate map' || fail 'Back did not leave the fullscreen editor'
step 'fullscreen editor closed while Maps remained active'
wait_for_ui_text 'Open in map editor' || fail 'Back left the Maps route with the fullscreen editor'
sleep 1
adb shell input keyevent KEYCODE_BACK
wait_until_foreground || fail 'second Back minimized instead of following Maps router history'
wait_for_ui_text 'Enter scene' || fail 'second Back did not return to the root destination'

# Deliver an external HTTPS app URL to the running singleTask Activity. Capacitor must emit
# appUrlOpen, the renderer must hand it to the native Browser surface, and the embedded WebView must
# stop being the foreground activity. Back then returns to the still-running app.
step 'external HTTPS browser escape'
EXTERNAL_OUTPUT=$(adb shell am start -W -a android.intent.action.VIEW \
	-d 'https://capacitorjs.com/' -n "$COMPONENT" | tr -d '\r')
grep -q 'Status: ok' <<<"$EXTERNAL_OUTPUT" || fail 'external HTTPS intent did not reach MainActivity'
wait_until_not_foreground || fail 'external HTTPS navigation remained inside the embedded WebView'
adb shell input keyevent KEYCODE_BACK
wait_until_foreground || fail 'Back did not return from the external HTTPS browser surface'
wait_for_ui_text 'Enter scene' || fail 'app state was lost after external HTTPS navigation'

# Open Settings through the canonical More sheet, then exercise the native share/save Activity and
# the WebView file picker. Cancelling either system surface is a normal outcome and must restore the
# same settings panel without an error or a stuck busy control.
step 'native share and file-picker cancellation'
tap_ui_button 'More' || fail 'More navigation control was not reachable'
wait_for_ui_text 'All sections' || fail 'More sheet did not open'
tap_ui_button 'Settings' || fail 'Settings destination was not reachable from the More sheet'
wait_for_ui_text 'Settings section' || fail 'Settings destination did not render'
tap_ui_control 'Settings section' || fail 'Settings section selector was not reachable'
wait_for_ui_text 'Backup' || fail 'Settings section choices did not open'
tap_ui_control 'Backup' || fail 'Backup & history choice was not reachable'
wait_for_ui_text 'Local backup' || fail 'Backup & history did not render the local backup panel'
tap_ui_button 'Download backup' || fail 'native vault backup action was not reachable'
wait_until_not_foreground || fail 'native vault backup did not open the Android share/save sheet'
adb shell input keyevent KEYCODE_BACK
wait_until_foreground || fail 'Back did not cancel the Android share/save sheet'
wait_for_ui_control_enabled 'Download backup' \
	|| fail 'native share cancellation left the backup action busy'
wait_for_ui_text_absent 'Could not build or export' \
	|| fail 'native share cancellation surfaced as an export failure'
tap_ui_button 'Restore from backup' || fail 'vault backup file-import action was not reachable'
wait_until_not_foreground || fail 'vault restore did not open the Android file picker'
adb shell input keyevent KEYCODE_BACK
wait_until_foreground || fail 'Back did not cancel the Android file picker'
wait_for_ui_text 'Local backup' || fail 'file-picker cancellation did not return to Local backup'
wait_for_ui_text_absent 'not a valid vault backup' \
	|| fail 'file-picker cancellation surfaced as an invalid backup'
tap_ui_button 'Home' || fail 'Home navigation control was not reachable after native surfaces'
wait_for_ui_text 'Enter scene' || fail 'native surface cancellation lost renderer navigation state'

# Exercise an actual sheet as the topmost Back layer.
tap_ui_button 'More' || fail 'More navigation control was not reachable'
wait_for_ui_text 'All sections' || fail 'More sheet did not open'
adb shell input keyevent KEYCODE_BACK
wait_until_foreground || fail 'Back minimized the app instead of closing the More sheet'
wait_for_ui_text_absent 'All sections' || fail 'Back did not dismiss the More sheet'

# The renderer opens the canonical Dexie vault during boot. Assert that the WebView created its
# IndexedDB directory, then keep an independent app-private marker to prove lifecycle and upgrade
# operations do not clear the application sandbox.
step 'app-private vault and temporary-file state'
VAULT_PATH=''
if adb shell "run-as $PACKAGE_ID true" >/dev/null 2>&1; then
	PRIVATE_ACCESS='run-as'
	find_private_vault() {
		adb shell "run-as $PACKAGE_ID sh -c 'find app_webview -type d -name \"*indexeddb*\" -print -quit 2>/dev/null'" \
			| tr -d '\r'
	}
	write_private_marker() {
		adb shell "run-as $PACKAGE_ID sh -c 'mkdir -p files && printf android-alpha-acceptance > files/android-alpha-acceptance-marker'"
	}
else
	ROOT_OUTPUT=$(adb root 2>&1 || true)
	adb wait-for-device
	if grep -Eq 'restarting adbd as root|adbd is already running as root' <<<"$ROOT_OUTPUT" \
		&& [[ "$(adb shell id -u | tr -d '\r')" == 0 ]]; then
		PRIVATE_ACCESS='root'
		find_private_vault() {
			adb shell "find '$PRIVATE_ROOT/app_webview' -type d -name '*indexeddb*' -print -quit 2>/dev/null" \
				| tr -d '\r'
		}
		write_private_marker() {
			adb shell "mkdir -p '$PRIVATE_ROOT/files' && printf android-alpha-acceptance > '$PRIVATE_ROOT/files/android-alpha-acceptance-marker'"
		}
	fi
fi
if [[ -n "$PRIVATE_ACCESS" ]]; then
	for _ in {1..30}; do
		VAULT_PATH=$(find_private_vault || true)
		[[ "$PRIVATE_ACCESS" == root ]] && VAULT_PATH=${VAULT_PATH#"$PRIVATE_ROOT/"}
		[[ -n "$VAULT_PATH" ]] && break
		sleep 1
	done
	[[ -n "$VAULT_PATH" ]] || fail 'the dndtools-v2 IndexedDB vault was not initialized'
	write_private_marker >/dev/null || fail 'could not create app-private persistence marker'
	if [[ "$PRIVATE_ACCESS" == run-as ]]; then
		EXPORT_FILES=$(adb shell "run-as $PACKAGE_ID sh -c 'find cache/dndtools-exports -type f -print 2>/dev/null || true'" \
			| tr -d '\r')
	else
		EXPORT_FILES=$(adb shell "find '$PRIVATE_ROOT/cache/dndtools-exports' -type f -print 2>/dev/null || true" \
			| tr -d '\r')
	fi
	[[ -z "$EXPORT_FILES" ]] || fail 'cancelled native share left an app-private temporary export'
elif [[ "${ANDROID_EXPECT_PRIVATE_DATA:-0}" == 1 ]]; then
	fail 'private app data is inaccessible; persistence checks cannot run'
fi

# Offline cold relaunch must continue to boot entirely from packaged assets and local vault data.
step 'offline process-death recovery'
adb shell cmd connectivity airplane-mode enable >/dev/null || fail 'could not enable airplane mode'
adb shell svc data disable >/dev/null || fail 'could not disable mobile data'
adb shell svc wifi disable >/dev/null || fail 'could not disable Wi-Fi'
NETWORK_DISABLED=1
[[ "$(adb shell settings get global airplane_mode_on | tr -d '\r')" == 1 ]] \
	|| fail 'airplane mode did not become active'
for _ in {1..10}; do
	[[ "$(adb shell settings get global wifi_on | tr -d '\r')" == 0 ]] && break
	sleep 1
done
[[ "$(adb shell settings get global wifi_on | tr -d '\r')" == 0 ]] \
	|| fail 'Wi-Fi remained enabled during offline acceptance'
adb shell am force-stop "$PACKAGE_ID"
launch_app
if [[ -n "$PRIVATE_ACCESS" ]]; then
	private_path_exists "$VAULT_PATH" || fail 'vault disappeared during offline relaunch'
fi
wait_for_ui_text 'Enter scene' || fail 'offline cold relaunch did not render the root destination'
tap_ui_button 'Session' || fail 'Session was not reachable after offline process death'
wait_for_ui_text 'LIVE SESSION' || fail 'Session did not render after offline process death'
wait_for_ui_text_absent 'Session is in standby' \
	|| fail 'the accepted session command was not restored after offline process death'
tap_ui_button 'Home' || fail 'Home was not reachable after persisted-command verification'
wait_for_ui_text 'Enter scene' || fail 'persisted-command verification did not return to root'

# Background/resume must retain both process state and private data.
step 'background and resume'
adb shell input keyevent KEYCODE_HOME
wait_until_not_foreground || fail 'Home did not background the app'
launch_app
if [[ -n "$PRIVATE_ACCESS" ]]; then
	private_path_exists 'files/android-alpha-acceptance-marker' \
		|| fail 'private data disappeared during background/resume'
fi

# A force-stop must terminate the old process; the subsequent launch must create a new one.
step 'new-process restart'
OLD_PID=$(wait_for_pid) || fail 'could not observe process before force-stop'
adb shell am force-stop "$PACKAGE_ID"
for _ in {1..20}; do
	[[ -z "$(adb shell pidof "$PACKAGE_ID" 2>/dev/null | tr -d '\r' || true)" ]] && break
	sleep 1
done
[[ -z "$(adb shell pidof "$PACKAGE_ID" 2>/dev/null | tr -d '\r' || true)" ]] \
	|| fail 'force-stop did not terminate the app process'
launch_app
NEW_PID=$(wait_for_pid) || fail 'process did not restart after force-stop'
[[ "$NEW_PID" != "$OLD_PID" ]] || fail 'process restart reused the terminated pid'

# Trigger a system rotation without coordinate gestures. MainActivity handles density/orientation
# changes in place; the process and vault must remain available.
step 'rotation and root Back minimize'
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
sleep 2
[[ "$(adb shell settings get system user_rotation | tr -d '\r')" == 1 ]] \
	|| fail 'rotation setting was not applied'
[[ "$(wait_for_pid)" == "$NEW_PID" ]] || fail 'rotation recreated the app process unexpectedly'
if [[ -n "$PRIVATE_ACCESS" ]]; then
	private_path_exists "$VAULT_PATH" || fail 'vault disappeared during rotation'
fi
adb shell settings put system user_rotation 0

# At the root destination Android Back must move the task behind the launcher, not kill its process.
# After process death + restore + rotation, WebView/router state can still carry one in-app history
# entry even though the command-center content is present again. Accept one final in-app pop back to
# Home, then require the next Back to minimize the task.
adb shell input keyevent KEYCODE_BACK
if ! wait_until_not_foreground; then
	wait_for_ui_text 'Enter scene' || fail 'Back did not return to the root destination before minimize'
	adb shell input keyevent KEYCODE_BACK
	wait_until_not_foreground || fail 'Back did not minimize the root task'
fi
wait_for_pid >/dev/null || fail 'Back killed the app process instead of minimizing it'

# Reinstall the exact same signed APK as an upgrade. Android rejects a signer mismatch; success plus
# retained private/vault paths proves update compatibility with the persistent alpha key.
step 'same-signer in-place upgrade'
adb install --no-streaming -r "$APK_PATH" | grep -q 'Success' \
	|| fail 'same-key in-place APK upgrade failed'
if [[ -n "$PRIVATE_ACCESS" ]]; then
	private_path_exists 'files/android-alpha-acceptance-marker' \
		|| fail 'app-private data was cleared by in-place upgrade'
	private_path_exists "$VAULT_PATH" || fail 'vault was cleared by in-place upgrade'
fi
launch_app

adb shell cmd connectivity airplane-mode disable >/dev/null || fail 'could not restore network state'
adb shell svc data enable >/dev/null || fail 'could not restore mobile data'
adb shell svc wifi enable >/dev/null || fail 'could not restore Wi-Fi'
NETWORK_DISABLED=0
echo 'Android emulator acceptance passed.'
