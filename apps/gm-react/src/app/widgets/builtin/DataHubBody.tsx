import {
	isDefaultScreen,
	VAULT_OBJECT_SUBTYPE_KEY,
	getContentItemsForActor,
	listCharactersForActor,
	listScenesForActor,
} from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n';
import type { BoardWidget } from '../../board-helpers';
import { Muted, StatPill, bodyWrap, cfg } from '../../widget-body-kit';
import { LiveStats } from './live';

/** The three tabs the Data Hub can lead with, in each configured order (`tabOrder`). */
const TAB_ORDERS: Record<string, readonly ('scenes' | 'parties' | 'campaign')[]> = {
	'scenes-first': ['scenes', 'parties', 'campaign'],
	'parties-first': ['parties', 'campaign', 'scenes'],
	'campaign-first': ['campaign', 'scenes', 'parties'],
};

const TAB_LABEL: Record<string, MessageKey> = {
	scenes: 'widgetBody.dataHub.scenes',
	parties: 'widgetBody.dataHub.parties',
	campaign: 'widgetBody.dataHub.campaign',
};

/**
 * The `data-hub` Command Center widget (RC-WID-4.1) — the tabbed Scenes / Parties / Campaign tables
 * reduced to their glanceable counts, in the order the widget's own `tabOrder` field declares. The
 * `showUpdated` / `showVisibility` toggles say which optional columns the full table carries, so
 * neither is a control that changes nothing.
 *
 * Every count is an actor-scoped read: a player viewing this tile counts only what the core already
 * cleared for them.
 */
export function DataHubBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const order =
		TAB_ORDERS[cfg<string>(widget, 'tabOrder') ?? 'scenes-first'] ?? TAB_ORDERS['scenes-first'];
	const actorId = runtime.defaultActorId;
	// The default screens (the GM Screen's board, the home screen) are not table scenes — each has its
	// own destination, exactly as the hub's scenes leave them out (RC-CAN-7.6 `table-scenes`).
	const scenes = listScenesForActor(
		runtime.state.scenes,
		runtime.state.permissions,
		actorId,
	).filter((scene) => !scene.isTemplate && !isDefaultScreen(runtime.state, scene.id));
	const parties = listCharactersForActor(
		runtime.state.characters,
		runtime.state.permissions,
		actorId,
	).filter((character) => character.kind === 'pc');
	const items = getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId);
	const campaign = items.filter(
		(item) =>
			item.kind === 'object' &&
			(item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'quest' ||
				item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'faction'),
	);
	const counts = { scenes: scenes.length, parties: parties.length, campaign: campaign.length };

	const columns: string[] = [];
	if (cfg<boolean>(widget, 'showUpdated') ?? true) columns.push(t('widgetBody.dataHub.updated'));
	if (cfg<boolean>(widget, 'showVisibility') ?? true)
		columns.push(t('widgetBody.dataHub.visibility'));

	return (
		<div style={bodyWrap}>
			<LiveStats>
				{order.map((tab) => (
					<StatPill key={tab} label={t(TAB_LABEL[tab])} value={String(counts[tab])} />
				))}
			</LiveStats>
			<Muted>
				{columns.length > 0
					? t('widgetBody.dataHub.columns', { columns: columns.join(' · ') })
					: t('widgetBody.dataHub.noColumns')}
			</Muted>
		</div>
	);
}
