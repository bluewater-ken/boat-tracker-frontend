import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import ActionMenu, { MenuLabel } from './ActionMenu';
import { applyDeliveredFilter, ShowDeliveredToggle } from './boatFilter';
import './AssemblyTracker.css';

// Assembly board (BRD "Mission Control") — read-only mirror of CompanyCam checklists.
// Columns (work centers) come from the backend, which discovers them from CompanyCam
// checklist templates. These placeholders only show until the backend is connected.
const PLACEHOLDER_WCS = [
  { id: 'wc1', name: 'Backline – Hull' },
  { id: 'wc2', name: 'Backline – Deck & Ring' },
  { id: 'wc3', name: 'Front Line' },
  { id: 'wc4', name: 'Console' },
  { id: 'wc5', name: 'QC' },
];

// Status colors follow the house palette (gray / amber / green).
const CELL = {
  NOT_STARTED: { bg: '#EEF0F2', fg: '#5F6B73' },
  IN_PROGRESS: { bg: '#FAEEDA', fg: '#854F0B' },
  COMPLETE: { bg: '#EAF3DE', fg: '#3B6D11' },
  NONE: { bg: '#FFFFFF', fg: '#B9C2C9' }, // no checklist on this boat/work center
};

const statusOf = (row) => {
  if (!row || !row.total_items) return 'NONE';
  if (row.completed_items >= row.total_items) return 'COMPLETE';
  if (row.completed_items > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
};

function AssemblyTracker() {
  const [boats, setBoats] = useState([]);
  const [workCenters, setWorkCenters] = useState(PLACEHOLDER_WCS);
  const [rows, setRows] = useState({}); // boatId -> wcId -> row
  const [connected, setConnected] = useState(false);
  const [showDelivered, setShowDelivered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(null); // { boatId, wcId, x, y }

  useEffect(() => {
    init();
    const t = setInterval(() => init(true), 60000); // auto-refresh — crews update from phones
    return () => clearInterval(t);
  }, []);

  const init = async (quiet) => {
    try {
      if (!quiet) setLoading(true);
      const [b, asm] = await Promise.all([
        apiFetch('/api/boats').then(r => r.json()),
        apiFetch('/api/assembly').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setBoats(b);
      if (asm && Array.isArray(asm.work_centers) && asm.work_centers.length) {
        setWorkCenters(asm.work_centers);
        const map = {};
        for (const r of asm.rows || []) {
          if (!map[r.boat_id]) map[r.boat_id] = {};
          map[r.boat_id][r.work_center_id] = r;
        }
        setRows(map);
        setConnected(true);
      }
    } catch (e) { if (!quiet) alert('Failed to load assembly board.'); }
    finally { if (!quiet) setLoading(false); }
  };

  const getRow = (boatId, wcId) => rows[boatId]?.[wcId] || null;

  if (loading) return <div className="loading">Loading assembly board...</div>;

  const { visible, delivered } = applyDeliveredFilter(boats, showDelivered);

  const menuBoat = menu ? boats.find(b => b.boat_id === menu.boatId) : null;
  const menuWc = menu ? workCenters.find(w => w.id === menu.wcId) : null;
  const menuRow = menu ? getRow(menu.boatId, menu.wcId) : null;
  // Show what's left whenever a cell is tapped (the BRD's 75% gate made sense for a
  // dashboard, not an on-demand popup). Cap the list; the rest lives in CompanyCam.
  const allRemaining = menuRow?.remaining || [];
  const menuRemaining = allRemaining.slice(0, 8);
  const moreCount = allRemaining.length - menuRemaining.length;

  return (
    <div className="asm-wrap">
      <div className="asm-toolbar">
        <span className="asm-toolbar-note">
          {connected
            ? 'Live from CompanyCam — read-only here. Crews update by checking items in CompanyCam.'
            : 'Not connected to CompanyCam yet — columns are placeholders until the backend link is set up.'}
        </span>
        <span style={{ marginLeft: 'auto' }}><ShowDeliveredToggle count={delivered} on={showDelivered} onChange={setShowDelivered} /></span>
      </div>
      <div className="asm-scroll">
        <table className="asm-table">
          <thead>
            <tr>
              <th className="asm-boathead">Boat</th>
              {workCenters.map(w => <th key={w.id}>{w.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map(boat => (
              <tr key={boat.boat_id}>
                <td className="asm-boatcell">
                  <div className="asm-bid">{boat.boat_id} · {boat.customer_name}</div>
                  <div className="asm-bmeta">{boat.boat_model} · <span className="asm-bhull">{boat.hull_color}</span></div>
                </td>
                {workCenters.map(w => {
                  const row = getRow(boat.boat_id, w.id);
                  const st = statusOf(row);
                  const c = CELL[st];
                  const pct = row?.total_items ? row.completed_items / row.total_items : 0;
                  return (
                    <td key={w.id} className="asm-cell" style={{ background: c.bg, color: c.fg }}
                      onClick={(e) => row && setMenu({ boatId: boat.boat_id, wcId: w.id, x: e.clientX, y: e.clientY })}>
                      {st === 'NONE' ? (
                        <div className="asm-count asm-none">—</div>
                      ) : (
                        <>
                          <div className="asm-count">{row.completed_items} / {row.total_items}</div>
                          <div className="asm-bar"><span style={{ width: `${Math.round(pct * 100)}%`, background: c.fg }} /></div>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="asm-legend">
        <span className="asm-legend-item"><i style={{ background: CELL.NOT_STARTED.bg }} />Not started</span>
        <span className="asm-legend-item"><i style={{ background: CELL.IN_PROGRESS.bg }} />In progress</span>
        <span className="asm-legend-item"><i style={{ background: CELL.COMPLETE.bg }} />Complete</span>
        <span className="asm-legend-item"><i style={{ background: '#fff', border: '1px solid #E2E6EA' }} />— No checklist</span>
        <span className="asm-legend-note">Tap a cell for details. Counts are checklist items done / total, straight from CompanyCam.</span>
      </div>

      {menu && menuBoat && menuWc && menuRow && (
        <ActionMenu anchor={{ x: menu.x, y: menu.y }} title={menuWc.name} subtitle={`${menuBoat.boat_id} · ${menuBoat.customer_name}`} onClose={() => setMenu(null)}>
          <div className="asm-menu-count">{menuRow.completed_items} / {menuRow.total_items} items complete</div>
          {menuRemaining.length > 0 && (
            <>
              <MenuLabel>Remaining</MenuLabel>
              <ul className="asm-remaining">
                {menuRemaining.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
              {moreCount > 0 && <div className="asm-more">+ {moreCount} more in CompanyCam</div>}
            </>
          )}
          {menuRow.cc_url && (
            <a className="asm-cc-link" href={menuRow.cc_url} target="_blank" rel="noreferrer">Open in CompanyCam →</a>
          )}
          <div className="am-spec-hint">Read-only — items are checked off in CompanyCam.</div>
        </ActionMenu>
      )}
    </div>
  );
}

export default AssemblyTracker;
