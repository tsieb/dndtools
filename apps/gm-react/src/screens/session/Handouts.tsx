import { getHandoutsForActor, getHandoutStatusForDm } from '@dndtools/core';
import { Badge, Button, Field, IconButton, Input, Textarea } from '../../ds';
import { Panel, T } from '../../app/screen-kit';

type HandoutView = ReturnType<typeof getHandoutsForActor>[number];
type HandoutStatusView = ReturnType<typeof getHandoutStatusForDm>[number];

// Spoken labels for the handout kinds — the raw kind token never renders to users.
const HANDOUT_KIND_LABEL: Record<string, string> = {
	handout: 'Handout',
	image: 'Image',
	note: 'Note',
	'map-fragment': 'Map fragment',
	cipher: 'Cipher',
	rumor: 'Rumor',
};

export function HandoutsPanel({
	handouts,
	status,
	isDm,
	isLive,
	previewing,
	canDeliver,
	title,
	body,
	onTitle,
	onBody,
	onDeliver,
	onRevoke,
	onAcknowledge,
}: {
	handouts: HandoutView[];
	status: HandoutStatusView[];
	isDm: boolean;
	isLive: boolean;
	previewing: boolean;
	canDeliver: boolean;
	title: string;
	body: string;
	onTitle: (v: string) => void;
	onBody: (v: string) => void;
	onDeliver: () => void;
	onRevoke: (id: string) => void;
	onAcknowledge: (id: string) => void;
}) {
	const statusById = new Map(status.map((s) => [s.handoutId, s]));
	return (
		<Panel title="Handouts">
			{isDm ? (
				<>
					{!isLive && (
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							Handouts deliver to the live session — go live to push to players.
						</div>
					)}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{/* These were the only two unlabelled fields on the screen: a `placeholder` is
						    not a label, and it disappears the moment the DM types (WCAG 3.3.2). axe
						    cannot flag it, because HTML-AAM accepts placeholder as an accname
						    fallback — so the a11y gate stayed green over it. */}
						<Field label="Handout title">
							<Input
								value={title}
								onChange={(e: { target: { value: string } }) => onTitle(e.target.value)}
								placeholder="Handout title"
							/>
						</Field>
						<Field label="What the players read">
							<Textarea
								value={body}
								onChange={(e: { target: { value: string } }) => onBody(e.target.value)}
								placeholder="What the players read…"
								rows={3}
							/>
						</Field>
						<Button
							variant="primary"
							size="sm"
							icon="send"
							// A successful push CLEARS the title, so this button natively disabled itself
							// the instant the DM used it — under their own focus, which then fell to
							// <body> and restarted the next Tab at the top of the page. Soft-disabled it
							// keeps the tab stop and, for the first time, says why it is unavailable.
							// (DS `Button` only swallows `aria-disabled={true}`, so guard the handler too.)
							aria-disabled={!canDeliver || !title.trim() || undefined}
							title={
								!canDeliver
									? 'Go live to push handouts to players'
									: !title.trim()
										? 'Give the handout a title first'
										: undefined
							}
							onClick={() => {
								if (!canDeliver || !title.trim()) return;
								onDeliver();
							}}
						>
							Push to players
						</Button>
					</div>
				</>
			) : (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					Handouts the DM has shared with you appear here.
				</div>
			)}

			{handouts.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No handouts delivered yet.</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{handouts.map((h) => {
						const st = statusById.get(h.id);
						const delivered = st ? st.recipients.length : 0;
						const opened = st ? st.recipients.filter((r) => r.acknowledged).length : 0;
						return (
							<div
								key={h.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '8px 10px',
									borderRadius: 9,
									border: `1px solid ${T.bd}`,
									background: T.surf,
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											font: `600 13px ${T.sans}`,
											color: T.ink,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{h.title}
									</div>
									<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{HANDOUT_KIND_LABEL[h.handoutKind] ?? 'Handout'} · {h.sections.length}{' '}
										{h.sections.length === 1 ? 'section' : 'sections'}
										{isDm ? ` · ${opened}/${delivered} opened` : ''}
									</div>
								</div>
								{isDm ? (
									<IconButton
										icon="close"
										label={`Revoke handout — ${h.title}`}
										variant="ghost"
										size="sm"
										disabled={previewing}
										onClick={() => onRevoke(h.id)}
									/>
								) : h.acknowledged ? (
									<Badge status="success">Read</Badge>
								) : (
									<Button
										variant="secondary"
										size="sm"
										aria-label={`Mark read — ${h.title}`}
										disabled={previewing}
										onClick={() => onAcknowledge(h.id)}
									>
										Mark read
									</Button>
								)}
							</div>
						);
					})}
				</div>
			)}
		</Panel>
	);
}
