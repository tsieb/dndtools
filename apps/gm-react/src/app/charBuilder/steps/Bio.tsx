/**
 * CharBuilder — Step 5 — bio, DM notes and visibility.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { Textarea } from '../../../ds';
import { FieldLabel, HonestNote, Tile } from '../ui';
import type { Wizard } from '../wizard';
import { useI18n } from '../../../i18n';

export function BioStep({ w }: { w: Wizard }) {
	const { t } = useI18n();
	const { isPc, bio, setBio, dmNotes, setDmNotes, vis, setVis } = w;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<div>
				<FieldLabel>{t('charBuilder.bio')}</FieldLabel>
				<Textarea
					value={bio}
					onChange={(e: any) => setBio(e.target.value)}
					rows={4}
					placeholder={t('charBuilder.bioPlaceholder')}
					style={{ width: '100%' }}
				/>
			</div>
			<div>
				<FieldLabel hint={t('charBuilder.dmNotesHint')}>{t('charBuilder.dmNotes')}</FieldLabel>
				{isPc ? (
					// quick-create can mark data.dmNotes dm-only at creation; a finalized PC has no
					// command to mark a field DM-only afterwards — hiding beats leaking to the owner.
					<HonestNote>{t('charBuilder.dmNotesUnavailable')}</HonestNote>
				) : (
					<Textarea
						value={dmNotes}
						onChange={(e: any) => setDmNotes(e.target.value)}
						rows={3}
						placeholder={t('charBuilder.dmNotesPlaceholder')}
						style={{ width: '100%' }}
					/>
				)}
			</div>
			<div>
				<FieldLabel>{t('charBuilder.visibility')}</FieldLabel>
				{isPc ? (
					<HonestNote>
						{t('charBuilder.pcSharedBefore')} <strong>{t('charBuilder.pcSharedEmphasis')}</strong>{' '}
						{t('charBuilder.pcSharedAfter')}
					</HonestNote>
				) : (
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
						<Tile
							on={vis === 'players'}
							onClick={() => setVis('players')}
							title={t('charBuilder.playersCanSee')}
							sub={t('charBuilder.playersCanSeeSub')}
							icon="visibility-players"
							compact
						/>
						<Tile
							on={vis === 'dm-only'}
							onClick={() => setVis('dm-only')}
							title={t('common.visibility.dmOnly')}
							sub={t('charBuilder.dmOnlySub')}
							icon="dm-only"
							compact
						/>
					</div>
				)}
			</div>
		</div>
	);
}
