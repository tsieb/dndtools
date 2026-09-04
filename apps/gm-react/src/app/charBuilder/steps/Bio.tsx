/**
 * CharBuilder — Step 5 — bio, DM notes and visibility.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { Textarea } from '../../../ds';
import { FieldLabel, HonestNote, Tile } from '../ui';
import type { Wizard } from '../wizard';

export function BioStep({ w }: { w: Wizard }) {
	const { isPc, bio, setBio, dmNotes, setDmNotes, vis, setVis } = w;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<div>
				<FieldLabel>Bio</FieldLabel>
				<Textarea
					value={bio}
					onChange={(e: any) => setBio(e.target.value)}
					rows={4}
					placeholder="Who are they, and why are they here?"
					style={{ width: '100%' }}
				/>
			</div>
			<div>
				<FieldLabel hint="Never shown to players">DM notes</FieldLabel>
				{isPc ? (
					// quick-create can mark data.dmNotes dm-only at creation; a finalized PC has no
					// command to mark a field DM-only afterwards — hiding beats leaking to the owner.
					<HonestNote>
						DM-only notes aren't available on a guided PC yet — a PC is shared with its owning
						player, and a field can't be made DM-only after creation.
					</HonestNote>
				) : (
					<Textarea
						value={dmNotes}
						onChange={(e: any) => setDmNotes(e.target.value)}
						rows={3}
						placeholder="Secrets, leverage, how you'll play them."
						style={{ width: '100%' }}
					/>
				)}
			</div>
			<div>
				<FieldLabel>Visibility</FieldLabel>
				{isPc ? (
					<HonestNote>
						A new PC starts <strong>shared with its owning player</strong> — the core's guided-flow
						rule (CHAR-002). The DM can widen who sees it afterwards from the character sheet's
						Sharing controls.
					</HonestNote>
				) : (
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
						<Tile
							on={vis === 'players'}
							onClick={() => setVis('players')}
							title="Players can see"
							sub="On the party roster and shared scenes"
							icon="visibility-players"
							compact
						/>
						<Tile
							on={vis === 'dm-only'}
							onClick={() => setVis('dm-only')}
							title="DM only"
							sub="Hidden until you reveal them"
							icon="dm-only"
							compact
						/>
					</div>
				)}
			</div>
		</div>
	);
}
