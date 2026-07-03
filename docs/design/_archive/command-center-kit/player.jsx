// Player Character Suite (Initiative 10) — the SECOND persona. Everything here is the player's own
// surface, not the DM's read-only view. A persistent vitals bar sits over five views:
//   • Sheet      — the complete 5e sheet: abilities, saves, skills, features, equipment, currency.   (E10.1)
//   • Resources  — spell-slot grid, class resources, concentration, death saves, rest workflow.       (E10.2)
//   • Party      — the live party coordination panel + spellcaster summary + marching order + stash.  (E10.4)
//   • Level up   — the guided 5→6 advancement wizard.                                                  (E10.3)
//   • Journal    — DM-invisible private notes: bookmarks, NPC impressions, personal quests, highlights.(E10.5)
// Player-mode chrome is signalled throughout; HP/slots/conditions are session overlays, not vault state.
const PL = window.DNDToolsDesignSystem_8ae046;

function chip(tone, label, icon) { return <PL.Badge status={tone} icon={icon}>{label}</PL.Badge>; }
function sgn(n) { return n >= 0 ? `+${n}` : `${n}`; }

/* ════ persistent vitals bar ════ */
function Vitals({ c, hp, setHp }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap', padding: 'var(--space-4) var(--space-5)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-accent-border)', boxShadow: 'var(--shadow-md)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', font: '700 var(--text-lg) var(--font-display)', flex: '0 0 auto' }}>{c.name[0]}</span>
      <div style={{ minWidth: 150 }}>
        <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>{c.name}</div>
        <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{c.race} {c.cls} {c.level} · {c.subclass}</div>
      </div>
      {/* HP stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 240 }}>
        <PL.IconButton icon="chevron-down" label="Damage" variant="ghost" size="sm" onClick={() => setHp((v) => Math.max(0, v - 1))} />
        <div style={{ flex: 1 }}><PL.HPBar current={hp} max={c.hp.max} label="HP" /></div>
        <PL.IconButton icon="chevron-up" label="Heal" variant="ghost" size="sm" onClick={() => setHp((v) => Math.min(c.hp.max, v + 1))} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <PL.StatPill label="AC" value={c.ac} />
        <PL.StatPill label="Speed" value={`${c.speed}`} />
        <PL.StatPill label="Init" value={sgn(c.init)} />
        <PL.StatPill label="Prof" value={sgn(c.profBonus)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
        {c.conditions.map((k) => <PL.ConditionBadge key={k} condition={k} compact />)}
        {c.inspiration && chip('warning', 'Inspiration', 'sparkle')}
      </div>
    </div>
  );
}

/* ════ 1 · SHEET ════ */
function Sheet({ c }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(0,1fr) 330px', gap: 'var(--space-4)', alignItems: 'start' }}>
      {/* abilities + saves + senses */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel title="Abilities" pad="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {c.abilities.map((a) => <PL.AbilityScore key={a.key} label={a.key} score={a.score} modifier={a.mod} tone={a.save ? 'accent' : 'default'} />)}
          </div>
        </window.Panel>
        <window.Panel title="Saving throws" pad="md">
          {c.abilities.map((a) => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '3px 0' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', flex: '0 0 auto', border: `2px solid ${a.save ? 'var(--color-accent)' : 'var(--color-border-strong)'}`, background: a.save ? 'var(--color-accent)' : 'transparent' }} />
              <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{a.key}</span>
              <span style={{ font: 'var(--text-sm) var(--font-mono)', color: a.save ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>{sgn(a.save ? a.mod + c.profBonus : a.mod)}</span>
            </div>
          ))}
        </window.Panel>
        <window.Panel title="Senses" pad="md">
          {Object.entries(c.passives).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>Passive {k}</span>
              <span style={{ font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-primary)' }}>{v}</span>
            </div>
          ))}
        </window.Panel>
      </div>

      {/* skills */}
      <window.Panel title="Skills" action={<span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>● proficient</span>} pad="md">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px var(--space-4)' }}>
          {c.skills.map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 6px', borderRadius: 'var(--radius-sm)', background: s.prof ? 'var(--color-surface-alt)' : 'transparent' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', flex: '0 0 auto', background: s.prof ? 'var(--color-accent)' : 'transparent', border: `1.5px solid ${s.prof ? 'var(--color-accent)' : 'var(--color-border-strong)'}` }} />
              <span style={{ flex: 1, font: `${s.prof ? 600 : 400} var(--text-sm) var(--font-sans)`, color: s.prof ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{s.name}</span>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{s.abil}</span>
              <span style={{ width: 26, textAlign: 'right', font: 'var(--text-sm) var(--font-mono)', color: s.prof ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>{sgn(s.mod)}</span>
            </div>
          ))}
        </div>
      </window.Panel>

      {/* features + equipment + money */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel title="Features & traits" pad="md">
          {c.features.map((f) => (
            <div key={f.name} style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{f.name}</span>
                <span style={{ marginLeft: 'auto', font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{f.src} · L{f.lvl}</span>
              </div>
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{f.note}</div>
            </div>
          ))}
        </window.Panel>
        <window.Panel title="Equipment" action={<span style={{ font: 'var(--text-2xs) var(--font-mono)', color: c.carried > c.carryMax ? 'var(--color-status-error-text)' : 'var(--color-text-tertiary)' }}>{c.carried}/{c.carryMax} lb</span>} pad="md">
          {c.equipment.map((e) => (
            <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '3px 0' }}>
              {e.equipped ? <PL.Icon name="check" size={13} color="var(--color-status-success-text)" /> : <span style={{ width: 13 }} />}
              <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{e.name}{e.qty > 1 ? ` ×${e.qty}` : ''}</span>
              {e.linked && <PL.Icon name="link" size={12} color="var(--color-text-tertiary)" />}
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', width: 34, textAlign: 'right' }}>{e.wt} lb</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
            {Object.entries(c.currency).map(([k, v]) => (
              <div key={k} style={{ flex: 1, textAlign: 'center', padding: '4px 0', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)' }}>
                <div style={{ font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-primary)' }}>{v}</div>
                <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>{k}</div>
              </div>
            ))}
          </div>
        </window.Panel>
      </div>
    </div>
  );
}

/* ════ 2 · RESOURCES ════ */
function Pips({ max, used }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: max }).map((_, i) => {
        const spent = i < used;
        return <PL.Icon key={i} name="spell-slot" size={18} color={spent ? 'var(--color-border-strong)' : 'var(--color-accent)'} style={{ fill: spent ? 'transparent' : 'var(--color-accent-subtle)' }} />;
      })}
    </div>
  );
}
function Resources({ d }) {
  const ds = d.deathSaves;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0,1fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* concentration banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-status-warning-subtle)', border: '1px solid var(--color-status-warning)' }}>
          <PL.Icon name="cond-concentration" size="md" color="var(--color-status-warning-text)" />
          <div style={{ flex: 1 }}>
            <div style={{ font: '700 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Concentrating · {d.concentration.spell}</div>
            <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{d.concentration.note} · since {d.concentration.since}</div>
          </div>
          <PL.IconButton icon="close" label="Drop concentration" variant="ghost" size="sm" />
        </div>
        <window.Panel title="Spell slots" pad="md">
          {d.spellSlots.map((s) => (
            <div key={s.lvl} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '4px 0' }}>
              <span style={{ width: 58, font: '600 var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--color-text-tertiary)' }}>Level {s.lvl}</span>
              <Pips max={s.max} used={s.used} />
              <span style={{ marginLeft: 'auto', font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}>{s.max - s.used}/{s.max}</span>
            </div>
          ))}
        </window.Panel>
        <window.Panel title="Class resources" pad="md">
          {d.classResources.map((r) => (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
              <PL.Icon name={r.icon} size="sm" color="var(--color-accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{r.name}</div>
                <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Recovers on {r.recover}</div>
              </div>
              <span style={{ font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-primary)' }}>{r.cur}/{r.max}</span>
              <PL.IconButton icon="add" label={`Spend ${r.name}`} variant="ghost" size="sm" />
            </div>
          ))}
        </window.Panel>
        {/* death saves + rest */}
        <window.Panel title="Death saves" pad="md">
          {[['Successes', ds.successes, 'var(--color-status-success)'], ['Failures', ds.failures, 'var(--color-status-error)']].map(([lbl, n, col]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{lbl}</span>
              {[0, 1, 2].map((i) => <span key={i} style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${col}`, background: i < n ? col : 'transparent' }} />)}
            </div>
          ))}
          <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Stable. Broadcasts to the DM’s party overview.</div>
        </window.Panel>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <PL.Button variant="secondary" size="sm" icon="hourglass" style={{ flex: 1 }}>Short rest</PL.Button>
          <PL.Button variant="primary" size="sm" icon="cond-unconscious" style={{ flex: 1 }}>Long rest</PL.Button>
        </div>
      </div>

      {/* prepared spells */}
      <window.Panel title="Prepared spells" action={<window.Seg value="lvl" onChange={() => {}} size="sm" options={[{ value: 'lvl', label: 'Level' }, { value: 'school', label: 'School' }, { value: 'az', label: 'A–Z' }]} />} pad="md">
        {d.spells.map((sp) => (
          <div key={sp.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: sp.active ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', border: `1px solid ${sp.active ? 'var(--color-accent-border)' : 'var(--color-border)'}` }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)', font: '700 var(--text-sm) var(--font-mono)', color: 'var(--color-accent)', flex: '0 0 auto' }}>{sp.lvl}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{sp.name}</span>
                {sp.conc && <PL.Icon name="cond-concentration" size={12} color="var(--color-status-warning-text)" />}
                {sp.active && chip('warning', 'active', 'cond-concentration')}
              </div>
              <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{sp.school} · {sp.time} · {sp.range} · {sp.dur}</div>
            </div>
            <PL.Button variant="ghost" size="sm">Cast</PL.Button>
          </div>
        ))}
      </window.Panel>
    </div>
  );
}

/* ════ 3 · PARTY ════ */
function Party({ d }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'var(--space-4)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel title="The Lantern Company" action={chip('success', 'live · synced', 'success')} pad="md">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {d.party.map((m) => {
              const down = m.cur === 0;
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: m.self ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', border: `1px solid ${down ? 'var(--color-status-error)' : m.self ? 'var(--color-accent-border)' : 'var(--color-border)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)', color: 'var(--color-accent)', font: '700 var(--text-sm) var(--font-display)', flex: '0 0 auto' }}>{m.name[0]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{m.name}{m.self ? ' (you)' : ''}</div>
                      <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{m.cls}</div>
                    </div>
                  </div>
                  <PL.HPBar current={m.cur} max={m.max} size="sm" />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 20 }}>
                    {m.conds.length ? m.conds.map((k) => <PL.ConditionBadge key={k} condition={k} compact />) : <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>No conditions</span>}
                  </div>
                  <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}>{m.res}</div>
                </div>
              );
            })}
          </div>
        </window.Panel>
        <window.Panel title="Party stash" sub pad="md">
          <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: -4 }}>Shared loot — any player can claim into their pack.</div>
          {d.partyStash.map((it) => (
            <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
              <PL.Icon name="tag" size={13} color="var(--color-text-tertiary)" />
              <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{it.name}{it.qty ? ` ×${it.qty}` : ''}</span>
              <PL.Chip tone={it.tag === 'quest' ? 'info' : it.tag === 'magic' ? 'warning' : 'neutral'}>{it.tag}</PL.Chip>
              <PL.Button variant="ghost" size="sm" icon="enter">Claim</PL.Button>
            </div>
          ))}
        </window.Panel>
      </div>

      {/* marching order */}
      <window.Panel title="Marching order" sub pad="md" style={{ position: 'sticky', top: 'var(--space-5)' }}>
        <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: -4 }}>Drag to reorder. Broadcast to the table.</div>
        {d.marchingOrder.map((row) => (
          <div key={row.row} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)' }}>
            <span style={{ font: '600 var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--color-text-tertiary)' }}>{row.row}</span>
            {row.members.map((nm) => (
              <div key={nm} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                <PL.Icon name="drag-handle" size={14} color="var(--color-text-tertiary)" />
                <span style={{ font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{nm}</span>
              </div>
            ))}
          </div>
        ))}
      </window.Panel>
    </div>
  );
}

