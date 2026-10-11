import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	resolveOnboarding,
	type CoreCommand,
	type FirstSessionGuideView,
	type FirstSessionLink,
	type FirstSessionRow,
} from '@dndtools/core';
import { Button, Toaster } from '../../../ds';
import { useI18n, type MessageKey } from '../../../i18n';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { T } from '../../screen-kit';
import { Muted, SR_ONLY } from '../../widget-body-kit';
import { LiveReadout, StateMark } from './live';

/**
 * The `getting-started` widget (RC-WID-4.1), since RC-UX-6.3 the first-session guide: six things to do
 * before the first evening at the table, read from the core's onboarding view (`resolveOnboarding`'s
 * `guide`, the one read the WID-5.5 ledger already records for this body) so a row ticks when the
 * vault shows it was done, whichever screen did it. A click here never ticks anything; each link opens
 * the existing flow (a WID-5.1 intent the core already resolved against the viewer's read gate, or
 * onboarding's campaign step for the name).
 *
 * The Command Center places it first on a fresh vault's home screen, bare. "Hide guide" removes that
 * instance; Help › Getting started shows the same list and puts it back.
 */

/** Where onboarding sends focus when it closes onto the Command Center (the guide's first row). */
export const FIRST_SESSION_FOCUS_SELECTOR = '[data-first-session-guide] [data-first-session-focus]';

/** A row or link id (`name-campaign`) as its catalog key segment (`nameCampaign`). */
const keyOf = (id: string) =>
	id.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

/**
 * Asks the shell to reopen onboarding on its first step, the one that names the campaign. The shell's
 * Help host answers it (`HelpHost`, mounted once on every route), as Settings › Account's replay does,
 * so a widget body never reaches for the device-preference layer itself.
 */
export const FIRST_SESSION_NAME_EVENT = 'dndtools:first-session-name-campaign';

function useFollowLink(onLeave?: () => void) {
	const navigate = useNavigate();
	return (link: FirstSessionLink) => {
		onLeave?.();
		if (link.kind === 'onboarding') window.dispatchEvent(new Event(FIRST_SESSION_NAME_EVENT));
		else navigate(link.destination.path, { state: link.destination.state });
	};
}

const LIST: CSSProperties = {
	listStyle: 'none',
	margin: T.space.zero,
	padding: T.space.zero,
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 16rem), 1fr))',
	gap: T.space.three,
};

const ROW: CSSProperties = {
	display: 'flex',
	gap: T.space.two,
	padding: T.space.three,
	borderRadius: T.radius.md,
	border: `1px solid ${T.bd}`,
	background: T.surf,
	minWidth: T.space.zero,
};

const MARK: CSSProperties = {
	flex: '0 0 auto',
	width: T.space.six,
	height: T.space.six,
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	borderRadius: T.radius.full,
	font: `600 var(--text-xs) ${T.sans}`,
};

function RowMark({ row, index }: { row: FirstSessionRow; index: number }) {
	const { t } = useI18n();
	if (row.done)
		return (
			<span style={{ ...MARK, background: T.accSub, color: T.acc }}>
				<StateMark icon="check" label={t('firstSession.done')} />
			</span>
		);
	return (
		<span style={{ ...MARK, border: `1px solid ${T.bdS}`, color: T.sub }}>
			<span aria-hidden="true">{index + 1}</span>
			<span style={SR_ONLY}>{t('firstSession.open')}</span>
		</span>
	);
}

function GuideRow({
	row,
	index,
	idPrefix,
	follow,
}: {
	row: FirstSessionRow;
	index: number;
	idPrefix: string;
	follow: (link: FirstSessionLink) => void;
}) {
	const { t } = useI18n();
	const titleId = `${idPrefix}-${row.id}`;
	return (
		<li data-first-session-row={row.id} data-done={row.done} style={ROW} aria-labelledby={titleId}>
			<RowMark row={row} index={index} />
			<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.one, minWidth: 0 }}>
				<span
					id={titleId}
					style={{ font: `600 var(--text-sm)/1.4 ${T.sans}`, color: row.done ? T.sub : T.ink }}
				>
					{t(`firstSession.row.${keyOf(row.id)}` as MessageKey)}
				</span>
				<span style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
					{t(`firstSession.row.${keyOf(row.id)}.why` as MessageKey)}
				</span>
				{row.links.length > 0 && (
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.two }}>
						{row.links.map((link, linkIndex) => (
							<Button
								key={link.id}
								variant={linkIndex === 0 && !row.done ? 'secondary' : 'ghost'}
								size="sm"
								iconRight={linkIndex === 0 ? 'chevron-right' : undefined}
								data-first-session-link={link.id}
								data-first-session-focus={index === 0 && linkIndex === 0 ? '' : undefined}
								aria-describedby={titleId}
								onClick={() => follow(link)}
							>
								{t(`firstSession.link.${keyOf(link.id)}` as MessageKey)}
							</Button>
						))}
					</div>
				)}
			</div>
		</li>
	);
}

