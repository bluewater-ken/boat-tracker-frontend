import { useState, useEffect, useRef } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import './GanttChart.css';

// Timeline — the self-maintaining production Gantt (see TIMELINE_SPEC.md).
// The backend projector computes everything (norms, cascade, fills, waits); this component
// just draws the payload and handles Ken's controls: draft-mode row drag (Save/Discard),
// pins & holds, target diamonds, slots. Degrades to a notice until the backend brief runs.

const DAY = 86400000;
const parseD = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00');
const fmtShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const daysBetween = (a, b) => Math.round((b - a) / DAY) + 1;

const STAGE_COLOR = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('glass')) return '#D8443F';
  if (n.includes('back')) return '#E89A2B';
  if (n.includes('front')) return '#D6B33A';
  if (n.includes('qc') || n.includes('quality')) return '#3A8BB0';
  return '#2E92D6';
};

// Projected delivery + on-pace/behind, surfaced in the sticky left column so the
// key status reads without scrolling out to the end of the bars.
function deliveryStatus(g) {
  const segs = g.segments || [];
  const projStr = g.projected_end || (segs.length ? segs[segs.length - 1].end : null);
  if (!projStr) return null;
  const proj = fmtShort(parseD(projStr));
  if (!g.target_date) return <span className="gantt-deliv"><span className="gantt-deliv-arrow">→</span> {proj} <span className="gantt-deliv-muted">· no target</span></span>;
  if (g.behind_days > 0) return <span className="gantt-deliv"><span className="gantt-deliv-arrow">→</span> {proj} <b className="gantt-behindtag">· ▲ {g.behind_days}d behind</b></span>;
  return <span className="gantt-deliv"><span className="gantt-deliv-arrow">→</span> {proj} <span className="gantt-onpace">· on pace</span></span>;
}

