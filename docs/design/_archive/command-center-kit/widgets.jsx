// WidgetBody — renders a widget's real content by type, using the design-system primitives. This
// is the widget as the DM sees it; edit-mode chrome (drag/resize/select) is layered on by the
// canvas frame, so the body stays identical in view and edit modes.
const WB = window.DNDToolsDesignSystem_8ae046;

const VIS_LEVEL = { dm: 'dm-only', players: 'players', shared: 'players' };

function WHeader({ w }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flex: '0 0 auto' }}>
      <span style={{ flex: 1, minWidth: 0, font: '700 var(--text-sm) var(--font-display)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</span>
      <WB.VisibilityChip level={VIS_LEVEL[w.vis] || 'dm-only'} compact />
    </div>
  );
}

function Initiative({ w }) {
  const d = window.DNDData;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flex: '0 0 auto' }}>
        <WB.StatPill label="Turn" value="Mara Quill" mono={false} tone="accent" />
        <WB.StatPill label="Round" value="2" />
        {w.props.autoAdvance && <WB.Chip tone="neutral" icon="skip">Auto-advance</WB.Chip>}
        <WB.Button variant="primary" size="sm" iconRight="skip" style={{ marginLeft: 'auto' }}>Next</WB.Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
        {d.combatants.slice(0, 3).map((c) => (
          <WB.InitiativeRow key={c.id} name={c.name} initiative={c.init} current={c.hp} max={c.max} active={c.active} dmOnly={c.dmOnly && !w.props.showHpToPlayers} />
        ))}
      </div>
    </div>
  );
}

function Dice({ w }) {
  const d = window.DNDData;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minHeight: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: '0 0 auto' }}>
        {(w.props.presets || []).map((p) => <WB.Chip key={p} tone="accent">{p}</WB.Chip>)}
        {w.props.advantage && <WB.Chip tone="info">Advantage</WB.Chip>}
      </div>
      {w.props.history && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
          {d.dice.map((r) => <WB.DiceResult key={r.id} notation={r.notation} total={r.total} rolls={r.rolls} modifier={r.modifier} crit={r.crit} />)}
        </div>
      )}
      <WB.Button variant="secondary" size="sm" icon="dice" style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>Roll</WB.Button>
    </div>
  );
}

function Party() {
  const d = window.DNDData;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
      {d.party.slice(0, 4).map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <WB.Avatar name={p.name} size="sm" ring={p.conn === 'offline' ? 'danger' : undefined} />
          <WB.HPBar current={p.hp} max={p.max} label={p.name} size="sm" style={{ flex: 1 }} />
        </div>
      ))}
    </div>
  );
}

function Players() {
  const d = window.DNDData;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
      {d.players.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <WB.Avatar name={p.name} size="sm" ring={p.status === 'live' ? 'active' : undefined} />
          <span style={{ flex: 1, minWidth: 0, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          <WB.Badge status={p.status === 'live' ? 'success' : 'warning'}>{p.status === 'live' ? 'Live' : 'Queued'}</WB.Badge>
        </div>
      ))}
    </div>
  );
}

function Note({ w }) {
  const size = { sm: 'var(--text-xs)', md: 'var(--text-sm)', lg: 'var(--text-md)' }[w.props.size || 'md'];
  return <div style={{ font: `${size}/1.6 var(--font-sans)`, color: 'var(--color-text-secondary)', overflow: 'hidden' }}>{w.props.text}</div>;
}

function Timer({ w }) {
  const m = w.props.minutes || 5;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div style={{ font: '700 28px var(--font-mono)', color: 'var(--color-text-primary)', letterSpacing: '.04em' }}>{String(m).padStart(2, '0')}:00</div>
      <WB.Button variant="secondary" size="sm" icon="play" style={{ marginLeft: 'auto' }}>Start</WB.Button>
    </div>
  );
}

function AudioW({ w }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <WB.IconButton icon="play" label="Play" variant="accent" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.props.track}</div>
        <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{w.props.loop ? 'Looping' : 'Once'}</div>
      </div>
    </div>
  );
}

function Conditions({ w }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {(w.props.items || []).map((t) => <WB.Chip key={t} tone="neutral">{t}</WB.Chip>)}
    </div>
  );
}

function ImageW({ w }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
      <div style={{ flex: 1, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, #2a2117, #14100b)', backgroundImage: 'linear-gradient(rgba(224,176,111,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(224,176,111,.08) 1px, transparent 1px)', backgroundSize: '18px 18px', border: '1px solid var(--color-border)' }} />
      <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{w.props.caption}</div>
    </div>
  );
}

const BODIES = { initiative: Initiative, dice: Dice, party: Party, players: Players, note: Note, timer: Timer, audio: AudioW, conditions: Conditions, image: ImageW };

function WidgetBody({ w }) {
  const Body = BODIES[w.type] || Note;
  const accent = !!w.props.accent;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: accent ? 'var(--color-accent-subtle)' : 'var(--color-surface-raised)', border: `1px solid ${accent ? 'var(--color-accent-border)' : 'var(--color-border)'}`, boxShadow: accent ? 'var(--shadow-md)' : 'var(--shadow-sm)', overflow: 'hidden' }}>
      <WHeader w={w} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}><Body w={w} /></div>
    </div>
  );
}

Object.assign(window, { WidgetBody });
