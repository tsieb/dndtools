import { useEffect, useState } from 'react';
import { Button, Card, EmptyState } from '../../ds';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../platform/preferences';
import { Page } from '../../app/screen-kit';
import { useI18n } from '../../i18n';

/**
 * What a player sees at `/board`: the DM's spatial console is DM-only, so this says so plainly
 * rather than rendering an empty canvas.
 *
 * A pure move out of `Board.tsx` (RC-ENG-2.2 — that screen had grown past the RC-STB-2.7 file-size
 * limit). The markup is unchanged.
 */
export function BoardPlayerNotice() {
	const { t } = useI18n();
	return (
		// `<Page>` rather than a bare max-width div: the raw div has no padding, so on a phone this
		// explainer Card sat flush against both screen edges — every other screen's non-DM/empty
		// state goes through Page and gets the profile's gutters.
		<Page max={640}>
			<Card
				elevation="raised"
				padding="lg"
				style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
			>
				<span
					style={{
						font: '700 var(--text-lg) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					{t('board.playerTitle')}
				</span>
				<span
					style={{
						font: 'var(--text-sm) var(--font-sans)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{t('board.playerBody')}
				</span>
			</Card>
		</Page>
	);
}

/** Shared onboarding for the home board and authored scenes. */
export function BoardEmptyState({
	title,
	repeat,
	onAdd,
	onTemplate,
	testId,
}: {
	title: string;
	repeat: boolean;
	onAdd: () => void;
	onTemplate: () => void;
	testId: string;
}) {
	const { t } = useI18n();
	return (
		<EmptyState
			data-testid={testId}
			illustration="session-board-empty"
			title={title}
			inset
			style={{
				position: 'absolute',
				inset: 0,
				overflow: 'auto',
				background: 'var(--color-bg)',
				// Like the canvas's own empty message, the overlay lets pointers through: a click beside
				// the actions still focuses the canvas, so its keyboard shortcuts (Ctrl+Z after removing
				// the last tile) stay reachable. Only the actions take the pointer.
				pointerEvents: 'none',
			}}
			action={
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-2)',
						pointerEvents: 'auto',
					}}
				>
					{/* The first action is the subtle accent, not the gold fill: the canvas's selected
					    zoom step already holds this region's one primary (RC-ENG-8.4 emphasis rule). */}
					<Button variant="accent" icon="plus" onClick={onAdd}>
						{t('board.addFirstTile')}
					</Button>
					{!repeat && (
						<Button variant="secondary" icon="layers" onClick={onTemplate}>
							{t('board.applyTemplate')}
						</Button>
					)}
				</div>
			}
		/>
	);
}

function readFilledBoards(): Set<string> {
	try {
		const value: unknown = JSON.parse(readPreference(PREFERENCE_KEYS.boardFilled) ?? '[]');
		return new Set(
			Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [],
		);
	} catch {
		return new Set();
	}
}

/** Persist only successful content, never a dismissed gallery or a failed add. */
export function useBoardPreviouslyFilled(sceneId: string | null, hasTiles: boolean) {
	const [filled, setFilled] = useState<ReadonlySet<string>>(readFilledBoards);
	useEffect(() => {
		if (!sceneId || !hasTiles) return;
		setFilled((previous) => (previous.has(sceneId) ? previous : new Set([...previous, sceneId])));
		const stored = readFilledBoards();
		stored.add(sceneId);
		writePreference(PREFERENCE_KEYS.boardFilled, JSON.stringify([...stored]));
	}, [sceneId, hasTiles]);
	return (sceneId !== null && filled.has(sceneId)) || hasTiles;
}
