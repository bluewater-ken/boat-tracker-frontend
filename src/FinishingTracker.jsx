import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import ActionMenu, { MenuBtn, MenuLabel, MenuToggle } from './ActionMenu';
import { GRADES } from './flags';
import { colorOptions } from './colors';
import { applyDeliveredFilter, ShowDeliveredToggle, inProduction } from './boatFilter';
import SmartInput from './SmartInput';
import useIsMobile from './useIsMobile';
import './FinishingTracker.css';

// BRD §9 — post-lamination finishing. 10 tasks, 4-status line that STOPS at Complete, plus N/A.
const FIN_TASKS = ['Hull', 'Liner', 'Ring', 'Hard Top', 'Console', 'Console Face', 'Hatches', 'Leaning Post', 'Buckets', 'Other'];
const FIN_ORDER = ['Not Available', 'Not Started', 'In Progress', 'Complete'];
const firstStatus = () => FIN_ORDER[0];
const NA = 'Not Applicable';

// App-wide status language: amber = working, green = done, cool gray = blocked.
// Not Started is the action state here — the part HAS arrived from the lam shop
// and is sitting untouched — so it gets a red tint instead of the neutral.
const CELL = {
  'Not Available': { bg: '#E7EBEF', fg: '#5F6B73' },  // cool gray — blocked upstream (lam shop)
  'Not Started': { bg: '#FCEBEB', fg: '#A32D2D' },    // needs action — it's here, start it
  'In Progress': { bg: '#FAC775', fg: '#633806' },
  'Complete': { bg: '#9CCB62', fg: '#1F3D07' },
  'Not Applicable': { bg: '#E4E4E7', fg: '#9A9A9F' },
};

// Per-part color default: Hull follows the boat's hull color, else White.
const defaultColor = (task, boat) => task === 'Hull' ? (boat?.hull_color || 'White') : 'White';
// Only non-white colors are shown (white is the norm, so exceptions stand out).
const shownColor = (row, task, boat) => {
  const col = row.color || defaultColor(task, boat);
  return col && col !== 'White' ? col : '';
};
const gradeOf = (row) => GRADES.find(g => g.key === row.grade);

