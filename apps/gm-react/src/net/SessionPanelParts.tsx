import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../ds';
import { T } from '../app/screen-kit';
import { qrDataUrl } from './qr';
import type { ClientStatus } from './SessionClient';
import { decodeJoinCode } from './cloudCrypto';
import { connectionState, type PresenceReading, type StatusTone } from './sessionStatus';
import { registerBackHandler } from '../platform/backNavigation';

/**
 * The pieces the host and join surfaces both render: the shared modal shell, the copy/dictate
 * fields, the status tones and banners, and the DM's online join-code share block.
 *
 * A pure move out of `SessionPanel.tsx` (RC-ENG-2.2 — that file had grown past the RC-STB-2.7
 * file-size limit). Unchanged apart from being exported so `SessionPanel.tsx` and `HostModal.tsx`
 * can both import them instead of one file owning everything.
 */

// Participant roles arrive as machine tokens; render the spoken versions.
export const ROLE_LABEL: Record<string, string> = {
	dm: 'DM',
	'co-dm': 'Co-DM',
	player: 'Player',
	observer: 'Observer',
};

/**
 * The P2P session UI: a DM-side HOST control (topbar) and a player-side JOIN control (PlayerView). Both
 * drive the serverless LAN handshake — the DM shows a connection code / QR, the player returns an answer
 * code — and reflect live connection state. Kept intentionally self-contained (inline styles matching the
 * surrounding surfaces) so it can mount in either chrome.
 */

// --- shared modal primitive ------------------------------------------------------------------------

export function Modal({
	title,
	onClose,
	children,
	width = 520,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	width?: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	useEffect(() => {
		ref.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onCloseRef.current();
		};
		document.addEventListener('keydown', onKey);
		const unregisterBack = registerBackHandler('overlay', () => {
			onCloseRef.current();
			return true;
		});
		return () => {
			document.removeEventListener('keydown', onKey);
			unregisterBack();
		};
	}, []);
	return (
		<div
			className="app-fixed-viewport"
			role="presentation"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			style={{
				position: 'fixed',
				top: 'var(--native-titlebar-height)',
				right: 0,
				bottom: 0,
				left: 0,
				zIndex: 200,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding:
					'max(20px, var(--safe-area-top, 0px)) max(20px, var(--safe-area-right, 0px)) max(20px, var(--safe-area-bottom, 0px)) max(20px, var(--safe-area-left, 0px))',
				background: 'rgba(8,5,3,.55)',
				backdropFilter: 'blur(3px)',
			}}
		>
			<div
				ref={ref}
				tabIndex={-1}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				style={{
					width,
					maxWidth: '100%',
					maxHeight: '100%',
					overflow: 'auto',
					background: T.surf,
					border: `1px solid ${T.bd}`,
					borderRadius: 14,
					boxShadow: T.smd,
					outline: 'none',
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						padding: '14px 18px',
						borderBottom: `1px solid ${T.bd}`,
					}}
				>
					<span style={{ font: `600 15px ${T.disp}`, color: T.ink, flex: 1 }}>{title}</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						style={{
							border: 'none',
							background: 'transparent',
							cursor: 'pointer',
							color: T.ter,
							display: 'flex',
						}}
					>
						<Icon name="close" size={18} />
					</button>
				</div>
				<div style={{ padding: 18 }}>{children}</div>
			</div>
		</div>
	);
}

export const fieldStyle = {
	width: '100%',
	font: `12px ${T.mono}`,
	color: T.ink,
	background: T.alt,
	border: `1px solid ${T.bd}`,
	borderRadius: 8,
	padding: 10,
	resize: 'vertical' as const,
};
export const btn = (primary?: boolean) => ({
	display: 'inline-flex',
	alignItems: 'center',
	gap: 7,
	padding: '8px 14px',
	borderRadius: 9,
	cursor: 'pointer',
	font: `600 12.5px ${T.sans}`,
	border: `1px solid ${primary ? T.accBd : T.bd}`,
	background: primary ? T.acc : T.surf,
	color: primary ? T.accFg : T.sub,
});

