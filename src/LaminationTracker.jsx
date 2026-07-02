import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import ActionMenu, { MenuBtn, MenuLabel, MenuToggle } from './ActionMenu';
import { FlagIcons, STANDARD_FLAGS } from './flags';
import { colorOptions } from './colors';
import './LaminationTracker.css';

// BRD §7 — 13 tasks, 5-status mold cycle that STOPS at Pulled, plus an N/A state.
const LAM_TASKS = ['Glass Kit', 'Hull', 'Transducer', 'T Top', 'Liner', 'Ring', 'Baitwell', 'Leaning Post', 'Console', 'Console Face', 'Hatches', 'Boxes', 'Grid', 'Other'];
const LAM_ORDER = ['Mold Unavailable', 'Mold Open', 'In Progress', 'Complete/On Mold', 'Pulled'];
// Most tasks use the mold cycle; a few (e.g. Glass Kit, which isn't molded) have their own set.
const TASK_ORDER = { 'Glass Kit': ['Not Started', 'In Progress', 'Complete'] };
const orderFor = (task) => TASK_ORDER[task] || LAM_ORDER;
const firstStatus = (task) => orderFor(task)[0];
const NA = 'Not Applicable';
// Palette from BluewaterDemo.jsx (plus Not Started / Complete for the non-mold tasks).
const CELL = {
  'Mold Unavailable': { bg: '#EEF0F2', fg: '#5F6B73' },
  'Mold Open': { bg: '#CFD8DE', fg: '#33424C' },
  'In Progress': { bg: '#FCEBEB', fg: '#A32D2D' },
  'Complete/On Mold': { bg: '#FAEEDA', fg: '#854F0B' },
  'Pulled': { bg: '#EAF3DE', fg: '#3B6D11' },
  'Not Started': { bg: '#F1EFE8', fg: '#5F5E5A' },
  'Complete': { bg: '#EAF3DE', fg: '#3B6D11' },
  'Not Applicable': { bg: '#E4E4E7', fg: '#9A9A9F' },
};

const fmtDate = (d) => { if (!d) return ''; const [, m, day] = d.slice(0, 10).split('-'); return `${+m}/${+day}`; };

// Per-part color default: Hull follows the boat's hull color, Baitwell is Ice Blue, else White.
const defaultColor = (task, boat) => task === 'Hull' ? (boat?.hull_color || 'White') : task === 'Baitwell' ? 'Ice Blue' : 'White';
// Only non-white colors are shown (white is the norm, so exceptions stand out).
const shownColor = (row, task, boat) => {
  const col = row.color || defaultColor(task, boat);
  return col && col !== 'White' ? col : '';
};

