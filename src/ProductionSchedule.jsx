import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import { FlagTags, SCHEDULE_FLAGS } from './flags';
import ActionMenu, { MenuBtn, MenuLabel, MenuToggle } from './ActionMenu';
import { applyDeliveredFilter, isDelivered, ShowDeliveredToggle, inProduction } from './boatFilter';
import useIsMobile from './useIsMobile';
import './ProductionSchedule.css';

const STATUSES = ['Backlog', 'Pre-Production', 'Glass Shop', 'Back Line', 'Front Line', 'QC', 'Delivered'];
// What the bar displays: the 7 real stages plus display-only trackers that are
// NOT statuses — Advance/Step back skip them and they're never "current".
// Consoles shows the Assembly tab's Console checklist % between BackL and Front.
const DISPLAY_SEGS = [
  { key: 'Backlog', label: 'Backlog', stage: true },
  { key: 'Pre-Production', label: 'Pre', stage: true },
  { key: 'Glass Shop', label: 'Glass', stage: true },
  { key: 'Back Line', label: 'Backline', stage: true },
  { key: 'Consoles', label: 'Console', stage: false },
  { key: 'Front Line', label: 'Front', stage: true },
  { key: 'QC', label: 'QC', stage: true },
  { key: 'Delivered', label: 'Done', stage: true },
];
// Stage bar fill colors, light → dark green by display position.
const GREEN_GRADIENT = ['#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A', '#4CAF50', '#43A047', '#388E3C', '#2E7D32'];
// Per-stage completion for the segmented bar. Real timeline fill_pct when the
// stage has a tracked source (Lamination / CompanyCam); otherwise stages before
// the current one count as done and later ones as not started.
const stagePct = (boat, stageIdx, stageName) => {
  const seg = boat.segments?.find(sg => sg.name === stageName);
  if (seg && seg.fill_pct != null) return { pct: seg.fill_pct, real: true };
  return { pct: STATUSES.indexOf(stageName) < stageIdx ? 100 : 0, real: false };
};

