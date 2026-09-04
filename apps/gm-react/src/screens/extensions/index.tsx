import { useState } from 'react';
import { Tabs, tabPanelProps } from '../../ds';
import { Page } from '../../app/screen-kit';
import { ExtPlugins } from './Plugins';
import { ExtCompendium } from './Compendium';
import { ExtObjects } from './ObjectTypes';
import { ExtSystem } from './System';
import { ExtTheme } from './ThemeStudio';

/**
 * Extensions & Systems — plugins, compendium import, custom object types, the rules-system switch, and
 * the theme studio (port of app.jsx ExtensibilitySection).
 *
 * REAL CORE WIRING — the Plugins tab is the live widget-package registry (`runtime.state.widgets`):
 *   - the installed list renders the actual registry records with the capability/host-permission
 *     profile computed by `buildWidgetPackageReviewSummary` and their trust posture;
 *   - install (bundled starter library or pasted package JSON), enable, disable, remove and upgrade
 *     all dispatch the real `widget.package.*` commands (DM-only). Installs land unreviewed with
 *     every host permission denied — fail-closed; there is no trust-review command in this build,
 *     so that denial is permanent (only code-defined `system.*` packages are trusted). Upgrades run
 *     declared migrations against every placed widget; removes leave placed widgets as disabled
 *     placeholders. All of it persists.
 *
 * REAL — the Compendium tab browses the Open5e v2 API (default: the CC-BY-4.0 SRD; other source
 * documents only behind an explicit opt-in that shows each source's own license) with an offline
 * fallback to the bundled SRD dataset (`app/compendium/`), and IMPORTS entries through real core
 * commands: a monster dispatches `character.quick-create` (kind 'monster' — lands in the roster and
 * the EncounterBuilder), a spell dispatches `content.create-object` (subtype 'spell'). Duplicate
 * names are flagged with an explicit re-import confirm — never silent.
 *
 * REAL — the Object types tab renders the Core's declared vault-object schema registry
 * (`listVaultObjectSchemas`) with live per-subtype counts from the actor-filtered content read; the
 * System tab runs the real `previewSystemSwitch` dry-run and applies through the real
 * `widget.package.switch-system` command (fail-closed: a non-migratable vault or an unacknowledged
 * destructive drop blocks the switch); the Theme studio persists the preset choice through the same
 * mechanism Settings → Appearance uses and lists the LIVE token values of the active preset.
 *
 * HONEST LIMITS (no core command — each panel says so, no fake controls):
 *   - Community marketplace: browsing/fetching community packages needs a network backend — nothing
 *     is fetched; the panel says so and offers no fake controls.
 *   - Per-token theme overrides: presets are the architecture (ADR-011); token rows are read-only.
 *
 * Custom object types ARE now backed by the Core `content.define/update/delete-object-type`
 * commands (ADR-023): the Custom Types panel defines a type's field schema and creates instances of
 * it, dispatching through the runtime like every other panel.
 */

export function Extensions() {
	const [tab, setTab] = useState('plugins');
	const tabs = [
		{ id: 'plugins', label: 'Plugins', icon: 'widget' },
		{ id: 'compendium', label: 'Compendium', icon: 'search' },
		{ id: 'objects', label: 'Object types', icon: 'tag' },
		{ id: 'system', label: 'System', icon: 'retry' },
		{ id: 'theme', label: 'Theme studio', icon: 'theme' },
	];
	return (
		<Page max={1180}>
			<div style={{ marginBottom: 18 }}>
				<Tabs
					value={tab}
					onChange={setTab}
					tabs={tabs}
					idBase="extensions"
					aria-label="Extensions sections"
				/>
			</div>
			<div {...tabPanelProps('extensions', tab)}>
				{tab === 'plugins' && <ExtPlugins />}
				{tab === 'compendium' && <ExtCompendium />}
				{tab === 'objects' && <ExtObjects />}
				{tab === 'system' && <ExtSystem />}
				{tab === 'theme' && <ExtTheme />}
			</div>
		</Page>
	);
}
