// scene-widgets.jsx — the BODY of every widget type, drawn with DS primitives. The canvas Frame
// (scene-canvas.jsx) wraps this with selection / drag / resize chrome, so the body is identical
// in view and edit modes. Exposes window.SceneWidget({ w }).
const SW = window.DNDToolsDesignSystem_8ae046;
const VISMAP = { dm: 'dm-only', players: 'players', shared: 'players' };

function Head({ w }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flex: '0 0 auto' }}>
      <span style={{ flex: 1, minWidth: 0, font: '700 var(--text-sm) var(--font-display)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</span>
      <SW.VisibilityChip level={VISMAP[w.vis] || 'dm-only'} compact />
    </div>
  );
}

/* ───────────────── system (Command Center base) ───────────────── */
function ResumeBody() {
  const d = window.DNDData;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: '100%' }}>
      <SW.StatusDot status="live" pulse />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>{d.campaign} · live</div>
        <div style={{ font: '700 var(--text-xl) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>The Pier</div>
        <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>3 players connected</div>
      </div>
      <SW.Button variant="primary" size="sm" iconRight="enter">Enter</SW.Button>
    </div>
  );
}
function ScenesBody() {
  const scenes = window.SCN.scenes.filter((s) => !s.pinned).slice(0, 4);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', height: '100%', alignContent: 'start' }}>
      {scenes.map((s) => (
        <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
          <div style={{ height: 38, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg,#2a2117,#14100b)', backgroundImage: 'linear-gradient(rgba(224,176,111,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(224,176,111,.08) 1px,transparent 1px)', backgroundSize: '14px 14px' }} />
          <span style={{ font: '600 var(--text-xs) var(--font-sans)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
        </div>
      ))}
    </div>
  );
}
function CreateBody() {
  const items = [['New scene', 'scene'], ['New character', 'new-character'], ['New widget', 'widget'], ['New note', 'note-edit']];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      {items.map(([label, icon]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
          <SW.Icon name={icon} size="sm" color="var(--color-accent)" />
          <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
function QuicklinksBody() {
  const pins = window.DNDHub.pinned;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      {pins.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><SW.Icon name={p.icon} size="sm" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '600 var(--text-xs) var(--font-sans)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
            <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{p.sub}</div>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-tertiary)', font: 'var(--text-xs) var(--font-sans)', marginTop: 2 }}><SW.Icon name="add" size="sm" />Pin anything</div>
    </div>
  );
}

/* ───────────────── template (provided) ───────────────── */
function NoteBody({ w }) {
  const size = { sm: 'var(--text-xs)', md: 'var(--text-sm)', lg: 'var(--text-md)' }[w.props.size || 'md'];
  return <div style={{ font: `${size}/1.6 var(--font-sans)`, color: 'var(--color-text-secondary)', overflow: 'hidden' }}>{w.props.text}</div>;
}
function Pips({ filled, segments, accent }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {Array.from({ length: segments }).map((_, i) => (
        <span key={i} style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--color-border-strong)', background: i < filled ? 'var(--color-accent)' : 'transparent', boxShadow: i < filled ? '0 0 0 1px var(--color-accent-border)' : 'none' }} />
      ))}
    </div>
  );
}
function ClockBody({ w }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', height: '100%', justifyContent: 'center' }}>
      <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{w.props.label}</div>
      <div style={{ font: '700 28px var(--font-mono)', color: 'var(--color-text-primary)' }}>{w.props.filled}<span style={{ color: 'var(--color-text-tertiary)', fontSize: 20 }}> / {w.props.segments}</span></div>
      <Pips filled={w.props.filled} segments={w.props.segments} />
    </div>
  );
}
function bar(label, pct) {
  return (
    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}><span>{label}</span><span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{pct}%</span></div>
      <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-sunken)', overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', borderRadius: 'var(--radius-full)', background: 'var(--color-accent)' }} /></div>
    </div>
  );
}
function TrackerBody({ w }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>{(w.props.bars || []).map(([l, p]) => bar(l, p))}</div>;
}
function DiceBody({ w }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', height: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(w.props.presets || []).map((p) => <SW.Chip key={p} tone="accent">{p}</SW.Chip>)}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 'auto' }}>
        <span style={{ font: '700 26px var(--font-mono)', color: 'var(--color-text-primary)' }}>27</span>
        <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>1d20+7 · nat 20</span>
      </div>
      <SW.Button variant="secondary" size="sm" icon="dice" style={{ alignSelf: 'flex-start' }}>Roll</SW.Button>
    </div>
  );
}
function InitiativeBody() {
  const d = window.DNDData;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
      {d.combatants.slice(0, 4).map((c) => (
        <SW.InitiativeRow key={c.id} name={c.name} initiative={c.init} current={c.hp} max={c.max} active={c.active} dmOnly={c.dmOnly} />
      ))}
    </div>
  );
}

