// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'scripts', 'android-emulator-acceptance.sh');

type WorkflowStep = {
	uses?: string;
	env?: Record<string, string>;
	with?: { script?: string };
};

type Workflow = {
	jobs?: Record<string, { steps?: WorkflowStep[] }>;
};

describe('Android emulator acceptance gate', () => {
	it('fails closed across install, lifecycle, native surfaces, persistence, Back, and same-key upgrade checks', () => {
		const source = fs.readFileSync(scriptPath, 'utf-8');

		expect(source).toContain('set -Eeuo pipefail');
		for (const contract of [
			'apksigner',
			'adb install --no-streaming "$APK_PATH"',
			'airplane-mode enable',
			'svc wifi disable',
			'KEYCODE_HOME',
			'dismissing first-run setup',
			'the session.set-workflow command was not accepted',
			'Session is in standby',
			'fullscreen quick-map editor did not open',
			'external HTTPS navigation remained inside the embedded WebView',
			'native vault backup did not open the Android share/save sheet',
			'cancelled native share left an app-private temporary export',
			'vault restore did not open the Android file picker',
			'class="android.widget.CheckedTextView"',
			"tap_ui_control 'Backup'",
			'the accepted session command was not restored after offline process death',
			'am force-stop',
			'user_rotation 1',
			'KEYCODE_BACK',
			'adb install --no-streaming -r "$APK_PATH"',
			'indexeddb',
			'android-alpha-acceptance-marker',
			'ANDROID_EXPECTED_SIGNER_SHA256',
			'ANDROID_EXPECT_PRIVATE_DATA',
		]) {
			expect(source, `missing acceptance contract: ${contract}`).toContain(contract);
		}
		expect(fs.statSync(scriptPath).mode & 0o111).not.toBe(0);
	});

	it('runs instrumentation and the shared script in CI and signed release emulators', () => {
		const ci = YAML.parse(
			fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf-8'),
		) as Workflow;
		const release = YAML.parse(
			fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf-8'),
		) as Workflow;

		const ciEmulator = ci.jobs?.['android-checks']?.steps?.find((step) =>
			step.uses?.startsWith('reactivecircus/android-emulator-runner@'),
		);
		const releaseEmulator = release.jobs?.['draft-release']?.steps?.find((step) =>
			step.uses?.startsWith('reactivecircus/android-emulator-runner@'),
		);
		for (const step of [ciEmulator, releaseEmulator]) {
			expect(step?.uses).toMatch(/@[0-9a-f]{40}$/);
			expect(step?.with?.script).toContain('connectedDebugAndroidTest');
			expect(step?.with?.script).toContain('scripts/android-emulator-acceptance.sh');
		}
		expect(ciEmulator?.with?.script).toContain('app-debug.apk');
		expect(releaseEmulator?.with?.script).toContain('app-release.apk');
		expect(ciEmulator?.env?.ANDROID_EXPECT_PRIVATE_DATA).toBe('1');
		expect(releaseEmulator?.env?.ANDROID_EXPECT_PRIVATE_DATA).toBe('1');
		expect(releaseEmulator?.env?.ANDROID_EXPECTED_SIGNER_SHA256).toBe(
			'A9:34:D3:0B:1D:F9:F3:43:68:06:78:0B:B8:37:B3:E4:FE:CC:A6:95:CB:7B:37:F7:AF:03:72:AD:30:4C:AD:70',
		);
	});
});
