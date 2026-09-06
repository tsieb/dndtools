import { useEffect, useState } from 'react';
import type { MapListEntry, PrepRecapDigest, SessionArchiveSnapshot } from '@dndtools/core';
import { Button, Select, Textarea, VisibilityChip } from '../../ds';
import { useI18n } from '../../i18n';
import { Panel, T, eb } from '../../app/screen-kit';

// ── Prep & recap (SES-009 — the continuity digest, session archives, recap authoring) ─────────────

function formatArchiveStamp(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * RC-MAP-2.6 — the archived encounter's final map: the map that was active when the DM ended the
 * session, with a dot for every combat token still on it at archive time (the `combat.tokens` /
 * `combat.templates` RC-MAP-1.1/1.2 wrote survive into the snapshot untouched — `archiveCurrentSession`
 * copies the whole `combat` slice, so there is nothing new to persist here). This is a POSITION
 * thumbnail, not a rendered map (no walls/terrain) — the label says so rather than implying more.
 */
function ArchiveFinalMap({
	archive,
	mapName,
}: {
	archive: SessionArchiveSnapshot;
	mapName: string | null;
}) {
	const { t } = useI18n();
	const activeMap = archive.activeMap;
	if (!activeMap) return null;
	const tokens = Object.entries(archive.combat.tokens)
		.filter(([, token]) => token.mapId === activeMap.mapId)
		.map(([combatantId, token]) => ({ token, combatant: archive.combat.combatants[combatantId] }));

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
			<div
				aria-hidden
				style={{
					position: 'relative',
					width: 72,
					height: 54,
					flex: '0 0 auto',
					borderRadius: 6,
					border: `1px solid ${T.bd}`,
					background: T.sunken,
					overflow: 'hidden',
				}}
			>
				{tokens.map(({ token, combatant }, i) => (
					<span
						key={i}
						title={combatant?.name}
						style={{
							position: 'absolute',
							left: `${token.x * 100}%`,
							top: `${token.y * 100}%`,
							transform: 'translate(-50%, -50%)',
							width: 6,
							height: 6,
							borderRadius: '50%',
							background: combatant?.kind === 'character' ? T.acc : T.sub,
						}}
					/>
				))}
			</div>
			<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
				{t('session.prep.finalMap', { name: mapName ?? activeMap.mapId })}
				{tokens.length === 0 && (
					<>
						<br />
						{t('session.prep.finalMapNoTokens')}
					</>
				)}
			</div>
		</div>
	);
}

/**
 * RecapPanel — the DM-only SES-009 surface: the computed prep/recap continuity digest (pure
 * derivation, never a copied dataset), the durable session archives, and recap AUTHORING via
 * `session.author-recap` (markdown onto the selected archive; re-saving replaces it). Ending a live
 * session into Recap is what creates an archive — the empty state says so instead of faking one.
 */
export function RecapPanel({
	digest,
	archives,
	maps,
	defaultArchiveId,
	previewing,
	onAuthor,
}: {
	digest: PrepRecapDigest;
	archives: SessionArchiveSnapshot[];
	maps: MapListEntry[];
	defaultArchiveId: string | null;
	previewing: boolean;
	onAuthor: (archiveId: string, markdown: string) => Promise<boolean>;
}) {
	const { t } = useI18n();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [busy, setBusy] = useState(false);
	const target =
		archives.find((a) => a.id === (selectedId ?? defaultArchiveId)) ?? archives[0] ?? null;

	// Seed the editor from the canonical authored recap whenever the target archive (or its authored
	// revision) changes — same sync-from-canonical pattern as CampaignDatePanel.
	const seedKey = target ? `${target.id}:${target.recap?.revision ?? 0}` : 'none';
	useEffect(() => {
		setDraft(target?.recap?.markdown ?? '');
		// eslint-disable-next-line react-hooks/exhaustive-deps -- seed from the canonical recap only
	}, [seedKey]);

	const prompts = digest.continuityPrompts.slice(0, 6);

	async function save() {
		if (!target || busy) return;
		setBusy(true);
		// `runtime.dispatch` rethrows on a persist failure, and `busy` disables "Update recap" too, so a
		// throw froze the recap panel with the DM's unsaved markdown and no way out but a reload.
		try {
			await onAuthor(target.id, draft);
		} finally {
			setBusy(false);
		}
	}

	return (
		// The whole panel (digest + recap authoring) is DM-only — labeled explicitly in the header.
		<Panel title={t('session.prep.title')} action={<VisibilityChip level="dm-only" compact />}>
			<div>
				<div style={{ ...eb, marginBottom: 5 }}>
					{t(digest.mode === 'recap' ? 'session.prep.whatHappened' : 'session.prep.carryInto')}
				</div>
				{prompts.length === 0 ? (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{t('session.prep.nothingToCarry')}
					</div>
				) : (
					prompts.map((p) => (
						<div
							key={p.id}
							style={{
								display: 'flex',
								alignItems: 'baseline',
								gap: 7,
								font: `12.5px/1.6 ${T.sans}`,
								color: T.sub,
							}}
						>
							<span
								aria-hidden
								style={{
									width: 5,
									height: 5,
									borderRadius: '50%',
									background: T.accBd,
									flexShrink: 0,
									transform: 'translateY(-2px)',
								}}
							/>
							<span style={{ minWidth: 0 }}>{p.text}</span>
						</div>
					))
				)}
			</div>

			<div
				style={{
					borderTop: `1px solid ${T.bd}`,
					paddingTop: 10,
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
				}}
			>
				<div style={eb}>{t('session.prep.archives')}</div>
				{archives.length === 0 ? (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('session.prep.noArchives')}</div>
				) : (
					<>
						{archives.length > 1 && (
							<Select
								aria-label={t('session.prep.archivedSession')}
								value={target?.id ?? ''}
								options={archives.map((a) => ({
									value: a.id,
									label: `${formatArchiveStamp(a.archivedAt)}${a.recap ? ` · ${t('session.prep.hasRecap')}` : ''}`,
								}))}
								onChange={(e: { target: { value: string } }) => setSelectedId(e.target.value)}
							/>
						)}
						{target && (
							<>
								<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
									{formatArchiveStamp(target.archivedAt)}
									{target.recap
										? ` · ${t('session.prep.recapRevision', { revision: target.recap.revision })}`
										: ` · ${t('session.prep.noRecapYet')}`}
								</div>
								{target.activeMap && (
									<ArchiveFinalMap
										archive={target}
										mapName={maps.find((m) => m.id === target.activeMap?.mapId)?.name ?? null}
									/>
								)}
								<Textarea
									value={draft}
									onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
									rows={4}
									aria-label={t('session.prep.recapField')}
									placeholder={t('session.prep.recapPlaceholder')}
								/>
								<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
									{t('session.prep.markdownHelp')}
								</div>
								<Button
									variant="primary"
									size="sm"
									icon="check"
									// An existing recap has to be clearable: gating on `!draft.trim()`
									// unconditionally meant emptying the box disabled the only control that
									// could store the emptied value, so a wrong recap was permanent.
									disabled={previewing || busy || (!draft.trim() && !target.recap)}
									onClick={() => void save()}
								>
									{t(target.recap ? 'session.prep.updateRecap' : 'session.prep.saveRecap')}
								</Button>
							</>
						)}
					</>
				)}
			</div>
		</Panel>
	);
}
