// scene-shell.jsx — the top-level app: scene switcher, edit toolbar (undo/redo, snap, add, player
// view), zoom controls, the model legend, and ALL scene/widget state incl. history + persistence.
// Command Center is just scenes[0] (pinned). Exposes SceneSystem.
const SH = window.DNDToolsDesignSystem_8ae046;
// hooks (useState/useRef/useEffect) are destructured from React in scene-canvas.jsx (shared scope).

const clone = (o) => JSON.parse(JSON.stringify(o));
let _seq = 1000;
const uid = (p) => (p || 'w') + ++_seq;

const STATEKEY = 'scn-proto-state-v2';

function ToolbarBtn({ icon, label, onClick, active, disabled }) {
  return <SH.IconButton icon={icon} label={label} variant={active ? 'accent' : 'ghost'} onClick={onClick} disabled={disabled} />;
}

/* ── scene switcher ── */
function SceneTabs({ scenes, activeId, onPick, onSettings, onNew }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflowX: 'auto' }}>
      {scenes.map((s) => {
        const on = s.id === activeId;
        return (
          <button key={s.id} type="button" onClick={() => (on ? onSettings() : onPick(s.id))} title={on ? 'Scene settings' : s.name}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', flex: '0 0 auto', border: '1px solid ' + (on ? 'var(--color-accent-border)' : 'transparent'), borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'transparent', cursor: 'pointer', color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
            <SH.Icon name={s.icon || 'scene'} size="sm" color={on ? 'var(--color-accent)' : 'currentColor'} />
            <span style={{ font: (on ? 600 : 500) + ' var(--text-sm) var(--font-sans)', whiteSpace: 'nowrap' }}>{s.name}</span>
            {s.pinned && <SH.Icon name="pin" size={12} color="var(--color-text-tertiary)" />}
            {on && <SH.Icon name="chevron-down" size={13} color="var(--color-text-tertiary)" />}
          </button>
        );
      })}
      <button type="button" onClick={onNew} title="New scene"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 10px', flex: '0 0 auto', border: '1px dashed var(--color-border-strong)', borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)', font: '500 var(--text-sm) var(--font-sans)' }}>
        <SH.Icon name="add" size="sm" />New
      </button>
    </div>
  );
}

/* ── model legend ── */
function Legend({ onClose, onReset }) {
  const Row = ({ icon, head, body }) => (
    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><SH.Icon name={icon} size="sm" /></span>
      <div><div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{head}</div><div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{body}</div></div>
    </div>
  );
  return (
    <div style={{ position: 'absolute', top: 56, right: 12, zIndex: 70, width: 372, padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-strong)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1, font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>One model</span>
        <SH.IconButton icon="close" label="Close" variant="ghost" size="sm" onClick={onClose} />
      </div>
      <Row icon="scene" head="Every screen is a Scene" body="A canvas of widgets — for prep, worldbuilding, player management or live play. Nothing is hard-coded." />
      <Row icon="home" head="Command Center is a pinned Scene" body="Same canvas, seeded with system widgets. Add your own; move and restyle the base ones." />
      <Row icon="widget" head="Widgets come in four tiers" body="System (locked content, still movable) · Template (configurable) · Custom (your code & data) · AI (generated)." />
      <Row icon="zoom-fit" head="Overflow adapts to the scene" body="Home fits to screen & scrolls — keyboard-first — with pan & zoom available on demand. Canvases pan & zoom, with a minimap." />
      <Row icon="visibility-players" head="Visibility is projection-safe" body="Every widget is DM-only or Players. Player view shows exactly what the table sees; DM-only widgets never appear." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
        {[['Edit / done', 'E'], ['Undo / redo', '⌘Z · ⇧⌘Z'], ['Nudge selection', '↑↓←→'], ['Multi-select', '⇧click'], ['Remove', '⌫'], ['Deselect', 'Esc']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}><span>{k}</span><span style={{ font: 'var(--text-2xs) var(--font-mono)' }}>{v}</span></div>
        ))}
      </div>
      <SH.Button variant="ghost" size="sm" icon="retry" onClick={onReset} style={{ alignSelf: 'flex-start' }}>Reset to sample scenes</SH.Button>
    </div>
  );
}

function loadState() {
  try { const s = JSON.parse(localStorage.getItem(STATEKEY) || 'null'); if (s && s.scenes) return s; } catch (e) {}
  return null;
}
function defaultViews(scenes) {
  const v = {}; scenes.forEach((s) => { v[s.id] = s.policy === 'bounded' ? { fit: false } : { tx: 32, ty: 32, scale: 1 }; }); return v;
}

