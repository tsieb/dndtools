import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildWikilinkCandidatesForActor, getNoteRelationshipsForActor } from '@dndtools/core';
import { Button, EmptyState } from '../../ds';
import { Page, Panel, srOnly, useSingleColumn } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { BackBar } from './shared';
import { sheetCapabilitiesFor } from './sheet/capabilities';
import { useSheetFeedback } from './sheet/feedback';
import { SheetBody } from './sheet/SheetBody';
import { SheetHeader } from './sheet/SheetHeader';
import { buildSheetSubject } from './sheet/subject';

/**
 * `/characters/:id` — the roster's frame (back bar, identity header, rename) around the one sheet body
 * (RC-CHR-6.2) that `/player` and the companion render too. Which panels and controls appear is the
 * core's answer for this actor on this character (`sheetCapabilitiesFor`), never this route.
 */
export function CharacterSheet({ id, onBack }: { id: string; onBack: () => void }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	// Also true in the rail tier's detail pane (RC-UX-4.3), which is phone-width by construction.
	const singleColumn = useSingleColumn();
	const actorId = runtime.defaultActorId;
	const [nameDraft, setNameDraft] = useState('');
	const [editingName, setEditingName] = useState(false);
	// Every durable edit on this sheet changes only a number or a pill, which is invisible to assistive
	// tech, so each write announces itself through the header's one polite region.
	const feedback = useSheetFeedback({
		run: async (command) => {
			const result = await runtime.dispatch(command);
			return result.status === 'rejected'
				? { ok: false, message: result.rejection.message }
				: { ok: true };
		},
		newId: () => runtime.newId(),
		// `runtime.dispatch` RETHROWS after a failed persist; without this the control looked inert.
		failure: (cause) =>
			cause instanceof Error ? cause.message : 'That change couldn’t be saved — try again.',
	});
	// The visibility gate runs first inside the builder; the raw record is read only after it passed.
	const subject = useMemo(
		() => buildSheetSubject(runtime.state, actorId, id),
		[runtime.state, actorId, id],
	);
	// RC-KNW-6.1: notes that link this character, through the same actor-scoped relationship read.
	const backlinks = getNoteRelationshipsForActor(
		runtime.state.content,
		runtime.state.permissions,
		actorId,
		id,
		runtime.state,
	).backlinks;

	if (!subject) {
		return (
			<Page max={920}>
				<BackBar onBack={onBack} />
				<h2 style={srOnly}>{t('characters.detailsHeading')}</h2>
				<EmptyState
					icon="dm-only"
					title={t('characters.unavailableTitle')}
					description={t('characters.unavailableBody')}
				/>
			</Page>
		);
	}
	const caps = sheetCapabilitiesFor(runtime.state, actorId, id, runtime.readOnly);

	async function saveName() {
		setEditingName(false);
		const next = nameDraft.trim();
		if (!next || next === subject!.view.name) return;
		await feedback.io.dispatch(
			{
				type: 'character.edit-field',
				actorId,
				payload: { characterId: id, path: 'name', value: next },
			},
			`Renamed to ${next}.`,
		);
	}

	return (
		<Page max={1000}>
			<SheetHeader
				view={subject.view}
				canRename={caps.manage}
				advancement={subject.advancement}
				note={feedback.note}
				error={feedback.error}
				nameDraft={nameDraft}
				setNameDraft={setNameDraft}
				editingName={editingName}
				setEditingName={setEditingName}
				saveName={saveName}
				onBack={onBack}
			/>
			<SheetBody
				subject={subject}
				caps={caps}
				actorId={actorId}
				io={feedback.io}
				singleColumn={singleColumn}
				compact={singleColumn}
				idBase="character-sheet"
				onSectionChange={feedback.clear}
			/>
			<Panel title={t('knowledge.backlinks')}>
				{backlinks.map((link) => (
					<Button
						key={link.sourceId}
						variant="ghost"
						onClick={() =>
							navigate(
								buildWikilinkCandidatesForActor(
									runtime.state.content,
									runtime.state.permissions,
									actorId,
									runtime.state,
								).find((target) => target.id === link.sourceId)?.route ?? '/knowledge',
							)
						}
					>
						{link.sourceTitle}
					</Button>
				))}
			</Panel>
		</Page>
	);
}
