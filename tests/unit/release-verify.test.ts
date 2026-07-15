// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	expectedDesktopArtifacts,
	verifyDesktopArtifacts,
	verifyReleaseVersions,
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
});
