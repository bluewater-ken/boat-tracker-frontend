import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import ActionMenu from './ActionMenu';
import { FlagIcons, FlagToggles, KEYPARTS_FLAGS } from './flags';
import './KeyPartsTracker.css';

const STATUSES = ['Not Ordered', 'Ordered', 'Received'];
const CELL = {
  'Received': { bg: '#E8F5E9', fg: '#1B5E20' },
  'Ordered': { bg: '#FFF3E0', fg: '#E65100' },
  'Not Ordered': { bg: '#F5F5F5', fg: '#666' },
};

// Delivery dates are date-only strings ("YYYY-MM-DD"); format without timezone drift.
const fmtDate = (d) => { if (!d) return ''; const [, m, day] = d.slice(0, 10).split('-'); return `${+m}/${+day}`; };
const todayStr = () => new Date().toISOString().slice(0, 10);

// Auto-Late: past the expected delivery date and still not received (blank dates can't auto-flag).
const isAutoLate = (row) =>
  !!row.expected_delivery && row.status !== 'Received' && row.expected_delivery.slice(0, 10) < todayStr();

// Effective flags shown in the UI = stored flags, with Late OR'd with the auto rule.
const effFlags = (row) => ({
  flag_late: !!row.flag_late || isAutoLate(row),
  flag_backordered: !!row.flag_backordered,
  flag_unsatisfactory: !!row.flag_unsatisfactory,
});

