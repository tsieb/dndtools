// Onboarding & learnability (UX-ONB): the first-run welcome + vault-setup wizard (get to first
// value fast), the per-surface empty-state pattern (illustration + primary/secondary action), and a
// dismissible coachmark tour over the Command Center. A setup checklist tracks early progress.
const OB = window.DNDToolsDesignSystem_8ae046;

function FirstRun({ d }) {
  const [step, setStep] = React.useState(1);
  const [choice, setChoice] = React.useState('sample');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 'var(--space-5)', maxWidth: 980, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <OB.Stepper steps={d.steps.map((s) => s.title)} current={step} ariaLabel="Setup" />
        <window.Panel pad="lg">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}><OB.Icon name="vault" size="md" /></span>
            <div>
              <window.Eyebrow>Step 2 · {d.timeToValue} to your first scene</window.Eyebrow>
              <div style={{ font: '700 var(--text-xl) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>Where should your campaign live?</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            {d.vaultChoices.map((c) => {
              const on = c.id === choice;
              return (
                <button key={c.id} type="button" onClick={() => setChoice(c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', border: `1px solid ${on ? 'var(--color-accent-border)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><OB.Icon name={c.icon} size="md" /></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{c.name}</span>
                      {c.rec && <OB.Badge status="info">Recommended</OB.Badge>}
                    </div>
                    <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{c.desc}</div>
                  </div>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-border-strong)'}`, background: on ? 'var(--color-accent)' : 'transparent', flex: '0 0 auto' }} />
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <OB.Button variant="ghost" size="md" onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</OB.Button>
            <OB.Button variant="primary" size="md" icon="chevron-right" style={{ marginLeft: 'auto' }} onClick={() => setStep((s) => Math.min(3, s + 1))}>Continue</OB.Button>
          </div>
        </window.Panel>
      </div>

      <window.Panel title="Get started" pad="md" style={{ alignSelf: 'start' }}>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{d.checklist.filter((c) => c.done).length} of {d.checklist.length} done</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {d.checklist.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: c.done ? 'transparent' : 'var(--color-surface-alt)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', border: `1px solid ${c.done ? 'var(--color-status-success)' : 'var(--color-border-strong)'}`, background: c.done ? 'var(--color-status-success-subtle)' : 'transparent', color: 'var(--color-status-success-text)', flex: '0 0 auto' }}>{c.done && <OB.Icon name="check" size={12} />}</span>
              <span style={{ font: 'var(--text-sm) var(--font-sans)', color: c.done ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', textDecoration: c.done ? 'line-through' : 'none' }}>{c.label}</span>
            </div>
          ))}
        </div>
      </window.Panel>
    </div>
  );
}

function EmptyStates({ d }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)', maxWidth: 960, margin: '0 auto', padding: 'var(--space-6) var(--space-5)' }}>
      {d.empties.map((e) => (
        <div key={e.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 'var(--space-2)', padding: 'var(--space-6) var(--space-5)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <window.Eyebrow style={{ alignSelf: 'flex-start' }}>{e.section}</window.Eyebrow>
          {/* placeholder illustration — striped tile (no hand-drawn SVG) */}
          <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', backgroundImage: 'repeating-linear-gradient(45deg, var(--color-surface-sunken), var(--color-surface-sunken) 6px, var(--color-surface-alt) 6px, var(--color-surface-alt) 12px)', border: '1px solid var(--color-border)', margin: 'var(--space-2) 0' }}>
            <OB.Icon name={e.icon} size="lg" />
          </div>
          <div style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{e.head}</div>
          <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5, maxWidth: 320 }}>{e.body}</div>
          {(e.cta || e.alt) && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              {e.cta && <OB.Button variant="primary" size="sm" icon="add">{e.cta}</OB.Button>}
              {e.alt && <OB.Button variant="ghost" size="sm">{e.alt}</OB.Button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CoachTour({ d }) {
  const [stop, setStop] = React.useState(0);
  const t = d.tour[stop];
  return (
    <div style={{ position: 'relative', minHeight: '100%', padding: 'var(--space-6) var(--space-5)' }}>
      {/* faux command-center backdrop */}
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', filter: 'blur(1.5px)', opacity: 0.5, pointerEvents: 'none' }}>
        {['Resume the Pier', 'Scenes', 'Create', 'Library', 'Combat', 'Manage'].map((x, i) => (
          <div key={i} style={{ height: i === 0 ? 120 : 84, gridColumn: i === 0 ? 'span 3' : 'span 1', borderRadius: 'var(--radius-md)', background: i === 0 ? 'var(--color-surface-raised)' : 'var(--color-surface-alt)', border: `1px solid ${i === 0 ? 'var(--color-accent-border)' : 'var(--color-border)'}`, display: 'flex', alignItems: 'center', padding: 'var(--space-4)', font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{x}</div>
        ))}
      </div>
      {/* coachmark */}
      <div style={{ position: 'absolute', left: '50%', top: 200, transform: 'translateX(-50%)', width: 360, padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-accent-border)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 6 }}>
          <OB.Icon name="sparkle" size="sm" color="var(--color-accent)" />
          <span style={{ flex: 1, font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{t.title}</span>
          <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{t.step}/{d.tour.length}</span>
        </div>
        <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{t.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <OB.Button variant="ghost" size="sm">Skip tour</OB.Button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
            {stop > 0 && <OB.Button variant="ghost" size="sm" onClick={() => setStop((s) => s - 1)}>Back</OB.Button>}
            <OB.Button variant="primary" size="sm" onClick={() => setStop((s) => (s + 1) % d.tour.length)}>{stop === d.tour.length - 1 ? 'Done' : 'Next'}</OB.Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Onboarding() {
  const d = window.DNDGaps2.onboarding;
  const [view, setView] = React.useState('first');
  return (
    <window.PageShell icon="sparkle" eyebrow="Welcome to DND Tools" title="Get set up"
      actions={<window.Seg value={view} onChange={setView} options={[
        { value: 'first', label: 'First run' },
        { value: 'empty', label: 'Empty states' },
        { value: 'tour', label: 'Coach tour' },
      ]} />}>
      {view === 'first' && <FirstRun d={d} />}
      {view === 'empty' && <EmptyStates d={d} />}
      {view === 'tour' && <CoachTour d={d} />}
    </window.PageShell>
  );
}

Object.assign(window, { Onboarding });
