import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import { FlagTags, SCHEDULE_FLAGS } from './flags';
import ActionMenu, { MenuBtn, MenuLabel, MenuToggle } from './ActionMenu';
import { applyDeliveredFilter, isDelivered, ShowDeliveredToggle } from './boatFilter';
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

function ProductionSchedule({ refreshTrigger }) {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';
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

  const toggleFlag = (boat, key) => {
    const next = !boat[key];
    setBoats(bs => bs.map(b => b.boat_id === boat.boat_id ? { ...b, [key]: next } : b));
    persist(boat.boat_id, { [key]: next });
  };

  const handleDrop = async (targetIndex) => {
    if (draggedIndex === null || draggedIndex === targetIndex) { setDraggedIndex(null); return; }
    // Reorder within the visible list, then keep any hidden delivered boats at the
    // end so they're never dropped from the saved build order.
    const nb = [...visible];
    const [dragged] = nb.splice(draggedIndex, 1);
    nb.splice(targetIndex, 0, dragged);
    const hidden = showDelivered ? [] : boats.filter(isDelivered);
    const updated = [...nb, ...hidden].map((b, i) => ({ ...b, sequence_number: i + 1 }));
    setBoats(updated);
    setDraggedIndex(null);
    try {
      await apiFetch('/api/schedule/reorder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boats: updated.map(b => ({ boat_id: b.boat_id, sequence_number: b.sequence_number })) }) });
    } catch (e) { alert('Failed to reorder'); fetchBoats(); }
  };

  if (loading) return <div className="loading">Loading production schedule...</div>;

  const { visible, delivered } = applyDeliveredFilter(boats, showDelivered);
  const menuBoat = menu ? boats.find(b => b.boat_id === menu.boatId) : null;
  const atStart = menuBoat && STATUSES.indexOf(menuBoat.global_status) <= 0;
  const atEnd = menuBoat && STATUSES.indexOf(menuBoat.global_status) >= STATUSES.length - 1;

  return (
    <div className="sched">
      <div className="sched-intro">
        Build order, top to bottom. Each boat shows its current production stage — Advance moves it forward.
        {isOps ? ' Drag rows to reorder the build sequence.' : ''} Tap a boat for more actions.
      </div>
      <div className="sched-toolbar">
        <ShowDeliveredToggle count={delivered} on={showDelivered} onChange={setShowDelivered} />
      </div>
      <div className="sched-list">
        {visible.map((boat, idx) => {
          const st = SCHED[boat.global_status] || SCHED['Backlog'];
          const stageIdx = STATUSES.indexOf(boat.global_status);
          return (
            <div key={boat.boat_id} className="sched-row"
              draggable={isOps}
              onDragStart={() => setDraggedIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              style={{ opacity: draggedIndex === idx ? 0.6 : 1 }}
              onClick={(e) => setMenu({ boatId: boat.boat_id, x: e.clientX, y: e.clientY })}>
              <div className="sched-num">{boat.sequence_number || idx + 1}</div>
              <div className="sched-boat">
                <div className="sched-id">{boat.boat_id}</div>
                <div className="sched-sub">{boat.customer_name} · {boat.boat_model} · {boat.hull_color}</div>
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