/**
 * The guide's list, shared by the widget and Help. A complete guide collapses to one line. `onLeave`
 * runs before a link is followed (Help closes itself first).
 */
export function FirstSessionGuideList({
	guide,
	idPrefix = 'first-session',
	onLeave,
}: {
	guide: FirstSessionGuideView;
	/** Prefixes the rows' ids, so the widget and Help can be on the page together. */
	idPrefix?: string;
	onLeave?: () => void;
}) {
	const { t } = useI18n();
	const follow = useFollowLink(onLeave);
	if (guide.complete)
		return (
			<p
				data-first-session-complete=""
				style={{ margin: T.space.zero, font: `var(--text-sm) ${T.sans}`, color: T.sub }}
			>
				<StateMark icon="check" label={t('firstSession.done')} />
				{t('firstSession.complete', { total: guide.rows.length })}
			</p>
		);
	return (
		<ol style={LIST} aria-label={t('firstSession.title')}>
			{guide.rows.map((row, index) => (
				<GuideRow key={row.id} row={row} index={index} idPrefix={idPrefix} follow={follow} />
			))}
		</ol>
	);
}

/** The progress line both surfaces print beside their heading. A row ticks while the GM is elsewhere
 * in the app, so the count is a polite live readout (RC-WID-4.4). */
export function FirstSessionProgress({ guide }: { guide: FirstSessionGuideView }) {
	const { t } = useI18n();
	return (
		<LiveReadout
			testId="first-session-progress"
			style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub, whiteSpace: 'nowrap' }}
		>
			{t('firstSession.progress', { done: guide.done, total: guide.rows.length })}
		</LiveReadout>
	);
}

/** Run a guide command (hide or put back) and say what happened. */
export function useGuideCommand() {
	const runtime = useRuntime();
	const { t } = useI18n();
	return async (command: CoreCommand, done: MessageKey): Promise<boolean> => {
		try {
			const result = await runtime.dispatch(command);
			if (result.status === 'accepted') {
				Toaster.success(t(done));
				return true;
			}
		} catch {
			// A refused or failed write is reported below, like any other.
		}
		Toaster.error(t('firstSession.failed'));
		return false;
	};
}

export function GettingStartedBody() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const run = useGuideCommand();
	const { guide } = resolveOnboarding(runtime.state, runtime.defaultActorId);
	if (!guide.canSetup) return <Muted>{t('widgetBody.gettingStarted.participant')}</Muted>;
	const dismiss = guide.dismiss;
	return (
		<section
			data-first-session-guide=""
			aria-labelledby="first-session-title"
			style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}
		>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					alignItems: 'center',
					gap: T.space.three,
				}}
			>
				<h2
					id="first-session-title"
					style={{
						margin: T.space.zero,
						font: `600 var(--text-xs) ${T.sans}`,
						letterSpacing: 'var(--tracking-wide)',
						textTransform: 'uppercase',
						color: T.ter,
					}}
				>
					{t('firstSession.title')}
				</h2>
				<FirstSessionProgress guide={guide} />
				{dismiss && (
					<Button
						variant="ghost"
						size="sm"
						icon="close"
						style={{ marginLeft: 'auto' }}
						onClick={() => {
							void run(dismiss, 'firstSession.hidden').then((hidden) => {
								// The guide leaves the page with focus inside it; keep the reader in the page.
								if (hidden) document.querySelector<HTMLElement>('#main-content')?.focus();
							});
						}}
					>
						{t('firstSession.hide')}
					</Button>
				)}
			</div>
			<FirstSessionGuideList guide={guide} />
		</section>
	);
}
