import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { SaxesParser } from 'saxes';

// Deliberately bounded static guard, not a Java compiler. These standard exception
// relationships cover the native shell's catches without requiring a JDK or SDK.
const parents = {
	SecurityException: 'RuntimeException',
	IllegalArgumentException: 'RuntimeException',
	NumberFormatException: 'IllegalArgumentException',
	IllegalStateException: 'RuntimeException',
	NullPointerException: 'RuntimeException',
	UnsupportedOperationException: 'RuntimeException',
	IndexOutOfBoundsException: 'RuntimeException',
	RuntimeException: 'Exception',
	IOException: 'Exception',
	FileNotFoundException: 'IOException',
	Exception: 'Throwable',
	Error: 'Throwable',
};

function javaCode(source) {
	// Preserve line numbers while hiding comments, strings (including text blocks),
	// and character literals so examples in prose cannot trigger the catch guard.
	return source.replace(
		/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
		(value) => value.replace(/[^\r\n]/g, ' '),
	);
}

function* files(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (['build', '.gradle', 'node_modules'].includes(entry.name)) continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) yield* files(path);
		else if (entry.isFile()) yield path;
	}
}

export function checkAndroid(root) {
	const errors = [];
	let xmlCount = 0;
	let javaCount = 0;
	const android = join(root, 'apps/gm-react/android');
	const report = (path, message) => errors.push(`${relative(root, path)}: ${message}`);
	for (const path of files(android)) {
		if (path.endsWith('.xml')) {
			xmlCount++;
			try {
				new SaxesParser({ xmlns: true }).write(readFileSync(path, 'utf8')).close();
			} catch (error) {
				report(path, `invalid XML: ${error.message}`);
			}
		} else if (path.endsWith('.java')) {
			javaCount++;
			const source = javaCode(readFileSync(path, 'utf8'));
			for (const match of source.matchAll(/\bcatch\s*\(([^()]*)\)/g)) {
				const types = match[1]
					.replace(/\bfinal\s+/g, '')
					.trim()
					.replace(/\s+\w+$/, '')
					.split('|')
					.map((type) => type.trim().replace(/^java\.(?:lang|io)\./, ''));
				if (types.length < 2) continue;
				for (const type of types) {
					for (let parent = parents[type]; parent; parent = parents[parent]) {
						if (types.includes(parent)) {
							const line = source.slice(0, match.index).split('\n').length;
							report(
								path,
								`${line}: invalid multi-catch: ${type} extends ${parent}; remove ${type}`,
							);
						}
					}
				}
			}
		}
	}
	if (!xmlCount) errors.push('Android XML files are missing');
	if (!javaCount) errors.push('Android Java files are missing');
	const gradlePath = join(android, 'app/build.gradle');
	const gradle = readFileSync(gradlePath, 'utf8');
	const contract = gradle.match(/androidVersionName\s*=~\s*\/([^\n]+)\//);
	if (!contract || contract[1] !== String.raw`^(\d+)\.(\d+)\.(\d+)$`) {
		report(
			gradlePath,
			'expected anchored major.minor.patch version contract; update preflight if Gradle changes',
		);
	}
	const versionPattern = /^\d+\.\d+\.\d+$/;
	const rootVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
	const appPackage = join(root, 'apps/gm-react/package.json');
	const appVersion = JSON.parse(readFileSync(appPackage, 'utf8')).version;
	for (const [path, version] of [
		[join(root, 'package.json'), rootVersion],
		[appPackage, appVersion],
	]) {
		if (typeof version !== 'string' || !versionPattern.test(version)) {
			report(
				path,
				`Android build.gradle requires major.minor.patch (got ${JSON.stringify(version)})`,
			);
		}
	}
	if (appVersion !== rootVersion)
		report(appPackage, `version ${appVersion} differs from root ${rootVersion}`);
	return { errors, xmlCount, javaCount };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		if (process.argv.length > 3) throw new Error('Usage: check-android.mjs [repository-root]');
		const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
		const result = checkAndroid(root);
		if (result.errors.length) {
			console.error(result.errors.join('\n'));
			process.exitCode = 1;
		} else {
			console.log(
				`Android preflight passed: ${result.xmlCount} XML files, ${result.javaCount} Java files, package versions agree. Static checks only; run Gradle with JDK 21 to prove compilation.`,
			);
		}
	} catch (error) {
		console.error(`Android preflight failed: ${error.message}`);
		process.exitCode = 1;
	}
}
