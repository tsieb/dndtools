// CharacterSheet — the /characters/:id live-play detail view. A persistent vitals bar (HP stepper,
// AC, conditions, death saves) over tabbed sections (Combat default). Reuses HPBar / StatPill and
// the inspector vocabulary. Exports CharacterSheet to window.
const CS = window.DNDToolsDesignSystem_8ae046;

function Pip({ on, color }) {
  return <span style={{ width: 13, height: 13, borderRadius: 'var(--radius-full)', border: `1.5px solid ${color}`, background: on ? color : 'transparent', display: 'inline-block' }} />;
}
function DeathSaves({ success, fail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Death saves</span>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <CS.Icon name="success" size="micro" color="var(--color-status-success)" />
          {[0, 1, 2].map((i) => <Pip key={i} on={i < success} color="var(--color-status-success)" />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <CS.Icon name="error" size="micro" color="var(--color-status-error)" />
          {[0, 1, 2].map((i) => <Pip key={i} on={i < fail} color="var(--color-status-error)" />)}
        </div>
      </div>
    </div>
  );
}

function VitalStat({ label, value, icon, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 56 }}>
      <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: `700 var(--text-xl) var(--font-mono)`, color: accent ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>
        {icon && <CS.Icon name={icon} size="sm" color="var(--color-text-tertiary)" />}{value}
      </span>
    </div>
  );
}

/* The persistent vitals bar — the single accent/primary region of the sheet. */
function VitalsBar({ s, hp, setHp }) {
  return (
    <CS.Card accent elevation="raised" padding="md" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <CS.Avatar name={s.name} size="lg" ring="turn" />
        <div style={{ minWidth: 160 }}>
          <div style={{ font: '700 var(--text-2xl) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.05 }}>{s.name}</div>
          <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{s.race} · {s.cls} {s.level} · {s.subclass}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <CS.VisibilityChip level={s.vis} />
          <CS.Button variant="secondary" icon="send">Push to players</CS.Button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', flexWrap: 'wrap', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-accent-border)' }}>
        {/* HP stepper */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 280px', minWidth: 240 }}>
          <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Hit points{s.temp ? ` · +${s.temp} temp` : ''}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <CS.IconButton icon="Minus" label="Damage" variant="outline" onClick={() => setHp(Math.max(0, hp - 1))} />
            <div style={{ flex: 1 }}><CS.HPBar current={hp} max={s.max} size="lg" /></div>
            <CS.IconButton icon="add" label="Heal" variant="outline" onClick={() => setHp(Math.min(s.max, hp + 1))} />
          </div>
        </div>
        <VitalStat label="AC" value={s.ac} icon="shield" />
        <VitalStat label="Speed" value={s.speed} />
        <VitalStat label="Init" value={s.init} />
        <VitalStat label="Hit dice" value={s.hitDice} />
        <DeathSaves success={s.deathSaves.success} fail={s.deathSaves.fail} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ font: 'var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginRight: 2 }}>Conditions</span>
        {s.conditions.length ? s.conditions.map((c) => <CS.Chip key={c} tone="info" onRemove={() => {}}>{c}</CS.Chip>) : <span style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>None</span>}
        <CS.Button variant="ghost" size="sm" icon="add">Add</CS.Button>
        {s.inspiration && <span style={{ marginLeft: 'auto' }}><CS.Badge status="accent" icon="Sparkles">Inspiration</CS.Badge></span>}
      </div>
    </CS.Card>
  );
}

function Panel({ title, children, action, span }) {
  return (
    <section style={{ gridColumn: span ? `span ${span}` : 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

function AttacksTable({ attacks }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) 1fr 70px 1fr', gap: 'var(--space-2)', padding: '0 var(--space-2) var(--space-2)', font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
        <span>Attack</span><span>Type</span><span>Hit / DC</span><span>Damage</span>
      </div>
      {attacks.map((a) => (
        <div key={a.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) 1fr 70px 1fr', gap: 'var(--space-2)', alignItems: 'center', padding: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{a.name}</span>
          <span style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{a.kind}</span>
          <span style={{ font: '600 var(--text-sm) var(--font-mono)', color: 'var(--color-accent)' }}>{a.hit}</span>
          <span style={{ font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-secondary)' }}>{a.dmg} <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-2xs)' }}>{a.type}</span></span>
        </div>
      ))}
    </div>
  );
}

function AbilityBlock({ a }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 'var(--space-3) var(--space-2)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
      <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{a.key}</span>
      <span style={{ font: '700 var(--text-2xl) var(--font-mono)', color: 'var(--color-text-primary)', lineHeight: 1 }}>{a.mod}</span>
      <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}>{a.val}</span>
      <span style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, font: 'var(--text-2xs) var(--font-mono)', color: a.prof ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
        {a.prof && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />}save {a.save}
      </span>
    </div>
  );
}

function SkillRow({ sk }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1-5) 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: sk.prof ? 'var(--color-accent)' : 'transparent', border: sk.prof ? 'none' : '1.5px solid var(--color-border-strong)', flex: '0 0 auto' }} />
      <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: sk.prof ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{sk.name}</span>
      <span style={{ font: '600 var(--text-sm) var(--font-mono)', color: 'var(--color-text-secondary)' }}>{sk.mod}</span>
    </div>
  );
}

