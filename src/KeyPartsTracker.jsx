import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import ActionMenu, { MenuBtn, MenuLabel, MenuToggle } from './ActionMenu';
import { FlagIcons, KEYPARTS_FLAGS } from './flags';
import { colorOptions } from './colors';
import './KeyPartsTracker.css';

const STATUSES = ['Not Ordered', 'Ordered', 'Received'];
// Cell palette matches BluewaterDemo.jsx.
const CELL = {
  'Not Ordered': { bg: '#F1EFE8', fg: '#5F5E5A' },
  'Ordered': { bg: '#FAEEDA', fg: '#854F0B' },
  'Received': { bg: '#EAF3DE', fg: '#3B6D11' },
};

const fmtDate = (d) => { if (!d) return ''; const [, m, day] = d.slice(0, 10).split('-'); return `${+m}/${+day}`; };
const todayStr = () => new Date().toISOString().slice(0, 10);

const isAutoLate = (row) =>
  !!row.expected_delivery && row.status !== 'Received' && row.expected_delivery.slice(0, 10) < todayStr();

const effFlags = (row) => ({
  flag_late: !!row.flag_late || isAutoLate(row),
  flag_backordered: !!row.flag_backordered,
  flag_unsatisfactory: !!row.flag_unsatisfactory,
});

// Delivery-date label: expected when Ordered, actual when Received.
const dateLabel = (row) => {
  const st = row.status || 'Not Ordered';
  if (st === 'Received') return fmtDate(row.actual_delivery);
  if (st === 'Ordered') return `exp ${fmtDate(row.expected_delivery) || '—'}`;
  return '';
};

// DUMMY SEED DATA — placeholders so the feature is clickable before the real
// lists exist. Ken will add the real parts/specs in production (they persist
// via the backend, per API_CONTRACT.md). Safe to delete once real data flows.
const DUMMY_CUSTOM_PARTS = ['Outriggers', 'Hardtop', 'Underwater Lights', 'Radar', 'Autopilot', 'Livewell Pump', 'Dive Door', 'Spotlight'];
const DUMMY_SPEC_OPTIONS = {
  'Motors': ['Twin Yamaha 300', 'Triple Yamaha 300', 'Triple Suzuki 350', 'Quad Mercury 400'],
  'Gelcoat': ['White', 'Ice Blue', 'Matterhorn White'],
  'Steering': ['SeaStar hydraulic', 'Optimus EPS'],
  'Trailer': ['Aluminum tri-axle', 'Aluminum dual-axle'],
};

