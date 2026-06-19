// Session lifecycle (UX-SES): the three phases the combat hot path never covered — Prep (a
// readiness checklist before you start), Live (the running-session dashboard: timer, event feed,
// turn controls, party vitals), and Recap (session stats + an editable recap to save and close out).
const SS = window.DNDToolsDesignSystem_8ae046;

const FEED_TONE = { combat: 'var(--color-status-error-text)', dice: 'var(--color-accent)', share: 'var(--color-status-info-text)', map: 'var(--color-status-success-text)' };

function Prep({ d }) {
  const ready = d.prep.filter((p) => p.done).length;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'var(--space-5)', maxWidth: 980, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <window.Panel title="Pre-session readiness" action={<span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{ready}/{d.prep.length}</span>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {d.prep.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: p.done ? 'var(--color-status-success-subtle)' : 'transparent', border: `1px solid ${p.done ? 'var(--color-status-success)' : 'var(--color-border-strong)'}`, color: 'var(--color-status-success-text)', flex: '0 0 auto' }}>{p.done && <SS.Icon name="check" size={13} />}</span>
              <SS.Icon name={p.icon} size="sm" color="var(--color-text-tertiary)" />
              <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{p.label}</span>
              {!p.done && <SS.Button variant="ghost" size="sm">Do it</SS.Button>}
            </div>
          ))}
        </div>
      </window.Panel>
      <window.Panel pad="lg" style={{ borderColor: 'var(--color-accent-border)', alignItems: 'flex-start' }}>
        <window.Eyebrow>Session {d.number}</window.Eyebrow>
        <div style={{ font: '700 var(--text-xl) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.15 }}>{d.title}</div>
        <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>The party is at the pier at low tide. {ready} of {d.prep.length} prep items ready.</div>
        <SS.Button variant="primary" size="lg" icon="play" style={{ width: '100%' }}>Start session</SS.Button>
        <SS.Button variant="ghost" size="sm">Start without finishing prep</SS.Button>
      </window.Panel>
    </div>
  );
}

function Live({ d }) {
  const party = window.DNDData.party;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 'var(--space-5)', maxWidth: 1100, margin: '0 auto', padding: 'var(--space-5)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* live header */}
        <window.Panel pad="md" style={{ borderColor: 'var(--color-accent-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <SS.StatusDot status="live" pulse label="" />
            <div style={{ flex: 1 }}>
              <div style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>Session live · {d.title}</div>
              <div style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>elapsed {d.elapsed} · round 2 · projecting to 3</div>
            </div>
            <SS.Button variant="ghost" size="sm" icon="pause">Pause</SS.Button>
            <SS.Button variant="secondary" size="sm" icon="flag">End session</SS.Button>
          </div>
        </window.Panel>

        {/* event feed */}
        <window.Panel title="Session feed">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {d.feed.map((f, i) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-1)', borderBottom: i < d.feed.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', width: 36, flex: '0 0 auto' }}>{f.t}</span>
                <SS.Icon name={f.icon} size="sm" color={FEED_TONE[f.kind] || 'var(--color-text-tertiary)'} />
                <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{f.text}</span>
              </div>
            ))}
          </div>
        </window.Panel>
      </div>

      {/* right: party vitals + quick actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <window.Panel title="Turn">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent-border)' }}>
            <SS.Avatar name="Mara Quill" size="md" ring="active" />
            <div style={{ flex: 1 }}>
              <window.Eyebrow>Current turn</window.Eyebrow>
              <div style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>Mara Quill</div>
            </div>
            <SS.Button variant="primary" size="sm" icon="skip">Next</SS.Button>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <SS.Button variant="ghost" size="sm" icon="dice">Roll</SS.Button>
            <SS.Button variant="ghost" size="sm" icon="send">Push handout</SS.Button>
          </div>
        </window.Panel>
        <window.Panel title="Party vitals">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {party.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <SS.Avatar name={p.name} size="sm" ring={p.conn === 'connected' ? 'active' : 'danger'} />
                  <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{p.name}</span>
                  <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{p.cls}</span>
                </div>
                <SS.HPBar current={p.hp} max={p.max} size="sm" />
              </div>
            ))}
          </div>
        </window.Panel>
      </div>
    </div>
  );
}

function Recap({ d }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 'var(--space-5)', maxWidth: 980, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <window.Panel title="Session recap" action={<SS.Badge status="info" icon="visibility-players">Players will see this</SS.Badge>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {d.recap.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                <SS.Badge status="neutral">{r.tag}</SS.Badge>
                <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{r.text}</span>
                <SS.IconButton icon="edit" label="Edit beat" variant="ghost" size="sm" />
              </div>
            ))}
          </div>
          <SS.Button variant="ghost" size="sm" icon="sparkle">Draft recap with AI</SS.Button>
        </window.Panel>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <SS.Button variant="primary" size="md" icon="check">Save recap & close session</SS.Button>
          <SS.Button variant="ghost" size="md">Discard</SS.Button>
        </div>
      </div>
      <window.Panel title="This session" pad="md">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          {d.stats.map((s) => (
            <div key={s.k} style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
              <div style={{ font: '700 var(--text-xl) var(--font-mono)', color: 'var(--color-accent)', lineHeight: 1 }}>{s.v}</div>
              <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginTop: 4 }}>{s.k}</div>
            </div>
          ))}
        </div>
      </window.Panel>
    </div>
  );
}

function SessionLive() {
  const d = window.DNDGaps2.session;
  const [phase, setPhase] = React.useState('live');
  return (
    <window.PageShell icon="session-bolt" eyebrow="Session" title={`Session ${d.number}`}
      actions={<window.Seg value={phase} onChange={setPhase} options={[
        { value: 'prep', label: 'Prep' },
        { value: 'live', label: 'Live' },
        { value: 'recap', label: 'Recap' },
      ]} />}>
      {phase === 'prep' && <Prep d={d} />}
      {phase === 'live' && <Live d={d} />}
      {phase === 'recap' && <Recap d={d} />}
    </window.PageShell>
  );
}

Object.assign(window, { SessionLive });
