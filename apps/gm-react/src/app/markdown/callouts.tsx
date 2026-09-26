import { useState, type CSSProperties, type ReactNode } from 'react';
import type { CalloutKind } from '@dndtools/core';
import { Icon } from '../../ds';
import { T } from '../screen-kit';
import type { MessageKey } from '../../i18n';
import type { MdBlock } from './plugins';
import type { MarkdownRenderOptions } from './render';

/*
 * RC-KNW-1.1 callouts, split out of render.tsx (RC-POL-1.11). Every callout pairs its accent colour
 * with its own glyph, so the kind never rests on colour alone.
 *
 * `[!Secret]`: the CORE removes these from every non-DM projection (`stripSecretCallouts`), so a
 * player never receives the bytes. On the DM's own screen, which is often on a TV in front of the
 * table, a secret renders blurred behind an explicit "Show" control. When one somehow reaches a
 * non-DM renderer anyway its body is DROPPED, not blurred: a blur is CSS, and CSS is not a security
 * boundary.
 */

type Translate = MarkdownRenderOptions['t'];
type Callout = Extract<MdBlock, { type: 'callout' }>;

const CALLOUT_ICON: Record<CalloutKind, string> = {
	lore: 'scroll',
	warning: 'warning',
	tip: 'sparkle',
	secret: 'dm-only',
};

const CALLOUT_ACCENT: Record<CalloutKind, string> = {
	lore: T.acc,
	warning: T.warn,
	tip: T.info,
	secret: T.dm,
};

const CALLOUT_LABEL: Record<CalloutKind, MessageKey> = {
	lore: 'markdown.calloutLore',
	warning: 'markdown.calloutWarning',
	tip: 'markdown.calloutTip',
	secret: 'markdown.calloutSecret',
};

const HEAD: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: T.space.two,
	marginBottom: T.space.oneHalf,
};
const LABEL: CSSProperties = { font: `600 var(--text-sm) ${T.sans}`, color: T.ink };

function Glyph({ kind }: { kind: CalloutKind }) {
	return (
		<span style={{ color: CALLOUT_ACCENT[kind], display: 'inline-flex' }}>
			<Icon name={CALLOUT_ICON[kind]} size="sm" />
		</span>
	);
}

/**
 * A `[!Secret]` block on the DM's screen. Blurred until the DM presses "Show". The control is a real
 * button, so the keyboard path and the pointer path are identical (WCAG 2.2 AA).
 */
function SecretCallout({ title, body, t }: { title: string; body: ReactNode; t: Translate }) {
	const [shown, setShown] = useState(false);
	return (
		<>
			<div style={HEAD}>
				<Glyph kind="secret" />
				<span style={LABEL}>{title || t('markdown.calloutSecret')}</span>
				<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
					{t('markdown.dmOnly')}
				</span>
				<button
					type="button"
					onClick={() => setShown((value) => !value)}
					aria-expanded={shown}
					style={{
						marginLeft: 'auto',
						minHeight: T.density.touch,
						font: `600 var(--text-xs) ${T.sans}`,
						color: T.acc,
						background: 'none',
						border: 'none',
						padding: `${T.space.half} ${T.space.two}`,
						cursor: 'pointer',
					}}
				>
					{shown ? t('markdown.hideSecret') : t('markdown.showSecret')}
				</button>
			</div>
			<div
				data-secret={shown ? 'shown' : 'blurred'}
				style={{
					filter: shown ? 'none' : 'blur(5px)',
					userSelect: shown ? 'auto' : 'none',
					transition: `filter ${T.duration.fast} var(--easing-standard)`,
				}}
				aria-hidden={!shown}
			>
				{body}
			</div>
		</>
	);
}

export function renderCallout(
	block: Callout,
	key: number,
	options: MarkdownRenderOptions,
	renderChildren: (blocks: MdBlock[]) => ReactNode,
): ReactNode {
	const wrapper: CSSProperties = {
		margin: `${T.space.three} ${T.space.zero}`,
		padding: `${T.space.three} ${T.space.four}`,
		borderLeft: `3px solid ${CALLOUT_ACCENT[block.kind]}`,
		background: T.alt,
		borderRadius: `${T.radius.none} ${T.radius.md} ${T.radius.md} ${T.radius.none}`,
	};
	if (block.kind === 'secret') {
		// A non-DM must not receive the secret's text at all. The core already stripped it upstream;
		// if one arrives here anyway, drop the body and say plainly that something is withheld.
		if (options.isDm !== true) {
			return (
				<aside key={key} style={wrapper}>
					<div style={{ ...HEAD, marginBottom: T.space.zero }}>
						<Glyph kind="secret" />
						<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
							{options.t('markdown.secretWithheld')}
						</span>
					</div>
				</aside>
			);
		}
		return (
			<aside key={key} style={wrapper}>
				<SecretCallout title={block.title} t={options.t} body={renderChildren(block.blocks)} />
			</aside>
		);
	}
	return (
		<aside key={key} style={wrapper}>
			<div style={HEAD}>
				<Glyph kind={block.kind} />
				<span style={LABEL}>{block.title || options.t(CALLOUT_LABEL[block.kind])}</span>
			</div>
			{renderChildren(block.blocks)}
		</aside>
	);
}
