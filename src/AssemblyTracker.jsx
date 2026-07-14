import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import ActionMenu from './ActionMenu';
import { applyDeliveredFilter, ShowDeliveredToggle, inProduction } from './boatFilter';
import useIsMobile from './useIsMobile';
import useAsapBoats from './useAsapBoats';
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

// ---- App-sourced columns: Lamination + Finishing progress from our own trackers ----
// (Mirrors the task/status rules in LaminationTracker.jsx / FinishingTracker.jsx.)
// Transducer Type is EXCLUDED: it's an info-only field (holds the transducer to
// install), not a job that gets checked off — counting it capped boats at n-1/n.
const LAM_TASKS = ['Glass Kit', 'Hull', 'T Top', 'Liner', 'Ring', 'Baitwell', 'Leaning Post', 'Console', 'Console Face', 'Hatches', 'Boxes', 'Grid', 'Other'];
// Lamination "done" = glass-shop work complete: on the mold or pulled (pulling only
// frees the mold, it's not more lamination). Glass Kit (non-mold) is done at Complete.
const LAM_FINAL = { 'Glass Kit': ['Complete'] };
const LAM_MOLD_DONE = ['Complete/On Mold', 'Pulled'];
const LAM_DEFAULT = {};
const FIN_TASKS = ['Hull', 'Liner', 'Ring', 'Hard Top', 'Console', 'Console Face', 'Hatches', 'Leaning Post', 'Buckets', 'Other'];

// Roll a tracker's rows for one boat into {completed, total, remaining[]} — N/A tasks excluded.
// finalOf(t) may return a single status or an array of statuses that count as done.
const rollup = (rowsForBoat, tasks, finalOf, defaultOf) => {
  let completed = 0, total = 0; const remaining = []; const items = [];
  for (const t of tasks) {
    const row = rowsForBoat?.[t] || {};
    if (row.na) continue;
    total++;
    const status = row.status || defaultOf(t);
    const finals = finalOf(t);
    const done = (Array.isArray(finals) ? finals : [finals]).includes(status);
    if (done) completed++; else remaining.push(t);
    items.push({ name: t, done }); // full checklist for the popup
  }
  return { completed_items: completed, total_items: total, remaining, items };
};

const APP_COLS = [
  { id: '_lam', name: 'Lamination', app: true },
  { id: '_fin', name: 'Finishing', app: true },
];

// App-wide status language: neutral = untouched, amber = working, green = done.
const CELL = {
  NOT_STARTED: { bg: '#F4F3EE', fg: '#9B998F' },
  IN_PROGRESS: { bg: '#FAC775', fg: '#633806' },
  COMPLETE: { bg: '#9CCB62', fg: '#1F3D07' },
  NONE: { bg: '#FFFFFF', fg: '#B9C2C9' }, // no checklist on this boat/work center
};

