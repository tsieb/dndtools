// Profile + a11y specimens.
//   NavProfiles (UX-NAV) — the one IA in its three presentations: desktop sidebar rail, tablet icon
//     rail, mobile bottom tab bar. Same seven destinations; only the chrome changes.
//   AccessibilitySpec (UX-A11Y) — the keyboard map, live-region announcements (with politeness),
//     the DM↔player leak-proofing checklist, and the focus-ring / preference specimens.
const PF = window.DNDToolsDesignSystem_8ae046;

const IA = [
  { id: 'home', label: 'Command Center', icon: 'home' },
  { id: 'session', label: 'Session', icon: 'session-bolt' },
  { id: 'characters', label: 'Characters', icon: 'characters-person' },
  { id: 'atlas', label: 'Atlas', icon: 'atlas-map' },
  { id: 'campaign', label: 'Campaign', icon: 'campaign-scroll' },
  { id: 'knowledge', label: 'Knowledge', icon: 'knowledge-book' },
  { id: 'settings', label: 'Settings', icon: 'settings-gear' },
];

function Frame({ label, w, children, foot }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: '0 0 auto' }}>
      <window.Eyebrow>{label}</window.Eyebrow>
      <div style={{ width: w, borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)', background: 'var(--color-bg)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>{children}</div>
      {foot && <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', maxWidth: w, lineHeight: 1.5 }}>{foot}</div>}
    </div>
  );
}

function NavProfiles() {
  const active = 'session';
  return (
    <window.PageShell icon="atlas-map" eyebrow="Navigation" title="Platform profiles">
      <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'flex-start', padding: 'var(--space-6) var(--space-5)', maxWidth: 1180, margin: '0 auto' }}>

        {/* Desktop — sidebar rail */}
        <Frame label="Desktop · sidebar rail" w={420} foot="Full labels, grouped. The current section is gold-tinted with a left rail.">
          <div style={{ display: 'flex', height: 300 }}>
            <div style={{ width: 168, borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {IA.map((s) => {
                const on = s.id === active;
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', borderLeft: `2px solid ${on ? 'var(--color-accent)' : 'transparent'}` }}>
                    <PF.Icon name={s.icon} size="sm" color={on ? 'var(--color-accent)' : 'var(--color-text-tertiary)'} />
                    <span style={{ font: `${on ? 600 : 500} var(--text-xs) var(--font-sans)`, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ flex: 1, background: 'var(--color-surface-sunken)' }} />
          </div>
        </Frame>

        {/* Tablet — icon rail */}
        <Frame label="Tablet · icon rail" w={300} foot="Compact icon-only rail to reclaim width; labels appear on the active item and on hover.">
          <div style={{ display: 'flex', height: 300 }}>
            <div style={{ width: 56, borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              {IA.map((s) => {
                const on = s.id === active;
                return (
                  <div key={s.id} title={s.label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                    <PF.Icon name={s.icon} size="md" />
                  </div>
                );
              })}
            </div>
            <div style={{ flex: 1, background: 'var(--color-surface-sunken)' }} />
          </div>
        </Frame>

        {/* Mobile — bottom tab bar */}
        <Frame label="Mobile · bottom tab bar" w={190} foot="Top 4 destinations + More. 44px targets, comfortable density locked.">
          <div style={{ display: 'flex', flexDirection: 'column', height: 360 }}>
            <div style={{ flex: 1, background: 'var(--color-surface-sunken)' }} />
            <div style={{ display: 'flex', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
              {[IA[0], IA[1], IA[3], IA[5], { id: 'more', label: 'More', icon: 'more' }].map((s) => {
                const on = s.id === active;
                return (
                  <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 'var(--space-2) 0', minHeight: 44, color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                    <PF.Icon name={s.icon} size="sm" />
                    <span style={{ font: '500 9px var(--font-sans)' }}>{s.label.split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Frame>
      </div>
    </window.PageShell>
  );
}

/* ════════════ Accessibility specimen ════════════ */
function AccessibilitySpec() {
  const d = window.DNDGaps2.a11y;
  const [focus, setFocus] = React.useState(true);
  return (
    <window.PageShell icon="accessibility" eyebrow="Settings" title="Accessibility">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--space-4)', maxWidth: 1080, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>

        <window.Panel title="Keyboard map" pad="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.shortcuts.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <kbd style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-strong)', borderRadius: 4, padding: '2px 7px', background: 'var(--color-surface-sunken)', minWidth: 64, textAlign: 'center' }}>{s.keys}</kbd>
                <span style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{s.action}</span>
              </div>
            ))}
          </div>
        </window.Panel>

        <window.Panel title="Live-region announcements" pad="md">
          <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>What a screen reader hears — actor-filtered before render.</div>
          {d.announcements.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
              <PF.Icon name={a.icon} size="sm" color="var(--color-accent)" />
              <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{a.text}</span>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: a.live === 'assertive' ? 'var(--color-status-warning-text)' : 'var(--color-text-tertiary)' }}>aria-live: {a.live}</span>
            </div>
          ))}
        </window.Panel>

        <window.Panel title="DM ↔ player leak-proofing" pad="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.leakChecks.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <PF.Icon name="check" size="sm" color="var(--color-status-success-text)" />
                <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>{c.label}</span>
              </div>
            ))}
          </div>
        </window.Panel>

        <window.Panel title="Focus & preferences" pad="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <window.Eyebrow>Focus ring · 2px gold at 2px offset</window.Eyebrow>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 6 }}>
                <span style={{ outline: focus ? '2px solid var(--color-accent)' : 'none', outlineOffset: 2, borderRadius: 'var(--radius-md)' }}><PF.Button variant="primary" size="sm">Focused</PF.Button></span>
                <PF.Button variant="ghost" size="sm" onClick={() => setFocus((v) => !v)}>{focus ? 'Hide ring' : 'Show ring'}</PF.Button>
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--color-border)' }} />
            <PF.Switch checked label="High-contrast theme" onChange={() => {}} />
            <PF.Switch checked label="Reduce motion (collapses durations to 0)" onChange={() => {}} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Density</span>
              <window.Seg value="comfortable" onChange={() => {}} options={[{ value: 'standard', label: 'Standard' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} size="sm" />
            </div>
          </div>
        </window.Panel>
      </div>
    </window.PageShell>
  );
}

Object.assign(window, { NavProfiles, AccessibilitySpec });