/* ───────────────── custom (user-built) ───────────────── */
function RandomTableBody({ w }) {
  const rows = w.props.rows || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden', flex: 1 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, font: 'var(--text-xs) var(--font-sans)', color: i === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', padding: '3px 0' }}>
            <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)', flex: '0 0 auto' }}>{i + 1}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r}</span>
          </div>
        ))}
      </div>
      <SW.Button variant="secondary" size="sm" icon="dice" style={{ alignSelf: 'flex-start' }}>Roll the table</SW.Button>
    </div>
  );
}
function LootBody({ w }) {
  const each = Math.floor((w.props.gold || 0) / (w.props.party || 1));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', height: '100%' }}>
      <div style={{ font: '700 28px var(--font-mono)', color: 'var(--color-text-primary)' }}>{(w.props.gold || 0).toLocaleString()} <span style={{ fontSize: 16, color: 'var(--color-accent)' }}>gp</span></div>
      <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{each.toLocaleString()} gp each · {w.props.party} share</div>
      <SW.Button variant="secondary" size="sm" icon="Coins" style={{ alignSelf: 'flex-start', marginTop: 'auto' }}>Split evenly</SW.Button>
    </div>
  );
}
function FactionsBody({ w }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {(w.props.rows || []).map(([name, val]) => {
        const pct = ((val + 5) / 10) * 100;
        const tone = val < 0 ? 'var(--color-status-error-text)' : val > 0 ? 'var(--color-status-success-text)' : 'var(--color-text-tertiary)';
        return (
          <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}><span>{name}</span><span style={{ font: 'var(--text-xs) var(--font-mono)', color: tone }}>{val > 0 ? '+' + val : val}</span></div>
            <div style={{ position: 'relative', height: 6, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-sunken)' }}>
              <div style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 10, background: 'var(--color-border-strong)' }} />
              <div style={{ position: 'absolute', left: Math.min(pct, 50) + '%', width: Math.abs(pct - 50) + '%', height: '100%', borderRadius: 'var(--radius-full)', background: tone }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
function ImageBody({ w }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <div style={{ flex: 1, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg,#2a2117,#14100b)', backgroundImage: 'repeating-linear-gradient(45deg, rgba(224,176,111,.06) 0 10px, transparent 10px 20px)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', letterSpacing: '.04em' }}>IMAGE</span>
      </div>
      <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{w.props.caption}</div>
    </div>
  );
}

/* ───────────────── shared spec renderer (custom + ai widgets) ───────────────── */
function SpecBody({ spec }) {
  const s = spec || {};
  if (s.kind === 'clock') return <ClockBody w={{ props: { label: s.label, filled: s.filled, segments: s.segments } }} />;
  if (s.kind === 'loot' || s.kind === 'stat') {
    if (s.kind === 'stat') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', justifyContent: 'center' }}>
        <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{s.label}</div>
        <div style={{ font: '700 34px var(--font-mono)', color: 'var(--color-text-primary)' }}>{s.value}<span style={{ fontSize: 16, color: 'var(--color-accent)' }}>{s.unit ? ' ' + s.unit : ''}</span></div>
      </div>
    );
    return <LootBody w={{ props: { gold: s.gold, party: s.party } }} />;
  }
  if (s.kind === 'table') return <RandomTableBody w={{ props: { rows: s.rows } }} />;
  if (s.kind === 'counter') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: '100%' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 20 }}>−</span>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ font: '700 32px var(--font-mono)', color: 'var(--color-text-primary)' }}>{s.value != null ? s.value : 0}</div>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{s.label}</div>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 20 }}>+</span>
    </div>
  );
  if (s.kind === 'tally') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(s.items || []).map(([n, c]) => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{n}</span>
          <span style={{ font: '700 var(--text-md) var(--font-mono)', color: c > 0 ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{c}</span>
        </div>
      ))}
    </div>
  );
  return <div style={{ font: 'var(--text-sm)/1.6 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{s.text}</div>;
}
function CustomBody({ w }) { return <SpecBody spec={w.props.spec} />; }

/* ───────────────── ai (generated) ───────────────── */
function AiBody({ w }) {
  const s = w.props.spec || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}><SpecBody spec={s} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6, borderTop: '1px solid var(--color-border)', font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
        <SW.Icon name="sparkle" size={12} color="var(--color-accent)" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.note || 'AI-generated'}</span>
      </div>
    </div>
  );
}

const BODIES = {
  resume: ResumeBody, scenes: ScenesBody, create: CreateBody, quicklinks: QuicklinksBody, library: NoteBody,
  note: NoteBody, clock: ClockBody, tracker: TrackerBody, dice: DiceBody, initiative: InitiativeBody,
  randomtable: RandomTableBody, loot: LootBody, factions: FactionsBody, image: ImageBody, ai: AiBody, custom: CustomBody,
};

function SceneWidget({ w }) {
  const Body = BODIES[w.type] || NoteBody;
  const accent = !!(w.props && w.props.accent);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: accent ? 'var(--color-accent-subtle)' : 'var(--color-surface-raised)', border: `1px solid ${accent ? 'var(--color-accent-border)' : 'var(--color-border)'}`, boxShadow: accent ? 'var(--shadow-md)' : 'var(--shadow-sm)', overflow: 'hidden' }}>
      <Head w={w} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}><Body w={w} /></div>
    </div>
  );
}

Object.assign(window, { SceneWidget });
