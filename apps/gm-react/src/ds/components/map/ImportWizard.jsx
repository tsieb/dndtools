import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Stepper } from '../core/Stepper.jsx';
import { SegmentedControl } from '../forms/SegmentedControl.jsx';
import { Field } from '../forms/Field.jsx';
import { Input } from '../forms/Input.jsx';
import { Button } from '../core/Button.jsx';

/**
 * ImportWizard — the two-phase map import flow (UX-MAP-009 / MAP-002 / MAP-020). The core safety
 * contract: NOTHING is written before the explicit "Commit import" in step 2, and cancelling at
 * any point leaves zero state (AP-7). Step 2 classifies every element of an external file as
 * importable · lossy · unsupported · blocked, and an unknown format (no declared adapter) offers
 * no commit path at all. Oversized files are rejected in step 1 before any storage mutation.
 *
 * This is the wizard body + step nav; wrap it in your own modal (desktop) or sheet (mobile).
 */
const SUPPORT = {
	importable: { tone: 'var(--color-status-success)', bg: 'var(--color-status-success-subtle)', label: 'Importable', icon: 'success' },
	lossy: { tone: 'var(--color-status-warning)', bg: 'var(--color-status-warning-subtle)', label: 'Lossy', icon: 'warning' },
	unsupported: { tone: 'var(--color-status-error)', bg: 'var(--color-status-error-subtle)', label: 'Unsupported', icon: 'error' },
	blocked: { tone: 'var(--color-text-tertiary)', bg: 'var(--color-surface-sunken)', label: 'Blocked', icon: 'lock' },
};

const DEMO_CAPS = [
	{ element: 'dimensions', support: 'importable' },
	{ element: 'grid', support: 'importable' },
	{ element: 'background image', support: 'importable' },
	{ element: 'walls', support: 'importable' },
	{ element: 'lights', support: 'lossy' },
	{ element: 'notes', support: 'unsupported' },
	{ element: 'tokens', support: 'unsupported' },
];

export function ImportWizard({ step: controlledStep, onCommit, onCancel, onOpenMap, capabilities = DEMO_CAPS, style, ...rest }) {
	const [step, setStep] = React.useState(controlledStep ?? 0);
	const [source, setSource] = React.useState('native');
	const [adapter, setAdapter] = React.useState('foundry-scene');
	const hasAdapter = source === 'native' || (adapter && adapter !== 'unknown');
	const dropped = capabilities.filter((c) => c.support === 'unsupported').map((c) => c.element);

	const go = (n) => setStep(n);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: 560, maxWidth: '92vw', padding: 'var(--space-5)', background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-lg)', boxSizing: 'border-box', ...style }} {...rest}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<Icon name="import" size={18} color="var(--color-accent)" />
				<h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-weight-bold)' }}>Import map</h2>
			</div>
			<Stepper steps={['Source', 'Preview', 'Result']} current={step} />

			{step === 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
					<SegmentedControl fullWidth ariaLabel="Source type" value={source} onChange={setSource}
						options={[{ value: 'native', label: 'Image / SVG' }, { value: 'external', label: 'External scene format' }]} />
					{source === 'native' ? (
						<label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-6)', border: '1px dashed var(--color-border-strong)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', cursor: 'pointer', textAlign: 'center' }}>
							<Icon name="upload" size={28} color="var(--color-text-tertiary)" />
							<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}><strong style={{ color: 'var(--color-text-primary)' }}>silverdale-region.png</strong> · 4.2 MB</span>
							<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-tertiary)' }}>PNG, JPG, SVG · up to 50 MB</span>
						</label>
					) : (
						<Field label="Adapter / format" help="External formats need a declared adapter before import.">
							<Input value={adapter} onChange={(e) => setAdapter(e.target.value)} placeholder="e.g. foundry-scene" />
						</Field>
					)}
					<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
						<Button variant="ghost" onClick={onCancel}>Cancel</Button>
						<Button variant="primary" icon="preview" onClick={() => go(1)}>Preview</Button>
					</div>
				</div>
			)}

			{step === 1 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
					{source === 'external' && !hasAdapter ? (
						<div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-status-error-subtle)', border: '1px solid var(--color-status-error)' }}>
							<Icon name="error" size={16} color="var(--color-status-error)" />
							<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-status-error-text)' }}>Unsupported format — no adapter declared. There is no commit path for this file.</span>
						</div>
					) : source === 'native' ? (
						<div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 'var(--space-1-5)', columnGap: 'var(--space-3)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}>
							{[['Filename', 'silverdale-region.png'], ['Dimensions', '4096 × 3072 px'], ['Byte size', '4.2 MB'], ['Content hash', 'sha256:9f3c…a1']].map(([k, v]) => (
								<React.Fragment key={k}>
									<span style={{ color: 'var(--color-text-tertiary)' }}>{k}</span>
									<span style={{ fontFamily: k === 'Content hash' ? 'var(--font-mono)' : 'inherit', color: 'var(--color-text-primary)' }}>{v}</span>
								</React.Fragment>
							))}
						</div>
					) : (
						<>
							<div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
								{capabilities.map((c, i) => {
									const s = SUPPORT[c.support];
									return (
										<div key={c.element} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', background: i % 2 ? 'var(--color-surface-alt)' : 'transparent' }}>
											<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{c.element}</span>
											<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', background: s.bg, color: s.tone, border: `1px solid ${s.tone}`, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-weight-semibold)' }}>
												<Icon name={s.icon} size={12} /> {s.label}
											</span>
										</div>
									);
								})}
							</div>
							{dropped.length > 0 && (
								<div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
									These elements will not be imported: <strong style={{ color: 'var(--color-text-primary)' }}>{dropped.join(', ')}</strong>.
								</div>
							)}
						</>
					)}
					<div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
						<Button variant="ghost" icon="chevron-left" onClick={() => go(0)}>Back</Button>
						<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
							<Button variant="ghost" onClick={onCancel}>Cancel (rollback)</Button>
							{hasAdapter && <Button variant="primary" icon="check" onClick={() => { onCommit && onCommit(); go(2); }}>Commit import</Button>}
						</div>
					</div>
				</div>
			)}

			{step === 2 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2-5, 10px)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-status-success-subtle)', border: '1px solid var(--color-status-success)' }}>
						<Icon name="success" size={20} color="var(--color-status-success)" />
						<div style={{ fontFamily: 'var(--font-sans)' }}>
							<div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>Silverdale Region imported</div>
							<div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>5 layers created · base image, walls, grid, lights, regions</div>
						</div>
					</div>
					<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
						<Button variant="ghost" onClick={onCancel}>Close</Button>
						<Button variant="primary" icon="enter" onClick={onOpenMap}>Open map</Button>
					</div>
				</div>
			)}
		</div>
	);
}
