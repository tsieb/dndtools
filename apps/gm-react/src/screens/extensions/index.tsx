import { useState } from 'react';
import { Tabs, tabPanelProps } from '../../ds';
import { Page } from '../../app/screen-kit';
import { ExtPlugins } from './Plugins';
import { ExtCompendium } from './Compendium';
import { ExtObjects } from './ObjectTypes';
import { ExtSystem } from './System';
import { ExtTheme } from './ThemeStudio';
import { useI18n } from '../../i18n';

/**
 * Extensions & Systems — plugins, compendium import, custom object types, the rules-system switch, and
 * the theme studio (port of app.jsx ExtensibilitySection).
 *
 * REAL CORE WIRING — the Plugins tab is the live widget-package registry (`runtime.state.widgets`):
 *   - the installed list renders the actual registry records with the capability/host-permission
 *     profile computed by `buildWidgetPackageReviewSummary` and their trust posture;
 *   - install (bundled starter library or pasted package JSON), enable, disable, remove and upgrade
 *     all dispatch the real `widget.package.*` commands (DM-only). Installs land unreviewed with
 *     every host permission denied — fail-closed. RC-WID-1.5 added the way out: each card opens a
 *     TRUST REVIEW sheet listing every permission the package asks for with the review summary's
 *     reasoning, and the DM's Allow/Deny decisions dispatch `widget.package.review`, which is what
 *     the sandbox host answers a widget's `requestPermission` from. A denied package is disabled and
 *     cannot be re-enabled until it is reviewed again. Upgrades run declared migrations against
 *     every placed widget; removes leave placed widgets as disabled placeholders. All of it
 *     persists.
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
 * System tab is the SYSTEM PACKAGE PICKER (RC-SYS-3.1) over the packages installed in the `systems`
 * slice — each card describes what that package declares, choosing one runs the real
 * `previewSystemPackageSelect` dry-run and applies through `system.select`, "Build your own"
 * dispatches `system.fork`, and the widget-package switch (`previewSystemSwitch` gating
 * `widget.package.switch-system`) keeps its own section below the gallery. Both are fail-closed: a
 * non-migratable vault or an unacknowledged destructive drop blocks the switch. The Theme studio
 * persists the preset choice through the same
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
	const { t } = useI18n();
	const [tab, setTab] = useState('plugins');
	const tabs = [
		{ id: 'plugins', label: t('extensions.tab.plugins'), icon: 'widget' },
		{ id: 'compendium', label: t('extensions.tab.compendium'), icon: 'search' },
		{ id: 'objects', label: t('extensions.tab.objects'), icon: 'tag' },
		{ id: 'system', label: t('extensions.tab.system'), icon: 'retry' },
		{ id: 'theme', label: t('extensions.tab.theme'), icon: 'theme' },
	];
	return (
		<Page max={1180}>
			<div style={{ marginBottom: 18 }}>
				<Tabs
					value={tab}
					onChange={setTab}
					tabs={tabs}
					idBase="extensions"
					aria-label={t('extensions.sections')}
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
