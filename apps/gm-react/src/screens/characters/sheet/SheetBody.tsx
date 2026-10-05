import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, tabPanelProps } from '../../../ds';
import { CharacterHistoryTimeline } from '../../../app/character/History';
import { useI18n, type MessageKey } from '../../../i18n';
import { PlayerLevelUp } from '../../player/Advancement';
import { PlayerEquipment } from '../../player/Equipment';
import { PlayerJournal } from '../../player/Journal';
import { PreparedSpellsPanel, ResourcesPanel, RestPanel } from '../../player/Vitals';
import '../../player/sheet.css';
import { AbilitiesPanel } from './AbilitiesPanel';
import { AttacksPanel } from './AttacksPanel';
import { BioPanel } from './BioPanel';
import {
	admits,
	sheetPlan,
	type SheetCapabilities,
	type SheetPanelId,
	type SheetSectionId,
} from './capabilities';
import { CombatPanel } from './CombatPanel';
import { DeathSavesPanel } from './DeathSavesPanel';
import { BackstoryPanel, IdentityPanel } from './IdentityPanel';
import { ReferencePanel } from './ReferencePanel';
import { SharingPanel } from './SharingPanel';
import { SpellsPanel } from './SpellsPanel';
import type { SheetIO, SheetSubject } from './subject';
import { TagsPanel } from './TagsPanel';
import type { VitalsWrite } from './VitalsBlock';
import { XpPanel } from './XpPanel';

const SECTION_TAB: Record<SheetSectionId, { label: MessageKey; icon: string }> = {
	sheet: { label: 'player.tab.sheet', icon: 'characters-person' },
	resources: { label: 'player.tab.resources', icon: 'sparkle' },
	levelup: { label: 'player.tab.levelUp', icon: 'flag' },
	journal: { label: 'player.tab.journal', icon: 'note-edit' },
	history: { label: 'player.tab.history', icon: 'recent' },
};

/** A section the frame adds beside the sheet's own, e.g. the DM shell's Party tab. Not a sheet panel. */
export interface FrameSection {
	id: string;
	label: string;
	icon: string;
	/** The sheet section it follows in the tab order. */
	after: SheetSectionId;
	render: () => ReactNode;
}

/**
 * RC-CHR-6.2 — the one character sheet body. `/characters/:id`, `/player` and the companion's Sheet all
 * render it; what differs between them is only the frame around it (header, picker, strip) and the
 * capabilities the core grants the viewer. Which panels exist comes from {@link sheetPlan}; which
 * controls a panel draws comes from the same `caps`. Layout follows the viewport (`singleColumn`,
 * `compact`), never the route. Every panel carries `data-sheet-panel` so the composition is testable.
 */