function SceneSystem() {
  const boot = loadState();
  const [scenes, setScenes] = useState(() => (boot ? boot.scenes : clone(window.SCN.scenes)));
  const [activeId, setActiveId] = useState(() => (boot && boot.activeId) || 'home');
  const [views, setViews] = useState(() => (boot && boot.views) || defaultViews(window.SCN.scenes));
  const [editing, setEditing] = useState(false);
  const [snap, setSnap] = useState(true);
  const [selIds, setSelIds] = useState([]);
  const [playerView, setPlayerView] = useState(false);
  const [palette, setPalette] = useState(false);
  const [ai, setAi] = useState(false);
  const [legend, setLegend] = useState(false);
  const [sceneMenu, setSceneMenu] = useState(false);
  const [context, setContext] = useState(null);
  const [codeId, setCodeId] = useState(null);
  const [builder, setBuilder] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const apiRef = useRef({});
  const scenesRef = useRef(scenes);
  useEffect(() => { scenesRef.current = scenes; }, [scenes]);

  // persistence
  useEffect(() => { try { localStorage.setItem(STATEKEY, JSON.stringify({ scenes, activeId, views })); } catch (e) {} }, [scenes, activeId, views]);

  const scene = scenes.find((s) => s.id === activeId) || scenes[0];
  const view = views[activeId] || {};
  const setView = (v) => setViews((m) => ({ ...m, [activeId]: v }));
  const selectedId = selIds.length === 1 ? selIds[0] : null;
  const selected = scene.widgets.find((w) => w.id === selectedId);

  /* ── history ── */
  const pushHistory = () => { setPast((p) => [...p.slice(-49), clone(scenesRef.current)]); setFuture([]); };
  const undo = () => setPast((p) => { if (!p.length) return p; setFuture((f) => [clone(scenesRef.current), ...f]); setScenes(p[p.length - 1]); setSelIds([]); return p.slice(0, -1); });
  const redo = () => setFuture((f) => { if (!f.length) return f; setPast((p) => [...p, clone(scenesRef.current)]); setScenes(f[0]); setSelIds([]); return f.slice(1); });

  /* ── mutations ── */
  const updateWidgets = (fn) => setScenes((ss) => ss.map((s) => (s.id === activeId ? { ...s, widgets: fn(s.widgets) } : s)));
  const patch = (id, p) => updateWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const setProp = (id, k, v) => { pushHistory(); updateWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, props: { ...w.props, [k]: v } } : w))); };
  const editPatch = (id, p) => { pushHistory(); patch(id, p); };

  const spawnPos = () => {
    if (scene.policy === 'bounded' && !view.panZoom) { const maxB = scene.widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0); return { x: 40, y: maxB + 24 }; }
    const s = view.scale || 1; return { x: Math.round((-(view.tx || 0)) / s + 120), y: Math.round((-(view.ty || 0)) / s + 120) };
  };
  const addWidget = (typeId) => {
    const m = window.SCN.types[typeId]; const id = uid(typeId); const pos = spawnPos(); pushHistory();
    updateWidgets((ws) => [...ws, { id, type: typeId, title: m.label, tier: m.tier, vis: m.tier === 'system' ? 'dm' : (scene.defaultVis || 'players'), x: pos.x, y: pos.y, w: m.w, h: m.h, props: clone(m.defaults) }]);
    setSelIds([id]); setPalette(false); if (!editing) setEditing(true);
  };
  const placeAi = (result) => {
    const id = uid('ai'); const pos = spawnPos(); pushHistory();
    updateWidgets((ws) => [...ws, { id, type: 'ai', title: result.title, tier: 'ai', vis: scene.defaultVis || 'dm', x: pos.x, y: pos.y, w: result.w, h: result.h, props: { accent: true, spec: result.spec } }]);
    setSelIds([id]); setAi(false); setPalette(false); if (!editing) setEditing(true);
  };
  const placeCustom = (payload) => {
    const id = uid('custom'); const pos = spawnPos(); pushHistory();
    updateWidgets((ws) => [...ws, { id, type: 'custom', title: payload.title, tier: 'custom', vis: payload.vis || scene.defaultVis || 'players', x: pos.x, y: pos.y, w: payload.w, h: payload.h, props: payload.props }]);
    setSelIds([id]); setBuilder(false); setPalette(false); if (!editing) setEditing(true);
  };
  const removeWidget = (id) => { pushHistory(); updateWidgets((ws) => ws.filter((w) => w.id !== id)); setSelIds([]); };
  const duplicateWidget = (id) => {
    const src = scene.widgets.find((w) => w.id === id); const nid = uid(src.type); pushHistory();
    updateWidgets((ws) => [...ws, { ...clone(src), id: nid, title: src.title + ' copy', x: src.x + 28, y: src.y + 28 }]);
    setSelIds([nid]);
  };
  const zOrder = (id, dir) => { pushHistory(); updateWidgets((ws) => { const w = ws.find((x) => x.id === id); const rest = ws.filter((x) => x.id !== id); return dir === 'front' ? [...rest, w] : [w, ...rest]; }); };

  /* ── alignment (2+ selected) ── */
  const align = (act) => {
    const ws = scene.widgets.filter((w) => selIds.includes(w.id)); if (ws.length < 2) return; pushHistory();
    const minX = Math.min(...ws.map((w) => w.x)), maxR = Math.max(...ws.map((w) => w.x + w.w));
    const minY = Math.min(...ws.map((w) => w.y)), maxB = Math.max(...ws.map((w) => w.y + w.h));
    const cx = (minX + maxR) / 2, cy = (minY + maxB) / 2;
    const upd = {};
    if (act === 'left') ws.forEach((w) => (upd[w.id] = { x: minX }));
    else if (act === 'right') ws.forEach((w) => (upd[w.id] = { x: maxR - w.w }));
    else if (act === 'cx') ws.forEach((w) => (upd[w.id] = { x: Math.round(cx - w.w / 2) }));
    else if (act === 'top') ws.forEach((w) => (upd[w.id] = { y: minY }));
    else if (act === 'bottom') ws.forEach((w) => (upd[w.id] = { y: maxB - w.h }));
    else if (act === 'cy') ws.forEach((w) => (upd[w.id] = { y: Math.round(cy - w.h / 2) }));
    else if (act === 'distx') { const s = [...ws].sort((a, b) => a.x - b.x); const span = (s[s.length - 1].x - s[0].x); const step = span / (s.length - 1); s.forEach((w, i) => (upd[w.id] = { x: Math.round(s[0].x + step * i) })); }
    else if (act === 'disty') { const s = [...ws].sort((a, b) => a.y - b.y); const span = (s[s.length - 1].y - s[0].y); const step = span / (s.length - 1); s.forEach((w, i) => (upd[w.id] = { y: Math.round(s[0].y + step * i) })); }
    updateWidgets((list) => list.map((w) => (upd[w.id] ? { ...w, ...upd[w.id] } : w)));
  };

  /* ── scene ops ── */
  const openNewScene = () => setNewOpen(true);
  const createSceneFromTemplate = (tpl, name) => {
    const id = uid('scene'); pushHistory();
    const widgets = (tpl.seed || []).map(([typeId, x, y]) => {
      const meta = window.SCN.types[typeId];
      return { id: uid(typeId), type: typeId, title: meta.label, tier: meta.tier, vis: meta.tier === 'system' ? 'dm' : 'players', x, y, w: meta.w, h: meta.h, props: clone(meta.defaults) };
    });
    const bounded = tpl.policy === 'bounded';
    setScenes((ss) => [...ss, { id, name, policy: tpl.policy || 'canvas', icon: tpl.icon || 'scene', sub: bounded ? 'Fits to screen' : 'Canvas · pan & zoom', defaultVis: 'dm', widgets }]);
    setViews((m) => ({ ...m, [id]: bounded ? { fit: false } : { tx: 32, ty: 32, scale: 1 } }));
    setActiveId(id); setEditing(true); setSelIds([]); setNewOpen(false);
  };
  const patchScene = (p) => { pushHistory(); setScenes((ss) => ss.map((s) => (s.id === activeId ? { ...s, ...p } : s))); };
  const duplicateScene = () => {
    const id = uid('scene'); pushHistory();
    const copy = { ...clone(scene), id, name: scene.name + ' copy', pinned: false };
    setScenes((ss) => { const i = ss.findIndex((s) => s.id === activeId); return [...ss.slice(0, i + 1), copy, ...ss.slice(i + 1)]; });
    setViews((m) => ({ ...m, [id]: scene.policy === 'bounded' ? { fit: false } : { tx: 32, ty: 32, scale: 1 } }));
    setActiveId(id); setSceneMenu(false); setSelIds([]);
  };
  const deleteScene = () => { if (scene.pinned) return; pushHistory(); setScenes((ss) => ss.filter((s) => s.id !== activeId)); setActiveId('home'); setSceneMenu(false); setSelIds([]); };
  const resetAll = () => { try { localStorage.removeItem(STATEKEY); } catch (e) {} setScenes(clone(window.SCN.scenes)); setViews(defaultViews(window.SCN.scenes)); setActiveId('home'); setPast([]); setFuture([]); setSelIds([]); setLegend(false); };

  /* ── selection ── */
  const onSelect = (id, shift) => {
    if (id == null) { setSelIds([]); return; }
    if (shift) setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else setSelIds([id]);
  };
  const ctxAct = (act) => {
    const id = context.id; const w = scene.widgets.find((x) => x.id === id); if (!w) return;
    if (act === 'edit') setSelIds([id]);
    else if (act === 'front') zOrder(id, 'front');
    else if (act === 'back') zOrder(id, 'back');
    else if (act === 'vis') editPatch(id, { vis: w.vis === 'players' ? 'dm' : 'players' });
    else if (act === 'code') setCodeId(id);
    else if (act === 'duplicate') duplicateWidget(id);
    else if (act === 'remove') removeWidget(id);
  };

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target.matches && e.target.matches('input,textarea,select');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (typing) return;
      if (e.key === 'Escape') { setSelIds([]); setPalette(false); setAi(false); setLegend(false); setSceneMenu(false); setContext(null); setCodeId(null); }
      if (e.key.toLowerCase() === 'e' && !playerView) setEditing((v) => { if (v) setSelIds([]); return !v; });
      if (!editing || !selIds.length) return;
      if ((e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); pushHistory(); updateWidgets((ws) => ws.filter((w) => !(selIds.includes(w.id) && w.tier !== 'system'))); setSelIds([]); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault(); const step = e.shiftKey ? 20 : 4;
        const d = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key];
        updateWidgets((ws) => ws.map((w) => (selIds.includes(w.id) ? { ...w, x: Math.max(0, w.x + d[0]), y: Math.max(0, w.y + d[1]) } : w)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, selIds, playerView, scene]);

  const effPolicy = (scene.policy === 'bounded' && view.panZoom) ? 'canvas' : scene.policy;
  const isCanvas = effPolicy === 'canvas';
  const zoomPct = Math.round((view.scale || 1) * 100);
  const subLabel = scene.policy === 'bounded' ? (view.panZoom ? (scene.pinned ? 'Home · pan & zoom' : 'Pan & zoom') : (scene.pinned ? 'Home · fits to screen' : 'Fits to screen')) : scene.sub;
  const togglePanZoom = () => setView(view.panZoom ? { panZoom: false, fit: false } : { panZoom: true, tx: 32, ty: 32, scale: 1 });

  const dmHidden = scene.widgets.filter((w) => w.vis !== 'players').length;
  const viewScene = playerView ? { ...scene, widgets: scene.widgets.filter((w) => w.vis === 'players') } : scene;
  const codeWidget = scene.widgets.find((w) => w.id === codeId);
  const showInspector = editing && selected && !playerView;
  const showAlign = editing && selIds.length >= 2 && !playerView;

  return (
    <div data-theme="tavern" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)', fontFamily: 'var(--font-sans)', position: 'relative' }}>
      {/* top chrome */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flex: '0 0 auto', zIndex: 20 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: 'var(--color-accent-foreground)', flex: '0 0 auto' }}><SH.Icon name="home" size="sm" /></span>
        <div style={{ flex: 1, minWidth: 0 }}><SceneTabs scenes={scenes} activeId={activeId} onPick={(id) => { setActiveId(id); setSelIds([]); setPlayerView(false); }} onSettings={() => setSceneMenu((v) => !v)} onNew={openNewScene} /></div>

        {/* policy chip */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', flex: '0 0 auto', borderRadius: 'var(--radius-full)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', font: '500 var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
          <SH.Icon name={isCanvas ? 'globe' : 'zoom-fit'} size={13} color="var(--color-accent)" />{subLabel}
        </span>

        {isCanvas && !playerView && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '0 0 auto', padding: 2, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
            <ToolbarBtn icon="zoom-out" label="Zoom out" onClick={() => apiRef.current.zoomOut && apiRef.current.zoomOut()} />
            <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-secondary)', minWidth: 38, textAlign: 'center' }}>{zoomPct}%</span>
            <ToolbarBtn icon="zoom-in" label="Zoom in" onClick={() => apiRef.current.zoomIn && apiRef.current.zoomIn()} />
            <ToolbarBtn icon="zoom-fit" label="Fit to view" onClick={() => apiRef.current.fit && apiRef.current.fit()} />
          </div>
        )}
        {scene.policy === 'bounded' && !view.panZoom && !playerView && (
          <SH.Button variant={view.fit ? 'primary' : 'secondary'} size="sm" icon="zoom-fit" onClick={() => setView({ ...view, fit: !view.fit })}>{view.fit ? 'Fit: on' : 'Fit to screen'}</SH.Button>
        )}
        {scene.policy === 'bounded' && !playerView && (
          <SH.Button variant={view.panZoom ? 'primary' : 'ghost'} size="sm" icon="globe" onClick={togglePanZoom}>{view.panZoom ? 'Pan & zoom: on' : 'Pan & zoom'}</SH.Button>
        )}

        {editing && !playerView && (
          <React.Fragment>
            <span style={{ width: 1, height: 22, background: 'var(--color-border)', flex: '0 0 auto' }} />
            <ToolbarBtn icon="undo" label="Undo" onClick={undo} disabled={!past.length} />
            <ToolbarBtn icon="redo" label="Redo" onClick={redo} disabled={!future.length} />
            <SH.Switch checked={snap} onChange={setSnap} label={<span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Snap</span>} />
            <SH.Button variant="secondary" size="sm" icon="add" onClick={() => setPalette(true)}>Add</SH.Button>
          </React.Fragment>
        )}
        {!playerView && <SH.Button variant={editing ? 'primary' : 'secondary'} size="sm" icon={editing ? 'check' : 'edit'} onClick={() => { setEditing((v) => !v); setSelIds([]); }}>{editing ? 'Done' : 'Edit'}</SH.Button>}
        <SH.Button variant={playerView ? 'primary' : 'ghost'} size="sm" icon="visibility-players" onClick={() => { setPlayerView((v) => !v); setEditing(false); setSelIds([]); }}>{playerView ? 'Player view' : 'Player view'}</SH.Button>
        <ToolbarBtn icon="info" label="How this works" active={legend} onClick={() => setLegend((v) => !v)} />
      </header>

      {legend && <Legend onClose={() => setLegend(false)} onReset={resetAll} />}
      {sceneMenu && <window.SceneMenu scene={scene} onPatch={patchScene} onDuplicate={duplicateScene} onDelete={deleteScene} onClose={() => setSceneMenu(false)} />}

      {/* body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <window.SceneCanvas
          scene={viewScene} policy={effPolicy} view={view} onView={setView}
          editing={editing && !playerView} snap={snap} selectedIds={selIds}
          onSelect={onSelect} onMutate={patch} onContext={(x, y, id) => setContext({ x, y, id })}
          onBeginInteract={pushHistory}
          registerApi={(api) => { apiRef.current = api; }} />

        {playerView && <window.PlayerBanner hidden={dmHidden} onExit={() => setPlayerView(false)} />}
        {showAlign && <window.AlignBar count={selIds.length} onAlign={align} />}

        {showInspector && (
          <window.SceneInspector w={selected}
            onChange={(p) => editPatch(selected.id, p)} onProp={(k, v) => setProp(selected.id, k, v)}
            onRemove={() => removeWidget(selected.id)} onDuplicate={() => duplicateWidget(selected.id)}
            onFront={() => zOrder(selected.id, 'front')} onBack={() => zOrder(selected.id, 'back')}
            onCode={() => setCodeId(selected.id)} onClose={() => setSelIds([])} />
        )}

        {codeWidget && <window.CodeDrawer w={codeWidget} onClose={() => setCodeId(null)} />}
        {context && <window.ContextMenu menu={context} isSystem={(scene.widgets.find((w) => w.id === context.id) || {}).tier === 'system'} onAct={ctxAct} onClose={() => setContext(null)} />}
        {palette && <window.AddPalette onAdd={addWidget} onAi={() => { setPalette(false); setAi(true); }} onBuild={() => { setPalette(false); setBuilder(true); }} onClose={() => setPalette(false)} />}
        {ai && <window.AiDialog onPlace={placeAi} onClose={() => setAi(false)} />}
        {builder && <window.WidgetBuilder onCreate={placeCustom} onClose={() => setBuilder(false)} />}
        {newOpen && <window.NewSceneDialog onCreate={createSceneFromTemplate} onClose={() => setNewOpen(false)} />}

        {!scene.widgets.length && !playerView && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)', pointerEvents: 'none' }}>
            <SH.Icon name="widget" size="xl" color="var(--color-text-tertiary)" />
            <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-secondary)' }}>An empty scene</div>
            <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{editing ? 'Add a widget or generate one with AI.' : 'Press Edit, then add or generate widgets.'}</div>
          </div>
        )}
        {playerView && !viewScene.widgets.length && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', pointerEvents: 'none' }}>
            <SH.Icon name="hidden" size="xl" color="var(--color-text-tertiary)" />
            <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Nothing on this scene is shared with players yet.</div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { SceneSystem });
