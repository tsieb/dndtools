import { useNavigate } from 'react-router-dom';
import { Button, Card, Icon } from '../../ds';
import { Illustration } from '../../ds/illustrations';
import { useI18n, type MessageKey } from '../../i18n';

/** The actor read's refusal, in words. It used to interpolate the raw code ("scene-not-found"). */
const REASON_KEY: Record<string, MessageKey> = {
	'scene-not-found': 'sceneEditor.noLongerExists',
	'dm-only': 'sceneEditor.cannotOpenDmOnly',
	'not-shared': 'sceneEditor.cannotOpenNotShared',
};

/**
 * `/scene/:id` when the scene is gone or the actor may not open it. There is no dedicated
 * illustration key for a missing scene; the Scenes list's own empty drawing is the nearest match.
 */
export function SceneUnavailable({ reason }: { reason: string | null }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const message = reason
		? (REASON_KEY[reason] ?? 'sceneEditor.cannotOpenOther')
		: 'sceneEditor.noLongerExists';
	return (
		<div
			style={{
				maxWidth: 720,
				margin: 'var(--space-0) auto',
				padding: 'var(--space-6) var(--space-4)',
				boxSizing: 'border-box',
			}}
			data-testid="scene-unavailable"
		>
			<Card
				elevation="raised"
				padding="lg"
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					textAlign: 'center',
					gap: 'var(--space-3)',
				}}
			>
				<Illustration name="scenes-empty" />
				<h2
					style={{
						margin: 'var(--space-0)',
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						font: '700 var(--text-xl) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					<Icon name="error" size="sm" color="var(--color-status-error-text)" />
					{t('sceneEditor.unavailable')}
				</h2>
				<p
					style={{
						margin: 'var(--space-0)',
						font: 'var(--text-sm)/1.5 var(--font-sans)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{t(message)}
				</p>
				<Button variant="secondary" icon="arrow-left" onClick={() => navigate('/scenes')}>
					{t('sceneEditor.backToScenes')}
				</Button>
			</Card>
		</div>
	);
}
