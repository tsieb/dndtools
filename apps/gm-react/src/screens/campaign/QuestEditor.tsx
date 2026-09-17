import { useEffect, useState } from 'react';
import { Button, Field, Input, Select, Textarea, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { QUEST_STATUS_OPTIONS, VIS_OPTIONS, options } from '../campaignVocab';
import { objectiveArray, str, type QuestObjective, type QuestRow } from '../campaignRows';
import type { DraftSlot } from './draftSlot';

export type QuestDraft = {
	title: string;
	status: string;
	objectivesText: string;
	body: string;
	visibility: string;
};

/**
 * Inline create/edit quest form (DM-only; the caller gates on `actorCanAuthorContent`). Structured
 * tracker data (status + objectives) lives in the subtype's declared frontmatter fields; the hook /
 * journal prose is the markdown body. Same shape as the FactionEditor beside it — editing dispatches
 * `content.update-object` so a mis-set visibility or objective list stays correctable.
 */
export function QuestEditor({
	quest,
	draft,
	onClose,
}: {
	quest: QuestRow | null;
	draft: DraftSlot<QuestDraft>;
	onClose: () => void;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const existingObjectives = objectiveArray(quest?.fields.objectives);
	const held = draft.read();
	const [title, setTitle] = useState(held?.title ?? quest?.view.title ?? '');
	const [status, setStatus] = useState(held?.status ?? (str(quest?.fields.status) || 'active'));
	const [objectivesText, setObjectivesText] = useState(
		held?.objectivesText ?? existingObjectives.map((o) => o.text).join('\n'),
	);
	const [body, setBody] = useState(held?.body ?? quest?.view.body ?? '');
	const [visibility, setVisibility] = useState<string>(
		held?.visibility ?? quest?.view.visibility ?? 'dm-only',
	);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	// Keep the surviving copy current, so a rotation across the split width restores what was typed.
	useEffect(() => {
		draft.write({ title, status, objectivesText, body, visibility });
	}, [draft, title, status, objectivesText, body, visibility]);

	async function save() {
		if (!title.trim()) {
			setErr(t('campaign.quest.needsTitle'));
			return;
		}
		setBusy(true);
		setErr(null);
		// `runtime.dispatch` RETHROWS on a persist failure (SceneRuntime.dispatchNow), and `busy` also
		// disables this panel's Cancel button — so a throw froze the editor permanently with the DM's
		// typed work unrecoverable and no way out but a reload. Any await inside a busy guard in this
		// app needs `finally`.
		try {
			const stamp = Date.now().toString(36);
			// Line i keeps existing objective i's id + done state (a text edit doesn't reset the checklist);
			// new lines become fresh unchecked objectives.
			const objectives: QuestObjective[] = objectivesText
				.split('\n')
				.map((t) => t.trim())
				.filter(Boolean)
				.map((text, i) =>
					existingObjectives[i]
						? { ...existingObjectives[i], text }
						: { id: `obj-${stamp}-${i}`, text, done: false },
				);
			const result = quest
				? // content.update-object — authorized-editor edit; merged frontmatter is re-validated.
					await runtime.dispatch({
						type: 'content.update-object',
						actorId,
						payload: {
							itemId: quest.view.id,
							title: title.trim(),
							fields: { title: title.trim(), status, objectives },
							body,
						},
					})
				: // content.create-object — DM-only vault authoring against the declared `quest` schema
					// (validated fail-closed before any durable write); visibility fails closed to dm-only.
					await runtime.dispatch({
						type: 'content.create-object',
						actorId,
						payload: {
							subtype: 'quest',
							title: title.trim(),
							fields: { title: title.trim(), status, objectives },
							body,
							visibility,
						},
					});
			if (result.status !== 'accepted') {
				setErr(result.rejection.message);
				return;
			}
			// Visibility is a SEPARATE command on edit (same split as FactionEditor / Knowledge).
			if (quest && visibility !== quest.view.visibility) {
				const vis = await runtime.dispatch({
					type: 'content.set-item-visibility',
					actorId,
					payload: { itemId: quest.view.id, visibility },
				});
				if (vis.status !== 'accepted') {
					setErr(vis.rejection.message);
					return;
				}
			}
			// Confirm the write. `onClose()` unmounts this whole Panel, so with no toast a successful
			// save was indistinguishable from a dead button: the editor vanished, focus fell to <body>,
			// and nothing anywhere said the quest had been stored.
			Toaster.success(
				quest
					? t('campaign.saved', { title: title.trim() })
					: t('campaign.created', { title: title.trim() }),
			);
			onClose();
		} catch {
			setErr(t('campaign.saveFailed'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Panel
			title={quest ? t('campaign.edit', { title: quest.view.title }) : t('campaign.quest.new')}
			accent
		>
			{/* A real <form> so Enter submits — the natural "type a title, press Enter" was a no-op. */}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (busy) return;
					void save();
				}}
				style={{ display: 'contents' }}
			>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
						gap: T.space.three,
					}}
				>
					<Field label={t('common.field.title')} required>
						<Input
							value={title}
							onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
							placeholder={t('campaign.quest.titlePlaceholder')}
						/>
					</Field>
					<Field label={t('campaign.status')}>
						<Select
							options={options(QUEST_STATUS_OPTIONS, t)}
							value={status}
							onChange={(e: { target: { value: string } }) => setStatus(e.target.value)}
						/>
					</Field>
				</div>
				<Field label={t('campaign.quest.objectives')} help={t('campaign.quest.objectivesHelp')}>
					<Textarea
						value={objectivesText}
						onChange={(e: { target: { value: string } }) => setObjectivesText(e.target.value)}
						rows={3}
						placeholder={t('campaign.quest.objectivesPlaceholder')}
					/>
				</Field>
				<Field label={t('campaign.quest.hook')} help={t('campaign.quest.hookHelp')}>
					<Textarea
						value={body}
						onChange={(e: { target: { value: string } }) => setBody(e.target.value)}
						rows={4}
						placeholder={t('campaign.quest.hookPlaceholder')}
					/>
				</Field>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<Field label={t('common.visibility.label')}>
						<Select
							options={options(VIS_OPTIONS, t)}
							value={visibility}
							onChange={(e: { target: { value: string } }) => setVisibility(e.target.value)}
						/>
					</Field>
					<div style={{ flex: 1 }} />
					{err && (
						<span role="alert" style={{ font: `12px ${T.sans}`, color: T.err }}>
							{err}
						</span>
					)}
					<Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button type="submit" variant="primary" size="sm" icon="check" disabled={busy}>
						{quest ? t('campaign.quest.save') : t('campaign.quest.create')}
					</Button>
				</div>
			</form>
		</Panel>
	);
}