function LaminationTracker() {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';

  const [boats, setBoats] = useState([]);
  const [lamData, setLamData] = useState({}); // boatId -> taskName -> row
  const [view, setView] = useState('table'); // table | boat
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(null); // { boatId, task, x, y }

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setLoading(true);
      const [b, all] = await Promise.all([
        apiFetch('/api/boats').then(r => r.json()),
        apiFetch('/api/lamination').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setBoats(b);
      const map = {};
      for (const row of all) {
        if (!map[row.boat_id]) map[row.boat_id] = {};
        map[row.boat_id][row.task_name] = row;
      }
      setLamData(map);
      if (b.length > 0) setSelectedBoat(b[0]);
    } catch (e) { alert('Failed to load lamination. Check backend connection.'); }
    finally { setLoading(false); }
  };

  const getRow = (boatId, task) => lamData[boatId]?.[task] || {};
  const statusOf = (row, task) => row.na ? NA : (row.status || firstStatus(task));

  const save = async (boatId, task, patch) => {
    setLamData(prev => {
      const next = { ...prev };
      next[boatId] = { ...(next[boatId] || {}), [task]: { ...(next[boatId]?.[task]), task_name: task, ...patch } };
      return next;
    });
    try {
      await apiFetch(`/api/lamination/${boatId}/${encodeURIComponent(task)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
    } catch (e) { alert('Failed to save'); init(); }
  };

  // Advance/step-back move through LAM_ORDER; the backend stamps/restores the date (date memory).
  const advance = (boatId, task) => {
    const row = getRow(boatId, task);
    if (row.na) return;
    const order = orderFor(task);
    const i = order.indexOf(row.status || firstStatus(task));
    if (i >= order.length - 1) return; // stops at the final status
    save(boatId, task, { status: order[i + 1] });
  };
  const stepBack = (boatId, task) => {
    const row = getRow(boatId, task);
    if (row.na) return;
    const order = orderFor(task);
    const i = order.indexOf(row.status || firstStatus(task));
    if (i <= 0) return;
    save(boatId, task, { status: order[i - 1] });
  };
  const toggleNA = (boatId, task) => save(boatId, task, { na: !getRow(boatId, task).na });
  const setColor = (boatId, task, val) => save(boatId, task, { color: val || null });
  const toggleFlag = (boatId, task, key) => save(boatId, task, { [key]: !getRow(boatId, task)[key] });

  const openMenu = (e, boatId, task) => setMenu({ boatId, task, x: e.clientX, y: e.clientY });

  // Shared, growing color list (White pinned first, then alphabetical) — BRD §7c.
  const colorList = () => {
    const set = new Set(colorOptions(boats));
    for (const bid in lamData) for (const t in lamData[bid]) if (lamData[bid][t].color) set.add(lamData[bid][t].color);
    return Array.from(set).sort((a, b) => a === 'White' ? -1 : b === 'White' ? 1 : a.localeCompare(b));
  };

  const filteredBoats = boats.filter(b =>
    b.boat_id?.toLowerCase().includes(search.toLowerCase()) ||
    b.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    b.boat_model?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="loading">Loading lamination...</div>;

  const menuBoat = menu ? boats.find(b => b.boat_id === menu.boatId) : null;
  const menuRow = menu ? getRow(menu.boatId, menu.task) : {};
  const menuOrder = menu ? orderFor(menu.task) : LAM_ORDER;
  const menuIdx = menu ? menuOrder.indexOf(menuRow.status || firstStatus(menu.task)) : -1;
  const menuNA = !!menuRow.na;
  const menuAtEnd = menuIdx >= menuOrder.length - 1;

  const actionMenu = menu && menuBoat && (
    <ActionMenu anchor={{ x: menu.x, y: menu.y }} title={menu.task} subtitle={`${menuBoat.boat_id} · ${menuBoat.customer_name}`} onClose={() => setMenu(null)}>
      <MenuBtn label={menuNA ? 'Advance ›' : menuAtEnd ? `${menuOrder[menuOrder.length - 1]} (done)` : `Advance to ${menuOrder[menuIdx + 1]} ›`} primary disabled={menuNA || menuAtEnd} onClick={() => advance(menu.boatId, menu.task)} />
      <MenuBtn label={menuNA || menuIdx <= 0 ? '‹ Step back' : `‹ Back to ${menuOrder[menuIdx - 1]}`} disabled={menuNA || menuIdx <= 0} onClick={() => stepBack(menu.boatId, menu.task)} />
      {isOps && (
        <>
          <MenuBtn label={menuNA ? 'Clear N/A' : 'Set Not Applicable'} onClick={() => toggleNA(menu.boatId, menu.task)} />
          <MenuLabel>Color / note</MenuLabel>
          <input className="am-spec-input" list="lam-color-opts" value={menuRow.color || ''} placeholder={`Mostly a color (default: ${defaultColor(menu.task, menuBoat)})`} onChange={e => setColor(menu.boatId, menu.task, e.target.value)} />
          <datalist id="lam-color-opts">{colorList().map(c => <option key={c} value={c} />)}</datalist>
          <div className="am-spec-hint">Pick a color or type any note (saved for this task).</div>
        </>
      )}
      <MenuLabel>Flags</MenuLabel>
      {STANDARD_FLAGS.map(f => (
        <MenuToggle key={f.key} label={f.label} color={f.color} active={!!menuRow[f.key]} onClick={() => toggleFlag(menu.boatId, menu.task, f.key)} />
      ))}
    </ActionMenu>
  );

  const cellContent = (row, task, boat) => {
    const st = statusOf(row, task);
    const c = CELL[st] || CELL['Mold Unavailable'];
    const showDate = !row.na && st !== firstStatus(task) && row.status_date;
    const col = shownColor(row, task, boat);
    return { st, c, showDate: showDate ? fmtDate(row.status_date) : '', col };
  };

  if (view === 'table') {
    return (
      <div className="lam-tablewrap">
        <div className="lam-toolbar">
          <button className="lam-toggle" onClick={() => setView('boat')}>Boat view</button>
          <span className="lam-toolbar-note">{isOps ? 'Tap a cell to update.' : 'Tap a cell to advance, step back, or flag.'}</span>
        </div>
        <div className="lam-scroll">
          <table className="lam-table">
            <thead>
              <tr>
                <th className="lam-boathead">Boat</th>
                {LAM_TASKS.map(t => <th key={t}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {boats.map(boat => (
                <tr key={boat.boat_id}>
                  <td className="lam-boatcell">
                    <div className="lam-bid">{boat.boat_id} · {boat.customer_name}</div>
                    <div className="lam-bmeta">{boat.boat_model} · <span className="lam-bhull">{boat.hull_color}</span></div>
                  </td>
                  {LAM_TASKS.map(t => {
                    const row = getRow(boat.boat_id, t);
                    const { st, c, showDate, col } = cellContent(row, t, boat);
                    return (
                      <td key={t} className="lam-cell" style={{ background: c.bg, color: c.fg }} onClick={(e) => openMenu(e, boat.boat_id, t)}>
                        <span className="lam-flagwrap"><FlagIcons flags={row} defs={STANDARD_FLAGS} size={11} /></span>
                        <div className="lam-cellstatus">{st}</div>
                        {showDate && <div className="lam-celldate">{showDate}</div>}
                        {col && <div className="lam-cellcolor">{col}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Legend />
        {actionMenu}
      </div>
    );
  }

  return (
    <div className="lam">
      <div className="lam-list-panel">
        <button className="lam-toggle" onClick={() => setView('table')}>← Task grid</button>
        <input className="lam-search" placeholder="Search by ID, customer, or model..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="lam-boats">
          {filteredBoats.map(boat => (
            <div key={boat.boat_id} className={`lam-boat-row ${selectedBoat?.boat_id === boat.boat_id ? 'selected' : ''}`} onClick={() => setSelectedBoat(boat)}>
              <div className="lam-bid">{boat.boat_id} - {boat.customer_name}</div>
              <div className="lam-bhull">{boat.hull_color} {boat.boat_model}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="lam-detail">
        {selectedBoat ? (
          <>
            <h2>{selectedBoat.boat_id} - {selectedBoat.customer_name}</h2>
            <h3>Lamination Tasks ({LAM_TASKS.length})</h3>
            {LAM_TASKS.map(t => {
              const row = getRow(selectedBoat.boat_id, t);
              const { st, c, showDate, col } = cellContent(row, t, selectedBoat);
              return (
                <div key={t} className="lam-part" onClick={(e) => openMenu(e, selectedBoat.boat_id, t)}>
                  <span className="lam-part-main">
                    <span className="lam-part-name">{t}</span>
                    {col && <span className="lam-part-color">{col}</span>}
                  </span>
                  <span className="lam-part-right">
                    <FlagIcons flags={row} defs={STANDARD_FLAGS} size={14} />
                    <span className="lam-badge" style={{ background: c.bg, color: c.fg }}>{st}{showDate ? ` • ${showDate}` : ''}</span>
                  </span>
                </div>
              );
            })}
          </>
        ) : <p>Select a boat</p>}
      </div>
      {actionMenu}
    </div>
  );
}

function Legend() {
  return (
    <div className="lam-legend">
      <div className="lam-legend-title">Status</div>
      <div className="lam-legend-row">
        {[...LAM_ORDER, 'Not Started', 'Complete', NA].map(s => (
          <span key={s} className="lam-legend-item"><i className="lam-legend-sw" style={{ background: CELL[s].bg }} />{s}</span>
        ))}
      </div>
      <div className="lam-legend-note" style={{ marginTop: 4 }}>Glass Kit uses Not Started → In Progress → Complete; all other tasks use the mold cycle.</div>
      <div className="lam-legend-title" style={{ marginTop: 11 }}>Flags</div>
      <div className="lam-legend-row">
        {STANDARD_FLAGS.map(f => (
          <span key={f.key} className="lam-legend-item"><FlagIcons flags={{ [f.key]: true }} defs={[f]} size={14} />{f.label}</span>
        ))}
      </div>
      <div className="lam-legend-note">Mold cycle stops at Pulled. Non-white part colors show under the status. N/A and color are Ops-only.</div>
    </div>
  );
}

export default LaminationTracker;
