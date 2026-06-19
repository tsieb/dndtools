// CharactersRoster — the /characters library: party vitals overview + a filterable roster grid.
// Styled like the Atlas map library (gradient card tiles) but with HP / AC / conditions / ownership
// pulled forward, and a DM quick-create. Exports to window.
const CR = window.DNDToolsDesignSystem_8ae046;

function kindMeta(k) {
  return ({
    PC: { label: 'PC', tone: 'success', icon: 'characters-person' },
    NPC: { label: 'NPC', tone: 'neutral', icon: 'dm-only' },
    Monster: { label: 'Monster', tone: 'warning', icon: 'Skull' },
  })[k] || { label: k, tone: 'neutral' };
}

function ownerChip(c) {
  return c.vis === 'players'
    ? <CR.VisibilityChip level="players" compact />
    : <CR.VisibilityChip level="dm-only" compact />;
}

/* The party vitals overview — a single raised glance-strip atop the roster. */
function PartyOverview() {
  const v = window.DNDGaps.partyVitals;
  return (
    <CR.Card elevation="raised" padding="md" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Party · {window.DNDGaps.party}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
          <CR.StatusDot status="live" pulse /> 3 of 4 online
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
        {v.map((p) => (
          <div key={p.id} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minWidth: 0, padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', opacity: p.conn === 'offline' ? 0.62 : 1 }}>
            <CR.Avatar name={p.name} size="md" ring={p.conn === 'offline' ? 'danger' : 'active'} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ marginLeft: 'auto', font: '600 var(--text-xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}>AC {p.ac}</span>
              </div>
              <div style={{ marginTop: 5 }}><CR.HPBar current={p.hp} max={p.max} size="sm" /></div>
              <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: 3 }}>{p.cls}{p.conditions.length ? ' · ' + p.conditions[0] : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </CR.Card>
  );
}

function GradientHead({ c, h = 96 }) {
  const m = kindMeta(c.kind);
  return (
    <div style={{ position: 'relative', height: h, background: `linear-gradient(${c.grad}deg, #2a2117, #14100b)` }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(224,176,111,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(224,176,111,.07) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      <div style={{ position: 'absolute', top: 10, left: 10 }}>
        <CR.Badge status={m.tone} icon={m.icon}>{m.label}</CR.Badge>
      </div>
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
        {c.cr && <span style={{ font: '600 var(--text-2xs) var(--font-mono)', color: 'var(--color-text-secondary)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '2px 8px' }}>CR {c.cr}</span>}
        {c.count > 1 && <span style={{ font: '600 var(--text-2xs) var(--font-mono)', color: 'var(--color-accent)', background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent-border)', borderRadius: 'var(--radius-full)', padding: '2px 8px' }}>×{c.count}</span>}
      </div>
      <div style={{ position: 'absolute', left: 14, bottom: -22 }}>
        <span style={{ display: 'inline-block', borderRadius: 'var(--radius-full)', boxShadow: '0 0 0 3px var(--color-surface)' }}>
          <CR.Avatar name={c.name} size="lg" ring={c.kind === 'PC' && !c.offline ? 'active' : undefined} />
        </span>
      </div>
    </div>
  );
}

function RosterCard({ c, onOpen }) {
  return (
    <CR.Card elevation="flat" interactive padding="none" onClick={onOpen} style={{ overflow: 'hidden' }}>
      <GradientHead c={c} />
      <div style={{ padding: '28px var(--space-4) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{c.name}</span>
            {c.conditions.map((cd) => <CR.Chip key={cd} tone="info">{cd}</CR.Chip>)}
          </div>
          <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>{c.sub}</div>
        </div>
        <CR.HPBar current={c.hp} max={c.max} size="sm" label="HP" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 var(--text-xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}><CR.Icon name="shield" size="micro" />AC {c.ac}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 var(--text-xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}><CR.Icon name="Dices" size="micro" />Init {c.init}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
          {ownerChip(c)}
          <span style={{ marginLeft: 'auto', font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{c.faction}</span>
        </div>
      </div>
    </CR.Card>
  );
}

function RosterRow({ c, onOpen }) {
  const m = kindMeta(c.kind);
  return (
    <button type="button" onClick={onOpen}
      style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1.6fr) 84px minmax(120px, 1.1fr) 70px 110px', alignItems: 'center', gap: 'var(--space-3)', width: '100%', textAlign: 'left', padding: 'var(--space-2) var(--space-3)', border: 'none', borderBottom: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', transition: 'background var(--duration-fast) var(--easing-standard)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-interactive-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      <CR.Avatar name={c.name} size="sm" ring={c.kind === 'PC' && !c.offline ? 'active' : undefined} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{c.name}</span>
          {c.count > 1 && <span style={{ font: '600 var(--text-2xs) var(--font-mono)', color: 'var(--color-accent)' }}>×{c.count}</span>}
        </div>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</div>
      </div>
      <CR.Badge status={m.tone} icon={m.icon}>{m.label}</CR.Badge>
      <CR.HPBar current={c.hp} max={c.max} size="sm" />
      <span style={{ font: '600 var(--text-xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}>AC {c.ac}</span>
      {ownerChip(c)}
    </button>
  );
}

function CharactersRoster({ onOpen }) {
  const open = onOpen || (() => {});
  const all = window.DNDGaps.characters;
  const [filter, setFilter] = React.useState('all');
  const [view, setView] = React.useState('cards');
  const [q, setQ] = React.useState('');
  const counts = { all: all.length, PC: all.filter((c) => c.kind === 'PC').length, NPC: all.filter((c) => c.kind === 'NPC').length, Monster: all.filter((c) => c.kind === 'Monster').length };
  const shown = all.filter((c) => (filter === 'all' || c.kind === filter) && c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <CR.Breadcrumb items={[{ label: 'Command Center' }, { label: 'Characters' }]} />

      <PartyOverview />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <CR.SegmentedControl value={filter} onChange={setFilter}
          options={[{ value: 'all', label: `All ${counts.all}` }, { value: 'PC', label: `Party ${counts.PC}` }, { value: 'NPC', label: `NPCs ${counts.NPC}` }, { value: 'Monster', label: `Monsters ${counts.Monster}` }]} />
        <CR.Input icon="search" placeholder="Search characters…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <CR.SegmentedControl value={view} onChange={setView} size="sm"
            options={[{ value: 'cards', label: 'Cards' }, { value: 'list', label: 'List' }]} />
          <CR.Button variant="ghost" icon="Zap" onClick={() => window.DNDNavigate && window.DNDNavigate('character')}>Quick-create</CR.Button>
          <CR.Button variant="primary" icon="add" onClick={() => window.DNDNavigate && window.DNDNavigate('character')}>New character</CR.Button>
        </div>
      </div>

      {view === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
          {shown.map((c) => <RosterCard key={c.id} c={c} onOpen={() => open(c)} />)}
        </div>
      ) : (
        <CR.Card elevation="flat" padding="none" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1.6fr) 84px minmax(120px, 1.1fr) 70px 110px', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-border-strong)', font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            <span /><span>Name</span><span>Kind</span><span>Hit points</span><span>AC</span><span>Visibility</span>
          </div>
          {shown.map((c) => <RosterRow key={c.id} c={c} onOpen={() => open(c)} />)}
        </CR.Card>
      )}
    </div>
  );
}

Object.assign(window, { CharactersRoster });