function ProductionSchedule({ refreshTrigger, onManageBoats, onShopReport }) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isOps = user?.role === 'ops';
  // On the phone (employee view) reordering and adding boats stay desktop-only — it's a
  // view + advance/step-back/flag tool. `canReorder` also gates the drag handle + Move up/down.
  const canReorder = isOps && !isMobile;
  const [boats, setBoats] = useState([]);
  // Per-boat display-only percentages: { console: %, parts: % } — Consoles pip
  // (Assembly Console checklist) and Pre-Production pip (Key Parts received).
  const [extras, setExtras] = useState({});
  const [loading, setLoading] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [showDelivered, setShowDelivered] = useState(false);
  const [menu, setMenu] = useState(null); // { boatId, x, y }

  useEffect(() => { fetchBoats(); }, [refreshTrigger]);

  const fetchBoats = async () => {
    try {
      setLoading(true);
      // Display-only extras load in parallel and never block the boat list:
      // any failure just leaves that pip on its fallback (empty / stage logic).
      const extrasReq = Promise.all([
        apiFetch('/api/assembly').then(r => r.ok ? r.json() : null).catch(() => null),
        apiFetch('/api/parts').then(r => r.ok ? r.json() : null).catch(() => null),
        apiFetch('/api/parts/standard').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      let boatsData;
      if (isMobile) {
        // Mobile: fetch from timeline to get per-stage fill_pct data.
        const tlRes = await apiFetch('/api/timeline');
        const tlData = await tlRes.json();
        // Map timeline groups back to boat format, keeping timeline segment data.
        boatsData = (tlData.groups || [])
          .filter(g => g.kind === 'boat')
          .map(g => ({
            boat_id: g.key,
            customer_name: g.customer_name,
            boat_model: g.title.split(' · ')[1] || '',
            hull_color: g.hull_color,
            global_status: g.status,
            sequence_number: g.queue_pos,
            segments: g.segments, // Timeline segments with fill_pct
            ...g,
          }));
      } else {
        // Desktop: use production schedule for the boat list, but also pull the
        // timeline so we can show per-stage fill_pct on the pips. /api/boats has
        // no segment data — without this merge, fillPct is always undefined and
        // the per-stage % never renders.
        const [res, tlRes] = await Promise.all([
          apiFetch('/api/boats'),
          apiFetch('/api/timeline').catch(() => null),
        ]);
        boatsData = await res.json();
        if (tlRes && tlRes.ok) {
          const tlData = await tlRes.json();
          const segByBoat = {};
          for (const g of (tlData.groups || [])) {
            if (g.kind === 'boat') segByBoat[g.key] = g.segments;
          }
          boatsData = boatsData.map(b => ({ ...b, segments: segByBoat[b.boat_id] }));
        }
      }
      setBoats(boatsData);
      const [asm, partRows, stdParts] = await extrasReq;
      const ex = {};
      // Consoles pip: the Assembly work center whose name matches /console/.
      const wc = asm?.work_centers?.find(w => /console/i.test(w.name || ''));
      if (wc) {
        for (const r of asm.rows || []) {
          if (r.work_center_id === wc.id && r.total_items) {
            (ex[r.boat_id] ||= {}).console = Math.round(100 * r.completed_items / r.total_items);
          }
        }
      }
      // Pre-Production pip: % of Key Parts received. Denominator matches the Key
      // Parts grid: standard parts + the boat's custom parts, EXCLUDING any marked N/A.
      if (Array.isArray(partRows) && Array.isArray(stdParts) && stdParts.length) {
        const byBoat = {};
        for (const p of partRows) (byBoat[p.boat_id] ||= []).push(p);
        for (const bid in byBoat) {
          const rws = byBoat[bid];
          const naStd = new Set(rws.filter(p => !p.is_custom && p.na).map(p => p.part_name));
          const denom = (stdParts.length - naStd.size) + rws.filter(p => p.is_custom && !p.na).length;
          if (denom) (ex[bid] ||= {}).parts = Math.round(100 * rws.filter(p => !p.na && p.status === 'Received').length / denom);
        }
      }
      setExtras(ex);
    } catch (e) { alert('Failed to load boats. Check backend connection.'); }
    finally { setLoading(false); }
  };

  const persist = async (boatId, body) => {
    try {
      await apiFetch(`/api/schedule/${boatId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { alert('Failed to update'); fetchBoats(); }
  };

  // No refetch after advance/step-back: the optimistic update is already on screen and
  // persist() re-syncs on failure. Refetching here raced the PUT and could pull back the
  // OLD status before the save landed — which made buttons appear to need two presses.
  const advance = (boat) => {
    const i = STATUSES.indexOf(boat.global_status);
    if (i < 0 || i >= STATUSES.length - 1) return;
    const next = STATUSES[i + 1];
    setBoats(bs => bs.map(b => b.boat_id === boat.boat_id ? { ...b, global_status: next } : b));
    persist(boat.boat_id, { global_status: next });
  };

  const stepBack = (boat) => {
    const i = STATUSES.indexOf(boat.global_status);
    if (i <= 0) return;
    const prev = STATUSES[i - 1];
    setBoats(bs => bs.map(b => b.boat_id === boat.boat_id ? { ...b, global_status: prev } : b));
    persist(boat.boat_id, { global_status: prev });
  };

  // Calculate % complete and get stage index for a boat.
  const getStageProgress = (boat) => {
    const idx = STATUSES.indexOf(boat.global_status);
    const pct = Math.round((idx / (STATUSES.length - 1)) * 100);
    return { idx, pct };
  };

  // Resolve one display segment's % for a boat. Consoles reads the Assembly
  // checklist; Pre-Production prefers the Key Parts received %; real stages
  // use timeline fill_pct with the position fallback.
  const segInfo = (boat, stageIdx, seg) => {
    const ex = extras[boat.boat_id] || {};
    if (!seg.stage) return ex.console == null ? { pct: 0, real: false } : { pct: ex.console, real: true };
    if (seg.key === 'Pre-Production' && ex.parts != null) return { pct: ex.parts, real: true };
    return stagePct(boat, stageIdx, seg.key);
  };

  const toggleFlag = (boat, key) => {
    const next = !boat[key];
    setBoats(bs => bs.map(b => b.boat_id === boat.boat_id ? { ...b, [key]: next } : b));
    persist(boat.boat_id, { [key]: next });
  };

  // Persist a new visible order; hidden delivered boats stay at the end so they're
  // never dropped from the saved build order.
  const applyOrder = async (nb) => {
    const hidden = showDelivered ? [] : boats.filter(isDelivered);
    const updated = [...nb, ...hidden].map((b, i) => ({ ...b, sequence_number: i + 1 }));
    setBoats(updated);
    try {
      await apiFetch('/api/schedule/reorder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boats: updated.map(b => ({ boat_id: b.boat_id, sequence_number: b.sequence_number })) }) });
    } catch (e) { alert('Failed to reorder'); fetchBoats(); }
  };

  const handleDrop = (targetIndex) => {
    if (draggedIndex === null || draggedIndex === targetIndex) { setDraggedIndex(null); return; }
    const nb = [...visible];
    const [dragged] = nb.splice(draggedIndex, 1);
    nb.splice(targetIndex, 0, dragged);
    setDraggedIndex(null);
    applyOrder(nb);
  };

  // Precise one-step reorder from the popup menu — no dragging needed.
  const moveBoat = (boat, delta) => {
    const nb = [...visible];
    const i = nb.findIndex(b => b.boat_id === boat.boat_id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= nb.length) return;
    [nb[i], nb[j]] = [nb[j], nb[i]];
    applyOrder(nb);
  };

  if (loading) return <div className="loading">Loading production schedule...</div>;

  const { visible, delivered } = applyDeliveredFilter(boats, showDelivered);
  // Phone shows only in-production boats (matches the other tabs' employee view).
  const rows = isMobile ? visible.filter(inProduction) : visible;
  const menuBoat = menu ? boats.find(b => b.boat_id === menu.boatId) : null;
  const atStart = menuBoat && STATUSES.indexOf(menuBoat.global_status) <= 0;
  const atEnd = menuBoat && STATUSES.indexOf(menuBoat.global_status) >= STATUSES.length - 1;

  return (
    <div className="sched">
      <div className="sched-intro">
        Build order, top to bottom. Each boat shows its current production stage — Advance moves it forward.
        {canReorder ? ' Grab the ⠿ handle to drag-reorder, or tap a boat and use Move up / Move down.' : ''} Tap a boat for more actions.
      </div>
      <div className="sched-toolbar">
        {isOps && !isMobile && onManageBoats && <button className="sched-manage" onClick={onManageBoats}>⚙ Manage Boats</button>}
        {isOps && !isMobile && onShopReport && <button className="sched-manage" onClick={onShopReport}>📄 Shop Report</button>}
        <ShowDeliveredToggle count={delivered} on={showDelivered} onChange={setShowDelivered} />
      </div>
      <div className="sched-list">
        {rows.map((boat, idx) => {
          const stageIdx = STATUSES.indexOf(boat.global_status);
          const { pct } = getStageProgress(boat);

          if (isMobile) {
            return (
              <div key={boat.boat_id} className="sched-row-mobile"
                onClick={(e) => setMenu({ boatId: boat.boat_id, x: e.clientX, y: e.clientY })}>
                <div className="sched-mobile-header">
                  <div className="sched-mobile-boat">
                    <div className="sched-id">{boat.sequence_number || idx + 1}. {boat.boat_id} · {boat.customer_name} {boat.is_spare && <span className="spare-tag">SPARE PARTS</span>}</div>
                    <div className="sched-sub">{boat.boat_model} · {boat.hull_color}</div>
                  </div>
                  <div className="sched-stage-tag">{boat.global_status}</div>
                </div>
                <div className="sched-progress-wrap">
                  <div className="sched-progress-bar">
                    {DISPLAY_SEGS.map((seg, i) => {
                      const { pct: segPct, real } = segInfo(boat, stageIdx, seg);
                      const isCurrent = seg.stage && seg.key === boat.global_status;
                      // % text only where it says something: partially-done stages,
                      // or the current stage when it has real tracked progress.
                      const showPct = (segPct > 0 && segPct < 100) || (isCurrent && real);
                      return (
                        <div key={seg.key} className="sched-progress-stage" style={{ flex: 1 }} title={`${seg.key} — ${segPct}%`}>
                          <div className={`sched-progress-track ${isCurrent ? 'current' : ''}`}>
                            <div className="sched-progress-fill" style={{ width: `${segPct}%`, background: GREEN_GRADIENT[i] }} />
                          </div>
                          <div className={`sched-stage-label ${isCurrent ? 'current' : ''}`}>
                            {seg.label}
                            {showPct && <div className="sched-stage-pct">{segPct}%</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="sched-progress-info">
                    <span className="sched-progress-detail">
                      <strong>{pct}%</strong> complete through all 7 stages
                    </span>
                  </div>
                </div>
                <FlagTags flags={boat} defs={SCHEDULE_FLAGS} />
              </div>
            );
          }

          // Desktop: original layout with action buttons.
          return (
            <div key={boat.boat_id} className="sched-row"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              style={{ opacity: draggedIndex === idx ? 0.6 : 1 }}
              onClick={(e) => setMenu({ boatId: boat.boat_id, x: e.clientX, y: e.clientY })}>
              {/* The grip is the ONE drag zone — the rest of the row stays click-for-menu. */}
              {canReorder && (
                <div className="sched-grip" title="Drag to reorder" draggable
                  onDragStart={() => setDraggedIndex(idx)}
                  onDragEnd={() => setDraggedIndex(null)}
                  onClick={(e) => e.stopPropagation()}>⠿</div>
              )}
              <div className="sched-num">{boat.sequence_number || idx + 1}</div>
              <div className="sched-boat">
                <div className="sched-id">{boat.boat_id} · {boat.customer_name} {boat.is_spare && <span className="spare-tag">SPARE PARTS</span>}</div>
                <div className="sched-sub">{boat.boat_model} · {boat.hull_color}</div>
              </div>
              <div className="sched-pipswrap">
                <div className="sched-segs">
                  {DISPLAY_SEGS.map((seg, i) => {
                    const { pct: segPct, real } = segInfo(boat, stageIdx, seg);
                    const isCurrent = seg.stage && seg.key === boat.global_status;
                    // % text only where it says something: partially-done stages,
                    // or the current stage when it has real tracked progress.
                    const showPct = (segPct > 0 && segPct < 100) || (isCurrent && real);
                    return (
                      <div key={seg.key} className="sched-seg" title={`${seg.key} — ${segPct}%`}>
                        <div className={`sched-seg-track ${isCurrent ? 'current' : ''}`}>
                          <div className="sched-seg-fill" style={{ width: `${segPct}%`, background: GREEN_GRADIENT[i] }} />
                        </div>
                        <div className={`sched-seg-label ${isCurrent ? 'current' : segPct === 0 && !isCurrent ? 'future' : ''}`}>
                          {seg.label}{showPct ? ` ${segPct}%` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <FlagTags flags={boat} defs={SCHEDULE_FLAGS} />
              </div>
              <div className="sched-acts" onClick={(e) => e.stopPropagation()}>
                <button className="sched-back" disabled={stageIdx <= 0} onClick={() => stepBack(boat)}>{stageIdx <= 0 ? '‹' : `‹ ${STATUSES[stageIdx - 1]}`}</button>
                <button className="sched-adv" disabled={stageIdx >= STATUSES.length - 1} onClick={() => advance(boat)}>{stageIdx >= STATUSES.length - 1 ? 'Delivered' : `${STATUSES[stageIdx + 1]} ›`}</button>
              </div>
            </div>
          );
        })}
      </div>

      {menu && menuBoat && (
        <ActionMenu anchor={{ x: menu.x, y: menu.y }} title={menuBoat.boat_id} subtitle={`${menuBoat.customer_name} · ${menuBoat.global_status}`} onClose={() => setMenu(null)}>
          <MenuBtn label={atEnd ? 'Delivered' : `Advance to ${STATUSES[STATUSES.indexOf(menuBoat.global_status) + 1]} ›`} primary disabled={atEnd} onClick={() => { advance(menuBoat); setMenu(null); }} />
          <MenuBtn label={atStart ? '‹ Step back' : `‹ Back to ${STATUSES[STATUSES.indexOf(menuBoat.global_status) - 1]}`} disabled={atStart} onClick={() => { stepBack(menuBoat); setMenu(null); }} />
          {canReorder && (
            <>
              <MenuLabel>Build order</MenuLabel>
              <MenuBtn label="↑ Move up" disabled={visible.findIndex(b => b.boat_id === menuBoat.boat_id) <= 0} onClick={() => moveBoat(menuBoat, -1)} />
              <MenuBtn label="↓ Move down" disabled={visible.findIndex(b => b.boat_id === menuBoat.boat_id) >= visible.length - 1} onClick={() => moveBoat(menuBoat, 1)} />
            </>
          )}
          <MenuLabel>Flags</MenuLabel>
          {SCHEDULE_FLAGS.map(f => (
            <MenuToggle key={f.key} label={f.label} color={f.color} active={!!menuBoat[f.key]} onClick={() => toggleFlag(menuBoat, f.key)} />
          ))}
        </ActionMenu>
      )}
    </div>
  );
}

export default ProductionSchedule;
