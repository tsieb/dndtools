import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// This is an unconditional production gate. Dev builds do not invoke it.
const defaultDist = fileURLToPath(new URL('../apps/gm-react/dist', import.meta.url));
const dist = resolve(process.argv[2] ?? defaultDist);
const placeholder =
	/\[LEGAL\b[^\]]*\]|\[(?:MAILING ADDRESS|CONTACT EMAIL|GOVERNING LAW JURISDICTION|EFFECTIVE DATE|POST-CANCELLATION CLOUD RETENTION PERIOD)\]/g;

try {
	const files = readdirSync(dist, { recursive: true }).filter((file) =>
		/\.(?:[cm]?js|html|css|json|map)$/.test(file),
	);
	if (!files.includes('index.html') || !files.some((file) => /\.[cm]?js$/.test(file))) {
		throw new Error(`No complete web build in ${dist}; build the production app first`);
	}
	const offenders = [];
	for (const file of files) {
		const matches = readFileSync(join(dist, file), 'utf8').match(placeholder);
		if (matches) offenders.push(`${file}: ${[...new Set(matches)].join(', ')}`);
	}
	if (offenders.length) throw new Error(`Unresolved legal placeholders:\n${offenders.join('\n')}`);
	console.log(`check-legal-placeholders: OK (${files.length} build files)`);
} catch (error) {
	console.error(`check-legal-placeholders: ${error.message}`);
	process.exitCode = 1;
}
