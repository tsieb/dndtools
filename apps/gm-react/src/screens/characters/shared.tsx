import { CONDITIONS, Icon } from '../../ds';
import { type CharacterView } from '@dndtools/core';
import { T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';

/* The roster/sheet's shared label tables, the condition-alias normaliser, the portrait gradient
 * helpers and the screen's own back bar. Extracted from Characters.tsx unchanged (RC-STB-2.6). */

export const KIND_LABEL: Record<string, MessageKey> = {
	pc: 'characters.kind.pc',
	npc: 'characters.kind.npc',
	monster: 'characters.kind.monster',
	sidekick: 'characters.kind.sidekick',
};
export const KIND_TONE: Record<string, string> = {
	pc: 'success',
	npc: 'info',
	monster: 'error',
	sidekick: 'warning',
};
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export const STANDARD_CONDITIONS = [
	'Blinded',
	'Charmed',
	'Deafened',
	'Frightened',
	'Grappled',
	'Incapacitated',
	'Invisible',
	'Paralyzed',
	'Petrified',
	'Poisoned',
	'Prone',
	'Restrained',
	'Stunned',
	'Unconscious',
];

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const sgn = (n: number) => (n >= 0 ? `+${n}` : String(n));

export const COND_ALIAS: Record<string, string> = {
	concentrating: 'concentration',
	blessed: 'blessed',
	prone: 'prone',
	poisoned: 'poisoned',
	stunned: 'stunned',
	frightened: 'frightened',
	restrained: 'restrained',
	grappled: 'grappled',
	invisible: 'invisible',
	paralyzed: 'paralyzed',
	unconscious: 'unconscious',
	charmed: 'charmed',
	blinded: 'blinded',
	deafened: 'deafened',
	petrified: 'petrified',
	incapacitated: 'incapacitated',
	exhaustion: 'exhaustion',
};
export function condKey(s: string): string | null {
	const k = String(s).toLowerCase();
	return COND_ALIAS[k] || (CONDITIONS[k] ? k : null);
}

/** A stable card gradient angle derived from the character id (fallback when no portrait tone). */
export function gradFor(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
	return h;
}

/** The builder's "portrait tone" persists as `data.grad` (a validated `data.*` string field); older
 *  characters without one fall back to the id-derived angle. */
export function gradOf(view: CharacterView): number {
	const raw = view.data?.grad;
	const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
	return Number.isFinite(n) ? ((n % 360) + 360) % 360 : gradFor(view.id);
}

/** Map the core visibility level onto the VisibilityChip's players/dm-only axis. */
export function visChip(visibility: string) {
	return visibility === 'dm-only' ? 'dm-only' : 'players';
}

/** A human subtitle from whatever the sheet `data` actually carries, else the kind label. */
export function subtitleOf(
	view: CharacterView,
	level: number | null,
	t: (key: MessageKey) => string,
): string {
	const cls = typeof view.data.class === 'string' ? (view.data.class as string) : null;
	const bg = typeof view.data.background === 'string' ? (view.data.background as string) : null;
	const parts: string[] = [];
	if (cls) parts.push(level ? `${cls} ${level}` : cls);
	if (bg) parts.push(bg);
	return parts.join(' · ') || (KIND_LABEL[view.kind] ? t(KIND_LABEL[view.kind]) : view.kind);
}

export function BackBar({ onBack }: { onBack: () => void }) {
	const { t } = useI18n();
	return (
		<nav aria-label={t('characters.breadcrumb')} style={{ marginBottom: 14 }}>
			<button
				type="button"
				onClick={onBack}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					border: 'none',
					background: 'transparent',
					cursor: 'pointer',
					color: T.ter,
					font: `600 12px ${T.sans}`,
					letterSpacing: '.04em',
					textTransform: 'uppercase',
				}}
			>
				<Icon name="chevron-left" size={14} />
				{t('characters.title')}
			</button>
		</nav>
	);
}
