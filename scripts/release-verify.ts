import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
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
		`Lamplight-GM-${version}-arm64.dmg`,
		`Lamplight-GM-${version}-x64.dmg`,
		`Lamplight-GM-${version}-x86_64.AppImage`,
		`Lamplight-GM-${version}-x64.exe`,
	];
}

export function expectedAndroidArtifacts(version: string): string[] {
	return [`Lamplight-GM-${version}-android.apk`, `Lamplight-GM-${version}-android.aab`];
}

export function expectedReleaseArtifacts(version: string): string[] {
	return [...expectedDesktopArtifacts(version), ...expectedAndroidArtifacts(version)];
}

export function androidVersionCode(version: string): number {
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
	if (!match) throw new Error(`Android version requires major.minor.patch; received ${version}`);
	return Number(match[1]) * 1_000_000 + Number(match[2]) * 1_000 + Number(match[3]);
}

export function verifyReleaseVersions(repoRoot: string, tag: string): string[] {
	const match = SEMVER_TAG.exec(tag);
	if (!match)
		return [`release tag must be a full semver tag such as v0.3.0; received ${tag || '(empty)'}`];
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
		: [`release tag must be a full semver tag such as v0.3.0; received ${tag || '(empty)'}`];
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

export function verifyReleaseArtifacts(directory: string, tag: string): string[] {
	const tagProblems = SEMVER_TAG.test(tag)
		? []
		: [`release tag must be a full semver tag such as v0.3.0; received ${tag || '(empty)'}`];
	if (tagProblems.length > 0) return tagProblems;
	if (!fs.existsSync(directory)) return [`artifact directory does not exist: ${directory}`];

	const expected = expectedReleaseArtifacts(tag.slice(1));
	const actual = fs
		.readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
	const packages = actual.filter((name) => /\.(?:dmg|AppImage|exe|apk|aab)$/.test(name));
	const problems: string[] = [];
	for (const filename of expected) {
		if (!packages.includes(filename)) problems.push(`missing release artifact: ${filename}`);
	}
	for (const filename of packages) {
		if (!expected.includes(filename)) problems.push(`unexpected release artifact: ${filename}`);
	}
	return problems;
}

interface SpdxFile {
	SPDXID: string;
	checksums: Array<{ algorithm: 'SHA256'; checksumValue: string }>;
	copyrightText: 'NOASSERTION';
	fileName: string;
	licenseConcluded: 'NOASSERTION';
	licenseInfoInFiles: ['NOASSERTION'];
}

interface ArtifactSpdxDocument {
	SPDXID: 'SPDXRef-DOCUMENT';
	creationInfo: {
		created: string;
		creators: ['Tool: dndtools-release-verify'];
	};
	dataLicense: 'CC0-1.0';
	documentNamespace: string;
	files: SpdxFile[];
	name: string;
	relationships: Array<{
		spdxElementId: 'SPDXRef-DOCUMENT';
		relatedSpdxElement: string;
		relationshipType: 'DESCRIBES';
	}>;
	spdxVersion: 'SPDX-2.3';
}

function sha256(filename: string): string {
	return createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function spdxId(filename: string, index: number): string {
	return `SPDXRef-Artifact-${index + 1}-${filename.replace(/[^A-Za-z0-9.-]/g, '-')}`;
}

export function createArtifactSpdx(directory: string, tag: string): ArtifactSpdxDocument {
	const problems = verifyReleaseArtifacts(directory, tag);
	if (problems.length > 0) throw new Error(problems.join('\n'));

	const files = expectedReleaseArtifacts(tag.slice(1)).map((filename, index): SpdxFile => {
		const SPDXID = spdxId(filename, index);
		return {
			SPDXID,
			checksums: [{ algorithm: 'SHA256', checksumValue: sha256(path.join(directory, filename)) }],
			copyrightText: 'NOASSERTION',
			fileName: filename,
			licenseConcluded: 'NOASSERTION',
			licenseInfoInFiles: ['NOASSERTION'],
		};
	});

	return {
		SPDXID: 'SPDXRef-DOCUMENT',
		creationInfo: {
			created: new Date().toISOString(),
			creators: ['Tool: dndtools-release-verify'],
		},
		dataLicense: 'CC0-1.0',
		documentNamespace: `https://github.com/tsieb/dndtools/releases/tag/${tag}/artifact-sbom/${randomUUID()}`,
		files,
		name: `Lamplight GM ${tag.slice(1)} release artifacts`,
		relationships: files.map((file) => ({
			spdxElementId: 'SPDXRef-DOCUMENT',
			relatedSpdxElement: file.SPDXID,
			relationshipType: 'DESCRIBES',
		})),
		spdxVersion: 'SPDX-2.3',
	};
}

function checksumEntries(filename: string): Map<string, string> {
	const entries = new Map<string, string>();
	for (const line of fs.readFileSync(filename, 'utf-8').split(/\r?\n/)) {
		const match = /^([a-fA-F0-9]{64})\s+[*]?(.+)$/.exec(line.trim());
		if (match) entries.set(match[2]!.replace(/^\.\//, ''), match[1]!.toLowerCase());
	}
	return entries;
}

export function verifySupplyChainCoverage(
	directory: string,
	tag: string,
	checksumsPath: string,
	spdxPath: string,
): string[] {
	const artifactProblems = verifyReleaseArtifacts(directory, tag);
	if (artifactProblems.length > 0) return artifactProblems;
	if (!fs.existsSync(checksumsPath)) return [`checksum manifest does not exist: ${checksumsPath}`];
	if (!fs.existsSync(spdxPath)) return [`artifact SPDX SBOM does not exist: ${spdxPath}`];

	const expected = expectedReleaseArtifacts(tag.slice(1));
	const checksums = checksumEntries(checksumsPath);
	let spdx: {
		files?: Array<{
			checksums?: Array<{ algorithm?: string; checksumValue?: string }>;
			fileName?: string;
		}>;
	};
	try {
		spdx = JSON.parse(fs.readFileSync(spdxPath, 'utf-8')) as typeof spdx;
	} catch {
		return [`artifact SPDX SBOM is not valid JSON: ${spdxPath}`];
	}
	const spdxFiles = new Map((spdx.files ?? []).map((file) => [file.fileName, file]));
	const problems: string[] = [];

	for (const filename of expected) {
		const actualHash = sha256(path.join(directory, filename));
		if (checksums.get(filename) !== actualHash) {
			problems.push(`SHA-256 manifest does not cover release artifact: ${filename}`);
		}
		const file = spdxFiles.get(filename);
		const spdxHash = file?.checksums?.find((entry) => entry.algorithm === 'SHA256')?.checksumValue;
		if (spdxHash !== actualHash) {
			problems.push(`SPDX SBOM does not cover release artifact: ${filename}`);
		}
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
	let problems =
		mode === 'version'
			? verifyReleaseVersions(repoRoot, tag)
			: mode === 'artifacts'
				? verifyReleaseArtifacts(path.resolve(readFlag(args, '--dir') ?? 'release-artifacts'), tag)
				: mode === 'supply-chain'
					? verifySupplyChainCoverage(
							path.resolve(readFlag(args, '--dir') ?? 'release-artifacts'),
							tag,
							path.resolve(readFlag(args, '--checksums') ?? 'release-artifacts/SHA256SUMS.txt'),
							path.resolve(
								readFlag(args, '--sbom') ?? 'release-artifacts/dndtools-artifacts.spdx.json',
							),
						)
					: [];

	if (mode === 'sbom' && problems.length === 0) {
		const directory = path.resolve(readFlag(args, '--dir') ?? 'release-artifacts');
		const output = path.resolve(
			readFlag(args, '--out') ?? 'release-artifacts/dndtools-artifacts.spdx.json',
		);
		try {
			fs.writeFileSync(output, `${JSON.stringify(createArtifactSpdx(directory, tag), null, 2)}\n`);
		} catch (error) {
			problems = [error instanceof Error ? error.message : String(error)];
		}
	} else if (!['version', 'artifacts', 'supply-chain'].includes(mode)) {
		problems = [`unknown release verification mode: ${mode}`];
	}

	if (problems.length > 0) {
		console.error(`release verification failed with ${problems.length} problem(s):`);
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exit(1);
	}
	console.log(
		mode === 'version'
			? `release version verified: ${tag} matches root, core, and GM package metadata`
			: mode === 'sbom'
				? `release artifact SPDX SBOM written for ${tag}`
				: mode === 'supply-chain'
					? `release supply-chain coverage verified for ${tag}`
					: `release artifacts verified: all ${expectedReleaseArtifacts(tag.slice(1)).length} packages are present for ${tag}`,
	);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) runCli();
