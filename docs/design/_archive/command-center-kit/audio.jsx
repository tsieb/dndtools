// Audio & atmosphere (UX-AUDIO): the soundboard cue grid (one-tap DM-triggered SFX), the layered
// ambience mixer (independent loops + volume), the now-playing strip stating what players hear, and
// per-scene audio binding. DM-only vs player-audible routing is named in plain language, never color.
const AU = window.DNDToolsDesignSystem_8ae046;

const CUE_TONE = {
  error: ['var(--color-status-error-subtle)', 'var(--color-status-error)', 'var(--color-status-error-text)'],
  success: ['var(--color-status-success-subtle)', 'var(--color-status-success)', 'var(--color-status-success-text)'],
  warning: ['var(--color-status-warning-subtle)', 'var(--color-status-warning)', 'var(--color-status-warning-text)'],
  info: ['var(--color-status-info-subtle)', 'var(--color-status-info)', 'var(--color-status-info-text)'],
  accent: ['var(--color-accent-subtle)', 'var(--color-accent-border)', 'var(--color-accent)'],
  neutral: ['var(--color-surface-alt)', 'var(--color-border)', 'var(--color-text-secondary)'],
};

function AmbienceRow({ layer, onToggle, onVol }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', opacity: layer.on ? 1 : 0.6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: layer.on ? 'var(--color-accent)' : 'var(--color-text-tertiary)', flex: '0 0 auto' }}><AU.Icon name={layer.icon} size="md" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{layer.name}</span>
          {layer.dm && <AU.Badge status="neutral" icon="dm-only">DM only</AU.Badge>}
          {layer.loop && <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>loop</span>}
        </div>
        <div style={{ marginTop: 4 }}>
          <AU.Slider value={layer.vol} onChange={(v) => onVol(layer.id, v)} min={0} max={100} valueLabel={`${layer.vol}%`} disabled={!layer.on} />
        </div>
      </div>
      <AU.Switch checked={layer.on} onChange={() => onToggle(layer.id)} />
    </div>
  );
}

function AudioMixer() {
  const d = window.DNDGaps2.audio;
  const [layers, setLayers] = React.useState(d.ambience);
  const [master, setMaster] = React.useState(d.master);
  const [fired, setFired] = React.useState(null);
  const onToggle = (id) => setLayers((xs) => xs.map((l) => l.id === id ? { ...l, on: !l.on } : l));
  const onVol = (id, v) => setLayers((xs) => xs.map((l) => l.id === id ? { ...l, vol: v } : l));
  const playing = layers.filter((l) => l.on && !l.dm);

  const fire = (c) => { setFired(c.id); setTimeout(() => setFired(null), 600); };

  return (
    <window.PageShell icon="audio" eyebrow="Session" title="Audio & atmosphere"
      actions={<React.Fragment>
        <AU.Badge status="success" icon="visibility-players">Projecting to {d.listeners}</AU.Badge>
        <AU.Button variant="ghost" size="sm" icon="audio-off">Mute all</AU.Button>
      </React.Fragment>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 'var(--space-5)', maxWidth: 1100, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* now-playing strip */}
          <window.Panel pad="md" style={{ borderColor: 'var(--color-accent-border)', background: 'var(--color-surface-raised)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <AU.StatusDot status="live" pulse />
              <div style={{ flex: 1 }}>
                <div style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>Now playing · {d.nowScene}</div>
                <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Players hear: {playing.map((l) => l.name).join(' · ') || 'silence'}</div>
              </div>
              <AU.IconButton icon="pause" label="Pause all" variant="secondary" />
            </div>
          </window.Panel>

          {/* ambience mixer */}
          <window.Panel title="Ambience mixer" action={<AU.Button variant="ghost" size="sm" icon="add">Add loop</AU.Button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {layers.map((l) => <AmbienceRow key={l.id} layer={l} onToggle={onToggle} onVol={onVol} />)}
            </div>
          </window.Panel>
        </div>

        {/* right rail: soundboard + scenes + master */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <window.Panel title="Soundboard" pad="md">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              {d.cues.map((c) => {
                const [bg, bd, fg] = CUE_TONE[c.tone] || CUE_TONE.neutral;
                const on = fired === c.id;
                return (
                  <button key={c.id} type="button" onClick={() => fire(c)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 'var(--space-3)', border: `1px solid ${on ? fg : bd}`, borderRadius: 'var(--radius-md)', background: on ? fg : bg, color: on ? 'var(--color-accent-foreground)' : fg, cursor: 'pointer', transition: 'transform 80ms, background 80ms', transform: on ? 'scale(0.97)' : 'none', textAlign: 'left' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <AU.Icon name={c.icon} size="md" />
                      <kbd style={{ font: 'var(--text-2xs) var(--font-mono)', opacity: 0.7 }}>{c.hot}</kbd>
                    </span>
                    <span style={{ font: '600 var(--text-xs) var(--font-sans)', color: on ? 'var(--color-accent-foreground)' : 'var(--color-text-primary)' }}>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </window.Panel>

          <window.Panel title="Scene audio" pad="md">
            <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>Bind a mix to a scene so it starts when you drop in.</div>
            {d.scenes.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
                <AU.Icon name="scene" size="sm" color="var(--color-text-secondary)" />
                <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{s.name}</span>
                <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{s.tracks} tracks</span>
                {s.bound ? <AU.Badge status="success" icon="check">Bound</AU.Badge> : <AU.Button variant="ghost" size="sm">Bind</AU.Button>}
              </div>
            ))}
          </window.Panel>

          <window.Panel pad="md">
            <AU.Slider label="Master volume" value={master} onChange={setMaster} min={0} max={100} valueLabel={`${master}%`} steppers />
          </window.Panel>
        </div>
      </div>
    </window.PageShell>
  );
}

Object.assign(window, { AudioMixer });
