import { useState } from 'react';
import { Button, Dialog, SessionTimeline } from '../../ds';
import { Panel, Seg, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';

/**
 * RC-CHR-1.2 — the DM's "Call a rest". A rest is called at the table for everyone at once, so this
 * dispatches one `character.rest` per player character rather than asking six players to each press
 * their own button. It deliberately does NOT spend anybody's hit dice: which dice to burn is the
 * player's decision, taken on their own sheet (`app/character/RestDialog.tsx`), so the party rest
 * recovers what the system package says a rest recovers and nothing that belongs to a player.
 *
 * Fail closed: with no player characters in the roster the confirm is disabled and the dialog says
 * why, rather than offering a press that would dispatch nothing.
 */
export function CallRestDialog({
	open,
	partyCount,
	onClose,
	onConfirm,
}: {
	open: boolean;
	partyCount: number;
	onClose: () => void;
	onConfirm: (rest: 'short' | 'long') => void;
}) {
	if (!open) return null;
	return <CallRestForm partyCount={partyCount} onClose={onClose} onConfirm={onConfirm} />;
}

function CallRestForm({
	partyCount,
	onClose,
	onConfirm,
}: {
	partyCount: number;
	onClose: () => void;
	onConfirm: (rest: 'short' | 'long') => void;
}) {
	const { t } = useI18n();
	const [rest, setRest] = useState<'short' | 'long'>('short');
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('session.rest.title')}
			description={t('session.rest.description')}
			icon="recent"
			size="sm"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose}>
						{t('session.rest.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon={rest === 'long' ? 'theme' : 'recent'}
						disabled={partyCount === 0}
						onClick={() => partyCount > 0 && onConfirm(rest)}
					>
						{t('session.rest.confirm')}
					</Button>
				</>
			}
		>
			<div style={{ display: 'grid', gap: T.space.three }}>
				<Seg
					value={rest}
					ariaLabel={t('character.rest.kindLabel')}
					onChange={(value) => setRest(value as 'short' | 'long')}
					options={[
						{ value: 'short', label: t('character.rest.short') },
						{ value: 'long', label: t('character.rest.long') },
					]}
				/>
				<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>
					{partyCount === 0
						? t('session.rest.noParty')
						: t('session.rest.applies', { count: partyCount })}
				</div>
			</div>
		</Dialog>
	);
}

/** One rest already taken this session, read from the character's durable expenditure history. */
export interface RestTimelineEntry {
	id: string;
	characterName: string;
	/** The core's own label for the rest ("Short rest — spent 2 hit dice, regained 9 HP"). */
	label: string;
	at: string;
	rest: 'short' | 'long';
}

/**
 * RC-CHR-1.2 — the rest timeline. Every accepted rest already writes one durable entry on the
 * resting character's expenditure history; this reads those back so the DM can see, in one place,
 * who has rested and what it cost them. Nothing is stored twice: the panel is a projection of the
 * ledger the core writes, so it cannot drift from what actually happened.
 */
export function RestTimelinePanel({ entries }: { entries: readonly RestTimelineEntry[] }) {
	const { t } = useI18n();
	if (entries.length === 0) return null;
	return (
		<Panel title={t('session.rest.timeline')}>
			<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>
				{t('session.rest.timelineHelp')}
			</div>
			<SessionTimeline
				entries={entries.map((entry, index) => ({
					time: new Date(entry.at).toLocaleTimeString(undefined, {
						hour: 'numeric',
						minute: '2-digit',
					}),
					title: entry.characterName,
					detail: entry.label,
					icon: entry.rest === 'long' ? 'theme' : 'recent',
					tone: 'info',
					active: index === 0,
				}))}
			/>
		</Panel>
	);
}
