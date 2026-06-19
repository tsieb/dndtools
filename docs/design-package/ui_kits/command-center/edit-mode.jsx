// EditCanvas — a scene canvas with a real edit mode. Toggle "Edit layout" to make every widget
// moveable + resizable on a snap grid; select one to open the tiered Inspector. Core widgets can
// be placed and scoped but not content-edited; templates/custom widgets are fully customizable.
const EC = window.DNDToolsDesignSystem_8ae046;
const { useState, useRef, useEffect, useCallback } = React;

let _seq = 100;
const uid = () => 'w' + (++_seq);

function Toolbar({ editing, snap, onSnap, onAdd, onToggle }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)', flex: '0 0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
        <EC.IconButton icon="ChevronLeft" label="Back to session" variant="ghost" onClick={() => window.DNDNavigate && window.DNDNavigate('session')} />
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)' }}><EC.Icon name="atlas-map" size="sm" /></span>
        <div>
          <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>The Pier</div>
          <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Outpost Yard · scene</div>
        </div>
        {editing && <EC.Badge status="accent" icon="Pencil">Editing layout</EC.Badge>}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {editing ? (
          <React.Fragment>
            <EC.Switch checked={snap} onChange={onSnap} label={<span style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>Snap to grid</span>} />
            <span style={{ width: 1, height: 22, background: 'var(--color-border)', margin: '0 var(--space-1)' }} />
            <EC.Button variant="secondary" icon="add" onClick={onAdd}>Add widget</EC.Button>
            <EC.Button variant="primary" icon="check" onClick={onToggle}>Done</EC.Button>
          </React.Fragment>
        ) : (
          <EC.Button variant="secondary" icon="Pencil" onClick={onToggle}>Edit layout</EC.Button>
        )}
      </div>
    </header>
  );
}

// Floating chip above a selected widget: drag affordance + name, lock for core.
function FrameTag({ w, core }) {
  return (
    <div style={{ position: 'absolute', top: -28, left: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent)', color: 'var(--color-accent-foreground)', font: '600 var(--text-2xs) var(--font-sans)', boxShadow: 'var(--shadow-sm)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      <EC.Icon name="move" size={12} />{w.title}{core && <EC.Icon name="lock" size={12} />}
    </div>
  );
}

function Frame({ w, editing, selected, onSelect, onStartMove, onStartResize }) {
  const core = window.DNDEdit.types[w.type].tier === 'core';
  const ring = selected ? '0 0 0 2px var(--color-accent)' : 'none';
  return (
    <div style={{ position: 'absolute', left: w.x, top: w.y, width: w.w, height: w.h, borderRadius: 'var(--radius-md)', boxShadow: ring, transition: selected ? 'none' : 'box-shadow var(--duration-fast) var(--easing-standard)' }}>
      <div style={{ height: '100%', pointerEvents: editing ? 'none' : 'auto' }}><window.WidgetBody w={w} /></div>

      {editing && (
        <div
          onPointerDown={(e) => onStartMove(e, w.id)}
          style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-md)', cursor: 'grab', background: selected ? 'transparent' : 'rgba(0,0,0,0)' }}
          onMouseEnter={(e) => { if (!selected) e.currentTarget.parentElement.style.boxShadow = '0 0 0 1px var(--color-border-strong)'; }}
          onMouseLeave={(e) => { if (!selected) e.currentTarget.parentElement.style.boxShadow = 'none'; }}
        />
      )}

      {editing && selected && (
        <React.Fragment>
          <FrameTag w={w} core={core} />
          <div
            onPointerDown={(e) => onStartResize(e, w.id)}
            style={{ position: 'absolute', right: -6, bottom: -6, width: 16, height: 16, borderRadius: 4, background: 'var(--color-accent)', border: '2px solid var(--color-bg)', cursor: 'nwse-resize' }}
          />
        </React.Fragment>
      )}
    </div>
  );
}

