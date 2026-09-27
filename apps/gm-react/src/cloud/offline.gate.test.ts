import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * RC-PLT-2.4 — the coded half of "every cloud-only control shows the offline state".
 *
 * The acceptance criterion is a claim about a whole surface, and a surface grows. A reviewer can
 * confirm the controls that exist today; nothing stops the next screen from importing `appApi` and
 * shipping a button that looks live offline and can only fail. So the rule is enforced here rather
 * than asserted in a doc: a module that imports a network-backed cloud client must also import the
 * offline gate.
 *
 * This is a static rule and it is deliberately coarse — it proves a screen KNOWS about the gate,
 * not that every individual button wears it. The per-control evidence is `pwa-offline.spec.ts`,
 * which counts `[data-cloud-offline]` on the rendered page. The two together are what make the
 * criterion checkable; either one alone would be weaker than it looks.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '..');

/** Modules that actually cross the network. Importing one of these is what triggers the rule. */
const NETWORK_MODULES = [
	'cloud/appApi',
	'cloud/auth',
	'cloud/billing',
	'cloud/cloudSync',
	'cloud/copilot',
	'cloud/googleCalendar',
	'cloud/googleDocs',
	'cloud/syncEngine',
	'cloud/CloudSyncContext',
	// The internet-play relay (signaling + TURN over the cloud API); LAN play never touches it.
	'net/cloudBridge',
];

/**
 * Files that import a network module but legitimately render no cloud-only control. Each entry
 * carries the reason, because an allowlist without one rots into a silencer.
 */
const NO_CLOUD_CONTROLS: Record<string, string> = {
	'screens/settings/Vault.tsx':
		'Reads Google Doc connection metadata only. Folder sources are File System Access handles and disconnecting a Doc forgets local metadata — no control here calls Google.',
	'screens/settings/SyncPrivacy.tsx':
		'ADR-026 mode switch writes device-local state; recovery-key export/import are local crypto against the OS credential store (cloud/vaultKey.ts). Its only cloud call is a best-effort refresh already wrapped in .catch().',
	'app/shell/rows.tsx': 'Renders sync status as a nav row. Displays state, offers no action.',
	'screens/settings/Analytics.tsx':
		'Opt-in toggle writing a device-local preference; telemetry delivery is fire-and-forget by design.',
	'App.tsx':
		'Composition root plus the vault-recovery overlay, whose two buttons restore from a LOCAL backup file. Its cloud imports are providers, not calls.',
	'cloud/AuthContext.tsx':
		'Auth provider and modal host. Renders no control of its own; AuthModal.tsx carries the gate.',
	'cloud/CloudSyncContext.tsx':
		'Sync engine context. Exposes state and methods to callers; renders no control.',
	'net/SessionContext.tsx':
		'Live-table context. Exposes the relay to callers and renders no control; HostModal.tsx and SessionPanel.tsx gate the online-play buttons.',
	'screens/community/usePublishModel.ts':
		'State-and-handlers hook split out of Publish.tsx. Renders nothing; Publish.tsx spreads the gate on every control that calls it.',
	'screens/community/useWikiModel.ts':
		'State-and-handlers hook split out of Wiki.tsx. Renders nothing; Wiki.tsx spreads the gate on every control that calls it.',
	'screens/upgrade/PlanCards.tsx':
		'Plan CTAs split out of Upgrade.tsx. Its every cloud CTA is disabled by the `busy` prop, which Upgrade.tsx drives from the gate (with the offline notice above the cards).',
};

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (entry === 'ds' || entry === 'node_modules') continue;
			walk(full, out);
		} else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
}

describe('RC-PLT-2.4 cloud-only controls carry the offline gate', () => {
	const files = walk(srcRoot);

	it('finds the app source tree', () => {
		expect(files.length).toBeGreaterThan(50);
	});

	it('every module importing a network-backed cloud client also imports the offline gate', () => {
		const offenders: string[] = [];
		for (const file of files) {
			const rel = path.relative(srcRoot, file).split(path.sep).join('/');
			if (rel.startsWith('cloud/offline')) continue;
			const text = readFileSync(file, 'utf8');
			const importsNetwork = NETWORK_MODULES.some((mod) => {
				const leaf = mod.split('/')[1];
				return new RegExp(`from '[^']*/${leaf}'|from '\\./${leaf}'`).test(text);
			});
			if (!importsNetwork) continue;
			if (rel in NO_CLOUD_CONTROLS) continue;
			// `cloud/` internals are clients and contexts, not controls; only rendered surfaces
			// (anything with JSX) can show an offline state.
			if (rel.startsWith('cloud/') && !rel.endsWith('.tsx')) continue;
			if (!/from '[^']*cloud\/offline'|from '\.\/offline'/.test(text)) {
				offenders.push(rel);
			}
		}
		expect(
			offenders,
			`These modules call a cloud service but never import the offline gate, so their controls ` +
				`look live with no network. Import { useCloudActions } from 'cloud/offline' and spread ` +
				`offlineProps onto each cloud-only control — or add the file to NO_CLOUD_CONTROLS with a ` +
				`reason if it genuinely renders none.`,
		).toEqual([]);
	});

	it('every allowlist entry states a reason and still exists', () => {
		for (const [rel, reason] of Object.entries(NO_CLOUD_CONTROLS)) {
			expect(reason.length, `${rel} needs a real reason`).toBeGreaterThan(40);
			expect(files.some((f) => path.relative(srcRoot, f).split(path.sep).join('/') === rel)).toBe(
				true,
			);
		}
	});
});
