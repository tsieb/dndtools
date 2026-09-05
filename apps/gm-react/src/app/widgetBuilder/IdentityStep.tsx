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

export function IdentityStep({ draft, patch, issues }: StepProps) {
	const [idsTouched, setIdsTouched] = useState(() => draft.packageId !== '' || draft.typeId !== '');
	const [iconFilter, setIconFilter] = useState('');
	const icons = useMemo(() => {
		const needle = iconFilter.trim().toLowerCase();
		const matches = needle
			? ICON_VOCABULARY.filter((name) => name.includes(needle))
			: ICON_VOCABULARY;
		return matches.slice(0, 60);
	}, [iconFilter]);

	const setName = (name: string) => {
		const next: Partial<WidgetDraft> = { name };
		if (!idsTouched) {
			const slug = slugify(name);
			next.typeId = slug;
			next.packageId = slug ? `workspace.${slug}` : '';
		}
		patch(next);
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader
				title="Identity"
				help="Name the widget and say where it belongs. The ids are how the campaign refers to it forever, so they are slug-checked here."
			/>
			<StepSection title="Name and description">
				<Field label="Name" required error={issueFor(issues, 'name')}>
					<Input
						value={draft.name}
						placeholder="Party status"
						onChange={(e: { target: { value: string } }) => setName(e.target.value)}
					/>
				</Field>
				<Field
					label="Description"
					help="One line, shown in the widget library and the package review."
				>
					<Textarea
						value={draft.description}
						rows={2}
						placeholder="Who is up, who is down, at a glance."
						onChange={(e: { target: { value: string } }) => patch({ description: e.target.value })}
					/>
				</Field>
			</StepSection>

			<StepSection
				title="Ids and version"
				help="Lowercase letters, numbers, dots and hyphens. Changing an id after install creates a new widget rather than updating this one."
			>
				<FieldGrid>
					<Field label="Package id" required error={issueFor(issues, 'packageId')}>
						<Input
							value={draft.packageId}
							placeholder="workspace.party-status"
							onChange={(e: { target: { value: string } }) => {
								setIdsTouched(true);
								patch({ packageId: e.target.value.trim() });
							}}
						/>
					</Field>
					<Field label="Widget type id" required error={issueFor(issues, 'typeId')}>
						<Input
							value={draft.typeId}
							placeholder="party-status"
							onChange={(e: { target: { value: string } }) => {
								setIdsTouched(true);
								patch({ typeId: e.target.value.trim() });
							}}
						/>
					</Field>
					<Field label="Version" required error={issueFor(issues, 'version')}>
						<Input
							value={draft.version}
							placeholder="1.0.0"
							onChange={(e: { target: { value: string } }) =>
								patch({ version: e.target.value.trim() })
							}
						/>
					</Field>
					<Field label="Category" help="Groups the widget in the library.">
						<Input
							value={draft.category}
							placeholder="Combat"
							onChange={(e: { target: { value: string } }) => patch({ category: e.target.value })}
						/>
					</Field>
				</FieldGrid>
				{draft.packageId && !SLUG_PATTERN.test(draft.packageId) && (
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
						Suggested: {slugify(draft.packageId) || 'workspace.my-widget'}
					</span>
				)}
			</StepSection>

			<StepSection
				title="Icon"
				help="Pick from the app's icon vocabulary so the widget stays in one family."
			>
				<Field label="Filter icons">
					<Input
						value={iconFilter}
						placeholder="heart"
						onChange={(e: { target: { value: string } }) => setIconFilter(e.target.value)}
					/>
				</Field>
				<div
					role="radiogroup"
					aria-label="Widget icon"
					onKeyDown={radioGroupKeyDown}
					data-testid="builder-icon-picker"
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						gap: 6,
						maxHeight: 168,
						overflow: 'auto',
						padding: 6,
						border: `1px solid ${T.bd}`,
						borderRadius: 9,
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
								aria-label={name}
								title={name}
								tabIndex={isTabStop ? 0 : -1}
								onClick={() => patch({ icon: name })}
								style={{
									width: 34,
									height: 34,
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									borderRadius: 8,
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
						<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
							No icon in the vocabulary matches that.
						</span>
					)}
				</div>
			</StepSection>

			<StepSection title="Where it can go">
				<ToggleGroup legend="Surfaces">
					{SURFACES.map((surface) => (
						<Checkbox
							key={surface}
							checked={draft.surfaces.includes(surface)}
							label={SURFACE_LABEL[surface]}
							onChange={() => patch({ surfaces: toggle(draft.surfaces, surface) })}
						/>
					))}
				</ToggleGroup>
				{issueFor(issues, 'surfaces') && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'surfaces')}
					</span>
				)}
				<ToggleGroup legend="Supported device profiles">
					{PROFILES.map((profile) => (
						<Checkbox
							key={profile}
							checked={draft.supportedProfiles.includes(profile)}
							label={PROFILE_LABEL[profile]}
							onChange={() =>
								patch({ supportedProfiles: toggle(draft.supportedProfiles, profile) })
							}
						/>
					))}
				</ToggleGroup>
				{issueFor(issues, 'supportedProfiles') && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'supportedProfiles')}
					</span>
				)}
				<Switch
					checked={draft.libraryListed}
					label="List it in the Add widget library"
					onChange={(next: boolean) => patch({ libraryListed: next })}
				/>
			</StepSection>
		</div>
	);
}
