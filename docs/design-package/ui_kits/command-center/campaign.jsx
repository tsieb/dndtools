// Campaign — the /campaign global section: a structured-entity browser (arcs, quests, factions,
// NPCs, items, timeline, relationships), distinct from Knowledge (entities, not documents). Two
// layout variations toggle at the top: "Catalog" (type rail + grid + detail) and "Board" (status
// columns). Both share an entity-detail panel that cross-links into Characters / Atlas / Knowledge.
const CP = window.DNDToolsDesignSystem_8ae046;
const G = () => window.DNDGaps;

const STATUS = {
  active: { label: 'Active', status: 'success', icon: 'session-bolt' },
  looming: { label: 'Looming', status: 'warning', icon: 'warning' },
  foreshadowed: { label: 'Foreshadowed', status: 'neutral', icon: 'dm-only' },
  done: { label: 'Resolved', status: 'info', icon: 'check' },
};
const STANCE = {
  hostile: { label: 'Hostile', status: 'error' }, neutral: { label: 'Neutral', status: 'neutral' },
  friendly: { label: 'Friendly', status: 'success' }, allied: { label: 'Allied', status: 'accent' },
};

const CATS = [
  { id: 'arcs', label: 'Arcs', icon: 'GitBranch' },
  { id: 'quests', label: 'Quests', icon: 'Target' },
  { id: 'factions', label: 'Factions', icon: 'Network' },
  { id: 'npcs', label: 'NPCs', icon: 'characters-person' },
  { id: 'items', label: 'Items', icon: 'Backpack' },
  { id: 'timeline', label: 'Timeline', icon: 'recent' },
  { id: 'relationships', label: 'Relationships', icon: 'link' },
];

function CrossLink({ icon, section, label }) {
  return (
    <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', cursor: 'pointer', textAlign: 'left', transition: 'border-color var(--duration-fast) var(--easing-standard)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-border)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}>
      <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><CP.Icon name={icon} size="sm" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{label}</div>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{section}</div>
      </div>
      <CP.Icon name="chevron-right" size="sm" color="var(--color-text-tertiary)" />
    </button>
  );
}