function SlotPips({ slot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span style={{ font: '600 var(--text-sm) var(--font-mono)', color: 'var(--color-text-secondary)', width: 78 }}>Level {slot.lvl}</span>
      <div style={{ display: 'flex', gap: 5 }}>
        {Array.from({ length: slot.total }).map((_, i) => <Pip key={i} on={i >= slot.used} color="var(--color-accent)" />)}
      </div>
      <span style={{ marginLeft: 'auto', font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{slot.total - slot.used}/{slot.total} left</span>
    </div>
  );
}

function CombatTab({ s }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
      <Panel title="Attacks & spellcasting" action={<CS.Button variant="ghost" size="sm" icon="add">Add</CS.Button>}>
        <AttacksTable attacks={s.attacks} />
      </Panel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Panel title="Spell slots">
          <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 4 }}>
            <CS.StatPill label="Spell DC" value={s.spells.dc} tone="accent" />
            <CS.StatPill label="Spell atk" value={s.spells.atk} />
          </div>
          {s.spells.slots.map((sl) => <SlotPips key={sl.lvl} slot={sl} />)}
        </Panel>
        <Panel title="Resistances & senses">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <CS.Chip icon="Eye">Passive perception {s.passivePerc}</CS.Chip>
            <CS.Chip>Proficiency {s.prof}</CS.Chip>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StatsTab({ s }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
      <Panel title="Ability scores">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
          {s.abilities.map((a) => <AbilityBlock key={a.key} a={a} />)}
        </div>
      </Panel>
      <Panel title="Skills">
        <div>{s.skills.map((sk) => <SkillRow key={sk.name} sk={sk} />)}</div>
      </Panel>
    </div>
  );
}

function SpellsTab({ s }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
      <Panel title="Spell slots">
        <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 4 }}>
          <CS.StatPill label="Spell DC" value={s.spells.dc} tone="accent" />
          <CS.StatPill label="Spell atk" value={s.spells.atk} />
        </div>
        {s.spells.slots.map((sl) => <SlotPips key={sl.lvl} slot={sl} />)}
      </Panel>
      <Panel title="Prepared spells" action={<span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{s.prepared.length} prepared</span>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {s.prepared.map((p) => <CS.Chip key={p} icon="sparkle">{p}</CS.Chip>)}
        </div>
      </Panel>
    </div>
  );
}

function InventoryTab({ s }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
      <Panel title="Inventory" action={<CS.Button variant="ghost" size="sm" icon="add">Add item</CS.Button>}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {s.inventory.map((it) => (
            <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderTop: '1px solid var(--color-border)' }}>
              <CS.Icon name="Backpack" size="sm" color="var(--color-text-tertiary)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{it.name}</div>
                <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{it.meta}</div>
              </div>
              <span style={{ font: '600 var(--text-sm) var(--font-mono)', color: 'var(--color-text-secondary)' }}>×{it.qty}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Coin purse">
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <CS.StatPill label="GP" value={s.coin.gp} tone="accent" />
          <CS.StatPill label="SP" value={s.coin.sp} />
          <CS.StatPill label="CP" value={s.coin.cp} />
        </div>
        <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <CS.Chip icon="Coins">Carrying capacity 195 lb</CS.Chip>
        </div>
      </Panel>
    </div>
  );
}

function BioTab({ s }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
      <Panel title="Background & bio">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
          <CS.Chip>{s.background}</CS.Chip><CS.Chip>{s.align}</CS.Chip><CS.Chip icon="characters-person">Player: {s.owner}</CS.Chip>
        </div>
        <p style={{ margin: 0, font: 'var(--text-sm)/1.7 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{s.bio}</p>
      </Panel>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', background: 'var(--color-dm-only-subtle)', border: '1px solid var(--color-dm-only-badge)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CS.Icon name="dm-only" size="sm" color="var(--color-dm-only-badge)" />
          <span style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>DM notes</span>
          <span style={{ marginLeft: 'auto' }}><CS.VisibilityChip level="dm-only" compact /></span>
        </div>
        <p style={{ margin: 0, font: 'var(--text-sm)/1.7 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{s.dmNotes}</p>
      </section>
    </div>
  );
}

function CharacterSheet() {
  const s = window.DNDGaps.sheet;
  const [tab, setTab] = React.useState('combat');
  const [hp, setHp] = React.useState(s.hp);
  const tabs = [
    { id: 'combat', label: 'Combat', icon: 'session-bolt' },
    { id: 'stats', label: 'Stats & skills', icon: 'Dices' },
    { id: 'spells', label: 'Spells', icon: 'sparkle' },
    { id: 'inventory', label: 'Inventory', icon: 'Backpack' },
    { id: 'bio', label: 'Bio & notes', icon: 'note-edit' },
  ];
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <CS.Breadcrumb items={[{ label: 'Command Center' }, { label: 'Characters' }, { label: s.name }]} />
      <VitalsBar s={{ ...s, hp }} hp={hp} setHp={setHp} />
      <CS.Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'combat' && <CombatTab s={s} />}
      {tab === 'stats' && <StatsTab s={s} />}
      {tab === 'spells' && <SpellsTab s={s} />}
      {tab === 'inventory' && <InventoryTab s={s} />}
      {tab === 'bio' && <BioTab s={s} />}
    </div>
  );
}

Object.assign(window, { CharacterSheet });
