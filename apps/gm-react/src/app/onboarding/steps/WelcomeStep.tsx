import { Icon } from '../../../ds';
import { T } from '../../screen-kit';

/** Step 1 — welcome. Extracted from Onboarding.tsx unchanged (RC-STB-2.6). */
export function WelcomeStep() {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-start',
				justifyContent: 'center',
				minHeight: '100%',
				gap: 16,
			}}
		>
			<span
				style={{
					width: 60,
					height: 60,
					borderRadius: 16,
					background: T.acc,
					color: T.accFg,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<Icon name="sparkle" size="xl" />
			</span>
			<div>
				<h2 style={{ margin: 0, font: `700 28px ${T.disp}`, letterSpacing: '-.01em' }}>
					Run a better table.
				</h2>
				<p
					style={{
						margin: '8px 0 0',
						font: `14px/1.6 ${T.sans}`,
						color: T.sub,
						maxWidth: 440,
					}}
				>
					Lamplight is a candle-lit command center for live play — combat, dice, maps, party vitals
					and what your players see, all in one spatial board. Let's get yours set up.
				</p>
			</div>
			<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
				{[
					'Any system — D&D 5e, narrative, or your own',
					'Local-first, cloud backup only when you choose',
					'Player-safe by design',
				].map((t) => (
					<span
						key={t}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 7,
							padding: '7px 11px',
							borderRadius: 20,
							background: T.surf,
							border: `1px solid ${T.bd}`,
							font: `12px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name="check" size={13} color={T.acc} />
						{t}
					</span>
				))}
			</div>
		</div>
	);
}
