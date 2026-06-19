// Session (combat hot path), Knowledge (notes), Atlas (map library). Exports to window.
const SX = window.DNDToolsDesignSystem_8ae046;

/* ---------------- Session / Combat ---------------- */
function SessionCombat() {
  const d = window.DNDData;
  const [mode, setMode] = React.useState('run');
  const [hp, setHp] = React.useState(Object.fromEntries(d.combatants.map((c) => [c.id, c.hp])));
  const bump = (id, n, max) => setHp((s) => ({ ...s, [id]: Math.max(0, Math.min(max, s[id] + n)) }));
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SX.Tabs value={mode} onChange={setMode} tabs={[{ id: 'run', label: 'Run combat', icon: 'session-bolt' }, { id: 'build', label: 'Build encounter', icon: 'add' }]} />
        <SX.StatusDot status="live" pulse label="Session live" />
      </div>

      {mode === 'run' ? (
        <SX.Card accent elevation="raised" padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
              <SX.StatPill label="Round" value="2" tone="accent" />
              <SX.StatPill label="Current turn" value="Mara Quill" mono={false} />
              <SX.StatPill label="Up next" value="Bandit Captain" mono={false} tone="warning" />
            </div>
            <SX.Button variant="primary" size="lg" iconRight="skip">Next turn</SX.Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {d.combatants.map((c) => (
              <SX.InitiativeRow key={c.id} name={c.name} initiative={c.init} current={hp[c.id]} max={c.max}
                conditions={c.conditions} active={c.active} dmOnly={c.dmOnly}
                onHpDown={() => bump(c.id, -1, c.max)} onHpUp={() => bump(c.id, 1, c.max)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <SX.Button variant="secondary" icon="add">Add combatant</SX.Button>
            <SX.Button variant="ghost" icon="dice">Roll initiative</SX.Button>
            <SX.Button variant="ghost" icon="error" style={{ marginLeft: 'auto', color: 'var(--color-status-error-text)' }}>End combat</SX.Button>
          </div>
        </SX.Card>
      ) : (
        <SX.Card elevation="flat" padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>Build encounter</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
            <SX.Field label="Title"><SX.Input defaultValue="Pier ambush" /></SX.Field>
            <SX.Field label="Party size"><SX.Input type="number" defaultValue="4" /></SX.Field>
            <SX.Field label="Average level"><SX.Input type="number" defaultValue="5" /></SX.Field>
          </div>
          <SX.Field label="Difficulty">
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <SX.Badge status="warning">Hard</SX.Badge>
              <span style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>1,400 XP · 5 monsters</span>
            </div>
          </SX.Field>
          <div><SX.Button variant="primary" icon="check">Build encounter</SX.Button></div>
        </SX.Card>
      )}
    </div>
  );
}

/* ---------------- Knowledge ---------------- */
function NoteRow({ note, selected, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: 'var(--space-3)', border: 'none', borderLeft: `3px solid ${selected ? 'var(--color-accent)' : 'transparent'}`, borderRadius: 'var(--radius-sm)', background: selected ? 'var(--color-accent-subtle)' : 'transparent', cursor: 'pointer', transition: 'background var(--duration-fast) var(--easing-standard)' }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--color-interactive-hover)'; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
        <span style={{ flex: 1, font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</span>
        <SX.VisibilityChip level={note.vis} compact />
      </div>
      <div style={{ font: 'var(--text-xs)/1.4 var(--font-sans)', color: 'var(--color-text-tertiary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{note.snippet}</div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 6, font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
        <span style={{ color: 'var(--color-accent)' }}>{note.src}</span>·<span>{note.updated}</span>
      </div>
    </button>
  );
}

function Knowledge() {
  const d = window.DNDData;
  const [sel, setSel] = React.useState('n1');
  const note = d.notes.find((n) => n.id === sel);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 'var(--space-4)', height: '100%', maxWidth: 1180, margin: '0 auto' }}>
      <SX.Card elevation="flat" padding="sm" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-1)' }}>
          <SX.Input icon="search" placeholder="Search notes…" style={{ flex: 1 }} />
          <SX.Button variant="primary" icon="add" onClick={() => window.DNDNavigate && window.DNDNavigate('note')}>New</SX.Button>
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {d.notes.map((n) => <NoteRow key={n.id} note={n} selected={n.id === sel} onSelect={() => setSel(n.id)} />)}
        </div>
      </SX.Card>

      <SX.Card elevation="flat" padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1, font: '700 var(--text-2xl) var(--font-display)', color: 'var(--color-text-primary)' }}>{note.title}</div>
          <SX.Badge status="success" icon="check">Saved</SX.Badge>
          <SX.VisibilityChip level={note.vis} />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
          <SX.Icon name="campaign-scroll" size="sm" />Source: {note.src} · Updated {note.updated}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', font: 'var(--text-md)/1.7 var(--font-sans)', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
          {renderMarkdownish(d.noteBody)}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
          <SX.Button variant="secondary" icon="send">Push to players</SX.Button>
          <SX.Button variant="ghost" icon="link">Backlinks · 3</SX.Button>
        </div>
      </SX.Card>
    </div>
  );
}

function renderMarkdownish(src) {
  return src.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <div key={i} style={{ font: '700 var(--text-xl) var(--font-display)', color: 'var(--color-text-primary)', margin: '4px 0' }}>{line.slice(3)}</div>;
    if (line.startsWith('### ')) return <div key={i} style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-accent)', margin: '10px 0 2px' }}>{line.slice(4)}</div>;
    if (line.startsWith('> ')) return <div key={i} style={{ borderLeft: '3px solid var(--color-accent-border)', paddingLeft: 'var(--space-3)', color: 'var(--color-text-secondary)', fontStyle: 'italic', margin: '6px 0' }}>{line.slice(2)}</div>;
    if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 'var(--space-4)' }}>• {boldify(line.slice(2))}</div>;
    if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
    return <div key={i}>{boldify(line)}</div>;
  });
}
function boldify(t) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') ? <strong key={i} style={{ color: 'var(--color-text-primary)' }}>{p.slice(2, -2)}</strong> : p);
}

/* ---------------- Atlas ---------------- */
function Atlas() {
  const d = window.DNDData;
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <SX.Input icon="search" placeholder="Search maps…" style={{ maxWidth: 320 }} />
        <SX.Button variant="primary" icon="add" style={{ marginLeft: 'auto' }} onClick={() => window.DNDNavigate && window.DNDNavigate('map')}>New map</SX.Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        {d.maps.map((m, i) => (
          <SX.Card key={m.id} elevation="flat" interactive padding="none" style={{ overflow: 'hidden' }} onClick={() => window.DNDNavigate && window.DNDNavigate('map')}>
            <div style={{ position: 'relative', height: 150, background: `linear-gradient(${135 + i * 40}deg, #2a2117, #14100b)` }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(224,176,111,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(224,176,111,.07) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
              {m.projecting && <div style={{ position: 'absolute', top: 10, right: 10 }}><SX.Badge status="success" icon="visibility-players">Projecting</SX.Badge></div>}
            </div>
            <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
              <div style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{m.name}</div>
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{m.region} · {m.layers} layers</div>
            </div>
          </SX.Card>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SessionCombat, Knowledge, Atlas });