/* ════ 4 · LEVEL UP ════ */
function LevelUp({ d }) {
  const kindIcon = { roll: 'dice', auto: 'check', feature: 'sparkle', choice: 'flag' };
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <window.Panel pad="md" style={{ borderColor: 'var(--color-accent-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', font: '700 var(--text-xl) var(--font-mono)', flex: '0 0 auto' }}>{d.to}</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: 'var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--color-text-tertiary)' }}>Level up · {d.mode}</div>
            <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>Cleric {d.from} → {d.to}</div>
          </div>
          {chip('warning', `${d.steps.filter((s) => !s.done).length} choices left`, 'warning')}
        </div>
      </window.Panel>
      {d.steps.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: s.done ? 'var(--color-surface-alt)' : 'var(--color-surface-raised)', border: `1px solid ${s.done ? 'var(--color-border)' : 'var(--color-accent-border)'}`, opacity: s.done ? 0.85 : 1 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', flex: '0 0 auto', background: s.done ? 'var(--color-status-success-subtle)' : 'var(--color-accent-subtle)', color: s.done ? 'var(--color-status-success-text)' : 'var(--color-accent)' }}>
            <PL.Icon name={s.done ? 'check' : kindIcon[s.kind]} size="sm" />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ font: '600 var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--color-text-tertiary)' }}>Step {i + 1}</span>
              <span style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{s.label}</span>
            </div>
            <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', marginTop: 4 }}>{s.choice}</div>
            <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{s.detail}</div>
          </div>
          {s.done ? <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-status-success-text)', alignSelf: 'center' }}>Chosen</span>
            : <PL.Button variant="primary" size="sm" style={{ alignSelf: 'center' }}>{s.kind === 'roll' ? 'Roll' : 'Choose'}</PL.Button>}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
        <PL.Button variant="ghost" size="sm">Save & resume later</PL.Button>
        <PL.Button variant="primary" size="sm" icon="check">Apply level 6</PL.Button>
      </div>
    </div>
  );
}

