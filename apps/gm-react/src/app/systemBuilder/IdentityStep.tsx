import { StepHeader, StepSection, FieldGrid } from '../widgetBuilder/fields';
import { Field, Textarea } from '../../ds';
import { issuesForPath } from './draft';
import { StepIssues, TextField, type SystemStepProps } from './ui';
import type { MessageKey } from '../../i18n';
import type { SystemVocabulary } from '@dndtools/core';

/**
 * Step 1 — identity and vocabulary (RC-SYS-3.3).
 *
 * The vocabulary is the half of a system package that renames the app: RC-SYS-2.6 made every piece
 * of chrome read `{gm}`, `{spell}` and `{levelUp}` from the ACTIVE package, so editing "Dungeon
 * Master" to "Keeper" here is what makes the top bar, the rail and the safety copy say Keeper. Each
 * box is a plain text field for that reason — the words are the DM's, not a menu of ours.
 */

const VOCABULARY_FIELDS: { key: keyof SystemVocabulary; label: MessageKey }[] = [
	{ key: 'gameMaster', label: 'systemBuilder.vocab.gameMaster' },
	{ key: 'player', label: 'systemBuilder.vocab.player' },
	{ key: 'character', label: 'systemBuilder.vocab.character' },
	{ key: 'ability', label: 'systemBuilder.vocab.ability' },
	{ key: 'abilityPlural', label: 'systemBuilder.vocab.abilityPlural' },
	{ key: 'levelUpVerb', label: 'systemBuilder.vocab.levelUpVerb' },
	{ key: 'levelNoun', label: 'systemBuilder.vocab.levelNoun' },
	{ key: 'hitPoints', label: 'systemBuilder.vocab.hitPoints' },
	{ key: 'session', label: 'systemBuilder.vocab.session' },
	{ key: 'campaign', label: 'systemBuilder.vocab.campaign' },
];

export function IdentityStep({ draft, patch, issues, t }: SystemStepProps) {
	const setVocabulary = (key: keyof SystemVocabulary, value: string) =>
		patch({ vocabulary: { ...draft.vocabulary, [key]: value } });
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<StepHeader
				title={t('systemBuilder.step.identity')}
				help={t('systemBuilder.identity.help')}
			/>
			<StepSection title={t('systemBuilder.identity.section')}>
				<FieldGrid>
					<TextField
						label={t('systemBuilder.identity.name')}
						value={draft.displayName}
						path="displayName"
						issues={issues}
						t={t}
						maxLength={120}
						onChange={(next) => patch({ displayName: next })}
					/>
					<TextField
						label={t('systemBuilder.identity.version')}
						help={t('systemBuilder.identity.versionHelp')}
						value={draft.version}
						path="version"
						issues={issues}
						t={t}
						maxLength={32}
						onChange={(next) => patch({ version: next })}
					/>
				</FieldGrid>
				<Field
					label={t('systemBuilder.identity.summary')}
					help={t('systemBuilder.identity.summaryHelp')}
					error={issuesForPath(issues, 'summary', t)}
				>
					<Textarea
						value={draft.summary}
						rows={3}
						maxLength={280}
						onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
							patch({ summary: e.target.value })
						}
					/>
				</Field>
			</StepSection>
			<StepSection
				title={t('systemBuilder.vocab.section')}
				help={t('systemBuilder.vocab.sectionHelp')}
			>
				<FieldGrid>
					{VOCABULARY_FIELDS.map((entry) => (
						<TextField
							key={entry.key}
							label={t(entry.label)}
							value={draft.vocabulary[entry.key]}
							path={`vocabulary.${entry.key}`}
							issues={issues}
							t={t}
							maxLength={120}
							onChange={(next) => setVocabulary(entry.key, next)}
						/>
					))}
				</FieldGrid>
			</StepSection>
			<StepIssues
				issues={issues}
				claimed={[
					'displayName',
					'version',
					'summary',
					...VOCABULARY_FIELDS.map((entry) => `vocabulary.${entry.key}`),
				]}
				t={t}
			/>
		</div>
	);
}
