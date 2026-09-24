#!/usr/bin/env bash
# Accept the Android SDK licences, then install the requested sdkmanager packages.
#
# dl.google.com occasionally cuts a large package off mid-transfer, and sdkmanager
# then exits 1 on the unzip ("Error reading Zip content from a SeekableByteChannel").
# One truncated emulator download used to fail the whole Android job even though the
# code under test was fine. Each sdkmanager call is retried a bounded number of times,
# with any staged partial download dropped first; once the attempts run out the script
# still exits non-zero, so a package that really is missing keeps the job red.
set -Eeuo pipefail

if (($# == 0)); then
	echo "usage: scripts/android-sdk-install.sh <sdk-package>..." >&2
	exit 2
fi

ATTEMPTS=${ANDROID_SDK_INSTALL_ATTEMPTS:-3}
RETRY_DELAY=${ANDROID_SDK_INSTALL_RETRY_DELAY:-15}
SDK_ROOT=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}

accept_licences() {
	# sdkmanager closes stdin after the final prompt, so GNU yes may exit 141 under pipefail.
	set +o pipefail
	yes | sdkmanager --licenses >/dev/null
	local status=${PIPESTATUS[1]}
	set -o pipefail
	return "$status"
}

drop_staged_downloads() {
	[[ -n "$SDK_ROOT" ]] || return 0
	rm -rf "$SDK_ROOT/.temp" "$SDK_ROOT/.downloadIntermediates"
}

with_retries() {
	local label=$1
	shift
	local attempt=1
	until "$@"; do
		if ((attempt >= ATTEMPTS)); then
			echo "Android SDK $label failed after $attempt attempts" >&2
			return 1
		fi
		echo "::warning::Android SDK $label failed (attempt $attempt of $ATTEMPTS); retrying in ${RETRY_DELAY}s"
		drop_staged_downloads
		sleep "$RETRY_DELAY"
		attempt=$((attempt + 1))
	done
}

with_retries 'licence acceptance' accept_licences
with_retries 'package install' sdkmanager "$@"