/* ════ 5 · JOURNAL ════ */
function Journal({ d }) {
  const [shared, setShared] = React.useState(Object.fromEntries(d.impressions.map((x, i) => [i, x.shared])));
  const qStatus = { active: 'info', completed: 'success', failed: 'error', abandoned: 'neutral' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-dm-only-subtle)', border: '1px solid var(--color-dm-only-badge)' }}>
        <PL.Icon name="hidden" size="md" color="var(--color-dm-only-badge)" />
        <span style={{ flex: 1, font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Private space — stored locally, never synced to the DM or visible via MCP.</span>
        <PL.Button variant="ghost" size="sm" icon="send">Export journal</PL.Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <window.Panel title="NPC impressions" action={<PL.IconButton icon="add" label="New impression" variant="ghost" size="sm" />} pad="md">
            {d.impressions.map((im, i) => (
              <div key={im.npc} style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PL.Icon name="characters-person" size={14} color="var(--color-accent)" />
                  <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{im.npc}</span>
                  <PL.Chip tone="neutral">{im.mood}</PL.Chip>
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: shared[i] ? 'var(--color-status-info-text)' : 'var(--color-text-tertiary)' }}>{shared[i] ? 'Shared w/ DM' : 'Private'}</span>
                    <PL.Switch checked={shared[i]} onChange={() => setShared((s) => ({ ...s, [i]: !s[i] }))} label={`Share ${im.npc} with DM`} />
                  </span>
                </div>
                <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{im.note}</div>
              </div>
            ))}
          </window.Panel>
          <window.Panel title="Session highlights" pad="md">
            {d.highlights.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', padding: '4px 0' }}>
                <PL.Icon name="sparkle" size={14} color="var(--color-accent)" style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{h.text}</div>
                  <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{h.kind} · {h.when}</div>
                </div>
              </div>
            ))}
          </window.Panel>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <window.Panel title="Personal quests" action={<PL.IconButton icon="add" label="New goal" variant="ghost" size="sm" />} pad="md">
            {d.quests.map((q, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
                <PL.Icon name={q.status === 'completed' ? 'success' : 'flag'} size={14} color={`var(--color-status-${qStatus[q.status]}-text)`} style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ font: `${q.status === 'completed' ? 400 : 600} var(--text-sm) var(--font-sans)`, color: 'var(--color-text-primary)', textDecoration: q.status === 'completed' ? 'line-through' : 'none' }}>{q.goal}</div>
                  {q.note && <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>{q.note}</div>}
                </div>
                <PL.Badge status={qStatus[q.status]}>{q.status}</PL.Badge>
              </div>
            ))}
          </window.Panel>
          <window.Panel title="Bookmarks" sub pad="md">
            <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: -4 }}>Revealed notes you flagged, with your own annotation.</div>
            {d.bookmarks.map((b) => (
              <div key={b.title} style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PL.Icon name="pin" size={13} color="var(--color-accent)" />
                  <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{b.title}</span>
                  <span style={{ marginLeft: 'auto', font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{b.when}</span>
                </div>
                <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{b.note}</div>
              </div>
            ))}
          </window.Panel>
        </div>
      </div>
    </div>
  );
}

/* ════ SHELL ════ */
function PlayerSuite() {
  const d = window.DNDPlayer;
  const c = d.character;
  const [view, setView] = React.useState('sheet');
  const [hp, setHp] = React.useState(c.hp.cur);
  return (
    <window.PageShell icon="characters-person" eyebrow="Player mode" title={c.name}
      actions={<window.Seg value={view} onChange={setView} options={[
        { value: 'sheet', label: 'Sheet' },
        { value: 'resources', label: 'Resources' },
        { value: 'party', label: 'Party' },
        { value: 'levelup', label: 'Level up' },
        { value: 'journal', label: 'Journal' },
      ]} />}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Vitals c={{ ...c, conditions: c.conditions }} hp={hp} setHp={setHp} />
        {view === 'sheet' && <Sheet c={c} />}
        {view === 'resources' && <Resources d={d} />}
        {view === 'party' && <Party d={d} />}
        {view === 'levelup' && <LevelUp d={d.levelUp} />}
        {view === 'journal' && <Journal d={d.journal} />}
      </div>
    </window.PageShell>
  );
}

Object.assign(window, { PlayerSuite });