function KeyPartsTracker() {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';

  const [boats, setBoats] = useState([]);
  const [standardParts, setStandardParts] = useState([]);
  const [partData, setPartData] = useState({});
  const [customNames, setCustomNames] = useState([]);
  const [view, setView] = useState('table'); // table (default) | boat
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [search, setSearch] = useState('');
  const [newCustom, setNewCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(null); // { boatId, partName, isCustom, x, y }
  // Remembered spec/description options per part name (grows as values are entered).
  const [specOptions, setSpecOptions] = useState(DUMMY_SPEC_OPTIONS);

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
      // Merge backend custom-part names with the dummy seed list.
      setCustomNames(Array.from(new Set([...cn, ...DUMMY_CUSTOM_PARTS])));
      const map = {};
      const opts = { ...DUMMY_SPEC_OPTIONS };
      for (const row of all) {
        if (!map[row.boat_id]) map[row.boat_id] = {};
        map[row.boat_id][row.part_name] = row;
        // Remember any spec value already saved on a part, per part name.
        if (row.description) {
          if (!opts[row.part_name]) opts[row.part_name] = [];
          if (!opts[row.part_name].includes(row.description)) opts[row.part_name].push(row.description);
        }
      }
      setPartData(map);
      setSpecOptions(opts);
      if (b.length > 0) setSelectedBoat(b[0]);
    } catch (e) { alert('Failed to load parts. Check backend connection.'); }
    finally { setLoading(false); }
  };

  const getRow = (boatId, partName) => partData[boatId]?.[partName] || {};

  // Persist a partial change and update local state optimistically.
  const save = async (boatId, partName, isCustom, patch) => {
    setPartData(prev => {
      const next = { ...prev };
      next[boatId] = { ...(next[boatId] || {}), [partName]: { ...(next[boatId]?.[partName]), part_name: partName, is_custom: isCustom, ...patch } };
      return next;
    });
    try {
      await apiFetch(`/api/parts/${boatId}/${encodeURIComponent(partName)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_custom: isCustom, ...patch }),
      });
    } catch (e) { alert('Failed to save'); init(); }
  };

  const advance = (boatId, partName, isCustom) => {
    const row = getRow(boatId, partName);
    const i = STATUSES.indexOf(row.status || 'Not Ordered');
    if (i >= STATUSES.length - 1) return;
    const next = STATUSES[i + 1];
    const patch = { status: next };
    if (next === 'Received' && !row.actual_delivery) patch.actual_delivery = todayStr();
    save(boatId, partName, isCustom, patch);
  };
  const stepBack = (boatId, partName, isCustom) => {
    const row = getRow(boatId, partName);
    const i = STATUSES.indexOf(row.status || 'Not Ordered');
    if (i <= 0) return;
    save(boatId, partName, isCustom, { status: STATUSES[i - 1] });
  };
  const toggleFlag = (boatId, partName, isCustom, key) => {
    save(boatId, partName, isCustom, { [key]: !getRow(boatId, partName)[key] });
  };
  const setDate = (boatId, partName, isCustom, field, val) => {
    save(boatId, partName, isCustom, { [field]: val || null });
  };
  // Set the spec/description; remember new values per part name for future picks.
  const setDescription = (boatId, partName, isCustom, val) => {
    save(boatId, partName, isCustom, { description: val || null });
    if (val && !(specOptions[partName] || []).includes(val)) {
      setSpecOptions(prev => ({ ...prev, [partName]: [...(prev[partName] || []), val] }));
    }
  };

  const openMenu = (e, boatId, partName, isCustom = false) => {
    if (!isOps) return;
    setMenu({ boatId, partName, isCustom, x: e.clientX, y: e.clientY });
  };

  // Hull color is the boat's identifier — editable here and on Boat Information
  // (shared color list). Update locally on change, persist to the boat on blur.
  const updateColorLocal = (boatId, color) => {
    setBoats(bs => bs.map(b => b.boat_id === boatId ? { ...b, hull_color: color } : b));
    setSelectedBoat(sb => sb && sb.boat_id === boatId ? { ...sb, hull_color: color } : sb);
  };
  const persistColor = async (boat) => {
    try {
      await apiFetch(`/api/boats/${boat.boat_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(boat) });
    } catch (e) { alert('Failed to update color'); init(); }
  };

  const addCustom = async () => {
    const name = newCustom.trim();
    if (!name || !selectedBoat) return;
    setNewCustom('');
    await save(selectedBoat.boat_id, name, true, { status: 'Ordered' });
    apiFetch('/api/parts/custom-names').then(r => r.json()).then(setCustomNames).catch(() => {});
  };

  const customForBoat = (boatId) => Object.values(partData[boatId] || {}).filter(p => p.is_custom);
  const filteredBoats = boats.filter(b =>
    b.boat_id?.toLowerCase().includes(search.toLowerCase()) ||
    b.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    b.boat_model?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="loading">Loading parts...</div>;

  const menuBoat = menu ? boats.find(b => b.boat_id === menu.boatId) : null;
  const menuRow = menu ? getRow(menu.boatId, menu.partName) : {};
  const menuStatus = menuRow.status || 'Not Ordered';
  const menuIdx = STATUSES.indexOf(menuStatus);

  const actionMenu = menu && (
    <ActionMenu anchor={{ x: menu.x, y: menu.y }} title={menu.partName} subtitle={`${menu.boatId}${menuBoat ? ' · ' + menuBoat.customer_name : ''}`} onClose={() => setMenu(null)}>
      <MenuBtn label="Advance ›" primary disabled={menuIdx >= STATUSES.length - 1} onClick={() => advance(menu.boatId, menu.partName, menu.isCustom)} />
      <MenuBtn label="‹ Step back" disabled={menuIdx <= 0} onClick={() => stepBack(menu.boatId, menu.partName, menu.isCustom)} />
      <MenuLabel>Description / spec</MenuLabel>
      <input className="am-spec-input" list={`spec-opts-${menu.partName}`} value={menuRow.description || ''} placeholder="e.g. Triple Suzuki 350" onChange={e => setDescription(menu.boatId, menu.partName, menu.isCustom, e.target.value)} />
      <datalist id={`spec-opts-${menu.partName}`}>
        {(specOptions[menu.partName] || []).map(o => <option key={o} value={o} />)}
      </datalist>
      <div className="am-spec-hint">Pick a saved spec or type a new one (saved for next time).</div>
      {(menuStatus === 'Ordered' || menuStatus === 'Received') && (
        <>
          <MenuLabel>Expected delivery</MenuLabel>
          <input type="date" className="am-date-input" value={menuRow.expected_delivery ? menuRow.expected_delivery.slice(0, 10) : ''} onChange={e => setDate(menu.boatId, menu.partName, menu.isCustom, 'expected_delivery', e.target.value)} />
        </>
      )}
      {menuStatus === 'Received' && (
        <>
          <MenuLabel>Actual delivery</MenuLabel>
          <input type="date" className="am-date-input" value={menuRow.actual_delivery ? menuRow.actual_delivery.slice(0, 10) : ''} onChange={e => setDate(menu.boatId, menu.partName, menu.isCustom, 'actual_delivery', e.target.value)} />
        </>
      )}
      <MenuLabel>Flags</MenuLabel>
      {KEYPARTS_FLAGS.map(f => (
        <MenuToggle key={f.key} label={f.label} color={f.color} active={!!menuRow[f.key]} onClick={() => toggleFlag(menu.boatId, menu.partName, menu.isCustom, f.key)} />
      ))}
    </ActionMenu>
  );

  if (view === 'table') {
    return (
      <div className="kpt-tablewrap">
        <div className="kpt-toolbar">
          <button className="kpt-toggle" onClick={() => setView('boat')}>Boat view</button>
          <span className="kpt-toolbar-note">{isOps ? 'Tap a cell to update.' : 'View only — contact the office to change parts.'}</span>
        </div>
        <div className="kpt-scroll">
          <table className="kpt-table">
            <thead>
              <tr>
                <th className="kpt-boathead">Boat</th>
                {standardParts.map(p => <th key={p}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {boats.map(boat => (
                <tr key={boat.boat_id}>
                  <td className="kpt-boatcell">
                    <div className="kpt-bid">{boat.boat_id}</div>
                    <div className="kpt-bcust">{boat.customer_name} · {boat.boat_model}</div>
                    <div className="kpt-bhull">{boat.hull_color}</div>
                  </td>
                  {standardParts.map(p => {
                    const row = getRow(boat.boat_id, p);
                    const st = row.status || 'Not Ordered';
                    const c = CELL[st];
                    return (
                      <td key={p} className={`kpt-cell ${isOps ? '' : 'readonly'}`} style={{ background: c.bg, color: c.fg }} onClick={(e) => openMenu(e, boat.boat_id, p, false)}>
                        <span className="kpt-flagwrap"><FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} size={12} /></span>
                        <div className="kpt-cellstatus">{st}</div>
                        {dateLabel(row) && <div className="kpt-celldate">{dateLabel(row)}</div>}
                        {row.description && <div className="kpt-cellspec">{row.description}</div>}
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
    <div className="kpt">
      <div className="kpt-list-panel">
        <button className="kpt-toggle" onClick={() => setView('table')}>← Part grid</button>
        <input className="kpt-search" placeholder="Search by ID, customer, or model..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="kpt-boats">
          {filteredBoats.map(boat => (
            <div key={boat.boat_id} className={`kpt-boat-row ${selectedBoat?.boat_id === boat.boat_id ? 'selected' : ''}`} onClick={() => setSelectedBoat(boat)}>
              <div className="kpt-bid">{boat.boat_id} - {boat.customer_name}</div>
              <div className="kpt-bhull">{boat.hull_color} {boat.boat_model}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="kpt-detail">
        {selectedBoat ? (
          <>
            <h2>{selectedBoat.boat_id} - {selectedBoat.customer_name}</h2>
            <div className="kpt-colorrow">
              <label>Hull color</label>
              {isOps ? (
                <input className="kpt-colorinput" list="kpt-color-opts" value={selectedBoat.hull_color || ''} placeholder="Pick or type a color..."
                  onChange={e => updateColorLocal(selectedBoat.boat_id, e.target.value)} onBlur={() => persistColor(selectedBoat)} />
              ) : <span className="kpt-colorval">{selectedBoat.hull_color || '—'}</span>}
              <datalist id="kpt-color-opts">{colorOptions(boats).map(c => <option key={c} value={c} />)}</datalist>
            </div>
            {!isOps && <div className="kpt-readonly-note">View only — contact the office to change parts.</div>}
            <h3>Standard Parts ({standardParts.length})</h3>
            {standardParts.map(p => {
              const row = getRow(selectedBoat.boat_id, p);
              const st = row.status || 'Not Ordered';
              const c = CELL[st];
              return (
                <div key={p} className={`kpt-part ${isOps ? '' : 'readonly'}`} onClick={(e) => openMenu(e, selectedBoat.boat_id, p, false)}>
                  <span className="kpt-part-main">
                    <span className="kpt-part-name">{p}</span>
                    {row.description && <span className="kpt-part-spec">{row.description}</span>}
                  </span>
                  <span className="kpt-part-right">
                    <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} size={14} />
                    <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}{dateLabel(row) ? ` • ${dateLabel(row)}` : ''}</span>
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
                <div key={row.part_name} className={`kpt-part ${isOps ? '' : 'readonly'}`} onClick={(e) => openMenu(e, selectedBoat.boat_id, row.part_name, true)}>
                  <span className="kpt-part-main">
                    <span className="kpt-part-name">{row.part_name}</span>
                    {row.description && <span className="kpt-part-spec">{row.description}</span>}
                  </span>
                  <span className="kpt-part-right">
                    <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} size={14} />
                    <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}{dateLabel(row) ? ` • ${dateLabel(row)}` : ''}</span>
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
    <div className="kpt-legend">
      <div className="kpt-legend-title">Status</div>
      <div className="kpt-legend-row">
        {STATUSES.map(s => (
          <span key={s} className="kpt-legend-item"><i className="kpt-legend-sw" style={{ background: CELL[s].bg }} />{s}</span>
        ))}
      </div>
      <div className="kpt-legend-title" style={{ marginTop: 11 }}>Flags</div>
      <div className="kpt-legend-row">
        {KEYPARTS_FLAGS.map(f => (
          <span key={f.key} className="kpt-legend-item"><FlagIcons flags={{ [f.key]: true }} defs={[f]} size={14} />{f.label}</span>
        ))}
      </div>
      <div className="kpt-legend-note">Dates are delivery dates: “exp” = expected (set when Ordered), plain = actual received. Late auto-flags once past the expected date. Ops-only editing.</div>
    </div>
  );
}

export default KeyPartsTracker;
