import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SECTION_FEATURE_GATES } from '../packages/core/src/state/onboarding';
import { en } from '../apps/gm-react/src/i18n/messages/en';

/** Deterministic reference output; no clock, filesystem discovery or authored duplicate rows. */
export function renderFeatureComplexity(): string {
	const cell = (value: string) => value.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
	const rows = SECTION_FEATURE_GATES.map((gate) =>
		[
			gate.id,
			en[gate.labelKey as keyof typeof en],
			gate.labelKey,
			gate.minTier,
			gate.surface,
			gate.sectionAnchor,
			gate.assumes,
			gate.misuse,
		]
			.map(cell)
			.join(' | '),
	);
	return [
		'# Feature complexity map',
		'',
		'Generated from `SECTION_FEATURE_GATES` in `packages/core/src/state/onboarding.ts`.',
		'Regenerate with `pnpm exec tsx scripts/feature-complexity.ts`.',
		'',
		'Core assumes ordinary table use; intermediate assumes campaign structure and sharing; advanced assumes schemas, automation, security or recovery concepts. Tiers describe disclosure complexity, not authorization. A core tab may contain advanced sections. Private (E2EE) is advanced because the GM must manage decryption and recovery material.',
		'',
		'Settings panels and individual settings rows, Extensions and Community areas, authoring steps, navigation surfaces and map tools are inventoried below. Anchors are stable logical section identifiers for consumers; they do not claim that a DOM fragment already exists. The compact `FEATURE_GATES` onboarding summaries remain separate from this detailed inventory.',
		'',
		'<!-- prettier-ignore -->',
		'| ID | Label | Label key | Tier | Surface | Section anchor | Assumes the GM knows | If misused |',
		'| --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows.map((row) => `| ${row} |`),
		'',
	].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	writeFileSync(
		new URL('../docs/reference/FEATURE_COMPLEXITY.md', import.meta.url),
		renderFeatureComplexity(),
	);
}
