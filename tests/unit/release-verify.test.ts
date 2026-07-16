// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	androidVersionCode,
	createArtifactSpdx,
	expectedAndroidArtifacts,
	expectedDesktopArtifacts,
	expectedReleaseArtifacts,
	verifyDesktopArtifacts,
	verifyReleaseArtifacts,
	verifyReleaseVersions,
	verifySupplyChainCoverage,
} from '../../scripts/release-verify.ts';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dndtools-release-test-'));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

describe('release verification', () => {
	it('derives Android version codes from semantic package versions', () => {
		expect(androidVersionCode('0.3.0')).toBe(3000);
		expect(androidVersionCode('2.14.7')).toBe(2_014_007);
		expect(() => androidVersionCode('0.3.0-alpha')).toThrow(/major\.minor\.patch/);
	});

	it('requires the release tag to match all desktop release package versions', () => {
		const rootPackage = JSON.parse(
			fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'),
		) as {
			version: string;
		};
		expect(verifyReleaseVersions(process.cwd(), `v${rootPackage.version}`)).toEqual([]);
		expect(verifyReleaseVersions(process.cwd(), 'v9.9.9')).toContain(
			`package.json version is ${rootPackage.version}; expected 9.9.9 from v9.9.9`,
		);
		expect(verifyReleaseVersions(process.cwd(), 'main')).toHaveLength(1);
	});

	it('fails closed unless every documented OS/architecture installer is present', () => {
		const directory = temporaryDirectory();
		for (const filename of expectedDesktopArtifacts('0.2.0')) {
			fs.writeFileSync(path.join(directory, filename), 'installer');
		}
		expect(verifyDesktopArtifacts(directory, 'v0.2.0')).toEqual([]);

		fs.rmSync(path.join(directory, 'DND-Tools-GM-0.2.0-x64.exe'));
		expect(verifyDesktopArtifacts(directory, 'v0.2.0')).toContain(
			'missing desktop installer: DND-Tools-GM-0.2.0-x64.exe',
		);
	});

	it('requires the four desktop installers and both signed Android packages', () => {
		const directory = temporaryDirectory();
		for (const filename of expectedReleaseArtifacts('0.3.0')) {
			fs.writeFileSync(path.join(directory, filename), `release package: ${filename}`);
		}

		expect(expectedAndroidArtifacts('0.3.0')).toEqual([
			'DND-Tools-GM-0.3.0-android.apk',
			'DND-Tools-GM-0.3.0-android.aab',
		]);
		expect(verifyReleaseArtifacts(directory, 'v0.3.0')).toEqual([]);

		fs.rmSync(path.join(directory, 'DND-Tools-GM-0.3.0-android.aab'));
		expect(verifyReleaseArtifacts(directory, 'v0.3.0')).toContain(
			'missing release artifact: DND-Tools-GM-0.3.0-android.aab',
		);

		fs.writeFileSync(path.join(directory, 'DND-Tools-GM-0.3.0-arm64.apk'), 'unexpected');
		expect(verifyReleaseArtifacts(directory, 'v0.3.0')).toContain(
			'unexpected release artifact: DND-Tools-GM-0.3.0-arm64.apk',
		);
	});

	it('covers every release package with matching SHA-256 entries in checksums and SPDX', () => {
		const directory = temporaryDirectory();
		const filenames = expectedReleaseArtifacts('0.3.0');
		for (const filename of filenames) {
			fs.writeFileSync(path.join(directory, filename), `release package: ${filename}`);
		}

		const spdxPath = path.join(directory, 'dndtools-artifacts.spdx.json');
		const spdx = createArtifactSpdx(directory, 'v0.3.0');
		fs.writeFileSync(spdxPath, JSON.stringify(spdx));
		const checksumsPath = path.join(directory, 'SHA256SUMS.txt');
		fs.writeFileSync(
			checksumsPath,
			`${spdx.files
				.map((file) => `${file.checksums[0]!.checksumValue}  ./${file.fileName}`)
				.join('\n')}\n`,
		);

		expect(verifySupplyChainCoverage(directory, 'v0.3.0', checksumsPath, spdxPath)).toEqual([]);

		fs.writeFileSync(
			checksumsPath,
			fs.readFileSync(checksumsPath, 'utf-8').replace(/^.*android\.apk.*\n/m, ''),
		);
		const incompleteSpdx = {
			...spdx,
			files: spdx.files.filter((file) => !file.fileName.endsWith('.aab')),
		};
		fs.writeFileSync(spdxPath, JSON.stringify(incompleteSpdx));

		const problems = verifySupplyChainCoverage(directory, 'v0.3.0', checksumsPath, spdxPath);
		expect(problems).toContain(
			'SHA-256 manifest does not cover release artifact: DND-Tools-GM-0.3.0-android.apk',
		);
		expect(problems).toContain(
			'SPDX SBOM does not cover release artifact: DND-Tools-GM-0.3.0-android.aab',
		);

		fs.writeFileSync(spdxPath, '{invalid');
		expect(verifySupplyChainCoverage(directory, 'v0.3.0', checksumsPath, spdxPath)).toEqual([
			`artifact SPDX SBOM is not valid JSON: ${spdxPath}`,
		]);
	});
});