function KeyPartsTracker() {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';

  const [boats, setBoats] = useState([]);
  const [standardParts, setStandardParts] = useState([]);
  const [partData, setPartData] = useState({});
  const [customNames, setCustomNames] = useState([]);
  const [view, setView] = useState('boat');
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [search, setSearch] = useState('');
  const [newCustom, setNewCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(null); // { boatId, partName, isCustom, draft }

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setLoading(true);
      const [b, sp, all, cn] = await Promise.all([
        apiFetch('/api/boats').then(r => r.json()),
        apiFetch('/api/parts/standard').then(r => r.json()),
        apiFetch('/api/parts').then(r => r.json()),
        apiFetch('/api/parts/custom-names').then(r => r.json()),
      ]);
      setBoats(b);
      setStandardParts(sp);
      setCustomNames(cn);
      const map = {};
      for (const row of all) {
        if (!map[row.boat_id]) map[row.boat_id] = {};
        map[row.boat_id][row.part_name] = row;
      }
      setPartData(map);
      if (b.length > 0) setSelectedBoat(b[0]);
    } catch (e) { alert('Failed to load parts. Check backend connection.'); }
    finally { setLoading(false); }
  };

  const getRow = (boatId, partName) => partData[boatId]?.[partName] || {};

  // Text under/after the status: expected date when Ordered, actual date when Received.
  const dateText = (row) => {
    const st = row.status || 'Not Ordered';
    if (st === 'Received') return fmtDate(row.actual_delivery);
    if (st === 'Ordered') return `exp ${fmtDate(row.expected_delivery) || '—'}`;
    return '';
  };

  // ---- Action menu (Ops only) ----
  const openMenu = (boatId, partName, isCustom = false) => {
    if (!isOps) return;
    const row = getRow(boatId, partName);
    setMenu({
      boatId, partName, isCustom,
      draft: {
        status: row.status || 'Not Ordered',
        expected_delivery: row.expected_delivery ? row.expected_delivery.slice(0, 10) : '',
        actual_delivery: row.actual_delivery ? row.actual_delivery.slice(0, 10) : '',
        flag_late: !!row.flag_late,
        flag_backordered: !!row.flag_backordered,
        flag_unsatisfactory: !!row.flag_unsatisfactory,
      },
    });
  };

  const setDraft = (patch) => setMenu(m => m ? { ...m, draft: { ...m.draft, ...patch } } : m);
  const setStatusDraft = (next) => setMenu(m => {
    if (!m) return m;
    const draft = { ...m.draft, status: next };
    if (next === 'Received' && !draft.actual_delivery) draft.actual_delivery = todayStr();
    return { ...m, draft };
  });
  const toggleFlag = (key) => setMenu(m => m ? { ...m, draft: { ...m.draft, [key]: !m.draft[key] } } : m);

  const saveMenu = async () => {
    const { boatId, partName, isCustom, draft } = menu;
    const body = {
      status: draft.status,
      is_custom: isCustom,
      expected_delivery: draft.expected_delivery || null,
      actual_delivery: draft.actual_delivery || null,
      flag_late: draft.flag_late,
      flag_backordered: draft.flag_backordered,
      flag_unsatisfactory: draft.flag_unsatisfactory,
    };
    const optimistic = { ...partData };
    if (!optimistic[boatId]) optimistic[boatId] = {};
    optimistic[boatId][partName] = { ...optimistic[boatId][partName], part_name: partName, ...body };
    setPartData(optimistic);
    setMenu(null);
    try {
      await apiFetch(`/api/parts/${boatId}/${encodeURIComponent(partName)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) { alert('Failed to save'); init(); }
  };

  const addCustom = async () => {
    const name = newCustom.trim();
    if (!name || !selectedBoat) return;
    setNewCustom('');
    await apiFetch(`/api/parts/${selectedBoat.boat_id}/${encodeURIComponent(name)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Ordered', is_custom: true }),
    });
    init();
  };

  const customForBoat = (boatId) => Object.values(partData[boatId] || {}).filter(p => p.is_custom);

  const filteredBoats = boats.filter(b =>
    b.boat_id?.toLowerCase().includes(search.toLowerCase()) ||
    b.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    b.boat_model?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="loading">Loading parts...</div>;

  const menuBoat = menu ? boats.find(b => b.boat_id === menu.boatId) : null;

  const actionMenu = menu && (
    <ActionMenu
      title={menu.partName}
      subtitle={`${menu.boatId}${menuBoat ? ` — ${menuBoat.customer_name}` : ''}`}
      onClose={() => setMenu(null)}
    >
      <div className="am-section">
        <div className="am-label">Status</div>
        <div className="am-status-row">
          {STATUSES.map(s => (
            <button key={s} className={`am-status-btn ${menu.draft.status === s ? 'active' : ''}`} onClick={() => setStatusDraft(s)}>{s}</button>
          ))}
        </div>
      </div>
      {(menu.draft.status === 'Ordered' || menu.draft.status === 'Received') && (
        <div className="am-section">
          <div className="am-label">Expected delivery {menu.draft.status === 'Ordered' ? '(optional)' : ''}</div>
          <input type="date" className="am-date-input" value={menu.draft.expected_delivery} onChange={e => setDraft({ expected_delivery: e.target.value })} />
        </div>
      )}
      {menu.draft.status === 'Received' && (
        <div className="am-section">
          <div className="am-label">Actual delivery</div>
          <input type="date" className="am-date-input" value={menu.draft.actual_delivery} onChange={e => setDraft({ actual_delivery: e.target.value })} />
        </div>
      )}
      <div className="am-section">
        <div className="am-label">Flags</div>
        <FlagToggles flags={menu.draft} defs={KEYPARTS_FLAGS} onToggle={toggleFlag} />
      </div>
      <button className="kpt-btn-primary" onClick={saveMenu}>Save</button>
    </ActionMenu>
  );

  if (view === 'table') {
    return (
      <div className="kpt-table-wrap">
        <div className="kpt-toolbar">
          <button className="kpt-btn" onClick={() => setView('boat')}>← Back to Boat View</button>
        </div>
        <div className="kpt-table-scroll">
          <table className="kpt-table">
            <thead>
              <tr>
                <th className="kpt-sticky-col">Boat • Customer</th>
                {standardParts.map(p => <th key={p}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {boats.map(boat => (
                <tr key={boat.boat_id}>
                  <td className="kpt-sticky-col">
                    <div className="kpt-boat-id">{boat.boat_id}</div>
                    <div className="kpt-boat-cust">{boat.customer_name}</div>
                  </td>
                  {standardParts.map(p => {
                    const row = getRow(boat.boat_id, p);
                    const st = row.status || 'Not Ordered';
                    const c = CELL[st];
                    return (
                      <td key={p} className={`kpt-cell ${isOps ? '' : 'readonly'}`} style={{ background: c.bg, color: c.fg }} onClick={() => openMenu(boat.boat_id, p, false)}>
                        <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} size={11} />
                        <div className="kpt-cell-status">{st === 'Not Ordered' ? '—' : st}</div>
                        {dateText(row) && <div className="kpt-cell-date">{dateText(row)}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="kpt-legend">
          <span><i style={{ background: '#E8F5E9' }}></i>Received</span>
          <span><i style={{ background: '#FFF3E0' }}></i>Ordered</span>
          <span><i style={{ background: '#F5F5F5' }}></i>Not Ordered</span>
        </div>
        {actionMenu}
      </div>
    );
  }

  return (
    <div className="kpt">
      <div className="kpt-list-panel">
        <input className="kpt-search" placeholder="Search by ID, customer, or model..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="kpt-btn-primary" onClick={() => setView('table')}>View by Part Type</button>
        <div className="kpt-boats">
          {filteredBoats.map(boat => (
            <div key={boat.boat_id} className={`kpt-boat-row ${selectedBoat?.boat_id === boat.boat_id ? 'selected' : ''}`} onClick={() => setSelectedBoat(boat)}>
              <div className="kpt-boat-id">{boat.boat_id} - {boat.customer_name}</div>
              <div className="kpt-boat-cust">{boat.hull_color} {boat.boat_model}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="kpt-detail">
        {selectedBoat ? (
          <>
            <h2>{selectedBoat.boat_id} - {selectedBoat.customer_name}</h2>
            {!isOps && <div className="kpt-readonly-note">View only — contact the office to change parts.</div>}
            <h3>Standard Parts ({standardParts.length})</h3>
            {standardParts.map(p => {
              const row = getRow(selectedBoat.boat_id, p);
              const st = row.status || 'Not Ordered';
              const c = CELL[st];
              return (
                <div key={p} className={`kpt-part ${isOps ? '' : 'readonly'}`} onClick={() => openMenu(selectedBoat.boat_id, p, false)}>
                  <span className="kpt-part-name">{p}</span>
                  <span className="kpt-part-right">
                    <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} />
                    <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}{dateText(row) ? ` • ${dateText(row)}` : ''}</span>
                  </span>
                </div>
              );
            })}
            <h3 style={{ marginTop: 20 }}>Custom Parts (Extras)</h3>
            {isOps && (
              <div className="kpt-add">
                <input list="custom-suggestions" placeholder="Add custom part..." value={newCustom} onChange={e => setNewCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustom()} />
                <datalist id="custom-suggestions">
                  {customNames.map(n => <option key={n} value={n} />)}
                </datalist>
                <button onClick={addCustom}>+ Add</button>
              </div>
            )}
            {customForBoat(selectedBoat.boat_id).map(row => {
              const st = row.status || 'Not Ordered';
              const c = CELL[st];
              return (
                <div key={row.part_name} className={`kpt-part ${isOps ? '' : 'readonly'}`} onClick={() => openMenu(selectedBoat.boat_id, row.part_name, true)}>
                  <span className="kpt-part-name">{row.part_name}</span>
                  <span className="kpt-part-right">
                    <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} />
                    <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}{dateText(row) ? ` • ${dateText(row)}` : ''}</span>
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

export default KeyPartsTracker;
