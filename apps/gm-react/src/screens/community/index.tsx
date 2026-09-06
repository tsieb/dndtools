import { useState } from 'react';
import { Tabs, tabPanelProps } from '../../ds';
import { Page } from '../../app/screen-kit';
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
 *     DOWNLOADS the result — one markdown file exports as .md, multiple as a .json bundle.
 *   - Campaign wiki: publishes the player-visible notes as a hosted, account-less-readable wiki via
 *     the app-api (publish/unpublish + a stable public link). Eligibility counts and the page bundle
 *     come from the live actor-filtered content read; DM-only notes are never included. Publishing is
 *     a Beacon-plan feature (server-enforced); readers open the link with NO account. Fail-closed:
 *     when the cloud backend isn't configured (or the user is signed out) this stays a labeled LOCAL
 *     PREVIEW, and a non-Beacon plan sees an honest upgrade gate instead of a dead button.
 */

export function Community() {
	const [tab, setTab] = useState('discover');
	const tabs = [
		{ id: 'discover', label: 'Discover', icon: 'globe' },
		{ id: 'export', label: 'Export', icon: 'send' },
		{ id: 'publish', label: 'Publish', icon: 'upload' },
		{ id: 'wiki', label: 'Campaign wiki', icon: 'knowledge-book' },
	];
	return (
		<Page max={1200}>
			<div style={{ marginBottom: 18 }}>
				<Tabs
					value={tab}
					onChange={setTab}
					tabs={tabs}
					idBase="community"
					aria-label="Community sections"
				/>
			</div>
			{/* One panel element, re-labelled per active tab — only one body is ever mounted, so a
			    single wrapper completes the tab/panel relationship without four near-identical divs. */}
			<div {...tabPanelProps('community', tab)}>
				{tab === 'discover' && <CommDiscover />}
				{tab === 'export' && <CommExport />}
				{tab === 'publish' && <CommPublish />}
				{tab === 'wiki' && <CommWiki />}
			</div>
		</Page>
	);
}