function GanttChart() {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';

  const [data, setData] = useState(null);     // saved payload (null = backend not set up)
  const [preview, setPreview] = useState(null); // draft payload from POST /preview
  const [draft, setDraft] = useState(null);   // draft order (array of keys) | null
  const [previewFailed, setPreviewFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState('weeks');
  const [open, setOpen] = useState({});
  const [dragKey, setDragKey] = useState(null);
  const [editor, setEditor] = useState(null); // {type:'pin'|'target'|'slot', ...}
  const [colW, setColW] = useState(() => {
    const v = +localStorage.getItem('gantt_colw');
    return v >= 150 && v <= 520 ? v : 260;
  });
  const [segDrag, setSegDrag] = useState(null); // live bar-drag: {gkey, name, mode, dDays}
  const scrollRef = useRef(null);
  const didAutoScroll = useRef(false);
  const panRef = useRef({ suppress: false }); // suppress the click a pan-drag would fire

  // Hand-pan: dragging empty chart space (not a bar/handle) pans the view. No toggle
  // — grab-drag on the lanes; a real drag suppresses the click so it won't also
  // toggle a row.
  const beginPan = (e) => {
    const el = scrollRef.current;
    if (!el || e.button !== 0) return;
    const t = e.target;
    if (!t.closest('.gantt-lane')) return;            // only from the chart area
    if (t.closest('.gantt-bar, .gantt-rsz')) return;  // bars own their drags
    const x0 = e.clientX, y0 = e.clientY, sl = el.scrollLeft, st = el.scrollTop;
    let moved = false;
    el.classList.add('panning');
    const onMove = (ev) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      el.scrollLeft = sl - dx; el.scrollTop = st - dy;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.classList.remove('panning');
      if (moved) { panRef.current.suppress = true; setTimeout(() => { panRef.current.suppress = false; }, 0); }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    init();
    const t = setInterval(() => { if (!draftRef.current) init(true); }, 60000);
    return () => clearInterval(t);
  }, []);
  const draftRef = useRef(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const init = async (quiet) => {
    try {
      if (!quiet) setLoading(true);
      const r = await apiFetch('/api/timeline').catch(() => null);
      setData(r && r.ok ? await r.json() : null);
    } finally { if (!quiet) setLoading(false); }
  };

  // ---------- draft mode ----------
  const runPreview = async (order) => {
    try {
      const r = await apiFetch('/api/timeline/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      if (!r.ok) throw new Error();
      const p = await r.json();
      if (!p || !Array.isArray(p.groups)) throw new Error(); // demo-mode fake OK etc.
      setPreview(p); setPreviewFailed(false);
    } catch { setPreview(null); setPreviewFailed(true); }
  };
  const startDrop = (targetKey) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    const order = shownGroups().map(g => g.key);
    const from = order.indexOf(dragKey), to = order.indexOf(targetKey);
    if (from < 0 || to < 0) { setDragKey(null); return; }
    order.splice(to, 0, order.splice(from, 1)[0]);
    setDragKey(null);
    setDraft(order);
    runPreview(order);
  };
  const saveDraft = async () => {
    try {
      const r = await apiFetch('/api/timeline/order', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: draft }),
      });
      if (!r.ok) throw new Error();
      setDraft(null); setPreview(null); setPreviewFailed(false);
      init(true);
    } catch { alert('Failed to save the new order.'); }
  };
  const discardDraft = () => { setDraft(null); setPreview(null); setPreviewFailed(false); init(true); };

  // ---------- editors ----------
  const guardDraft = () => {
    if (draft) { alert('Save or discard your draft order first.'); return true; }
    return false;
  };
  const saveTarget = async () => {
    try {
      const r = await apiFetch(`/api/timeline/target/${encodeURIComponent(editor.key)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_date: editor.date || null }),
      });
      if (!r.ok) throw new Error();
      setEditor(null); init(true);
    } catch { alert('Failed to save target.'); }
  };
  const savePin = async () => {
    const e = editor;
    if (!e.end) { alert('End date is required.'); return; }
    if (e.kind === 'pin' && (!e.start || e.end < e.start)) { alert('Check the dates.'); return; }
    try {
      const r = await apiFetch('/api/timeline/pins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_key: e.key, stage: e.stage, kind: e.kind, start_date: e.kind === 'pin' ? e.start : null, end_date: e.end }),
      });
      if (!r.ok) throw new Error();
      setEditor(null); init(true);
    } catch { alert('Failed to save pin.'); }
  };
  const unpin = async (pinId) => {
    try {
      const r = await apiFetch(`/api/timeline/pins/${pinId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      setEditor(null); init(true);
    } catch { alert('Failed to unpin.'); }
  };
  const addSlot = async () => {
    if (!editor.title?.trim()) return;
    try {
      const r = await apiFetch('/api/timeline/slots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editor.title.trim(), model: editor.model || null }),
      });
      if (!r.ok) throw new Error();
      setEditor(null); init(true);
    } catch { alert('Failed to add slot.'); }
  };
  const deleteSlot = async (key) => {
    if (!window.confirm('Remove this planning slot?')) return;
    try {
      const r = await apiFetch(`/api/timeline/slots/${key.replace('slot:', '')}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      init(true);
    } catch { alert('Failed to remove slot.'); }
  };

  // ---------- first-column resize (drag the handle on the "Boat" header edge) ----------
  const beginColResize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = colW;
    const clamp = (v) => Math.max(150, Math.min(520, v));
    const onMove = (ev) => setColW(clamp(w0 + ev.clientX - x0));
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      localStorage.setItem('gantt_colw', String(clamp(w0 + ev.clientX - x0)));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (loading) return <div className="loading">Loading timeline...</div>;

  if (!data || !Array.isArray(data.groups)) {
    return (
      <div className="gantt-empty-state">
        <h2>Timeline</h2>
        <p>The scheduling engine isn't on the server yet. Run <b>BACKEND_TIMELINE_BRIEF.md</b> in a server
        session — it builds the projector, imports your monday.com plan, and this tab lights up with every
        boat's learned, self-updating schedule.</p>
      </div>
    );
  }

  const payload = (draft && preview) ? preview : data;
  const byKey = {}; for (const g of payload.groups) byKey[g.key] = g;
  const shownGroups = () => {
    if (draft) return draft.map(k => byKey[k]).filter(Boolean);
    return [...payload.groups].sort((a, b) => (a.queue_pos ?? 999) - (b.queue_pos ?? 999));
  };
  const groups = shownGroups();

  // ---------- axis ----------
  const today = parseD(payload.today || new Date().toISOString());
  let min = today, max = today;
  for (const g of groups) for (const s of (g.segments || [])) {
    const a = parseD(s.start), b = parseD(s.end);
    if (a < min) min = a;
    if (b > max) max = b;
  }
  for (const g of groups) if (g.target_date) { const t = parseD(g.target_date); if (t > max) max = t; }
  min = new Date(min.getTime() - 7 * DAY);
  max = new Date(max.getTime() + 14 * DAY);
  min = new Date(min.getTime() - ((min.getDay() + 6) % 7) * DAY); // snap to Monday

  const px = zoom === 'weeks' ? 11 : 3.2;
  const width = (Math.round((max - min) / DAY) + 1) * px;
  const x = (dstr) => Math.round((parseD(dstr) - min) / DAY) * px;
  const w = (s, e) => Math.max(px, (Math.round((parseD(e) - parseD(s)) / DAY) + 1) * px);
  const todayX = Math.round((today - min) / DAY) * px;

  // ---------- drag a bar to change its dates (saved as a pin) ----------
  const openPinEditor = (g, s) => {
    setEditor(s.pin_id
      ? { type: 'pin', key: g.key, stage: s.name, kind: s.kind === 'hold' ? 'hold' : 'pin', start: String(s.start).slice(0, 10), end: String(s.end).slice(0, 10), pin_id: s.pin_id, note: s.duration_note }
      : { type: 'pin', key: g.key, stage: s.name, kind: 'pin', start: String(s.start).slice(0, 10), end: String(s.end).slice(0, 10), note: s.duration_note });
  };
  const shiftDate = (dstr, n) => {
    const d = parseD(dstr); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  // mode 'move' slides the whole bar; 'resize' drags the end date only.
  const beginSegDrag = (e, g, s, mode) => {
    e.preventDefault(); e.stopPropagation();
    const info = { x0: e.clientX, moved: false };
    const onMove = (ev) => {
      const dx = ev.clientX - info.x0;
      if (Math.abs(dx) > 3) info.moved = true;
      setSegDrag({ gkey: g.key, name: s.name, mode, dDays: Math.round(dx / px) });
    };
    const onUp = async (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const dDays = Math.round((ev.clientX - info.x0) / px);
      const wasMoved = info.moved;
      setSegDrag(null);
      if (guardDraft()) return;
      if (!wasMoved) { openPinEditor(g, s); return; } // a plain click still opens the date popup
      if (dDays === 0) return;
      let start = String(s.start).slice(0, 10), end = String(s.end).slice(0, 10);
      if (mode === 'move') { start = shiftDate(start, dDays); end = shiftDate(end, dDays); }
      else { end = shiftDate(end, dDays); if (end < start) end = start; }
      try {
        const r = await apiFetch('/api/timeline/pins', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_key: g.key, stage: s.name, kind: 'pin', start_date: start, end_date: end }),
        });
        if (!r.ok) throw new Error();
        init(true);
      } catch { alert('Failed to save the new dates.'); init(true); }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Quarter row (top): Q1–Q4 + year, spanning three months each.
  const quarters = [];
  { let d = new Date(min);
    while (d <= max) {
      const q = Math.floor(d.getMonth() / 3);
      const qEnd = new Date(d.getFullYear(), q * 3 + 3, 0);
      const end = qEnd < max ? qEnd : max;
      quarters.push({ label: `Q${q + 1} ${d.getFullYear()}`, days: Math.round((end - d) / DAY) + 1 });
      d = new Date(d.getFullYear(), q * 3 + 3, 1);
    } }
  // Month row: month name only (year lives on the quarter row above).
  const months = [];
  { let d = new Date(min);
    while (d <= max) {
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const end = mEnd < max ? mEnd : max;
      months.push({ label: d.toLocaleDateString('en-US', { month: 'long' }), days: Math.round((end - d) / DAY) + 1 });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    } }
  // Week row (weeks zoom): labelled by each week's END date (Sunday).
  const weeks = [];
  if (zoom === 'weeks') { let d = new Date(min); while (d <= max) { weeks.push(fmtShort(new Date(d.getTime() + 6 * DAY))); d = new Date(d.getTime() + 7 * DAY); } }

  // Vertical gridlines: light weekly (weeks zoom), medium at month starts, heavy at quarters.
  const gridLines = [];
  if (zoom === 'weeks') {
    const totalDays = Math.round((max - min) / DAY);
    for (let j = 1; j * 7 <= totalDays; j++) gridLines.push({ left: j * 7 * px, cls: 'w' });
  }
  { let cum = 0;
    months.forEach((m, i) => {
      if (i > 0) {
        const d = new Date(min.getTime() + cum * DAY);
        gridLines.push({ left: Math.round(cum * px), cls: d.getMonth() % 3 === 0 ? 'q' : 'm' });
      }
      cum += m.days;
    }); }

  setTimeout(() => {
    if (!didAutoScroll.current && scrollRef.current) {
      didAutoScroll.current = true;
      scrollRef.current.scrollLeft = Math.max(0, todayX - 12 * px - 250);
    }
  }, 0);

  const toggle = (k) => setOpen(p => ({ ...p, [k]: !p[k] }));

  // ---------- segment renderer ----------
  const segBar = (g, s) => {
    const color = STAGE_COLOR(s.name);
    let left = x(s.start), wd = w(s.start, s.end);
    // Live preview while dragging this bar.
    const dm = segDrag && segDrag.gkey === g.key && segDrag.name === s.name ? segDrag : null;
    if (dm) {
      if (dm.mode === 'move') left += dm.dDays * px;
      else wd = Math.max(px, wd + dm.dDays * px);
    }
    const editable = isOps && g.kind !== 'slot';
    // Body drag slides the WHOLE bar (length kept, dates shift); the right-edge
    // handle changes the end date (length). Both save as a pin. Actual (past)
    // bars: end-edge drag only — the recorded start stays put.
    const canDrag = editable && s.kind !== 'hold' && s.kind !== 'actual';
    const endOnly = editable && s.kind === 'actual';
    const title = `${s.name}: ${String(s.start).slice(0, 10)} → ${String(s.end).slice(0, 10)}${s.duration_note ? ` · ${s.duration_note}` : ''}${s.fill_note ? ` · ${s.fill_note}` : ''}${canDrag ? ' · drag bar = shift dates · drag right edge = change length' : endOnly ? ' · drag right edge = adjust end date' : ''}`;
    const bodyDown = canDrag ? (e) => beginSegDrag(e, g, s, 'move') : undefined;
    const holdClick = (e) => { e.stopPropagation(); if (!editable || guardDraft()) return; openPinEditor(g, s); };
    const rsz = (canDrag || endOnly) && <span className="gantt-rsz" onPointerDown={(e) => beginSegDrag(e, g, s, 'resize')} title="Drag to change the end date" />;
    const dragCls = canDrag ? 'draggable' : endOnly ? 'resizable' : '';
    if (s.kind === 'hold') {
      return <div key={s.name + s.start} className={`gantt-bar gantt-hold ${editable ? 'clickable' : ''}`} style={{ left, width: wd }} title={title} onClick={holdClick}><span className="gantt-pinmark">📌</span></div>;
    }
    if (s.kind === 'projected') {
      return <div key={s.name + s.start} className={`gantt-bar gantt-proj ${dragCls} ${dm ? 'dragging' : ''}`} style={{ left, width: wd, borderColor: color }} title={title} onPointerDown={bodyDown}>{rsz}</div>;
    }
    if (s.kind === 'current') {
      return (
        <div key={s.name + s.start} className={`gantt-bar gantt-current ${dragCls} ${dm ? 'dragging' : ''}`} style={{ left, width: wd, borderColor: color }} title={title} onPointerDown={bodyDown}>
          <div className="gantt-fill" style={{ width: `${s.fill_pct ?? 0}%`, background: color }} />
          {rsz}
        </div>
      );
    }
    // actual or pinned
    return (
      <div key={s.name + s.start} className={`gantt-bar gantt-solid ${dragCls} ${dm ? 'dragging' : ''}`} style={{ left, width: wd, background: color, filter: s.kind === 'pinned' ? 'brightness(0.82)' : 'none' }} title={title} onPointerDown={bodyDown}>
        {s.kind === 'pinned' && <span className="gantt-pinmark">📌</span>}
        {rsz}
      </div>
    );
  };

  const waitEl = (s, prevEnd) => {
    if (!s.wait_before_days || !prevEnd) return null;
    const left = x(prevEnd) + w(prevEnd, prevEnd);
    const wd = Math.max(2, x(s.start) - left);
    return (
      <div key={'w' + s.name + s.start}>
        <div className="gantt-wait" style={{ left, width: wd }} />
        <span className="gantt-waitlabel" style={{ left }}>waits {s.wait_before_days}d{s.wait_reason ? ` (${s.wait_reason})` : ''}</span>
      </div>
    );
  };

  const groupSummary = (g) => {
    const segs = g.segments || [];
    if (!segs.length) return null;
    const gs = segs[0].start, ge = segs[segs.length - 1].end;
    const behind = g.behind_days != null && g.behind_days > 0;
    return (
      <>
        <div className="gantt-bar gantt-sum" style={{ left: x(gs), width: w(gs, ge) }} />
        {behind && g.target_date && (
          <div className="gantt-behind" style={{ left: x(g.target_date), width: Math.max(4, x(g.projected_end || ge) - x(g.target_date)) }} />
        )}
        {g.target_date && <div className="gantt-diamond" style={{ left: x(g.target_date) }} title={`Target delivery ${String(g.target_date).slice(0, 10)}`} />}
        <span className="gantt-sumlabel" style={{ left: Math.max(x(ge), g.target_date ? x(g.target_date) : 0) + 18 }}>
          {daysBetween(parseD(gs), parseD(ge))}d
        </span>
      </>
    );
  };

  return (
    <div className="gantt" style={{ '--gcol': colW + 'px' }}>
      <div className="gantt-scroll" ref={scrollRef} onPointerDown={beginPan}>
        <div className="gantt-toolbar">
          <div className="gantt-zoom">
            <button className={zoom === 'weeks' ? 'on' : ''} onClick={() => setZoom('weeks')}>Weeks</button>
            <button className={zoom === 'months' ? 'on' : ''} onClick={() => setZoom('months')}>Months</button>
          </div>
          <button className="gantt-expandall"
            onClick={() => {
              const allOpen = groups.length > 0 && groups.every(g => open[g.key]);
              setOpen(allOpen ? {} : Object.fromEntries(groups.map(g => [g.key, true])));
            }}>
            {groups.length > 0 && groups.every(g => open[g.key]) ? '⌃ Collapse all' : '⌄ Expand all'}
          </button>
          {!draft && <span className="gantt-note">{isOps ? 'Drag ⠿ to test a new build order · drag a bar to shift dates, its right edge to change length · ◆ = target.' : 'Solid = done, shaded = work complete, dashed = projected. ◆ = target.'}</span>}
          {draft && (
            <div className="gantt-draftbar">
              🧪 Draft order — nothing saved{previewFailed ? ' (preview unavailable — dates show the saved order)' : ''}.
              <button className="gantt-draft-save" onClick={saveDraft}>Save order</button>
              <button className="gantt-draft-discard" onClick={discardDraft}>Discard</button>
            </div>
          )}
          {isOps && !draft && <button className="gantt-addgroup" onClick={() => setEditor({ type: 'slot', title: '', model: '' })}>+ Add boat / slot</button>}
        </div>

        <div className="gantt-inner">
          <div className="gantt-grid" style={{ left: colW, width }}>
            {gridLines.map((l, i) => <div key={i} className={`gantt-gl ${l.cls}`} style={{ left: l.left }} />)}
          </div>
          <div className="gantt-row gantt-quarterrow">
            <div className="gantt-left gantt-headleft">Boat
              <span className="gantt-colresize" onPointerDown={beginColResize} title="Drag to resize this column" />
            </div>
            <div className="gantt-lane gantt-headlane" style={{ width }}>
              {quarters.map((q, i) => <div key={i} className="gantt-quarter" style={{ width: q.days * px }}>{q.label}</div>)}
              <div className="gantt-todaymark" style={{ left: todayX }}>Today</div>
            </div>
          </div>
          <div className="gantt-row gantt-monthrow">
            <div className="gantt-left gantt-headleft" />
            <div className="gantt-lane gantt-headlane" style={{ width }}>
              {months.map((m, i) => <div key={i} className="gantt-month" style={{ width: m.days * px }}>{m.label}</div>)}
            </div>
          </div>
          {zoom === 'weeks' && (
            <div className="gantt-row gantt-weekrow">
              <div className="gantt-left gantt-headleft" />
              <div className="gantt-lane gantt-headlane" style={{ width }}>
                {weeks.map((label, i) => <div key={i} className="gantt-week" style={{ width: 7 * px }}>{label}</div>)}
              </div>
            </div>
          )}

          {groups.map(g => {
            const isOpen = !!open[g.key];
            const rows = [];
            rows.push(
              <div key={g.key} className={`gantt-row gantt-grouprow ${dragKey === g.key ? 'dragging' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => startDrop(g.key)}
                onClick={() => { if (panRef.current.suppress) return; toggle(g.key); }}>
                <div className="gantt-left gantt-grouphead">
                  {isOps && <span className="gantt-grip" title="Drag to test a new build order" draggable
                    onDragStart={(e) => { e.stopPropagation(); setDragKey(g.key); }}
                    onDragEnd={() => setDragKey(null)}
                    onClick={(e) => e.stopPropagation()}>⠿</span>}
                  <span className={`gantt-chev ${isOpen ? 'open' : ''}`}>▸</span>
                  <div className="gantt-gmeta">
                    <div className="gantt-gline1">
                      <span className="gantt-gtitle" title={g.title}>{g.title}</span>
                      {isOps && g.kind === 'boat' && (
                        <button className="gantt-targetbtn" title="Set target delivery" onClick={(e) => { e.stopPropagation(); if (guardDraft()) return; setEditor({ type: 'target', key: g.key, title: g.title, date: g.target_date ? String(g.target_date).slice(0, 10) : '' }); }}>◆</button>
                      )}
                      {isOps && g.kind === 'slot' && (
                        <button className="gantt-slotdel" title="Remove slot" onClick={(e) => { e.stopPropagation(); if (guardDraft()) return; deleteSlot(g.key); }}>✕</button>
                      )}
                    </div>
                    <div className="gantt-gline2">
                      {g.kind === 'slot'
                        ? <span className="gantt-slottag">plan only{g.model ? ` · ${g.model}` : ''}</span>
                        : <>
                            <span className="gantt-gsub">{g.model}{g.hull_color ? ` · ${g.hull_color}` : ''}</span>
                            {deliveryStatus(g)}
                          </>}
                    </div>
                  </div>
                </div>
                <div className="gantt-lane gantt-grouplane" style={{ width }}>
                  <div className="gantt-todayline" style={{ left: todayX }} />
                  {groupSummary(g)}
                </div>
              </div>
            );
            if (isOpen) {
              (g.segments || []).forEach((s, i) => {
                const prev = i > 0 ? g.segments[i - 1] : null;
                rows.push(
                  <div key={`${g.key}-${s.name}-${s.start}`} className="gantt-row gantt-taskrow">
                    <div className={`gantt-left gantt-taskleft ${isOps && g.kind !== 'slot' ? 'clickable' : ''}`}
                      title={isOps && g.kind !== 'slot' ? 'Click to edit dates (pin / hold)' : undefined}
                      onClick={() => { if (!isOps || g.kind === 'slot' || guardDraft()) return; openPinEditor(g, s); }}>
                      <span className="gantt-tname">
                        {s.name}{s.kind === 'pinned' ? ' 📌' : s.kind === 'hold' ? ' (hold) 📌' : ''}
                        <span className="gantt-tdates">
                          {fmtShort(parseD(s.start))} – {fmtShort(parseD(s.end))}
                          {s.kind === 'actual' ? ' · actual' : s.kind === 'current' ? (s.fill_note ? ` · ${s.fill_note}` : '') : s.kind === 'projected' ? ' · projected' : ''}
                          {s.duration_note ? ` · ${s.duration_note}` : ''}
                        </span>
                      </span>
                    </div>
                    <div className="gantt-lane" style={{ width }}>
                      <div className="gantt-todayline" style={{ left: todayX }} />
                      {waitEl(s, prev ? prev.end : null)}
                      {segBar(g, s)}
                      {s.kind === 'current' && s.fill_note && <span className="gantt-filllabel" style={{ left: x(s.start) + w(s.start, s.end) + 8 }}>{s.fill_note}{s.fill_pct != null ? ` · ${s.fill_pct}%` : ''}</span>}
                    </div>
                  </div>
                );
              });
            }
            return rows;
          })}
          {groups.length === 0 && <div className="gantt-nogroups">Nothing to schedule yet.</div>}
        </div>
        <div className="gantt-legend">
          <span><i className="sw" style={{ background: '#E89A2B' }} />Actual</span>
          <span><i className="sw swfill" />Current — fill = work done</span>
          <span><i className="sw swproj" />Projected</span>
          <span>📌 Pinned / hold</span>
          <span><i className="sw swdiamond" /> Target delivery</span>
          <span><i className="sw swbehind" /><b className="gantt-behindtag">Behind target</b></span>
          <span className="gantt-legend-note">Norms learn from real history per model — see Admin → Timeline.</span>
        </div>
      </div>

      {editor && (
        <div className="gantt-edbackdrop" onClick={() => setEditor(null)}>
          <div className="gantt-editor" onClick={(e) => e.stopPropagation()}>
            {editor.type === 'target' && (
              <>
                <div className="gantt-ed-title">Target delivery — {editor.title}</div>
                <label>Target date
                  <input type="date" value={editor.date} onChange={e => setEditor(p => ({ ...p, date: e.target.value }))} autoFocus />
                </label>
                <div className="gantt-ed-actions">
                  {editor.date && <button className="gantt-ed-del" onClick={() => { setEditor(p => ({ ...p, date: '' })); }}>Clear</button>}
                  <span style={{ flex: 1 }} />
                  <button className="gantt-ed-cancel" onClick={() => setEditor(null)}>Cancel</button>
                  <button className="gantt-ed-save" onClick={saveTarget}>Save</button>
                </div>
              </>
            )}
            {editor.type === 'pin' && (
              <>
                <div className="gantt-ed-title">{editor.stage} — {editor.pin_id ? 'pinned' : 'pin or hold'}</div>
                {editor.note && <div className="gantt-ed-note">Auto: {editor.note}</div>}
                <label>Type
                  <select value={editor.kind} onChange={e => setEditor(p => ({ ...p, kind: e.target.value }))}>
                    <option value="pin">Pin exact dates</option>
                    <option value="hold">Hold — nothing starts until…</option>
                  </select>
                </label>
                {editor.kind === 'pin' && (
                  <label>Start
                    <input type="date" value={editor.start} onChange={e => setEditor(p => ({ ...p, start: e.target.value }))} />
                  </label>
                )}
                <label>{editor.kind === 'hold' ? 'Hold until' : 'End'}
                  <input type="date" value={editor.end} onChange={e => setEditor(p => ({ ...p, end: e.target.value }))} />
                </label>
                <div className="gantt-ed-actions">
                  {editor.pin_id && <button className="gantt-ed-del" onClick={() => unpin(editor.pin_id)}>Unpin (back to auto)</button>}
                  <span style={{ flex: 1 }} />
                  <button className="gantt-ed-cancel" onClick={() => setEditor(null)}>Cancel</button>
                  <button className="gantt-ed-save" onClick={savePin}>Save</button>
                </div>
              </>
            )}
            {editor.type === 'slot' && (
              <>
                <div className="gantt-ed-title">Add boat / planning slot</div>
                <label>Title
                  <input value={editor.title} placeholder={'e.g. "28230 - Smith" or "25T0XX - Open"'} autoFocus
                    onChange={e => setEditor(p => ({ ...p, title: e.target.value }))} />
                </label>
                <label>Model
                  <select value={editor.model} onChange={e => setEditor(p => ({ ...p, model: e.target.value }))}>
                    <option value="">— pick —</option>
                    <option>23T</option><option>25T</option><option>2850</option><option>36</option>
                  </select>
                </label>
                <div className="gantt-ed-actions">
                  <span style={{ flex: 1 }} />
                  <button className="gantt-ed-cancel" onClick={() => setEditor(null)}>Cancel</button>
                  <button className="gantt-ed-save" onClick={addSlot}>Add</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GanttChart;
