/**
 * RC-SYS-3.1 — the System Package Picker's data-only vocabulary: how the picker names a package's
 * dice and turn models, its tier and its sigil, and how it turns a `SystemPackage` into the chips a
 * gallery card shows and the rows the detail view's "declares" grid shows. Pure over the package —
 * every value is READ OFF the package, never a hard-coded per-system table, so a forked or imported
 * system describes itself through exactly the same path as a built-in.
 *
 * Lives beside `System.tsx` rather than inside it to keep that screen under its file-size baseline
 * (RC-STB-2.7), the same shape as `campaignVocab.ts`.
 */
import {
	isBuiltInSystemPackageId,
	type SystemPackage,
	type SystemPackageSelectFinding,
} from '@dndtools/core';
import type { MessageKey } from '../../i18n';

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

/** How the picker names each package's dice model. */
export const DICE_MODEL_COPY: Record<string, MessageKey> = {
	'd20-plus-modifier': 'extensions.system.dice.d20',
	'dice-pool': 'extensions.system.dice.pool',
	'2d6-pbta': 'extensions.system.dice.2d6',
	custom: 'extensions.system.dice.custom',
};

/** How the picker names each package's turn model. */
export const TURN_MODEL_COPY: Record<string, MessageKey> = {
	initiative: 'extensions.system.turn.initiative',
	'actions-per-turn': 'extensions.system.turn.actions',
	popcorn: 'extensions.system.turn.popcorn',
	none: 'extensions.system.turn.none',
};

export const FINDING_TONE: Record<string, 'success' | 'warning' | 'error'> = {
	keep: 'success',
	remap: 'warning',
	drop: 'error',
};
export const FINDING_LABEL: Record<string, MessageKey> = {
	keep: 'extensions.system.finding.keep',
	remap: 'extensions.system.finding.remap',
	drop: 'extensions.system.finding.drop',
};
export const CATEGORY_LABEL: Record<string, MessageKey> = {
	attribute: 'extensions.system.category.attribute',
	resource: 'extensions.system.category.resource',
	condition: 'extensions.system.category.condition',
	skill: 'extensions.system.category.skill',
};

/**
 * RC-SYS-3.2 — the dry-run dialog groups its findings under these three headings (maps directly /
 * carries over / drops) rather than one flat list, in this order — the safe half first, the
 * destructive half last, right above the typed acknowledgment it gates.
 */
export const FINDING_GROUP_ORDER: SystemPackageSelectFinding['effect'][] = [
	'keep',
	'remap',
	'drop',
];
export const FINDING_GROUP_LABEL: Record<SystemPackageSelectFinding['effect'], MessageKey> = {
	keep: 'extensions.system.select.group.keep',
	remap: 'extensions.system.select.group.remap',
	drop: 'extensions.system.select.group.drop',
};

/** A package's sigil: forked packages read as authored, built-ins as shipped. */
export function sigilFor(pkg: SystemPackage): string {
	if (!isBuiltInSystemPackageId(pkg.id)) return 'wand';
	return pkg.turnModel.kind === 'none' ? 'feather' : 'sword';
}

export function tierFor(pkg: SystemPackage, t: Translate): string {
	return isBuiltInSystemPackageId(pkg.id)
		? t('extensions.system.tier.builtIn')
		: t('extensions.system.tier.custom');
}

/** The four headline chips on a gallery card — the shape of the rules, at a glance. */
export function chipsFor(pkg: SystemPackage, t: Translate): { icon: string; label: string }[] {
	return [
		{
			icon: 'sliders',
			label: t('extensions.system.chip.attributes', { count: pkg.attributes.length }),
		},
		{
			icon: 'heart',
			label: t('extensions.system.chip.resources', { count: pkg.resources.length }),
		},
		{
			icon: 'warning',
			label: t('extensions.system.chip.conditions', { count: pkg.conditions.length }),
		},
		{ icon: 'dice', label: t(DICE_MODEL_COPY[pkg.dice.model] ?? 'extensions.system.dice.custom') },
	];
}

/** The detail view's "what this package declares" grid, read straight off the package. */
export function declaresFor(
	pkg: SystemPackage,
	t: Translate,
): { icon: string; term: string; value: string }[] {
	const list = (labels: string[], empty: MessageKey): string =>
		labels.length > 0 ? labels.join(' · ') : t(empty);
	return [
		{
			icon: 'sliders',
			term: t('extensions.system.declares.attributes'),
			value: list(
				pkg.attributes.map((a) => a.abbreviation),
				'extensions.system.declares.noAttributes',
			),
		},
		{
			icon: 'heart',
			term: t('extensions.system.declares.resources'),
			value: list(
				pkg.resources.map((r) => r.label),
				'extensions.system.declares.noResources',
			),
		},
		{
			icon: 'warning',
			term: t('extensions.system.declares.conditions'),
			value: list(
				pkg.conditions.map((c) => c.label),
				'extensions.system.declares.noConditions',
			),
		},
		{
			icon: 'dice',
			term: t('extensions.system.declares.dice'),
			value: `${t(DICE_MODEL_COPY[pkg.dice.model] ?? 'extensions.system.dice.custom')} · ${pkg.dice.notation}`,
		},
		{
			icon: 'hourglass',
			term: t('extensions.system.declares.turns'),
			value: t(TURN_MODEL_COPY[pkg.turnModel.kind] ?? 'extensions.system.turn.none'),
		},
		{
			icon: 'players',
			term: t('extensions.system.declares.roles'),
			value: `${pkg.vocabulary.gameMaster} · ${pkg.vocabulary.player}`,
		},
	];
}
