import { useEffect, useState } from 'react';
import { Button, Field, Input, Select, Textarea, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { FACTION_KIND_OPTIONS, STANCE_OPTIONS, VIS_OPTIONS, options } from '../campaignVocab';
import { str, strArray, type FactionRow } from '../campaignRows';
import type { DraftSlot } from './draftSlot';

export type FactionDraft = {
	name: string;
	kind: string;
	stance: string;
	leader: string;
	goalsText: string;
	secret: string;
	body: string;
	visibility: string;
};

/**
 * Inline create/edit dossier form (DM-only; the caller gates on `actorCanAuthorContent`, and while
 * previewing the runtime rejects every dispatch read-only anyway). Structured card data lives in the
 * subtype's declared frontmatter fields; the prose dossier is the markdown body.
 */
export function FactionEditor({
	faction,
	draft,
	onClose,
}: {
	faction: FactionRow | null;
	draft: DraftSlot<FactionDraft>;
	onClose: () => void;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const held = draft.read();
	const [name, setName] = useState(held?.name ?? faction?.view.title ?? '');
	const [kind, setKind] = useState(held?.kind ?? (str(faction?.fields.kind) || 'other'));
	const [stance, setStance] = useState(held?.stance ?? (str(faction?.fields.stance) || 'neutral'));
	const [leader, setLeader] = useState(held?.leader ?? str(faction?.fields.leader));
	const [goalsText, setGoalsText] = useState(
		held?.goalsText ?? strArray(faction?.fields.goals).join('\n'),
	);
	const [secret, setSecret] = useState(held?.secret ?? str(faction?.fields.secret));
	const [body, setBody] = useState(held?.body ?? faction?.view.body ?? '');
	// Widened to string (same as Knowledge's visibility control): the Select yields a string and the
	// core validates the enum fail-closed at dispatch.
	const [visibility, setVisibility] = useState<string>(
		held?.visibility ?? faction?.view.visibility ?? 'dm-only',
	);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	// See `useDraftSlot`: what is typed here survives the editor moving between pane and inline.
	useEffect(() => {
		draft.write({ name, kind, stance, leader, goalsText, secret, body, visibility });
	}, [draft, name, kind, stance, leader, goalsText, secret, body, visibility]);

	async function save() {
		if (!name.trim()) {
			setErr(t('campaign.faction.needsName'));
			return;
		}
		setBusy(true);
		setErr(null);
		// `runtime.dispatch` RETHROWS on a persist failure (SceneRuntime.dispatchNow), and `busy` also
		// disables this panel's Cancel button — so a throw froze the editor permanently with the DM's
		// typed work unrecoverable and no way out but a reload. Any await inside a busy guard in this
		// app needs `finally`.
		try {
			// Exactly the subtype's declared frontmatter fields — the core validates them fail-closed
			// against the `faction` schema before any durable write (an undeclared field is rejected).
			const fields = {
				name: name.trim(),
				kind,
				stance,
				leader: leader.trim(),
				goals: goalsText
					.split('\n')
					.map((g) => g.trim())
					.filter(Boolean),
				secret: secret.trim(),
			};
			const result = faction
				? // content.update-object — authorized-editor edit; merged frontmatter is re-validated.
					await runtime.dispatch({
						type: 'content.update-object',
						actorId,
						payload: { itemId: faction.view.id, title: name.trim(), fields, body },
					})
				: // content.create-object — DM-only vault authoring; visibility fails closed to dm-only.
					await runtime.dispatch({
						type: 'content.create-object',
						actorId,
						payload: { subtype: 'faction', title: name.trim(), fields, body, visibility },
					});
			if (result.status !== 'accepted') {
				setErr(result.rejection.message);
				return;
			}
			// Visibility is a SEPARATE command on edit (same split as Knowledge).
			if (faction && visibility !== faction.view.visibility) {
				const vis = await runtime.dispatch({
					type: 'content.set-item-visibility',
					actorId,
					payload: { itemId: faction.view.id, visibility },
				});
				if (vis.status !== 'accepted') {
					setErr(vis.rejection.message);
					return;
				}
			}
			// Same reason as the quest editor above: the Panel unmounts, so the toast is the only
			// confirmation a successful faction save ever produces.
			Toaster.success(
				faction
					? t('campaign.saved', { title: name.trim() })
					: t('campaign.created', { title: name.trim() }),
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
			title={
				faction ? t('campaign.edit', { title: faction.view.title }) : t('campaign.faction.new')
			}
			accent
		>
			{/* See QuestEditor — Enter submits rather than doing nothing. */}
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
					<Field label={t('campaign.faction.name')} required>
						<Input
							value={name}
							onChange={(e: { target: { value: string } }) => setName(e.target.value)}
							placeholder={t('campaign.faction.namePlaceholder')}
						/>
					</Field>
					<Field label={t('campaign.faction.kind')}>
						<Select
							options={options(FACTION_KIND_OPTIONS, t)}
							value={kind}
							onChange={(e: { target: { value: string } }) => setKind(e.target.value)}
						/>
					</Field>
					<Field label={t('campaign.faction.stance')}>
						<Select
							options={options(STANCE_OPTIONS, t)}
							value={stance}
							onChange={(e: { target: { value: string } }) => setStance(e.target.value)}
						/>
					</Field>
					<Field label={t('campaign.faction.leader')}>
						<Input
							value={leader}
							onChange={(e: { target: { value: string } }) => setLeader(e.target.value)}
							placeholder={t('campaign.faction.leaderPlaceholder')}
						/>
					</Field>
				</div>
				<Field label={t('campaign.faction.goals')} help={t('campaign.faction.goalsHelp')}>
					<Textarea
						value={goalsText}
						onChange={(e: { target: { value: string } }) => setGoalsText(e.target.value)}
						rows={3}
						placeholder={t('campaign.faction.goalsPlaceholder')}
					/>
				</Field>
				<Field label={t('campaign.faction.dossier')} help={t('campaign.faction.dossierHelp')}>
					<Textarea
						value={body}
						onChange={(e: { target: { value: string } }) => setBody(e.target.value)}
						rows={5}
						placeholder={t('campaign.faction.dossierPlaceholder')}
					/>
				</Field>
				<Field label={t('campaign.faction.secret')} help={t('campaign.faction.secretHelp')}>
					<Input
						value={secret}
						onChange={(e: { target: { value: string } }) => setSecret(e.target.value)}
						placeholder={t('campaign.faction.secretPlaceholder')}
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
						{faction ? t('campaign.faction.save') : t('campaign.faction.create')}
					</Button>
				</div>
			</form>
		</Panel>
	);
}