const statusOf = (row) => {
  if (!row || !row.total_items) return 'NONE';
  if (row.completed_items >= row.total_items) return 'COMPLETE';
  if (row.completed_items > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
};

function AssemblyTracker() {
  const isMobile = useIsMobile();
  const asapBoats = useAsapBoats(); // boats with an urgent part to order
  const [boats, setBoats] = useState([]);
  const [workCenters, setWorkCenters] = useState(PLACEHOLDER_WCS);
  const [rows, setRows] = useState({}); // boatId -> wcId -> row
  const [appRows, setAppRows] = useState({}); // boatId -> '_lam'|'_fin' -> rollup
  const [connected, setConnected] = useState(false);
  const [showDelivered, setShowDelivered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(null); // { boatId, wcId, x, y }
  const [checkFilter, setCheckFilter] = useState('todo'); // popup checklist filter: all | todo | done — opens on the actionable list

  useEffect(() => {
    init();
    const t = setInterval(() => init(true), 60000); // auto-refresh — crews update from phones
    return () => clearInterval(t);
  }, []);

  const init = async (quiet) => {
    try {
      if (!quiet) setLoading(true);
      const [b, asm, lam, fin] = await Promise.all([
        apiFetch('/api/boats').then(r => r.json()),
        apiFetch('/api/assembly').then(r => r.ok ? r.json() : null).catch(() => null),
        apiFetch('/api/lamination').then(r => r.ok ? r.json() : []).catch(() => []),
        apiFetch('/api/finishing').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setBoats(b);
      // Roll our own trackers into the same {done/total/remaining} shape as CompanyCam columns.
      const byBoat = (list) => {
        const m = {};
        for (const r of list) { if (!m[r.boat_id]) m[r.boat_id] = {}; m[r.boat_id][r.task_name] = r; }
        return m;
      };
      const lamMap = byBoat(lam), finMap = byBoat(fin);
      const app = {};
      for (const boat of b) {
        app[boat.boat_id] = {
          _lam: rollup(lamMap[boat.boat_id], LAM_TASKS, t => LAM_FINAL[t] || LAM_MOLD_DONE, t => LAM_DEFAULT[t] || ''),
          _fin: rollup(finMap[boat.boat_id], FIN_TASKS, () => 'Complete', () => ''),
        };
      }
      setAppRows(app);
      if (asm && Array.isArray(asm.work_centers) && asm.work_centers.length) {
        // "Build Improvements" is a punch list, not a build stage — its open items
        // surface on the Shop Feed's Issues list instead of a grid column here.
        setWorkCenters(asm.work_centers.filter(w => !/build\s*improvement/i.test(w.name || '')));
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

  // Spare / Refit / Service boats: their one CompanyCam checklist can be named
  // anything, so route it into the QC column by boat TYPE rather than by name.
  const spareSet = new Set(boats.filter(b => b.is_spare).map(b => b.boat_id));
  // Aggregate all of a spare boat's CompanyCam rows into one (shown under QC).
  const spareCcRow = (boatId) => {
    const wcRows = Object.values(rows[boatId] || {});
    if (!wcRows.length) return null;
    let c = 0, t = 0; const remaining = [], items = [];
    for (const r of wcRows) {
      c += r.completed_items || 0; t += r.total_items || 0;
      if (Array.isArray(r.remaining)) remaining.push(...r.remaining);
      if (Array.isArray(r.items)) items.push(...r.items);
    }
    return { completed_items: c, total_items: t, remaining, items };
  };
  // A work center used ONLY by spare boats (e.g. a refit checklist) shouldn't add a
  // column for the whole fleet — hide it; its progress rides in the QC column instead.
  const isSpareOnly = (wcId) => {
    const withRow = Object.keys(rows).filter(bid => rows[bid]?.[wcId]);
    return withRow.length > 0 && withRow.every(bid => spareSet.has(bid));
  };

  const getRow = (boatId, wcId) => {
    if (wcId === '_lam' || wcId === '_fin') return appRows[boatId]?.[wcId] || null;
    if (wcId === 'quality-control' && spareSet.has(boatId)) return spareCcRow(boatId);
    return rows[boatId]?.[wcId] || null;
  };

  if (loading) return <div className="loading">Loading assembly board...</div>;

  const { visible, delivered } = applyDeliveredFilter(boats, showDelivered);
  // Phone = only in-production boats (matches the other tabs' employee view).
  const boardBoats = isMobile ? visible.filter(inProduction) : visible;
  const columns = [...APP_COLS, ...workCenters.filter(w => !isSpareOnly(w.id))];

  const menuBoat = menu ? boats.find(b => b.boat_id === menu.boatId) : null;
  const menuWc = menu ? columns.find(w => w.id === menu.wcId) : null;
  const menuRow = menu ? getRow(menu.boatId, menu.wcId) : null;
  // The full checklist for the popup. Our own columns (Lamination/Finishing) always carry a
  // per-item list; CompanyCam columns only send `remaining` until the backend adds `items`,
  // so fall back to listing the unfinished ones (Done names then live in CompanyCam).
  const menuItems = menuRow?.items
    ? menuRow.items
    : (menuRow?.remaining || []).map(name => ({ name, done: false }));
  const menuNoDoneNames = !menuRow?.items && (menuRow?.completed_items || 0) > 0;
  const shownItems = menuItems.filter(it =>
    checkFilter === 'todo' ? !it.done : checkFilter === 'done' ? it.done : true);

  const legend = (
    <div className="asm-legend">
      <span className="asm-legend-item"><i style={{ background: CELL.NOT_STARTED.bg }} />Not started</span>
      <span className="asm-legend-item"><i style={{ background: CELL.IN_PROGRESS.bg }} />In progress</span>
      <span className="asm-legend-item"><i style={{ background: CELL.COMPLETE.bg }} />Complete</span>
      <span className="asm-legend-item"><i style={{ background: '#fff', border: '1px solid #E2E6EA' }} />— No checklist</span>
      <span className="asm-legend-note">Tap a cell for what's left. Counts are tasks done / total — Lamination &amp; Finishing from this app, other columns from CompanyCam.</span>
    </div>
  );

  return (
    <div className="asm-wrap">
      <div className="asm-toolbar">
        <span className="asm-toolbar-note">
          {connected
            ? 'One board for the whole boat — Lamination & Finishing from this app, the rest live from CompanyCam. Read-only here.'
            : 'Lamination & Finishing are live from this app. CompanyCam columns are placeholders until the backend link is set up.'}
        </span>
        <span style={{ marginLeft: 'auto' }}><ShowDeliveredToggle count={delivered} on={showDelivered} onChange={setShowDelivered} /></span>
      </div>
      {isMobile ? (
        <div className="asm-cards">
          {boardBoats.map(boat => (
            <div key={boat.boat_id} className="asm-card">
              <div className="asm-card-head">
                <span className="asm-bid">{boat.boat_id} · {boat.customer_name} {boat.is_spare && <span className="spare-tag">SPARE / REFIT / SERVICE</span>} {asapBoats.has(boat.boat_id) && <span className="asap-boat">🔴 ORDER ASAP</span>}</span>
                <span className="asm-bmeta">{boat.boat_model} · <span className="asm-bhull">{boat.hull_color}</span></span>
              </div>
              {columns.map(w => {
                const row = getRow(boat.boat_id, w.id);
                const st = statusOf(row);
                const c = CELL[st];
                const pct = row?.total_items ? row.completed_items / row.total_items : 0;
                return (
                  <button key={w.id} className="asm-cardrow" disabled={!row}
                    onClick={() => { if (row) { setCheckFilter('todo'); setMenu({ boatId: boat.boat_id, wcId: w.id, x: 0, y: 0 }); } }}>
                    <span className="asm-cardrow-name">{w.name}</span>
                    {st === 'NONE' ? (
                      <span className="asm-cardrow-none">—</span>
                    ) : (
                      <span className="asm-cardrow-right">
                        <span className="asm-cardrow-count" style={{ color: c.fg }}>{row.completed_items}/{row.total_items}</span>
                        <span className="asm-cardrow-bar"><span style={{ width: `${Math.round(pct * 100)}%`, background: c.fg }} /></span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {boardBoats.length === 0 && <div className="feed-quiet">No boats in production right now.</div>}
          {legend}
        </div>
      ) : (
      <div className="asm-scroll">
        <table className="asm-table">
          <thead>
            <tr>
              <th className="asm-boathead">Boat</th>
              {columns.map(w => <th key={w.id} className={w.app ? 'asm-apphead' : ''}>{w.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {boardBoats.map(boat => (
              <tr key={boat.boat_id}>
                <td className="asm-boatcell">
                  <div className="asm-bid">{boat.boat_id} · {boat.customer_name} {boat.is_spare && <span className="spare-tag">SPARE / REFIT / SERVICE</span>} {asapBoats.has(boat.boat_id) && <span className="asap-boat">🔴 ORDER ASAP</span>}</div>
                  <div className="asm-bmeta">{boat.boat_model} · <span className="asm-bhull">{boat.hull_color}</span></div>
                </td>
                {columns.map(w => {
                  const row = getRow(boat.boat_id, w.id);
                  const st = statusOf(row);
                  const c = CELL[st];
                  const pct = row?.total_items ? row.completed_items / row.total_items : 0;
                  return (
                    <td key={w.id} className="asm-cell" style={{ background: c.bg, color: c.fg }}
                      onClick={(e) => { if (row) { setCheckFilter('todo'); setMenu({ boatId: boat.boat_id, wcId: w.id, x: e.clientX, y: e.clientY }); } }}>
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
        {legend}
      </div>
      )}

      {menu && menuBoat && menuWc && menuRow && (
        <ActionMenu className="asm-check-pop" anchor={{ x: menu.x, y: menu.y }} title={menuWc.name} subtitle={`${menuBoat.boat_id} · ${menuBoat.customer_name}`} onClose={() => setMenu(null)}>
          <div className="asm-menu-count">{menuRow.completed_items} / {menuRow.total_items} items complete</div>
          <div className="asm-check-tabs">
            {[['all', 'All'], ['todo', 'To do'], ['done', 'Done']].map(([k, label]) => (
              <button key={k} className={`asm-check-tab ${checkFilter === k ? 'on' : ''}`} onClick={() => setCheckFilter(k)}>{label}</button>
            ))}
          </div>
          <ul className="asm-checklist">
            {shownItems.map((it, i) => (
              <li key={i} className={`asm-check-item ${it.done ? 'done' : ''}`}>
                <span className="asm-check-box">{it.done ? '✓' : ''}</span>
                <span className="asm-check-name">{it.name}</span>
              </li>
            ))}
            {shownItems.length === 0 && (
              <li className="asm-check-empty">
                {checkFilter === 'todo' ? 'Nothing left — all complete.'
                  : checkFilter === 'done' && menuNoDoneNames ? 'Completed items are tracked in CompanyCam.'
                  : checkFilter === 'done' ? 'Nothing complete yet.'
                  : 'No checklist items.'}
              </li>
            )}
            {checkFilter === 'all' && menuNoDoneNames && (
              <li className="asm-check-note">{menuRow.completed_items} completed item{menuRow.completed_items === 1 ? '' : 's'} tracked in CompanyCam</li>
            )}
          </ul>
          <div className="am-spec-hint">
            {menuWc.app
              ? `Read-only here — update tasks on the ${menuWc.name} tab.`
              : 'Read-only — items are checked off in CompanyCam.'}
          </div>
        </ActionMenu>
      )}
    </div>
  );
}

export default AssemblyTracker;