function EditCanvas() {
  const [editing, setEditing] = useState(true);
  const [snap, setSnap] = useState(true);
  const [widgets, setWidgets] = useState(() => window.DNDEdit.initial.map((w) => ({ ...w, props: { ...w.props } })));
  const [selectedId, setSelectedId] = useState('w1');
  const [palette, setPalette] = useState(false);
  const dragRef = useRef(null);

  const patch = useCallback((id, p) => setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w))), []);
  const setProp = useCallback((id, k, v) => setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, props: { ...w.props, [k]: v } } : w))), []);

  const onMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const g = d.g;
    const sn = (n) => Math.round(n / g) * g;
    if (d.mode === 'move') {
      patch(d.id, { x: Math.max(0, sn(d.ox + e.clientX - d.sx)), y: Math.max(0, sn(d.oy + e.clientY - d.sy)) });
    } else {
      patch(d.id, { w: Math.max(180, sn(d.ow + e.clientX - d.sx)), h: Math.max(120, sn(d.oh + e.clientY - d.sy)) });
    }
  }, [patch]);
  const onUp = useCallback(() => { dragRef.current = null; document.body.style.userSelect = ''; }, []);

  useEffect(() => {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [onMove, onUp]);

  const startMove = (e, id) => {
    if (!editing) return;
    e.preventDefault();
    setSelectedId(id);
    document.body.style.userSelect = 'none';
    const w = widgets.find((x) => x.id === id);
    dragRef.current = { id, mode: 'move', sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y, g: snap ? window.DNDEdit.grid : 1 };
  };
  const startResize = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const w = widgets.find((x) => x.id === id);
    dragRef.current = { id, mode: 'resize', sx: e.clientX, sy: e.clientY, ow: w.w, oh: w.h, g: snap ? window.DNDEdit.grid : 1 };
  };

  const addWidget = (type) => {
    const m = window.DNDEdit.types[type];
    const id = uid();
    setWidgets((ws) => [...ws, { id, type, title: m.label, vis: m.tier === 'core' ? 'dm' : 'shared', x: 40, y: 40, w: m.w, h: m.h, props: { ...m.defaults } }]);
    setSelectedId(id);
    setPalette(false);
  };
  const removeWidget = (id) => { setWidgets((ws) => ws.filter((w) => w.id !== id)); setSelectedId(null); };
  const duplicateWidget = (id) => {
    const src = widgets.find((w) => w.id === id);
    const nid = uid();
    setWidgets((ws) => [...ws, { ...src, id: nid, title: src.title + ' copy', x: src.x + 24, y: src.y + 24, props: { ...src.props } }]);
    setSelectedId(nid);
  };

  const selected = widgets.find((w) => w.id === selectedId);
  const showInspector = editing && selected;

  return (
    <div data-theme="tavern" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)', fontFamily: 'var(--font-sans)' }}>
      <Toolbar editing={editing} snap={snap} onSnap={setSnap} onAdd={() => setPalette(true)} onToggle={() => { setEditing((v) => !v); setSelectedId(null); }} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div onPointerDown={(e) => { if (e.target === e.currentTarget || e.target.dataset.canvas) setSelectedId(null); }}
          data-canvas="1"
          style={{ position: 'relative', flex: 1, overflow: 'auto', padding: 'var(--space-5)', backgroundColor: 'var(--color-bg)', backgroundImage: editing ? 'radial-gradient(var(--color-border-strong) 1px, transparent 1px)' : 'none', backgroundSize: '20px 20px', backgroundPosition: 'var(--space-5) var(--space-5)' }}>
          <div data-canvas="1" style={{ position: 'relative', minWidth: 940, minHeight: 600, width: 'max-content', height: 'max-content' }}>
            {widgets.map((w) => (
              <Frame key={w.id} w={w} editing={editing} selected={editing && w.id === selectedId}
                onSelect={setSelectedId} onStartMove={startMove} onStartResize={startResize} />
            ))}
          </div>
        </div>

        {showInspector && (
          <window.Inspector w={selected}
            onChange={(p) => patch(selected.id, p)}
            onProp={(k, v) => setProp(selected.id, k, v)}
            onRemove={() => removeWidget(selected.id)}
            onDuplicate={() => duplicateWidget(selected.id)}
            onClose={() => setSelectedId(null)} />
        )}
      </div>

      {palette && <window.AddWidgetPalette onAdd={addWidget} onClose={() => setPalette(false)} />}
    </div>
  );
}

Object.assign(window, { EditCanvas });
