import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import { FlagTags, SCHEDULE_FLAGS } from './flags';
import ActionMenu, { MenuBtn, MenuLabel, MenuToggle } from './ActionMenu';
import { applyDeliveredFilter, isDelivered, ShowDeliveredToggle, inProduction } from './boatFilter';
import useIsMobile from './useIsMobile';
import './ProductionSchedule.css';

const STATUSES = ['Backlog', 'Pre-Production', 'Glass Shop', 'Back Line', 'Front Line', 'QC', 'Delivered'];
// Status palette matches BluewaterDemo.jsx: bg/fg for the pill, tv for filled pips.
const SCHED = {
  'Backlog': { bg: '#EEF0F2', fg: '#5F6B73', tv: '#7E8B93' },
  'Pre-Production': { bg: '#E5EDF3', fg: '#33617F', tv: '#5C7A92' },
  'Glass Shop': { bg: '#FCEBEB', fg: '#A32D2D', tv: '#D8443F' },
  'Back Line': { bg: '#FAEEDA', fg: '#854F0B', tv: '#E89A2B' },
  'Front Line': { bg: '#FBF3D6', fg: '#7A6310', tv: '#D6B33A' },
  'QC': { bg: '#E6F0F5', fg: '#1E5E7E', tv: '#3A8BB0' },
  'Delivered': { bg: '#EAF3DE', fg: '#3B6D11', tv: '#5C9A2E' },
};

function ProductionSchedule({ refreshTrigger, onManageBoats }) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isOps = user?.role === 'ops';
  // On the phone (employee view) reordering and adding boats stay desktop-only — it's a
  // view + advance/step-back/flag tool. `canReorder` also gates the drag handle + Move up/down.
  const canReorder = isOps && !isMobile;
  const [boats, setBoats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [showDelivered, setShowDelivered] = useState(false);
  const [menu, setMenu] = useState(null); // { boatId, x, y }

  useEffect(() => { fetchBoats(); }, [refreshTrigger]);

  const fetchBoats = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/boats');
      setBoats(await res.json());
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
        <ShowDeliveredToggle count={delivered} on={showDelivered} onChange={setShowDelivered} />
      </div>
      <div className="sched-list">
        {rows.map((boat, idx) => {
          const st = SCHED[boat.global_status] || SCHED['Backlog'];
          const stageIdx = STATUSES.indexOf(boat.global_status);
          const { pct } = getStageProgress(boat);

          if (isMobile) {
            // Mobile: progress bar layout with green gradient (light to dark).
            // Green colors from left (incomplete) to right (complete):
            const greenGradient = [
              '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A',
              '#43A047', '#388E3C', '#2E7D32',
            ];
            return (
              <div key={boat.boat_id} className="sched-row-mobile"
                onClick={(e) => setMenu({ boatId: boat.boat_id, x: e.clientX, y: e.clientY })}>
                <div className="sched-mobile-header">
                  <div className="sched-mobile-boat">
                    <div className="sched-id">{boat.sequence_number || idx + 1}. {boat.boat_id} · {boat.customer_name}</div>
                    <div className="sched-sub">{boat.boat_model} · {boat.hull_color}</div>
                  </div>
                  <div className="sched-stage-tag">{boat.global_status}</div>
                </div>
                <div className="sched-progress-wrap">
                  <div className="sched-progress-bar">
                    {STATUSES.map((s, i) => (
                      <div key={s} className="sched-progress-stage" style={{ flex: 1 }}>
                        <div className="sched-progress-fill" style={{
                          background: i <= stageIdx ? greenGradient[i] : '#E6E9EC',
                          height: '36px',
                          borderRadius: i === 0 ? '4px 0 0 4px' : i === STATUSES.length - 1 ? '0 4px 4px 0' : '0',
                        }} />
                        <div className="sched-stage-label">{s.split(' ')[0]}</div>
                      </div>
                    ))}
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
                <div className="sched-id">{boat.boat_id} · {boat.customer_name}</div>
                <div className="sched-sub">{boat.boat_model} · {boat.hull_color}</div>
              </div>
              <div className="sched-pipswrap">
                <div className="sched-pips">
                  {STATUSES.map((s, i) => <span key={s} className="sched-pip" title={s} style={{ background: i <= stageIdx ? st.tv : '#E6E9EC' }} />)}
                </div>
                <FlagTags flags={boat} defs={SCHEDULE_FLAGS} />
              </div>
              <div className="sched-stat">
                <span className="sched-pill" style={{ background: st.bg, color: st.fg }}>{boat.global_status}</span>
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