function FinishingTracker() {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';

  const isMobile = useIsMobile();
  const [boats, setBoats] = useState([]);
  const [finData, setFinData] = useState({}); // boatId -> taskName -> row
  // Phones start in the boat view (the wide grid is desktop-only).
  const [view, setView] = useState(() => isMobile ? 'boat' : 'table'); // table | boat
  const [mobileView, setMobileView] = useState('list'); // phone master→detail: list | detail
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [search, setSearch] = useState('');
  const [showDelivered, setShowDelivered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(null); // { boatId, task, x, y }

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setLoading(true);
      const [b, all] = await Promise.all([
        apiFetch('/api/boats').then(r => r.json()),
        apiFetch('/api/finishing').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setBoats(b);
      const map = {};
      for (const row of all) {
        if (!map[row.boat_id]) map[row.boat_id] = {};
        map[row.boat_id][row.task_name] = row;
      }
      setFinData(map);
      if (b.length > 0) setSelectedBoat(b[0]);
    } catch (e) { alert('Failed to load finishing. Check backend connection.'); }
    finally { setLoading(false); }
  };

  const getRow = (boatId, task) => finData[boatId]?.[task] || {};
  const statusOf = (row) => row.na ? NA : (row.status || firstStatus());

  const save = async (boatId, task, patch) => {
    setFinData(prev => {
      const next = { ...prev };
      next[boatId] = { ...(next[boatId] || {}), [task]: { ...(next[boatId]?.[task]), task_name: task, ...patch } };
      return next;
    });
    try {
      await apiFetch(`/api/finishing/${boatId}/${encodeURIComponent(task)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
    } catch (e) { alert('Failed to save'); init(); }
  };

  // Advance/step-back move through FIN_ORDER (both roles); the backend stamps the date.
  const advance = (boatId, task) => {
    const row = getRow(boatId, task);
    if (row.na) return;
    const i = FIN_ORDER.indexOf(row.status || firstStatus());
    if (i >= FIN_ORDER.length - 1) return; // stops at Complete
    const next = FIN_ORDER[i + 1];
    const patch = { status: next };
    // Finished work is no longer a rush — completing a task clears its ASAP tag.
    if (next === 'Complete' && row.asap) patch.asap = false;
    save(boatId, task, patch);
  };
  const stepBack = (boatId, task) => {
    const row = getRow(boatId, task);
    if (row.na) return;
    const i = FIN_ORDER.indexOf(row.status || firstStatus());
    if (i <= 0) return;
    save(boatId, task, { status: FIN_ORDER[i - 1] });
  };
  const toggleNA = (boatId, task) => save(boatId, task, { na: !getRow(boatId, task).na });
  const setColor = (boatId, task, val) => save(boatId, task, { color: val || null });
  const toggleAsap = (boatId, task) => save(boatId, task, { asap: !getRow(boatId, task).asap });
  // Grade is pick-one: click the active grade again to clear it.
  const setGrade = (boatId, task, key) => save(boatId, task, { grade: getRow(boatId, task).grade === key ? null : key });

  const openMenu = (e, boatId, task) => setMenu({ boatId, task, x: e.clientX, y: e.clientY });

  // Shared, growing color list (White pinned first, then alphabetical).
  const colorList = () => {
    const set = new Set(colorOptions(boats));
    for (const bid in finData) for (const t in finData[bid]) if (finData[bid][t].color) set.add(finData[bid][t].color);
    return Array.from(set).sort((a, b) => a === 'White' ? -1 : b === 'White' ? 1 : a.localeCompare(b));
  };

  const { visible, delivered } = applyDeliveredFilter(boats, showDelivered);
  // On the phone (employee view) only show boats actually in production (Glass Shop onward).
  const filteredBoats = visible.filter(b =>
    (!isMobile || inProduction(b)) && (
    b.boat_id?.toLowerCase().includes(search.toLowerCase()) ||
    b.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    b.boat_model?.toLowerCase().includes(search.toLowerCase())));

  if (loading) return <div className="loading">Loading finishing...</div>;

  const menuBoat = menu ? boats.find(b => b.boat_id === menu.boatId) : null;
  const menuRow = menu ? getRow(menu.boatId, menu.task) : {};
  const menuIdx = menu ? FIN_ORDER.indexOf(menuRow.status || firstStatus()) : -1;
  const menuNA = !!menuRow.na;
  const menuAtEnd = menuIdx >= FIN_ORDER.length - 1;

  const actionMenu = menu && menuBoat && (
    <ActionMenu anchor={{ x: menu.x, y: menu.y }} title={menu.task} subtitle={`${menuBoat.boat_id} · ${menuBoat.customer_name}`} onClose={() => setMenu(null)}>
      <MenuBtn label={menuNA ? 'Advance ›' : menuAtEnd ? 'Complete (done)' : `Advance to ${FIN_ORDER[menuIdx + 1]} ›`} primary disabled={menuNA || menuAtEnd} onClick={() => advance(menu.boatId, menu.task)} />
      <MenuBtn label={menuNA || menuIdx <= 0 ? '‹ Step back' : `‹ Back to ${FIN_ORDER[menuIdx - 1]}`} disabled={menuNA || menuIdx <= 0} onClick={() => stepBack(menu.boatId, menu.task)} />
      {isOps && (
        <>
          <MenuBtn label={menuNA ? 'Clear N/A' : 'Set Not Applicable'} onClick={() => toggleNA(menu.boatId, menu.task)} />
          <MenuLabel>Color</MenuLabel>
          <SmartInput className="am-spec-input" storeKey="colors" options={colorList()} value={menuRow.color || ''} placeholder={`Default: ${defaultColor(menu.task, menuBoat)}`} onChange={v => setColor(menu.boatId, menu.task, v)} />
        </>
      )}
      <MenuLabel>Priority</MenuLabel>
      <MenuToggle label="ASAP" color="#A32D2D" active={!!menuRow.asap} onClick={() => toggleAsap(menu.boatId, menu.task)} />
      <MenuLabel>Part grade (as received)</MenuLabel>
      {GRADES.map(g => (
        <MenuToggle key={g.key} label={g.label} color={g.color} active={menuRow.grade === g.key} onClick={() => setGrade(menu.boatId, menu.task, g.key)} />
      ))}
    </ActionMenu>
  );

  const cellContent = (row, task, boat) => {
    const st = statusOf(row);
    const c = CELL[st] || CELL['Not Available'];
    const col = shownColor(row, task, boat);
    return { st, c, col, asap: !!row.asap, grade: gradeOf(row) };
  };

  const CornerMarks = ({ asap, grade, size = 13 }) => (
    (asap || grade) ? (
      <span className="fin-marks">
        {asap && <span className="fin-asap">ASAP</span>}
        {grade && <span className="fin-grade" title={`${grade.label} (as received)`}><grade.Icon size={size} color={grade.color} /></span>}
      </span>
    ) : null
  );

  if (view === 'table') {
    return (
      <div className="fin-tablewrap">
        <div className="fin-toolbar">
          <button className="fin-toggle" onClick={() => setView('boat')}>Boat view</button>
          <span className="fin-toolbar-note">Tap a cell to advance, step back, grade, or flag ASAP.</span>
          <span style={{ marginLeft: 'auto' }}><ShowDeliveredToggle count={delivered} on={showDelivered} onChange={setShowDelivered} /></span>
        </div>
        <div className="fin-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th className="fin-boathead">Boat</th>
                {FIN_TASKS.map(t => <th key={t}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map(boat => (
                <tr key={boat.boat_id}>
                  <td className="fin-boatcell">
                    <div className="fin-bid">{boat.boat_id} · {boat.customer_name} {boat.is_spare && <span className="spare-tag">SPARE / REFIT / SERVICE</span>}</div>
                    <div className="fin-bmeta">{boat.boat_model} · <span className="fin-bhull">{boat.hull_color}</span></div>
                  </td>
                  {FIN_TASKS.map(t => {
                    const row = getRow(boat.boat_id, t);
                    const { st, c, col, asap, grade } = cellContent(row, t, boat);
                    return (
                      <td key={t} className="fin-cell" style={{ background: c.bg, color: c.fg }} onClick={(e) => openMenu(e, boat.boat_id, t)}>
                        <CornerMarks asap={asap} grade={grade} size={12} />
                        <div className="fin-cellstatus">{st}</div>
                        {col && <div className="fin-cellcolor">{col}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <Legend />
        </div>
        {actionMenu}
      </div>
    );
  }

  // On phones, show either the boat list or the selected boat's tasks (not both).
  const pickBoat = (boat) => { setSelectedBoat(boat); if (isMobile) setMobileView('detail'); };
  const showList = !isMobile || mobileView === 'list';
  const showDetail = !isMobile || mobileView === 'detail';

  return (
    <div className={`fin ${isMobile ? 'fin-mobile' : ''}`}>
      {showList && (
      <div className="fin-list-panel">
        {!isMobile && <button className="fin-toggle" onClick={() => setView('table')}>← Task grid</button>}
        <input className="fin-search" placeholder="Search by ID, customer, or model..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="fin-boats">
          {filteredBoats.map(boat => (
            <div key={boat.boat_id} className={`fin-boat-row ${selectedBoat?.boat_id === boat.boat_id ? 'selected' : ''}`} onClick={() => pickBoat(boat)}>
              <div className="fin-bid">{boat.boat_id} - {boat.customer_name} {boat.is_spare && <span className="spare-tag">SPARE / REFIT / SERVICE</span>}</div>
              <div className="fin-bhull">{boat.hull_color} {boat.boat_model}</div>
            </div>
          ))}
        </div>
      </div>
      )}
      {showDetail && (
      <div className="fin-detail">
        {isMobile && <button className="fin-back" onClick={() => setMobileView('list')}>← Boats</button>}
        {selectedBoat ? (
          <>
            <h2>{selectedBoat.boat_id} - {selectedBoat.customer_name} {selectedBoat.is_spare && <span className="spare-tag">SPARE / REFIT / SERVICE</span>}</h2>
            <h3>Finishing Tasks ({FIN_TASKS.length})</h3>
            {FIN_TASKS.map(t => {
              const row = getRow(selectedBoat.boat_id, t);
              const { st, c, col, asap, grade } = cellContent(row, t, selectedBoat);
              return (
                <div key={t} className="fin-part" onClick={(e) => openMenu(e, selectedBoat.boat_id, t)}>
                  <span className="fin-part-main">
                    <span className="fin-part-name">{t}</span>
                    {col && <span className="fin-part-color">{col}</span>}
                  </span>
                  <span className="fin-part-right">
                    <CornerMarks asap={asap} grade={grade} size={16} />
                    <span className="fin-badge" style={{ background: c.bg, color: c.fg }}>{st}</span>
                  </span>
                </div>
              );
            })}
          </>
        ) : <p>Select a boat</p>}
      </div>
      )}
      {actionMenu}
    </div>
  );
}

function Legend() {
  return (
    <div className="fin-legend">
      <div className="fin-legend-title">Status</div>
      <div className="fin-legend-row">
        {[...FIN_ORDER, NA].map(s => (
          <span key={s} className="fin-legend-item"><i className="fin-legend-sw" style={{ background: CELL[s].bg }} />{s}</span>
        ))}
      </div>
      <div className="fin-legend-title" style={{ marginTop: 11 }}>Part grade (as received from lamination)</div>
      <div className="fin-legend-row">
        {GRADES.map(g => (
          <span key={g.key} className="fin-legend-item"><g.Icon size={16} color={g.color} />{g.label}</span>
        ))}
        <span className="fin-legend-item"><span className="fin-asap">ASAP</span> Priority</span>
      </div>
      <div className="fin-legend-note">"Not Available" = part hasn't arrived from the lamination shop yet. Non-white part colors show under the status. N/A and color are Ops-only; status, grade, and ASAP are set by Shop or Ops.</div>
    </div>
  );
}

export default FinishingTracker;
