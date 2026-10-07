// Cut a release: set every release package to one version, verify the Android version contract,
// commit, and create the annotated tag. Pushing the tag starts release.yml; the production
// promotion is a separate, approved button (docs/development/RELEASING.md).
//
//   pnpm release:cut 0.3.8            # from a clean checkout of main
//   pnpm release:cut 0.3.8 --no-tag   # bump and commit only
//
// Refuses to run on a dirty tree, off `main`, or when the tag exists.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RELEASE_PACKAGES = [
	'package.json',
	'packages/core/package.json',
	'apps/gm-react/package.json',
];
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const version = argv.find((arg) => !arg.startsWith('--'));
const noTag = argv.includes('--no-tag');

function git(...args: string[]): string {
	return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}
function fail(message: string): never {
	console.error(`release:cut: ${message}`);
	process.exit(1);
}

if (!version || !VERSION.test(version))
	fail('usage: pnpm release:cut X.Y.Z (plain semver; Android rejects a suffix)');
const tag = `v${version}`;
if (git('status', '--porcelain')) fail('the working tree is not clean');
if (git('symbolic-ref', '--short', 'HEAD') !== 'main') fail('cut releases from main');
if (git('tag', '--list', tag))
	fail(`tag ${tag} already exists; never move a tag, fix forward with a new version`);

for (const relative of RELEASE_PACKAGES) {
	const file = path.join(repoRoot, relative);
	const source = fs.readFileSync(file, 'utf8');
	const updated = source.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
	if (updated === source && !source.includes(`"version": "${version}"`))
		fail(`no version field in ${relative}`);
	fs.writeFileSync(file, updated);
}
execFileSync('pnpm', ['check:android'], { cwd: repoRoot, stdio: 'inherit' });
execFileSync('pnpm', ['release:verify', 'version', '--tag', tag], {
	cwd: repoRoot,
	stdio: 'inherit',
});

git('add', ...RELEASE_PACKAGES);
git('commit', '-m', `release: ${tag}`);
if (noTag) {
	console.log(`release:cut: committed ${tag} without a tag`);
} else {
	git('tag', '-a', tag, '-m', `Lamplight GM ${version}`);
	console.log(`release:cut: committed and tagged ${tag}. Next: git push origin main ${tag}`);
}
