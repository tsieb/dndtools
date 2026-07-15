import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE_PACKAGES = [
	'package.json',
	'packages/core/package.json',
	'apps/gm-react/package.json',
];
const SEMVER_TAG =
	/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function packageVersion(repoRoot: string, relativePath: string): string | undefined {
	const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')) as {
		version?: string;
	};
	return packageJson.version;
}

export function expectedDesktopArtifacts(version: string): string[] {
	return [
		`DND-Tools-GM-${version}-arm64.dmg`,
		`DND-Tools-GM-${version}-x64.dmg`,
		`DND-Tools-GM-${version}-x86_64.AppImage`,
		`DND-Tools-GM-${version}-x64.exe`,
	];
}

export function verifyReleaseVersions(repoRoot: string, tag: string): string[] {
	const match = SEMVER_TAG.exec(tag);
	if (!match)
		return [`release tag must be a full semver tag such as v0.2.0; received ${tag || '(empty)'}`];
	const version = tag.slice(1);
	const problems: string[] = [];
	for (const relativePath of RELEASE_PACKAGES) {
		const actual = packageVersion(repoRoot, relativePath);
		if (actual !== version) {
			problems.push(
				`${relativePath} version is ${actual ?? '(missing)'}; expected ${version} from ${tag}`,
			);
		}
	}
	return problems;
}

export function verifyDesktopArtifacts(directory: string, tag: string): string[] {
	const tagProblems = SEMVER_TAG.test(tag)
		? []
		: [`release tag must be a full semver tag such as v0.2.0; received ${tag || '(empty)'}`];
	if (tagProblems.length > 0) return tagProblems;
	if (!fs.existsSync(directory)) return [`artifact directory does not exist: ${directory}`];

	const expected = expectedDesktopArtifacts(tag.slice(1));
	const actual = fs
		.readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
	const installers = actual.filter((name) => /\.(?:dmg|AppImage|exe)$/.test(name));
	const problems: string[] = [];
	for (const filename of expected) {
		if (!installers.includes(filename)) problems.push(`missing desktop installer: ${filename}`);
	}
	for (const filename of installers) {
		if (!expected.includes(filename)) problems.push(`unexpected desktop installer: ${filename}`);
	}
	return problems;
}

function readFlag(argv: string[], name: string): string | undefined {
	const index = argv.indexOf(name);
	return index >= 0 ? argv[index + 1] : undefined;
}

function runCli(): void {
	const [mode = 'version', ...args] = process.argv.slice(2);
	const tag = readFlag(args, '--tag') ?? process.env.RELEASE_TAG ?? '';
	const repoRoot = process.cwd();
	const problems =
		mode === 'version'
			? verifyReleaseVersions(repoRoot, tag)
			: mode === 'artifacts'
				? verifyDesktopArtifacts(path.resolve(readFlag(args, '--dir') ?? 'release-artifacts'), tag)
				: [`unknown release verification mode: ${mode}`];

	if (problems.length > 0) {
		console.error(`release verification failed with ${problems.length} problem(s):`);
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exit(1);
	}
	console.log(
		mode === 'version'
			? `release version verified: ${tag} matches root, core, and desktop package metadata`
			: `release artifacts verified: all ${expectedDesktopArtifacts(tag.slice(1)).length} installers are present for ${tag}`,
	);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) runCli();