/* Shared entity-detail panel — the cross-linking surface. */
function EntityDetail({ sel }) {
  if (!sel) return null;
  const e = sel.data, t = sel.type;
  let head, meta, body, links = [];
  if (t === 'quest') {
    const st = STATUS[e.status];
    head = e.name; meta = <><CP.Badge status={st.status} icon={st.icon}>{st.label}</CP.Badge><CP.Chip tone={e.tag === 'Main' ? 'accent' : 'neutral'}>{e.tag} quest</CP.Chip></>;
    body = e.desc;
    if (e.npc) links.push({ icon: 'characters-person', section: 'Characters', label: e.npc });
    if (e.scene) links.push({ icon: 'atlas-map', section: 'Atlas', label: e.scene });
    links.push({ icon: 'knowledge-book', section: 'Knowledge', label: `${e.arc} — notes` });
  } else if (t === 'arc') {
    const st = STATUS[e.status];
    head = e.name; meta = <><CP.Badge status={st.status} icon={st.icon}>{st.label}</CP.Badge><CP.Chip>Sessions {e.sessions}</CP.Chip><CP.Chip icon="Target">{e.quests} quests</CP.Chip></>;
    body = e.desc; links = [{ icon: 'knowledge-book', section: 'Knowledge', label: `${e.name} — arc notes` }];
  } else if (t === 'faction') {
    const sc = STANCE[e.stance];
    head = e.name; meta = <><CP.Badge status={sc.status} icon={sc.status === 'error' ? 'error' : sc.status === 'success' ? 'success' : 'info'}>{sc.label}</CP.Badge><CP.Chip>{e.kind}</CP.Chip></>;
    body = e.desc; links = [{ icon: 'characters-person', section: 'Characters', label: e.leader }];
  } else if (t === 'npc') {
    head = e.name; meta = <><CP.VisibilityChip level={e.vis} /><CP.Chip>{e.faction}</CP.Chip></>;
    body = e.sub; links = [{ icon: 'characters-person', section: 'Characters', label: `Open ${e.name}` }, { icon: 'knowledge-book', section: 'Knowledge', label: `${e.name} — NPC note` }];
  } else if (t === 'item') {
    head = e.name; meta = <><CP.VisibilityChip level={e.vis} /><CP.Chip tone={e.rarity === 'Legendary' ? 'accent' : 'neutral'}>{e.rarity}</CP.Chip><CP.Chip>{e.kind}</CP.Chip></>;
    body = e.desc; links = [{ icon: 'knowledge-book', section: 'Knowledge', label: `${e.name} — handout` }];
  }
  return (
    <CP.Card elevation="raised" padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 0 }}>
      <div>
        <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>{t}</div>
        <div style={{ font: '700 var(--text-2xl) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1, marginTop: 2 }}>{head}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'var(--space-3)' }}>{meta}</div>
      </div>
      {e.due && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-status-warning-subtle)', color: 'var(--color-status-warning-text)', font: '600 var(--text-xs) var(--font-sans)' }}><CP.Icon name="recent" size="sm" />Due: {e.due}</div>}
      <p style={{ margin: 0, font: 'var(--text-sm)/1.7 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{body}</p>
      <div>
        <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>Linked across the campaign</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {links.map((l, i) => <CrossLink key={i} {...l} />)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
        <CP.Button variant="secondary" icon="note-edit">Edit</CP.Button>
        <CP.Button variant="ghost" icon="send">Push</CP.Button>
      </div>
    </CP.Card>
  );
}

/* ---- entity cards per category (catalog grid) ---- */
function QuestCard({ q, on, onClick }) {
  const st = STATUS[q.status];
  return (
    <CP.Card elevation={on ? 'raised' : 'flat'} interactive padding="md" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', outline: on ? '1px solid var(--color-accent-border)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CP.Badge status={st.status} icon={st.icon}>{st.label}</CP.Badge>
        <span style={{ marginLeft: 'auto', font: 'var(--text-2xs) var(--font-mono)', color: q.tag === 'Main' ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{q.tag}</span>
      </div>
      <div style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{q.name}</div>
      <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{q.desc}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
        <CP.Chip icon="GitBranch">{q.arc}</CP.Chip>
        {q.npc && <CP.Chip icon="characters-person">{q.npc}</CP.Chip>}
        {q.scene && <CP.Chip icon="atlas-map">{q.scene}</CP.Chip>}
      </div>
    </CP.Card>
  );
}

function ArcCard({ a, on, onClick }) {
  const st = STATUS[a.status];
  return (
    <CP.Card elevation={on ? 'raised' : 'flat'} interactive padding="md" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', outline: on ? '1px solid var(--color-accent-border)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', alignItems: 'center', justifyContent: 'center' }}><CP.Icon name="GitBranch" size="sm" /></span>
        <div style={{ flex: 1, font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{a.name}</div>
        <CP.Badge status={st.status} icon={st.icon}>{st.label}</CP.Badge>
      </div>
      <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{a.desc}</div>
      <div style={{ display: 'flex', gap: 6 }}><CP.Chip>Sessions {a.sessions}</CP.Chip><CP.Chip icon="Target">{a.quests} quests</CP.Chip></div>
    </CP.Card>
  );
}

function FactionCard({ f, on, onClick }) {
  const sc = STANCE[f.stance];
  return (
    <CP.Card elevation={on ? 'raised' : 'flat'} interactive padding="md" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', outline: on ? '1px solid var(--color-accent-border)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{f.name}</span>
        <CP.Badge status={sc.status} icon={sc.status === 'error' ? 'error' : sc.status === 'success' ? 'success' : 'info'}>{sc.label}</CP.Badge>
      </div>
      <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{f.desc}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CP.Chip icon="characters-person">{f.leader}</CP.Chip>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>{[1, 2, 3].map((i) => <span key={i} style={{ width: 7, height: 14, borderRadius: 2, background: i <= f.power ? 'var(--color-accent)' : 'var(--color-border-strong)' }} />)}</span>
      </div>
    </CP.Card>
  );
}

function NpcRow({ n, on, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', textAlign: 'left', padding: 'var(--space-3)', border: '1px solid', borderColor: on ? 'var(--color-accent-border)' : 'var(--color-border)', borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface)', cursor: 'pointer' }}>
      <CP.Avatar name={n.name} size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{n.name}</div>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{n.sub}</div>
      </div>
      <CP.VisibilityChip level={n.vis} compact />
    </button>
  );
}

function ItemCard({ it, on, onClick }) {
  return (
    <CP.Card elevation={on ? 'raised' : 'flat'} interactive padding="md" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', outline: on ? '1px solid var(--color-accent-border)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CP.Icon name={it.kind === 'Artifact' ? 'sparkle' : it.kind === 'Handout' ? 'send' : 'flag'} size="sm" color="var(--color-accent)" />
        <span style={{ flex: 1, font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{it.name}</span>
        <CP.VisibilityChip level={it.vis} compact />
      </div>
      <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{it.desc}</div>
      <div style={{ display: 'flex', gap: 6 }}><CP.Chip tone={it.rarity === 'Legendary' ? 'accent' : 'neutral'}>{it.rarity}</CP.Chip><CP.Chip>{it.kind}</CP.Chip></div>
    </CP.Card>
  );
}

function TimelineList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {G().timeline.map((t, i) => (
        <div key={t.id} style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: i === 0 ? 'var(--color-accent)' : 'var(--color-surface)', border: '2px solid var(--color-accent-border)', marginTop: 4 }} />
            {i < G().timeline.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--color-border)' }} />}
          </div>
          <div style={{ paddingBottom: 'var(--space-4)', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{t.label}</span>
              <CP.Chip>{t.tag}</CP.Chip>
              <span style={{ marginLeft: 'auto', font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{t.when}</span>
            </div>
            <div style={{ font: 'var(--text-sm)/1.6 var(--font-sans)', color: 'var(--color-text-secondary)', marginTop: 2 }}>{t.summary}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RelationshipsList() {
  const tone = { warning: 'var(--color-status-warning)', error: 'var(--color-status-error)', info: 'var(--color-status-info)', neutral: 'var(--color-text-tertiary)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {G().relationships.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
          <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{r.from}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--text-xs) var(--font-sans)', color: tone[r.tone], fontStyle: 'italic' }}><span style={{ flex: 1, height: 1, width: 24, background: tone[r.tone] }} />{r.kind}<CP.Icon name="chevron-right" size="micro" /></span>
          <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{r.to}</span>
        </div>
      ))}
    </div>
  );
}

function CatalogGrid({ cat, sel, setSel }) {
  if (cat === 'quests') return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>{G().quests.map((q) => <QuestCard key={q.id} q={q} on={sel && sel.data.id === q.id} onClick={() => setSel({ type: 'quest', data: q })} />)}</div>;
  if (cat === 'arcs') return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-3)' }}>{G().arcs.map((a) => <ArcCard key={a.id} a={a} on={sel && sel.data.id === a.id} onClick={() => setSel({ type: 'arc', data: a })} />)}</div>;
  if (cat === 'factions') return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>{G().factions.map((f) => <FactionCard key={f.id} f={f} on={sel && sel.data.id === f.id} onClick={() => setSel({ type: 'faction', data: f })} />)}</div>;
  if (cat === 'npcs') return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-2)' }}>{G().characters.filter((c) => c.kind === 'NPC').map((n) => <NpcRow key={n.id} n={n} on={sel && sel.data.id === n.id} onClick={() => setSel({ type: 'npc', data: n })} />)}</div>;
  if (cat === 'items') return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>{G().items.map((it) => <ItemCard key={it.id} it={it} on={sel && sel.data.id === it.id} onClick={() => setSel({ type: 'item', data: it })} />)}</div>;
  if (cat === 'timeline') return <CP.Card elevation="flat" padding="lg"><TimelineList /></CP.Card>;
  if (cat === 'relationships') return <RelationshipsList />;
  return null;
}

function CatalogLayout({ cat, setCat, sel, setSel }) {
  const counts = { arcs: G().arcs.length, quests: G().quests.length, factions: G().factions.length, npcs: G().characters.filter((c) => c.kind === 'NPC').length, items: G().items.length, timeline: G().timeline.length, relationships: G().relationships.length };
  const wide = cat === 'timeline' || cat === 'relationships';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '186px minmax(0, 1fr)' + (wide ? '' : ' 340px'), gap: 'var(--space-4)', alignItems: 'start' }}>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {CATS.map((c) => {
          const on = c.id === cat;
          return (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', border: 'none', borderLeft: `3px solid ${on ? 'var(--color-accent)' : 'transparent'}`, borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', font: `${on ? 600 : 500} var(--text-sm) var(--font-sans)`, cursor: 'pointer', textAlign: 'left' }}>
              <CP.Icon name={c.icon} size="sm" /><span style={{ flex: 1 }}>{c.label}</span>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{counts[c.id]}</span>
            </button>
          );
        })}
      </nav>
      <div><CatalogGrid cat={cat} sel={sel} setSel={setSel} /></div>
      {!wide && <EntityDetail sel={sel} />}
    </div>
  );
}

/* ---- Board layout: status columns ---- */
function BoardCard({ q, onClick }) {
  return (
    <CP.Card elevation="flat" interactive padding="md" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CP.Icon name="drag-handle" size="sm" color="var(--color-text-tertiary)" />
        <span style={{ flex: 1, font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{q.name}</span>
        <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: q.tag === 'Main' ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{q.tag}</span>
      </div>
      <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{q.desc}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <CP.Chip icon="GitBranch">{q.arc}</CP.Chip>
        {q.npc && <CP.Chip icon="characters-person">{q.npc}</CP.Chip>}
      </div>
    </CP.Card>
  );
}

function BoardLayout({ sel, setSel }) {
  const cols = [
    { id: 'active', ...STATUS.active }, { id: 'looming', ...STATUS.looming }, { id: 'done', ...STATUS.done },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 'var(--space-4)', alignItems: 'start' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', alignItems: 'start' }}>
        {cols.map((col) => {
          const qs = G().quests.filter((q) => q.status === col.id);
          return (
            <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CP.Badge status={col.status} icon={col.icon}>{col.label}</CP.Badge>
                <span style={{ marginLeft: 'auto', font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{qs.length}</span>
              </div>
              {qs.map((q) => <BoardCard key={q.id} q={q} onClick={() => setSel({ type: 'quest', data: q })} />)}
              <button type="button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 'var(--space-2)', border: '1px dashed var(--color-border-strong)', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--color-text-tertiary)', font: '500 var(--text-xs) var(--font-sans)', cursor: 'pointer' }}><CP.Icon name="add" size="sm" />Add quest</button>
            </div>
          );
        })}
      </div>
      <EntityDetail sel={sel} />
    </div>
  );
}

function Campaign() {
  const [layout, setLayout] = React.useState('catalog');
  const [cat, setCat] = React.useState('quests');
  const [sel, setSel] = React.useState({ type: 'quest', data: window.DNDGaps.quests[0] });
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <CP.Breadcrumb items={[{ label: 'Command Center' }, { label: 'Campaign' }]} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div>
          <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{window.DNDGaps.campaign} · session {window.DNDGaps.session}</div>
          <div style={{ font: '700 var(--text-2xl) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>Campaign</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <CP.Input icon="search" placeholder="Search the campaign…" style={{ width: 200 }} />
          <CP.SegmentedControl value={layout} onChange={setLayout} options={[{ value: 'catalog', label: 'Catalog' }, { value: 'board', label: 'Board' }]} />
          <CP.Button variant="primary" icon="add">New entity</CP.Button>
        </div>
      </div>
      {layout === 'catalog'
        ? <CatalogLayout cat={cat} setCat={setCat} sel={sel} setSel={setSel} />
        : <BoardLayout sel={sel} setSel={setSel} />}
    </div>
  );
}

Object.assign(window, { Campaign });
