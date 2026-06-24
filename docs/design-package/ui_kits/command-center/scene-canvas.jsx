// scene-canvas.jsx — ONE canvas engine, two overflow POLICIES.
//   policy 'bounded' (Command Center): scales to fit width, scrolls vertically, optional fit-all.
//      No pan, no free zoom → glanceable + keyboard-first. This is the accessibility answer.
//   policy 'canvas'  (custom scenes): free pan + zoom, fit-to-view, minimap, off-screen markers.
// Same widgets, same edit interactions (move / resize / select) in both. Exposes window.SceneCanvas.
const CV = window.DNDToolsDesignSystem_8ae046;
const { useRef, useState, useEffect, useCallback, useLayoutEffect } = React;
const GRID = 20;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function bbox(widgets) {
  if (!widgets.length) return { x: 0, y: 0, w: 800, h: 600 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  widgets.forEach((w) => { x0 = Math.min(x0, w.x); y0 = Math.min(y0, w.y); x1 = Math.max(x1, w.x + w.w); y1 = Math.max(y1, w.y + w.h); });
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ── one widget on the canvas, with edit chrome ── */
function Frame({ w, editing, selected, scale, canMove, canResize, onSelect, onStartMove, onStartResize, onContext }) {
  const tierTag = { system: 'System · locked content', template: 'Template', custom: 'Custom', ai: 'AI' }[w.tier] || '';
  return (
    <div onContextMenu={(e) => { if (editing) { e.preventDefault(); e.stopPropagation(); onSelect(w.id, false); onContext(e.clientX, e.clientY, w.id); } }}
      style={{ position: 'absolute', left: w.x, top: w.y, width: w.w, height: w.h, borderRadius: 'var(--radius-md)', boxShadow: selected ? '0 0 0 2px var(--color-accent)' : 'none', transition: selected ? 'none' : 'box-shadow var(--duration-fast) var(--easing-standard)' }}>
      <div style={{ height: '100%', pointerEvents: editing ? 'none' : 'auto' }}><window.SceneWidget w={w} /></div>

      {editing && (
        <div
          onPointerDown={(e) => { e.stopPropagation(); onSelect(w.id, e.shiftKey); if (canMove) onStartMove(e, w.id); }}
          style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-md)', cursor: canMove ? 'grab' : 'pointer' }}
          onMouseEnter={(e) => { if (!selected) e.currentTarget.parentElement.style.boxShadow = '0 0 0 1px var(--color-border-strong)'; }}
          onMouseLeave={(e) => { if (!selected) e.currentTarget.parentElement.style.boxShadow = 'none'; }}
        />
      )}

      {editing && selected && (
        <React.Fragment>
          <div style={{ position: 'absolute', top: -26, left: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent)', color: 'var(--color-accent-foreground)', font: '600 var(--text-2xs) var(--font-sans)', whiteSpace: 'nowrap', pointerEvents: 'none', transform: `scale(${1 / scale})`, transformOrigin: 'bottom left' }}>
            <CV.Icon name={canMove ? 'move' : 'lock'} size={11} />{w.title}
            <span style={{ opacity: 0.8, fontWeight: 500 }}>· {tierTag}</span>
          </div>
          {canResize && (
            <div onPointerDown={(e) => { e.stopPropagation(); onStartResize(e, w.id); }}
              style={{ position: 'absolute', right: -5, bottom: -5, width: 14, height: 14, borderRadius: 4, background: 'var(--color-accent)', border: '2px solid var(--color-bg)', cursor: 'nwse-resize', transform: `scale(${1 / scale})`, transformOrigin: 'bottom right' }} />
          )}
        </React.Fragment>
      )}
    </div>
  );
}

function Grid({ show, on }) {
  if (!show) return null;
  return <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(var(--color-border${on ? '-strong' : ''}) 1px, transparent 1px)`, backgroundSize: GRID + 'px ' + GRID + 'px', pointerEvents: 'none' }} />;
}

function SceneCanvas({ scene, policy: policyProp, view, onView, editing, snap, selectedIds, onSelect, onMutate, onContext, onBeginInteract, registerApi }) {
  const policy = policyProp || scene.policy;
  const selSet = selectedIds || [];
  const wrapRef = useRef(null);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const [vp, setVp] = useState({ w: 1000, h: 700 });

  // track viewport size
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const box = bbox(scene.widgets);
  const PAD = 80;
  const contentW = box.x + box.w + PAD;
  const contentH = box.y + box.h + PAD;

  // bounded fit-width scale (+ fit-all when view.fit)
  const fitW = Math.min(1, (vp.w - 48) / contentW);
  const fitAll = Math.min(fitW, (vp.h - 48) / contentH);
  const bScale = policy === 'bounded' ? (view.fit ? fitAll : fitW) : 1;
  const scale = policy === 'bounded' ? bScale : (view.scale || 1);
  const tx = policy === 'bounded' ? 0 : view.tx;
  const ty = policy === 'bounded' ? 0 : view.ty;

  /* ── imperative API for the toolbar (canvas policy) ── */
  useEffect(() => {
    if (!registerApi) return;
    const center = (s) => {
      const b = bbox(scene.widgets);
      return { tx: vp.w / 2 - (b.x + b.w / 2) * s, ty: vp.h / 2 - (b.y + b.h / 2) * s, scale: s };
    };
    registerApi({
      fit: () => { const b = bbox(scene.widgets); const s = clamp(Math.min((vp.w - 80) / b.w, (vp.h - 80) / b.h), 0.3, 1.4); onView(center(s)); },
      reset: () => onView(center(1)),
      zoomIn: () => onView({ ...view, ...zoomAt(vp.w / 2, vp.h / 2, 1.2) }),
      zoomOut: () => onView({ ...view, ...zoomAt(vp.w / 2, vp.h / 2, 1 / 1.2) }),
    });
  });

  const zoomAt = (cx, cy, factor) => {
    const s0 = view.scale || 1;
    const s1 = clamp(s0 * factor, 0.3, 2.2);
    const wx = (cx - view.tx) / s0, wy = (cy - view.ty) / s0;
    return { tx: cx - wx * s1, ty: cy - wy * s1, scale: s1 };
  };

  /* ── pan + wheel (canvas only) ── */
  const onWheel = useCallback((e) => {
    if (policy !== 'canvas') return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const r = wrapRef.current.getBoundingClientRect();
      onView({ ...view, ...zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1) });
    } else {
      onView({ ...view, tx: view.tx - e.deltaX, ty: view.ty - e.deltaY });
    }
  }, [policy, view]);

  const onBgDown = (e) => {
    onSelect(null, false);
    if (policy !== 'canvas') return;
    dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
    document.body.style.userSelect = 'none';
    wrapRef.current.style.cursor = 'grabbing';
  };

  const startMove = (e, id) => {
    onBeginInteract && onBeginInteract();
    const group = selSet.includes(id) ? selSet : [id];
    const items = group.map((gid) => { const gw = scene.widgets.find((x) => x.id === gid); return { id: gid, ox: gw.x, oy: gw.y }; });
    dragRef.current = { mode: 'move', items, sx: e.clientX, sy: e.clientY };
    document.body.style.userSelect = 'none';
  };
  const startResize = (e, id) => {
    onBeginInteract && onBeginInteract();
    const w = scene.widgets.find((x) => x.id === id);
    dragRef.current = { mode: 'resize', id, sx: e.clientX, sy: e.clientY, ow: w.w, oh: w.h };
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current; if (!d) return;
      if (d.mode === 'pan') { onView({ ...view, tx: d.tx + e.clientX - d.sx, ty: d.ty + e.clientY - d.sy }); return; }
      const dx = (e.clientX - d.sx) / scale, dy = (e.clientY - d.sy) / scale;
      const sn = (n) => (snap ? Math.round(n / GRID) * GRID : Math.round(n));
      if (d.mode === 'move') d.items.forEach((it) => onMutate(it.id, { x: Math.max(0, sn(it.ox + dx)), y: Math.max(0, sn(it.oy + dy)) }));
      else onMutate(d.id, { w: Math.max(180, sn(d.ow + dx)), h: Math.max(120, sn(d.oh + dy)) });
    };
    const up = () => { dragRef.current = null; document.body.style.userSelect = ''; if (wrapRef.current) wrapRef.current.style.cursor = policy === 'canvas' ? 'grab' : 'default'; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [view, scale, snap, policy, scene.widgets]);

  const frames = scene.widgets.map((w) => {
    const canMove = editing;
    const canResize = editing && w.tier !== 'system'; // system widgets are move-only
    return <Frame key={w.id} w={w} editing={editing} selected={editing && selSet.includes(w.id)} scale={scale}
      canMove={canMove} canResize={canResize} onSelect={onSelect} onStartMove={startMove} onStartResize={startResize} onContext={onContext} />;
  });

  const world = (
    <div data-bg="1" style={{ position: 'absolute', left: 0, top: 0, width: contentW, height: contentH, transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: '0 0' }}>
      <Grid show={editing} on />
      {frames}
    </div>
  );

  // ── BOUNDED: scrollable, centered, fit-to-width ──
  if (policy === 'bounded') {
    return (
      <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 0, background: 'var(--color-bg)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 50% -10%, rgba(224,176,111,.08), transparent 60%)', pointerEvents: 'none' }} />
        <div ref={scrollRef} onPointerDown={onBgDown} style={{ position: 'absolute', inset: 0, overflowY: view.fit ? 'hidden' : 'auto', overflowX: 'hidden' }}>
          <div style={{ width: contentW * scale, height: contentH * scale, margin: '0 auto', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: contentW, height: contentH, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <Grid show={editing} on />
              {frames}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CANVAS: pan + zoom, minimap, off-screen markers ──
  const offscreen = scene.widgets.map((w) => {
    const sx = w.x * scale + tx, sy = w.y * scale + ty, sw = w.w * scale, sh = w.h * scale;
    const out = sx + sw < 0 || sy + sh < 0 || sx > vp.w || sy > vp.h;
    if (!out) return null;
    const cx = clamp(sx + sw / 2, 24, vp.w - 24), cy = clamp(sy + sh / 2, 24, vp.h - 24);
    return { id: w.id, title: w.title, cx, cy, w };
  }).filter(Boolean);

  const goTo = (w) => onView({ ...view, tx: vp.w / 2 - (w.x + w.w / 2) * scale, ty: vp.h / 2 - (w.y + w.h / 2) * scale });

  // minimap geometry
  const mmW = 168, mmH = 116, mmPad = 8;
  const allB = bbox(scene.widgets);
  const mmScale = Math.min((mmW - mmPad * 2) / allB.w, (mmH - mmPad * 2) / allB.h);
  const mmX = (x) => mmPad + (x - allB.x) * mmScale;
  const mmY = (y) => mmPad + (y - allB.y) * mmScale;

  return (
    <div ref={wrapRef} onWheel={onWheel} onPointerDown={onBgDown}
      style={{ position: 'relative', flex: 1, minHeight: 0, background: 'var(--color-bg)', overflow: 'hidden', cursor: 'grab', touchAction: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 50% -10%, rgba(224,176,111,.06), transparent 60%)', pointerEvents: 'none' }} />
      {world}

      {/* off-screen markers */}
      {offscreen.map((o) => (
        <button key={o.id} type="button" onClick={() => goTo(o.w)} title={'Go to ' + o.title}
          style={{ position: 'absolute', left: o.cx, top: o.cy, transform: 'translate(-50%,-50%)', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 'var(--radius-full)', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-accent-border)', color: 'var(--color-text-primary)', font: '600 var(--text-2xs) var(--font-sans)', cursor: 'pointer', boxShadow: 'var(--shadow-md)', maxWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <CV.Icon name="atlas-map" size={11} color="var(--color-accent)" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</span>
        </button>
      ))}

      {/* minimap */}
      <div style={{ position: 'absolute', right: 16, bottom: 16, width: mmW, height: mmH, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-strong)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        {scene.widgets.map((w) => (
          <div key={w.id} onClick={() => goTo(w)} style={{ position: 'absolute', left: mmX(w.x), top: mmY(w.y), width: Math.max(4, w.w * mmScale), height: Math.max(4, w.h * mmScale), borderRadius: 2, background: selSet.includes(w.id) ? 'var(--color-accent)' : w.tier === 'system' ? 'var(--color-text-tertiary)' : 'var(--color-border-strong)', cursor: 'pointer' }} />
        ))}
        {/* viewport rect */}
        <div style={{ position: 'absolute', left: mmX((-tx) / scale), top: mmY((-ty) / scale), width: (vp.w / scale) * mmScale, height: (vp.h / scale) * mmScale, border: '1.5px solid var(--color-accent)', borderRadius: 2, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

Object.assign(window, { SceneCanvas });
