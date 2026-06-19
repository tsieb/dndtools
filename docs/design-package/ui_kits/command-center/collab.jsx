// Collaboration presence (UX-COLLAB): live co-editing on a note — presence avatars, colored
// cursors/selection in the text, a live activity feed, and the share scopes that decide who can
// edit, who can only view player-visible blocks, and who is locked out of a DM-only note.
const CB = window.DNDToolsDesignSystem_8ae046;

const SCOPE_META = {
  edit: { s: 'success', t: 'Can edit' }, view: { s: 'info', t: 'Can view' }, none: { s: 'neutral', t: 'No access' },
};

function Cursor({ name, color }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 2, height: '1.1em', background: color, verticalAlign: 'text-bottom', margin: '0 1px' }}>
      <span style={{ position: 'absolute', top: '-1.3em', left: 0, font: '600 var(--text-2xs) var(--font-sans)', color: 'var(--color-accent-foreground)', background: color, padding: '1px 5px', borderRadius: '3px 3px 3px 0', whiteSpace: 'nowrap' }}>{name}</span>
    </span>
  );
}

function Collaboration() {
  const d = window.DNDGaps2.collab;
  return (
    <window.PageShell icon="note-edit" eyebrow="Knowledge" title="Co-editing"
      actions={<React.Fragment>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {d.editors.map((e, i) => (
            <span key={e.id} title={`${e.name} · ${e.role}`} style={{ marginLeft: i ? -8 : 0, borderRadius: '50%', boxShadow: `0 0 0 2px var(--color-bg), 0 0 0 4px ${e.color}` }}>
              <CB.Avatar name={e.name} size="sm" />
            </span>
          ))}
          <span style={{ marginLeft: 'var(--space-3)', font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{d.editors.length} here</span>
        </div>
        <CB.Button variant="primary" size="sm" icon="link">Share</CB.Button>
      </React.Fragment>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'var(--space-5)', maxWidth: 1060, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
        {/* the live document */}
        <window.Panel title={d.doc} action={<CB.Badge status="neutral" icon="dm-only">DM only note</CB.Badge>}>
          <div style={{ font: 'var(--text-md)/1.7 var(--font-sans)', color: 'var(--color-text-primary)' }}>
            <h3 style={{ font: '700 var(--text-lg) var(--font-display)', margin: '0 0 8px' }}>Hooks
              <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 8 }}><Cursor name="You" color="#e0b06f" /></span>
            </h3>
            <p style={{ margin: '0 0 12px' }}>The missing shipment — the ledger names the 14th, low tide. Vorlag will parley; he wants out, not a fight.</p>
            <h3 style={{ font: '700 var(--text-lg) var(--font-display)', margin: '0 0 8px' }}>Read-aloud</h3>
            <p style={{ margin: 0, background: 'color-mix(in oklch, #5aa6e0 12%, transparent)', borderRadius: 'var(--radius-sm)', padding: '2px 4px' }}>
              Brackish water laps at the rotting pier. A single lantern gutters at the far end, throwing long shadows across the crates.<Cursor name="Aša" color="#5aa6e0" />
            </p>
            <div style={{ marginTop: 'var(--space-3)', font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Aša is editing the read-aloud · changes merge live</div>
          </div>
        </window.Panel>

        {/* presence + activity + share */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <window.Panel title="Who's here" pad="md">
            {d.editors.map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ borderRadius: '50%', boxShadow: `0 0 0 2px ${e.color}` }}><CB.Avatar name={e.name} size="sm" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{e.name}</span>
                  <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}> · {e.role}</span>
                </div>
                <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: e.view ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }}>{e.view ? 'viewing' : `at ${e.at}`}</span>
              </div>
            ))}
          </window.Panel>

          <window.Panel title="Activity" pad="md">
            {d.activity.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, marginTop: 6, flex: '0 0 auto' }} />
                <div style={{ flex: 1, font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  <b style={{ color: 'var(--color-text-primary)' }}>{a.who}</b> {a.text} <span style={{ color: 'var(--color-text-tertiary)' }}>· {a.when}</span>
                </div>
              </div>
            ))}
          </window.Panel>

          <window.Panel title="Share" pad="md">
            {d.shareScopes.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
                <CB.Icon name={s.icon} size="sm" color="var(--color-text-secondary)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{s.label}</div>
                  <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{s.sub}</div>
                </div>
                <CB.Badge status={SCOPE_META[s.level].s}>{SCOPE_META[s.level].t}</CB.Badge>
              </div>
            ))}
            <CB.Button variant="ghost" size="sm" icon="add">Invite someone</CB.Button>
          </window.Panel>
        </div>
      </div>
    </window.PageShell>
  );
}

Object.assign(window, { Collaboration });
