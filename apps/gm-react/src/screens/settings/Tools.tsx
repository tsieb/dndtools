import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Toaster } from '../../ds';
import { Panel, T, radioGroupKeyDown } from '../../app/screen-kit';
import {
	getAiUsagePreference,
	saveAiUsagePreference,
	type AiUsagePreference,
} from '../../ai/usagePreference';
/* ---- The three small subpages: tool preferences, and the Plugins / Systems pointers -------------- */
/** The one durable consent control. It remains reachable when AI is hidden, but the AI setup and
 * assistant panels themselves never render until the user explicitly picks Complete use. */
export function SettingsToolPreferences() {
	const [preference, setPreference] = useState<AiUsagePreference>(getAiUsagePreference);
	const choose = (next: AiUsagePreference) => {
		saveAiUsagePreference(next);
		setPreference(next);
		Toaster.success(
			next === 'complete'
				? 'Assistant enabled. AI & tools is now available in Settings.'
				: next === 'generation-only'
					? 'Random generation stays available. AI tools are hidden and blocked.'
					: 'AI tools are hidden and blocked.',
		);
	};
	return (
		<Panel title="Tool preferences">
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				Control optional tools for this device. Anything except “Assistant and generators”
				immediately hides the assistant and its setup, and blocks model requests even if a key
				remains stored.
			</div>
			<div
				role="radiogroup"
				aria-label="Optional tool preference"
				// This declared radiogroup had no arrow keys and every card was its own tab stop — the
				// same gap already closed for Seg/SegmentedControl and for Onboarding's choice cards.
				onKeyDown={radioGroupKeyDown}
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
					gap: 10,
				}}
			>
				{(
					[
						{
							id: 'complete' as const,
							title: 'Assistant and generators',
							desc: 'Use the optional campaign assistant and its setup, plus built-in generators.',
						},
						{
							id: 'generation-only' as const,
							title: 'Generators only',
							desc: 'Keep built-in offline generators. Assistant and model controls stay hidden.',
						},
						{
							id: 'none' as const,
							title: 'None',
							desc: 'Hide and block all optional AI tools. Only this Settings control can re-enable them.',
						},
					] satisfies Array<{ id: AiUsagePreference; title: string; desc: string }>
				).map((option) => {
					const selected = preference === option.id;
					return (
						<button
							key={option.id}
							type="button"
							role="radio"
							aria-checked={selected}
							tabIndex={selected ? 0 : -1}
							onClick={() => choose(option.id)}
							style={{
								padding: 12,
								borderRadius: 10,
								border: `1px solid ${selected ? T.accBd : T.bd}`,
								background: selected ? T.accSub : T.alt,
								textAlign: 'left',
								cursor: 'pointer',
							}}
						>
							<div style={{ font: `600 13px ${T.sans}`, color: selected ? T.acc : T.ink }}>
								{option.title}
							</div>
							<div style={{ marginTop: 4, font: `12px/1.5 ${T.sans}`, color: T.ter }}>
								{option.desc}
							</div>
						</button>
					);
				})}
			</div>
		</Panel>
	);
}

/* ---- Plugins → Extensions ---------------------------------------------------------------------
 * Installed widget packages have a REAL registry surface in Extensions (`runtime.state.widgets.packages`
 * with working `widget.package.enable/disable`). This subpage used to render a parallel MOCK list with
 * local-only toggles, contradicting the live surface — so it now points at the real one instead of
 * duplicating it with fake data. */
export function SettingsPlugins() {
	const navigate = useNavigate();
	return (
		<Panel title="Plugins">
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				Installed widget packages — their capabilities, host-permission review, and enable/disable —
				are managed in <strong style={{ color: T.ink }}>Extensions</strong>, backed by the live
				widget registry.
			</div>
			<Button
				variant="secondary"
				size="sm"
				icon="widget"
				onClick={() => navigate('/extensions')}
				style={{ alignSelf: 'flex-start' }}
			>
				Open Extensions
			</Button>
		</Panel>
	);
}

/* ---- Systems (pointer — the REAL rules-system switch, with its `previewSystemSwitch` dry-run and
 * the `widget.package.switch-system` command, lives on the Extensions screen's System tab) ---------- */
export function SettingsSystems() {
	const navigate = useNavigate();
	return (
		<Panel title="Extensions & systems">
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				Switching the campaign rules system — including the non-destructive migration dry-run that
				has to come back clean first — lives in{' '}
				<strong style={{ color: T.ink }}>Extensions → System</strong>, backed by the live extension
				registry and the same safe migration check used throughout the app.
			</div>
			<Button
				variant="secondary"
				size="sm"
				icon="scroll"
				onClick={() => navigate('/extensions')}
				style={{ alignSelf: 'flex-start' }}
			>
				Open Extensions
			</Button>
		</Panel>
	);
}
