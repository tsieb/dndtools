import changelogUrl from '../../../../../CHANGELOG.md?url';
import { useEffect, useState } from 'react';
import { Button, Icon, Skeleton } from '../../ds';
import { useI18n } from '../../i18n';
import { latestRelease, parseChangelog, type ReleaseNote } from './changelog';

async function loadRelease(): Promise<ReleaseNote | null> {
	// A failed dynamic import stays rejected in the browser module cache. Fetch the bundled
	// local asset instead, so Retry can recover without reloading the user's workspace.
	const response = await fetch(changelogUrl);
	if (!response.ok) throw new Error('Release notes unavailable');
	return latestRelease(parseChangelog(await response.text()));
}

type ReleaseState =
	| { status: 'loading' }
	| { status: 'error' }
	| { status: 'ready'; release: ReleaseNote | null };

/** Release notes are an optional bundled asset; a failed load must leave help usable. */
export function ReleaseNotes({ load = loadRelease }: { load?: typeof loadRelease }) {
	const { t } = useI18n();
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<ReleaseState>({ status: 'loading' });
	useEffect(() => {
		let live = true;
		setState({ status: 'loading' });
		void load().then(
			(release) => {
				if (live) setState({ status: 'ready', release });
			},
			() => {
				if (live) setState({ status: 'error' });
			},
		);
		return () => {
			live = false;
		};
	}, [load, attempt]);

	return (
		<div
			aria-live="polite"
			style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}
		>
			{state.status === 'loading' ? (
				<>
					<p>{t('help.whatsNewLoading')}</p>
					<Skeleton variant="text" lines={3} />
				</>
			) : state.status === 'error' ? (
				<>
					<p>
						<Icon name="warning" /> {t('help.whatsNewError')}
					</p>
					<Button
						variant="secondary"
						onClick={() => setAttempt((value) => value + 1)}
						style={{ minHeight: 'var(--space-12)' }}
					>
						{t('common.action.retry')}
					</Button>
				</>
			) : state.release ? (
				<>
					<p>{t('help.whatsNewVersion', { version: state.release.version })}</p>
					<ul
						style={{
							margin: 'var(--space-0)',
							paddingLeft: 'var(--space-4)',
							display: 'grid',
							gap: 'var(--space-1)',
						}}
					>
						{state.release.items.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</>
			) : (
				<p>{t('help.whatsNewNone')}</p>
			)}
		</div>
	);
}
