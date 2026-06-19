// CharacterSheetMobile — the /characters/:id view at the mobile/tablet density lock. Combat tab
// defaults first; the vitals bar compresses to a sticky header; sections become a bottom tab bar.
// Rendered inside a phone frame on the page. Exports to window.
const CM = window.DNDToolsDesignSystem_8ae046;

function MPip({ on, color }) {
  return <span style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${color}`, background: on ? color : 'transparent', display: 'inline-block' }} />;
}

function MStat({ label, value, icon }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 4px', background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-md)' }}>
      <span style={{ font: '600 10px var(--font-sans)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '700 18px var(--font-mono)', color: 'var(--color-text-primary)' }}>{icon && <CM.Icon name={icon} size="micro" color="var(--color-text-tertiary)" />}{value}</span>
    </div>
  );
}

function MTab({ icon, label, on, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 0', minHeight: 48, border: 'none', background: 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer' }}>
      <CM.Icon name={icon} size="sm" />
      <span style={{ font: `${on ? 600 : 500} 10px var(--font-sans)` }}>{label}</span>
    </button>
  );
}

function MobileScreen() {
  const s = window.DNDGaps.sheet;
  const [tab, setTab] = React.useState('combat');
  const [hp, setHp] = React.useState(s.hp);
  const tabs = [
    { id: 'combat', icon: 'session-bolt', label: 'Combat' },
    { id: 'stats', icon: 'Dices', label: 'Stats' },
    { id: 'spells', icon: 'sparkle', label: 'Spells' },
    { id: 'items', icon: 'Backpack', label: 'Items' },
    { id: 'bio', icon: 'note-edit', label: 'Bio' },
  ];
  return (
    <div data-theme="tavern" data-density="comfortable" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', backgroundImage: 'radial-gradient(520px 280px at 50% -120px, var(--color-accent-subtle), transparent 70%)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
      {/* status bar */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px 2px', font: '600 13px var(--font-mono)', color: 'var(--color-text-secondary)' }}>
        <span>9:41</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><CM.Icon name="Signal" size="micro" /><CM.Icon name="Wifi" size="micro" /><CM.Icon name="BatteryFull" size="sm" /></span>
      </div>
      {/* app bar */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--color-border)' }}>
        <CM.IconButton icon="ChevronLeft" label="Back" variant="ghost" onClick={() => window.DNDNavigate && window.DNDNavigate('characters')} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 17px var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>{s.name}</div>
          <div style={{ font: '11px var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{s.cls} {s.level} · {s.subclass}</div>
        </div>
        <CM.VisibilityChip level={s.vis} compact />
        <CM.IconButton icon="more" label="More" variant="ghost" />
      </div>

      {/* scroll body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* vitals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: 'var(--color-surface-raised)', border: '1px solid var(--color-accent-border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ font: '600 10px var(--font-sans)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Hit points</span>
            {s.inspiration && <span style={{ marginLeft: 'auto' }}><CM.Badge status="accent" icon="Sparkles">Inspiration</CM.Badge></span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CM.IconButton icon="Minus" label="Damage" variant="outline" onClick={() => setHp(Math.max(0, hp - 1))} />
            <div style={{ flex: 1 }}><CM.HPBar current={hp} max={s.max} size="lg" /></div>
            <CM.IconButton icon="add" label="Heal" variant="outline" onClick={() => setHp(Math.min(s.max, hp + 1))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <MStat label="AC" value={s.ac} icon="shield" /><MStat label="Speed" value={s.speed} /><MStat label="Init" value={s.init} /><MStat label="DC" value={s.spells.dc} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ font: '600 10px var(--font-sans)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Death</span>
            <div style={{ display: 'flex', gap: 4 }}>{[0, 1, 2].map((i) => <MPip key={i} on={i < s.deathSaves.success} color="var(--color-status-success)" />)}</div>
            <div style={{ display: 'flex', gap: 4 }}>{[0, 1, 2].map((i) => <MPip key={i} on={i < s.deathSaves.fail} color="var(--color-status-error)" />)}</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>{s.conditions.map((c) => <CM.Chip key={c} tone="info">{c}</CM.Chip>)}</div>
          </div>
        </div>

        {tab === 'combat' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ font: '700 14px var(--font-display)', color: 'var(--color-text-primary)' }}>Attacks</span>
            {s.attacks.map((a) => (
              <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 14px var(--font-sans)', color: 'var(--color-text-primary)' }}>{a.name}</div>
                  <div style={{ font: '11px var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{a.kind} · {a.type}</div>
                </div>
                <span style={{ font: '700 15px var(--font-mono)', color: 'var(--color-accent)' }}>{a.hit}</span>
                <span style={{ font: '14px var(--font-mono)', color: 'var(--color-text-secondary)' }}>{a.dmg}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'stats' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {s.abilities.map((a) => (
              <div key={a.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '10px 4px', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ font: '600 10px var(--font-sans)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{a.key}</span>
                <span style={{ font: '700 22px var(--font-mono)', color: 'var(--color-text-primary)', lineHeight: 1 }}>{a.mod}</span>
                <span style={{ font: '11px var(--font-mono)', color: 'var(--color-text-secondary)' }}>{a.val}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'spells' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {s.prepared.map((p) => <CM.Chip key={p} icon="sparkle">{p}</CM.Chip>)}
          </div>
        )}
        {tab === 'items' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.inventory.map((it) => (
              <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <CM.Icon name="Backpack" size="sm" color="var(--color-text-tertiary)" />
                <div style={{ flex: 1 }}><div style={{ font: '600 13px var(--font-sans)', color: 'var(--color-text-primary)' }}>{it.name}</div><div style={{ font: '10px var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{it.meta}</div></div>
                <span style={{ font: '600 13px var(--font-mono)', color: 'var(--color-text-secondary)' }}>×{it.qty}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'bio' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, font: '13px/1.7 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{s.bio}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: 'var(--color-dm-only-subtle)', border: '1px solid var(--color-dm-only-badge)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '700 13px var(--font-display)', color: 'var(--color-text-primary)' }}><CM.Icon name="dm-only" size="micro" color="var(--color-dm-only-badge)" />DM notes</span>
              <p style={{ margin: 0, font: '12px/1.6 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{s.dmNotes}</p>
            </div>
          </div>
        )}
      </div>

      {/* bottom tab bar — Combat first */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-raised)', paddingBottom: 6 }}>
        {tabs.map((t) => <MTab key={t.id} icon={t.icon} label={t.label} on={tab === t.id} onClick={() => setTab(t.id)} />)}
      </div>
      <div style={{ flex: '0 0 auto', height: 5, display: 'flex', justifyContent: 'center', paddingBottom: 8 }}>
        <span style={{ width: 130, height: 5, borderRadius: 3, background: 'var(--color-text-tertiary)', opacity: 0.5 }} />
      </div>
    </div>
  );
}

function CharacterSheetMobile() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 28, background: 'var(--color-bg)', backgroundImage: 'radial-gradient(1000px 520px at 50% -180px, var(--color-accent-subtle), transparent 70%)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ font: '700 var(--text-xl) var(--font-display)', color: 'var(--color-text-primary)' }}>Character sheet — mobile</div>
        <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', marginTop: 2 }}>Comfortable density · Combat tab first · 44px touch targets</div>
      </div>
      {/* phone frame */}
      <div style={{ position: 'relative', width: 372, height: 752, borderRadius: 46, padding: 11, background: '#0a0703', boxShadow: '0 30px 80px rgba(0,0,0,.6), 0 0 0 2px #2a2117, inset 0 0 0 1px #3a2e20' }}>
        <div style={{ position: 'absolute', inset: 11, borderRadius: 36, overflow: 'hidden', border: '1px solid #000' }}>
          <MobileScreen />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CharacterSheetMobile });
