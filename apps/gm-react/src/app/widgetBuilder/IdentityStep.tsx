import { useMemo, useState } from 'react';
import { Checkbox, Field, Icon, Input, Switch, Textarea } from '../../ds';
import { T, radioGroupKeyDown } from '../screen-kit';
import { SLUG_PATTERN, slugify, type WidgetDraft } from './draft';
import {
	FieldGrid,
	StepHeader,
	StepSection,
	ToggleGroup,
	issueFor,
	type StepProps,
} from './fields';
import { ICON_VOCABULARY, PROFILES, PROFILE_LABEL, SURFACES, SURFACE_LABEL } from './vocabulary';
import { useI18n } from '../../i18n';

/**
 * Identity — what the widget IS: its ids, its name, the glyph and category the library lists it
 * under, the surfaces it may be placed on and the device profiles it supports (RC-WID-2.1).
 *
 * The two ids are slug-validated as you type. Until the DM edits them by hand they follow the name,
 * because the common case is one widget per package and re-typing the same slug twice is a trap.
 */

function toggle<Item>(list: Item[], item: Item): Item[] {
	return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

/** Untouched ids follow the name even after a step/disclosure is closed and reopened. */
export function identityNamePatch(draft: WidgetDraft, name: string): Partial<WidgetDraft> {
	const previous = slugify(draft.name);
	const next = slugify(name);
	return {
		name,
		...(draft.typeId === previous ? { typeId: next } : {}),
		...(draft.packageId === (previous ? `workspace.${previous}` : '')
			? { packageId: next ? `workspace.${next}` : '' }
			: {}),
	};
}

/** Vocabulary concepts, never the Lucide shape used to draw them. */
export function iconMeaning(name: string): string {
	const meanings: Record<string, string> = {
		'session-bolt': 'Session',
		'characters-person': 'Characters',
		'atlas-map': 'Map',
		'campaign-scroll': 'Campaign',
		'knowledge-book': 'Knowledge',
		'settings-gear': 'Settings',
		'dm-only': 'DM only',
		'monster-claw': 'Monster',
		'spell-sparkle': 'Spell',
		'maximize-2': 'Full screen',
		'minimize-2': 'Exit full screen',
	};
	return (
		meanings[name] ??
		name
			.replace(/^cond-/, 'Condition ')
			.replace(/^sys-/, 'System ')
			.replace(/^tile-/, 'Widget ')
			.replace(/^die-/, 'Die ')
			.replace(/-/g, ' ')
	);
}

export function IdentityStep({
	draft,
	patch,
	issues,
	deriveIds = true,
}: StepProps & { deriveIds?: boolean }) {
	const { t } = useI18n();
	const [iconFilter, setIconFilter] = useState('');
	const icons = useMemo(() => {
		const needle = iconFilter.trim().toLowerCase();
		const matches = needle
			? ICON_VOCABULARY.filter((name) =>
					`${name} ${iconMeaning(name)}`.toLowerCase().includes(needle),
				)
			: ICON_VOCABULARY;
		return matches.slice(0, 60);
	}, [iconFilter]);

	const setName = (name: string) => patch(deriveIds ? identityNamePatch(draft, name) : { name });

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			<StepHeader title={t('builder.step.identity')} help={t('builder.identity.help')} />
			<StepSection title={t('builder.identity.nameSection')}>
				<Field label={t('builder.identity.name')} required error={issueFor(issues, 'name', t)}>
					<Input
						value={draft.name}
						placeholder={t('builder.identity.namePlaceholder')}
						onChange={(e: { target: { value: string } }) => setName(e.target.value)}
					/>
				</Field>
				<Field
					label={t('builder.identity.description')}
					help={t('builder.identity.descriptionHelp')}
				>
					<Textarea
						value={draft.description}
						rows={2}
						placeholder={t('builder.identity.descriptionPlaceholder')}
						onChange={(e: { target: { value: string } }) => patch({ description: e.target.value })}
					/>
				</Field>
			</StepSection>

			<StepSection title={t('builder.identity.icon')} help={t('builder.identity.iconHelp')}>
				<Field label={t('builder.identity.filterIcons')}>
					<Input
						value={iconFilter}
						placeholder={t('builder.identity.filterPlaceholder')}
						onChange={(e: { target: { value: string } }) => setIconFilter(e.target.value)}
					/>
				</Field>
				<div
					role="radiogroup"
					aria-label={t('builder.identity.widgetIcon')}
					onKeyDown={radioGroupKeyDown}
					data-testid="builder-icon-picker"
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						gap: 'var(--space-1-5)',
						maxHeight: 168,
						overflow: 'auto',
						padding: 'var(--space-1-5)',
						border: `1px solid ${T.bd}`,
						borderRadius: 'var(--radius-md)',
						background: T.sunken,
					}}
				>
					{icons.map((name, index) => {
						const selected = draft.icon === name;
						// Roving tab stop: the group is ONE stop and arrows move the selection.
						const isTabStop = icons.includes(draft.icon) ? selected : index === 0;
						return (
							<button
								key={name}
								type="button"
								role="radio"
								aria-checked={selected}
								aria-label={iconMeaning(name)}
								title={iconMeaning(name)}
								tabIndex={isTabStop ? 0 : -1}
								onClick={() => patch({ icon: name })}
								style={{
									width: 34,
									height: 34,
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									borderRadius: 'var(--radius-md)',
									border: `1px solid ${selected ? T.accBd : T.bd}`,
									background: selected ? T.accSub : T.surf,
									color: selected ? T.acc : T.sub,
									cursor: 'pointer',
								}}
							>
								<Icon name={name} size="sm" />
							</button>
						);
					})}
					{icons.length === 0 && (
						<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
							{t('builder.identity.noIconMatch')}
						</span>
					)}
				</div>
			</StepSection>

			<details>
				<summary>{t('builder.identity.advanced')}</summary>
				<StepSection title={t('builder.identity.idsSection')} help={t('builder.identity.idsHelp')}>
					<FieldGrid>
						<Field
							label={t('builder.identity.packageId')}
							required
							error={issueFor(issues, 'packageId', t)}
						>
							<Input
								value={draft.packageId}
								placeholder={t('builder.identity.packageIdPlaceholder')}
								onChange={(e: { target: { value: string } }) => {
									patch({ packageId: e.target.value.trim() });
								}}
							/>
						</Field>
						<Field
							label={t('builder.identity.typeId')}
							required
							error={issueFor(issues, 'typeId', t)}
						>
							<Input
								value={draft.typeId}
								placeholder={t('builder.identity.typeIdPlaceholder')}
								onChange={(e: { target: { value: string } }) => {
									patch({ typeId: e.target.value.trim() });
								}}
							/>
						</Field>
						<Field
							label={t('builder.identity.version')}
							required
							error={issueFor(issues, 'version', t)}
						>
							<Input
								value={draft.version}
								placeholder="1.0.0"
								onChange={(e: { target: { value: string } }) =>
									patch({ version: e.target.value.trim() })
								}
							/>
						</Field>
						<Field label={t('builder.identity.category')} help={t('builder.identity.categoryHelp')}>
							<Input
								value={draft.category}
								placeholder={t('builder.identity.categoryPlaceholder')}
								onChange={(e: { target: { value: string } }) => patch({ category: e.target.value })}
							/>
						</Field>
					</FieldGrid>
					{draft.packageId && !SLUG_PATTERN.test(draft.packageId) && (
						<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
							{t('builder.identity.suggested', {
								id: slugify(draft.packageId) || 'workspace.my-widget',
							})}
						</span>
					)}
				</StepSection>

				<StepSection title={t('builder.identity.whereSection')}>
					<ToggleGroup legend={t('builder.identity.surfaces')}>
						{SURFACES.map((surface) => (
							<Checkbox
								key={surface}
								checked={draft.surfaces.includes(surface)}
								label={t(SURFACE_LABEL[surface])}
								onChange={() => patch({ surfaces: toggle(draft.surfaces, surface) })}
							/>
						))}
					</ToggleGroup>
					{issueFor(issues, 'surfaces', t) && (
						<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.err }}>
							{issueFor(issues, 'surfaces', t)}
						</span>
					)}
					<ToggleGroup legend={t('builder.identity.profiles')}>
						{PROFILES.map((profile) => (
							<Checkbox
								key={profile}
								checked={draft.supportedProfiles.includes(profile)}
								label={t(PROFILE_LABEL[profile])}
								onChange={() =>
									patch({ supportedProfiles: toggle(draft.supportedProfiles, profile) })
								}
							/>
						))}
					</ToggleGroup>
					{issueFor(issues, 'supportedProfiles', t) && (
						<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.err }}>
							{issueFor(issues, 'supportedProfiles', t)}
						</span>
					)}
					<Switch
						checked={draft.libraryListed}
						label={t('builder.identity.libraryListed')}
						onChange={(next: boolean) => patch({ libraryListed: next })}
					/>
				</StepSection>
			</details>
		</div>
	);
}
