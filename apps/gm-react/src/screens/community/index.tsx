import { useState } from 'react';
import { Page, Panel, T } from '../../app/screen-kit';
import { EmptyState, Tabs, tabPanelProps } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { CommDiscover } from './Discover';
import { CommExport } from './Export';
import { CommPublish } from './Publish';
import { CommWiki } from './Wiki';

/**
 * Community — discover/publish marketplace modules and export your work.
 *
 * REAL WIRING:
 *   - Discover / Publish: the app-api marketplace (list/fetch/publish/delete). Installing runs the
 *     EXISTING `widget.package.install`/`upgrade` review flow — packages land unreviewed with every
 *     host permission denied (fail-closed), enabled later in Extensions → Plugins. Fail-closed gate
 *     when the cloud backend isn't configured or the user is signed out.
 *   - Export: dispatches the real `content.export` (mode + item-type scope are REAL core params) and
 *     DOWNLOADS the result — one markdown file exports as .md, multiple as a .json bundle. Module
 *     files save/install a `.dndmodule` bundle (ADR-034) with no account: the same format and the
 *     same per-kind install review Discover runs, so a module can be shared by hand.
 *   - Campaign wiki: publishes the player-visible notes as a hosted, account-less-readable wiki via
 *     the app-api (publish/unpublish + a stable public link). Eligibility counts and the page bundle
 *     come from the live actor-filtered content read; DM-only notes are never included. Publishing is
 *     a Beacon-plan feature (server-enforced); readers open the link with NO account. Fail-closed:
 *     when the cloud backend isn't configured (or the user is signed out) this stays a labeled LOCAL
 *     PREVIEW, and a non-Beacon plan sees an honest upgrade gate instead of a dead button.
 */

export function Community() {
	const { t } = useI18n();
	const [tab, setTab] = useState('discover');
	const runtime = useRuntime();
	const tabs = [
		{ id: 'discover', label: t('community.tab.discover'), icon: 'globe' },
		{ id: 'export', label: t('community.tab.export'), icon: 'send' },
		{ id: 'publish', label: t('community.tab.publish'), icon: 'upload' },
		{ id: 'wiki', label: t('community.tab.wiki'), icon: 'knowledge-book' },
	];
	if (runtime.readOnly)
		return (
			<Page max={1200}>
				<Panel title={t('community.preview.title')}>
					<EmptyState illustration="community-empty" description={t('player.blockedPreview')} />
				</Panel>
			</Page>
		);

	return (
		<Page max={1200}>
			<div style={{ marginBottom: T.space.five }}>
				<Tabs
					value={tab}
					onChange={setTab}
					tabs={tabs}
					idBase="community"
					aria-label={t('community.sections')}
				/>
			</div>
			{/* One panel element, re-labelled per active tab — only one body is ever mounted, so a
			    single wrapper completes the tab/panel relationship without four near-identical divs. */}
			<div style={{ minWidth: 0, overflowWrap: 'anywhere' }} {...tabPanelProps('community', tab)}>
				{tab === 'discover' && <CommDiscover />}
				{tab === 'export' && <CommExport />}
				{tab === 'publish' && <CommPublish />}
				{tab === 'wiki' && <CommWiki />}
			</div>
		</Page>
	);
}