export function SheetBody({
	subject,
	caps,
	actorId,
	io,
	writeVitals,
	singleColumn,
	compact,
	idBase,
	section,
	onSectionChange,
	frameSections = [],
}: {
	subject: SheetSubject;
	caps: SheetCapabilities;
	actorId: string;
	io: SheetIO;
	/** How a CHAR-007 vitals change is applied; defaults to `character.update-combat-resource`. */
	writeVitals?: (write: VitalsWrite) => Promise<boolean>;
	singleColumn: boolean;
	compact: boolean;
	/** The tabs' id base (`tabPanelProps`); unique per page. */
	idBase: string;
	/** The open section when the frame controls it (the DM shell clears its banners on a switch). */
	section?: string;
	onSectionChange?: (next: string) => void;
	frameSections?: FrameSection[];
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [ownSection, setOwnSection] = useState('sheet');
	const plan = sheetPlan(caps);
	const tabs: { id: string; label: string; icon: string }[] = [];
	for (const { section: id } of plan) {
		tabs.push({ id, label: t(SECTION_TAB[id].label), icon: SECTION_TAB[id].icon });
		for (const extra of frameSections.filter((f) => f.after === id))
			tabs.push({ id: extra.id, label: extra.label, icon: extra.icon });
	}
	const requested = section ?? ownSection;
	const active = tabs.some((tab) => tab.id === requested) ? requested : 'sheet';
	const change = (next: string) => {
		setOwnSection(next);
		onSectionChange?.(next);
	};
	const vitals =
		writeVitals ??
		((write: VitalsWrite) =>
			io.dispatch({
				type: 'character.update-combat-resource',
				actorId,
				payload: { characterId: subject.id, ...write },
			}));
	const props = { subject, actorId, io };
	const panel = (id: SheetPanelId, node: ReactNode) =>
		admits(caps, id) ? (
			<div key={id} data-sheet-panel={id} style={{ display: 'contents' }}>
				{node}
			</div>
		) : null;
	const columns = (count: 1 | 2): CSSProperties | undefined =>
		singleColumn || count === 1 ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined;

	const frameSection = frameSections.find((f) => f.id === active);

	return (
		<>
			<div style={{ marginBottom: 'var(--space-4)' }}>
				<Tabs
					aria-label={t('player.sections')}
					value={active}
					onChange={change}
					tabs={tabs}
					idBase={idBase}
				/>
			</div>
			{/* One panel element, re-labelled per active tab — only one body is ever mounted. Keyed by
			    the character so a switch never carries one character's drafts onto the next. */}
			<div {...tabPanelProps(idBase, active)} key={subject.id}>
				{active === 'sheet' && (
					<div className="character-sheet" data-testid="character-sheet" style={columns(2)}>
						<div className="character-sheet-column">
							{panel('abilities', <AbilitiesPanel subject={subject} />)}
							{panel(
								'attacks',
								<AttacksPanel {...props} canEdit={caps.manage} compact={compact} />,
							)}
							{panel(
								'equipment',
								<PlayerEquipment
									charId={subject.id}
									actorId={actorId}
									inventory={subject.inventory}
									encumbrance={subject.encumbrance}
									canManage={caps.manage}
									dispatch={io.dispatch}
								/>,
							)}
							{panel(
								'bio',
								<BioPanel
									view={subject.view}
									mentions={subject.mentions}
									onOpenMention={(hit) =>
										navigate(hit.type === 'note' ? `/knowledge/${hit.id}` : '/campaign')
									}
								/>,
							)}
						</div>
						<div className="character-sheet-column">
							{panel('combat', <CombatPanel {...props} caps={caps} writeVitals={vitals} />)}
							{panel('spellcasting', <SpellsPanel {...props} canEdit={caps.manage} />)}
							{panel(
								'identity',
								<IdentityPanel {...props} canEdit={caps.manage} compact={compact} />,
							)}
							{panel('backstory', <BackstoryPanel {...props} canEdit={caps.manage} />)}
							{panel('reference', <ReferencePanel view={subject.view} />)}
							{panel(
								'tags',
								<TagsPanel
									view={subject.view}
									canEdit={caps.manage}
									onSave={(value) =>
										io.dispatch(
											{
												type: 'character.edit-field',
												actorId,
												payload: { characterId: subject.id, path: 'data.tags', value },
											},
											t('characters.tagsSaved'),
										)
									}
								/>,
							)}
							{panel('sharing', <SharingPanel {...props} />)}
						</div>
					</div>
				)}
				{active === 'resources' && (
					<div className="character-sheet" style={columns(compact ? 1 : 2)}>
						<div className="character-sheet-column">
							{panel('resources', <ResourcesPanel {...props} caps={caps} compact={compact} />)}
						</div>
						<div className="character-sheet-column">
							{panel('death-saves', <DeathSavesPanel subject={subject} />)}
							{panel('rest', <RestPanel {...props} />)}
							{panel('prepared-spells', <PreparedSpellsPanel {...props} caps={caps} />)}
						</div>
					</div>
				)}
				{active === 'levelup' && (
					<div className="character-sheet-column">
						{panel('xp', <XpPanel {...props} />)}
						{panel(
							'level-up',
							<PlayerLevelUp
								charId={subject.id}
								actorId={actorId}
								advancement={subject.advancement}
								xpEligible={subject.xpEligible}
								milestoneEligible={subject.milestoneEligible}
								dispatch={io.dispatch}
							/>,
						)}
					</div>
				)}
				{active === 'journal' &&
					panel(
						'journal',
						<PlayerJournal
							charId={subject.id}
							actorId={actorId}
							entries={subject.journal}
							canAuthor={caps.manage}
							compact={compact}
							dispatch={io.dispatch}
						/>,
					)}
				{active === 'history' &&
					panel(
						'history',
						<CharacterHistoryTimeline
							characterName={subject.view.name}
							entries={subject.journal}
						/>,
					)}
				{frameSection?.render()}
			</div>
		</>
	);
}