export function CopyField({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div style={{ marginTop: 10 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
				<span
					style={{
						font: `600 11px ${T.sans}`,
						color: T.ter,
						textTransform: 'uppercase',
						letterSpacing: '.04em',
						flex: 1,
					}}
				>
					{label}
				</span>
				<button
					type="button"
					style={btn()}
					onClick={() => {
						void navigator.clipboard?.writeText(value).then(() => {
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						});
					}}
				>
					<Icon name={copied ? 'check' : 'duplicate'} size={13} />
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<textarea readOnly value={value} rows={3} style={fieldStyle} />
		</div>
	);
}

// --- status presentation ---------------------------------------------------------------------------

/** Semantic status families for the readings in `sessionStatus.ts`. `muted` is the quiet, no-news tone. */
export const TONE: Record<StatusTone, { text: string; border: string; subtle: string }> = {
	ok: {
		text: 'var(--color-status-success-text)',
		border: 'var(--color-status-success-border)',
		subtle: 'var(--color-status-success-subtle)',
	},
	info: {
		text: 'var(--color-status-info-text)',
		border: 'var(--color-status-info-border)',
		subtle: 'var(--color-status-info-subtle)',
	},
	warn: {
		text: 'var(--color-status-warning-text)',
		border: 'var(--color-status-warning-border)',
		subtle: 'var(--color-status-warning-subtle)',
	},
	error: {
		text: 'var(--color-status-error-text)',
		border: 'var(--color-status-error-border)',
		subtle: 'var(--color-status-error-subtle)',
	},
	muted: { text: T.ter, border: T.bd, subtle: T.alt },
};

/** The player's live connection reading. Announced politely so a drop is not a silent visual change. */
export function ConnectionBanner({ status }: { status: ClientStatus }) {
	const state = connectionState(status);
	const tone = TONE[state.tone];
	return (
		<div
			role="status"
			aria-live="polite"
			data-testid="session-connection"
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 10,
				marginBottom: 14,
				padding: '10px 12px',
				borderRadius: 10,
				border: `1px solid ${tone.border}`,
				background: tone.subtle,
			}}
		>
			<Icon name={state.icon} size={16} color={tone.text} />
			<div style={{ flex: 1 }}>
				<div style={{ font: `600 12.5px ${T.sans}`, color: tone.text }}>{state.label}</div>
				<div style={{ marginTop: 2, font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>
					{state.detail}
				</div>
			</div>
		</div>
	);
}

/** One participant's presence: the spoken label plus any coarse hints, never colour alone. */
export function PresenceTag({ reading }: { reading: PresenceReading }) {
	const tone = TONE[reading.tone];
	return (
		<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
			<span style={{ font: `11px ${T.sans}`, color: tone.text }}>{reading.label}</span>
			{reading.badges.map((badge) => (
				<span
					key={badge}
					style={{
						font: `600 10.5px ${T.sans}`,
						color: T.acc,
						border: `1px solid ${T.accBd}`,
						background: T.accSub,
						borderRadius: 999,
						padding: '1px 7px',
					}}
				>
					{badge}
				</span>
			))}
		</span>
	);
}

/** A read-aloud field: the DM dictates these when a player cannot paste the whole join code. */
export function DictateField({ label, value }: { label: string; value: string }) {
	return (
		<div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
			<span style={{ font: `600 11px ${T.sans}`, color: T.ter, minWidth: 46 }}>{label}</span>
			<code
				style={{
					flex: 1,
					font: `12px ${T.mono}`,
					color: T.ink,
					wordBreak: 'break-all',
					userSelect: 'all',
				}}
			>
				{value}
			</code>
		</div>
	);
}

/** The join code's two halves, or null when it cannot be read — never throws into a render. */
export function splitJoinCode(code: string): { sessionId: string; pin: string } | null {
	try {
		return decodeJoinCode(code);
	} catch {
		return null;
	}
}

/**
 * The DM's share block for an online (cloud) table: the one-string join code, the same code as a QR
 * for a phone at the table, and the room + PIN read out separately for a player who cannot paste.
 * The PIN is the admission credential (`cloudCrypto.ts`) and never reaches the signaling service.
 */
export function OnlineJoinShare({ code }: { code: string }) {
	const [qr, setQr] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		void qrDataUrl(code).then((url) => {
			if (!cancelled) setQr(url);
		});
		return () => {
			cancelled = true;
		};
	}, [code]);

	// Both halves are already inside the code; splitting them out is a dictation aid, and it lets the
	// two sides confirm out loud that they are on the same room before anyone is approved.
	const parts = splitJoinCode(code);

	return (
		<>
			<CopyField label="Online join code — send privately" value={code} />
			{qr && (
				<img
					src={qr}
					alt="Online join code QR code"
					style={{
						display: 'block',
						margin: '12px auto 4px',
						width: 160,
						height: 160,
						imageRendering: 'pixelated',
						background: '#fff',
						borderRadius: 8,
						padding: 6,
					}}
				/>
			)}
			{parts && (
				<div
					style={{
						marginTop: 10,
						padding: '10px 12px',
						borderRadius: 10,
						border: `1px solid ${T.bd}`,
						background: T.alt,
					}}
				>
					<span
						style={{
							font: `600 11px ${T.sans}`,
							color: T.ter,
							textTransform: 'uppercase',
							letterSpacing: '.04em',
						}}
					>
						Or read these out
					</span>
					<DictateField label="Room" value={parts.sessionId} />
					<DictateField label="PIN" value={parts.pin} />
				</div>
			)}
			<div style={{ marginTop: 8, font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
				The PIN is what opens the table, and it is never sent to the signaling service. A device
				that has it still waits for your approval below.
			</div>
		</>
	);
}
