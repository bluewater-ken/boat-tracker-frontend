import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import ActionMenu, { MenuBtn, MenuLabel, MenuToggle } from './ActionMenu';
import { FlagIcons, KEYPARTS_FLAGS } from './flags';
import { colorOptions } from './colors';
import { applyDeliveredFilter, ShowDeliveredToggle, inProduction } from './boatFilter';
import SmartInput from './SmartInput';
import useIsMobile from './useIsMobile';
import './KeyPartsTracker.css';

const STATUSES = ['Not Ordered', 'Ordered', 'Received'];
const NA = 'Not Applicable';
// Expressive palette: color alone carries the status on the grid (no status word).
// Not Ordered recedes to near-white; Ordered = strong amber; Received = strong green;
// N/A = the app-wide gray (distinct from Not Ordered), used on Lamination/Finishing too.
const CELL = {
  'Not Ordered': { bg: '#F4F3EE', fg: '#9B998F' },
  'Ordered': { bg: '#FAC775', fg: '#633806' },
  'Received': { bg: '#9CCB62', fg: '#1F3D07' },
  'Not Applicable': { bg: '#E4E4E7', fg: '#7A7A80' },
};
// A part marked N/A shows N/A regardless of its stored status, and drops out of counts.
const statusOf = (row) => (row.na ? NA : (row.status || 'Not Ordered'));

const fmtDate = (d) => { if (!d) return ''; const [, m, day] = d.slice(0, 10).split('-'); return `${+m}/${+day}`; };
const todayStr = () => new Date().toISOString().slice(0, 10);

const isAutoLate = (row) =>
  !!row.expected_delivery && row.status !== 'Received' && row.expected_delivery.slice(0, 10) < todayStr();

const effFlags = (row) => ({
  flag_late: !!row.flag_late || isAutoLate(row),
  flag_backordered: !!row.flag_backordered,
  flag_partial: !!row.flag_partial,
  flag_unsatisfactory: !!row.flag_unsatisfactory,
});

// Date label: order date once Ordered, plus expected (Ordered) or actual (Received).
// e.g. "ord 7/6 · exp 7/15"  or  "ord 7/6 · 7/20".
// Order date: order_date if present, else the original schema's ordered_at timestamp.
const orderDateOf = (row) => row.order_date || row.ordered_at || null;
// Received date: the editable actual_delivery, else the received_at timestamp.
const receivedDateOf = (row) => row.actual_delivery || row.received_at || null;
const dateLabel = (row) => {
  const st = statusOf(row);
  const ord = fmtDate(orderDateOf(row));
  const ordPart = ord ? `ord ${ord}` : '';
  if (st === 'Received') {
    const rec = fmtDate(receivedDateOf(row));
    return [ordPart, rec ? `rec ${rec}` : ''].filter(Boolean).join(' · ');
  }
  if (st === 'Ordered') return [ordPart, `exp ${fmtDate(row.expected_delivery) || '—'}`].filter(Boolean).join(' · ');
  return '';
};

// DUMMY SEED DATA — placeholder spec suggestions until enough real specs are
// saved. (The custom-parts name list is live backend data — no seeds, so
// deleting a name sticks.)
const DUMMY_SPEC_OPTIONS = {
  'Motors': ['Twin Yamaha 300', 'Triple Yamaha 300', 'Triple Suzuki 350', 'Quad Mercury 400'],
  'Gelcoat': ['White', 'Ice Blue', 'Matterhorn White'],
  'Steering': ['SeaStar hydraulic', 'Optimus EPS'],
  'Trailer': ['Aluminum tri-axle', 'Aluminum dual-axle'],
};

function KeyPartsTracker() {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';
  const isMobile = useIsMobile();

  const [boats, setBoats] = useState([]);
  const [standardParts, setStandardParts] = useState([]);
  const [partData, setPartData] = useState({});
  const [customNames, setCustomNames] = useState([]);
  const [view, setView] = useState(() => isMobile ? 'boat' : 'table'); // table (default) | boat
  const [mobileView, setMobileView] = useState('list'); // phone master→detail: list | detail
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [search, setSearch] = useState('');
  const [showDelivered, setShowDelivered] = useState(false);
  const [newCustom, setNewCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(null); // { boatId, partName, isCustom, x, y }
  const [customList, setCustomList] = useState(null); // { boatId, x, y } — grid drill-down
  const [customSel, setCustomSel] = useState(null); // { side: 'all'|'boat', name } — two-box selection
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
      setCustomNames(cn);
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
    if (row.na) return; // N/A parts don't cycle
    const i = STATUSES.indexOf(row.status || 'Not Ordered');
    if (i >= STATUSES.length - 1) return;
    const next = STATUSES[i + 1];
    const patch = { status: next };
    if (next === 'Ordered' && !orderDateOf(row)) patch.ordered_at = todayStr();
    // Ordering it fulfills the "order ASAP" priority — clear the tag.
    if (next === 'Ordered' && row.order_asap) patch.order_asap = false;
    if (next === 'Received' && !row.actual_delivery) patch.actual_delivery = todayStr();
    save(boatId, partName, isCustom, patch);
  };
  const stepBack = (boatId, partName, isCustom) => {
    const row = getRow(boatId, partName);
    if (row.na) return;
    const i = STATUSES.indexOf(row.status || 'Not Ordered');
    if (i <= 0) return;
    save(boatId, partName, isCustom, { status: STATUSES[i - 1] });
  };
  const toggleNa = (boatId, partName, isCustom) => {
    save(boatId, partName, isCustom, { na: !getRow(boatId, partName).na });
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

  const customForBoat = (boatId) => Object.values(partData[boatId] || {}).filter(p => p.is_custom);
  const sortedCustom = (boatId) => [...customForBoat(boatId)].sort((a, b) => a.part_name.localeCompare(b.part_name));
  const customRollup = (boatId) => {
    const cs = customForBoat(boatId).filter(p => !p.na); // N/A parts don't count
    return { received: cs.filter(p => (p.status || 'Not Ordered') === 'Received').length, total: cs.length };
  };
  const availableForBoat = (boatId) => {
    const onBoat = new Set(customForBoat(boatId).map(p => p.part_name));
    return customNames.filter(n => !onBoat.has(n)).sort((a, b) => a.localeCompare(b));
  };
  const moveToBoat = (name) => { if (selectedBoat) { save(selectedBoat.boat_id, name, true, { status: 'Not Ordered' }); setCustomSel(null); } };
  const removeFromBoat = async (boatId, partName) => {
    setCustomSel(null);
    setPartData(prev => { const next = { ...prev }; if (next[boatId]) { const c = { ...next[boatId] }; delete c[partName]; next[boatId] = c; } return next; });
    try {
      const r = await apiFetch(`/api/parts/${boatId}/${encodeURIComponent(partName)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
    } catch (e) { alert('Removing a part needs the backend delete endpoint (coming in the server update).'); init(); }
  };
  // Delete a name from the master custom-parts list (Ops). Boats that already
  // have the part keep their rows — this only removes it from the addable list.
  const deleteCustomName = async (name) => {
    if (!window.confirm(`Delete "${name}" from the custom parts list?\nBoats that already have it keep it.`)) return;
    setCustomSel(null);
    setCustomNames(prev => prev.filter(n => n !== name));
    try {
      const r = await apiFetch(`/api/parts/custom-names/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
    } catch (e) { alert('Deleting a name needs the backend endpoint (coming in the server update).'); init(); }
  };
  const addNewCustomName = () => {
    const name = newCustom.trim();
    if (!name || !selectedBoat) return;
    setNewCustom('');
    setCustomNames(prev => Array.from(new Set([...prev, name])));
    save(selectedBoat.boat_id, name, true, { status: 'Not Ordered' });
  };

  const { visible, delivered } = applyDeliveredFilter(boats, showDelivered);
  // On the phone (employee view) only show boats actually in production (Glass Shop onward).
  const filteredBoats = visible.filter(b =>
    (!isMobile || inProduction(b)) && (
    b.boat_id?.toLowerCase().includes(search.toLowerCase()) ||
    b.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    b.boat_model?.toLowerCase().includes(search.toLowerCase())));

  if (loading) return <div className="loading">Loading parts...</div>;

  const menuBoat = menu ? boats.find(b => b.boat_id === menu.boatId) : null;
  const menuRow = menu ? getRow(menu.boatId, menu.partName) : {};
  const menuNa = !!menuRow.na;
  const menuStatus = menuRow.status || 'Not Ordered';
  const menuIdx = STATUSES.indexOf(menuStatus);

  const actionMenu = menu && (
    <ActionMenu anchor={{ x: menu.x, y: menu.y }} title={menu.partName} subtitle={`${menu.boatId}${menuBoat ? ' · ' + menuBoat.customer_name : ''}`} onClose={() => setMenu(null)}>
      <MenuBtn label={menuIdx >= STATUSES.length - 1 ? 'Received' : `Advance to ${STATUSES[menuIdx + 1]} ›`} primary disabled={menuNa || menuIdx >= STATUSES.length - 1} onClick={() => advance(menu.boatId, menu.partName, menu.isCustom)} />
      <MenuBtn label={menuIdx <= 0 ? '‹ Step back' : `‹ Back to ${STATUSES[menuIdx - 1]}`} disabled={menuNa || menuIdx <= 0} onClick={() => stepBack(menu.boatId, menu.partName, menu.isCustom)} />
      <MenuBtn label={menuNa ? 'Clear N/A' : 'Set Not Applicable'} onClick={() => toggleNa(menu.boatId, menu.partName, menu.isCustom)} />
      {!menuNa && menuStatus !== 'Received' && (
        <MenuToggle label="🔴 Order ASAP" color="#A32D2D" active={!!menuRow.order_asap} onClick={() => toggleFlag(menu.boatId, menu.partName, menu.isCustom, 'order_asap')} />
      )}
      {menu.isCustom ? (
        <>
          <MenuLabel>Notes</MenuLabel>
          <textarea className="am-notes" value={menuRow.description || ''} placeholder="Notes for this part (supplier, lead time, details)..." onChange={e => save(menu.boatId, menu.partName, true, { description: e.target.value || null })} />
        </>
      ) : (
        <>
          <MenuLabel>Description / spec</MenuLabel>
          <SmartInput className="am-spec-input" storeKey={`spec:${menu.partName}`} options={specOptions[menu.partName] || []} value={menuRow.description || ''} placeholder="e.g. Triple Suzuki 350" onChange={v => setDescription(menu.boatId, menu.partName, false, v)} />
          <div className="am-spec-hint">Pick a saved spec or type a new one (saved for next time). ✕ removes a suggestion.</div>
        </>
      )}
      {(menuStatus === 'Ordered' || menuStatus === 'Received') && (
        <>
          <MenuLabel>Order date</MenuLabel>
          <input type="date" className="am-date-input" value={orderDateOf(menuRow) ? orderDateOf(menuRow).slice(0, 10) : ''} onChange={e => setDate(menu.boatId, menu.partName, menu.isCustom, 'ordered_at', e.target.value)} />
        </>
      )}
      {(menuStatus === 'Ordered' || menuStatus === 'Received') && (
        <>
          <MenuLabel>Expected delivery</MenuLabel>
          <input type="date" className="am-date-input" value={menuRow.expected_delivery ? menuRow.expected_delivery.slice(0, 10) : ''} onChange={e => setDate(menu.boatId, menu.partName, menu.isCustom, 'expected_delivery', e.target.value)} />
        </>
      )}
      {menuStatus === 'Received' && (
        <>
          <MenuLabel>Received date</MenuLabel>
          <input type="date" className="am-date-input" value={receivedDateOf(menuRow) ? receivedDateOf(menuRow).slice(0, 10) : ''} onChange={e => setDate(menu.boatId, menu.partName, menu.isCustom, 'actual_delivery', e.target.value)} />
        </>
      )}
      <MenuLabel>Flags</MenuLabel>
      {KEYPARTS_FLAGS.map(f => (
        <MenuToggle key={f.key} label={f.label} color={f.color} active={!!menuRow[f.key]} onClick={() => toggleFlag(menu.boatId, menu.partName, menu.isCustom, f.key)} />
      ))}
    </ActionMenu>
  );

  // Drill-down popup: the custom parts on one boat (opened from the grid's Custom column).
  const clBoat = customList ? boats.find(b => b.boat_id === customList.boatId) : null;
  const clRoll = customList ? customRollup(customList.boatId) : null;
  const customListMenu = customList && clBoat && (
    <ActionMenu anchor={{ x: customList.x, y: customList.y }} title="Custom parts" subtitle={`${clBoat.boat_id} · ${clRoll.received}/${clRoll.total} received`} onClose={() => setCustomList(null)}>
      {sortedCustom(customList.boatId).length === 0 && <div className="am-menu-note">No custom parts on this boat yet — add them from Boat view.</div>}
      {sortedCustom(customList.boatId).map(row => {
        const st = statusOf(row);
        const c = CELL[st];
        return (
          <button key={row.part_name} className="kpt-cprow" onClick={(e) => { setCustomList(null); openMenu(e, customList.boatId, row.part_name, true); }}>
            <span className="kpt-cpname">{!row.na && row.order_asap && st !== 'Received' && <span className="kpt-asap">ASAP</span>}{!row.na && <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} size={12} />}{row.part_name}{row.description ? ' 📝' : ''}</span>
            <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}{dateLabel(row) ? ` • ${dateLabel(row)}` : ''}</span>
          </button>
        );
      })}
      <div className="am-menu-note">Tap a part to set status, dates, flags, or notes.</div>
    </ActionMenu>
  );

  if (view === 'table') {
    return (
      <div className="kpt-tablewrap">
        <div className="kpt-toolbar">
          <button className="kpt-toggle" onClick={() => setView('boat')}>Boat view</button>
          <span className="kpt-toolbar-note">{isOps ? 'Tap a cell to update.' : 'View only — contact the office to change parts.'}</span>
          <span style={{ marginLeft: 'auto' }}><ShowDeliveredToggle count={delivered} on={showDelivered} onChange={setShowDelivered} /></span>
        </div>
        <div className="kpt-scroll">
          <table className="kpt-table">
            <thead>
              <tr>
                <th className="kpt-boathead">Boat</th>
                {standardParts.map(p => <th key={p}>{p}</th>)}
                <th className="kpt-customhead">Custom</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(boat => (
                <tr key={boat.boat_id}>
                  <td className="kpt-boatcell">
                    <div className="kpt-bid">{boat.boat_id} · {boat.customer_name}</div>
                    <div className="kpt-bmeta">{boat.boat_model} · <span className="kpt-bhull">{boat.hull_color}</span></div>
                  </td>
                  {standardParts.map(p => {
                    const row = getRow(boat.boat_id, p);
                    const st = statusOf(row);
                    const c = CELL[st];
                    // One anchor fact per cell — color carries the status, the line
                    // carries the date that matters: → incoming, ✓ landed, — untouched.
                    const primary = st === NA ? 'N/A'
                      : st === 'Received' ? `✓ ${fmtDate(receivedDateOf(row)) || ''}`.trim()
                      : st === 'Ordered' ? `→ exp ${fmtDate(row.expected_delivery) || '—'}`
                      : '—';
                    // Everything (incl. the ord date) stays one hover / one tap away.
                    const tip = [`${p} — ${st}`,
                      !row.na && orderDateOf(row) && `ord ${fmtDate(orderDateOf(row))}`,
                      !row.na && row.expected_delivery && `exp ${fmtDate(row.expected_delivery)}`,
                      !row.na && st === 'Received' && receivedDateOf(row) && `rec ${fmtDate(receivedDateOf(row))}`,
                      row.description].filter(Boolean).join(' · ');
                    return (
                      <td key={p} title={tip} className={`kpt-cell ${isOps ? '' : 'readonly'}`} style={{ background: c.bg, color: c.fg }} onClick={(e) => openMenu(e, boat.boat_id, p, false)}>
                        {!row.na && row.order_asap && st !== 'Received' && <div className="kpt-asap">ORDER ASAP</div>}
                        <div className="kpt-cellprimary">{primary}{!row.na && <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} size={11} />}</div>
                        {row.description && <div className="kpt-cellspec">{row.description}</div>}
                      </td>
                    );
                  })}
                  {(() => {
                    const { received, total } = customRollup(boat.boat_id);
                    const cls = total === 0 ? 'chip-none' : received === total ? 'chip-done' : 'chip-part';
                    return (
                      <td className={`kpt-customcell ${isOps ? '' : 'readonly'}`} onClick={(e) => isOps && setCustomList({ boatId: boat.boat_id, x: e.clientX, y: e.clientY })}>
                        <span className={`kpt-chip ${cls}`}>{total === 0 ? '—' : `${received}/${total}${received === total ? ' ✓' : ''}`}</span>
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
          <Legend />
        </div>
        {actionMenu}
        {customListMenu}
      </div>
    );
  }

  // On phones, show either the boat list or the selected boat's parts (not both).
  const pickBoat = (boat) => { setSelectedBoat(boat); if (isMobile) setMobileView('detail'); };
  const showList = !isMobile || mobileView === 'list';
  const showDetail = !isMobile || mobileView === 'detail';

  return (
    <div className={`kpt ${isMobile ? 'kpt-mobile' : ''}`}>
      {showList && (
      <div className="kpt-list-panel">
        {!isMobile && <button className="kpt-toggle" onClick={() => setView('table')}>← Part grid</button>}
        <input className="kpt-search" placeholder="Search by ID, customer, or model..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="kpt-boats">
          {filteredBoats.map(boat => (
            <div key={boat.boat_id} className={`kpt-boat-row ${selectedBoat?.boat_id === boat.boat_id ? 'selected' : ''}`} onClick={() => pickBoat(boat)}>
              <div className="kpt-bid">{boat.boat_id} - {boat.customer_name}</div>
              <div className="kpt-bhull">{boat.hull_color} {boat.boat_model}</div>
            </div>
          ))}
        </div>
      </div>
      )}
      {showDetail && (
      <div className="kpt-detail">
        {isMobile && <button className="kpt-back" onClick={() => setMobileView('list')}>← Boats</button>}
        {selectedBoat ? (
          <>
            <h2>{selectedBoat.boat_id} - {selectedBoat.customer_name}</h2>
            <div className="kpt-colorrow">
              <label>Hull color</label>
              {isOps ? (
                <SmartInput className="kpt-colorinput" storeKey="colors" options={colorOptions(boats)} value={selectedBoat.hull_color || ''} placeholder="Pick or type a color..."
                  onChange={v => updateColorLocal(selectedBoat.boat_id, v)} onBlur={() => persistColor(selectedBoat)} onEnter={() => persistColor(selectedBoat)} />
              ) : <span className="kpt-colorval">{selectedBoat.hull_color || '—'}</span>}
            </div>
            {!isOps && <div className="kpt-readonly-note">View only — contact the office to change parts.</div>}
            <h3>Standard Parts ({standardParts.length})</h3>
            {standardParts.map(p => {
              const row = getRow(selectedBoat.boat_id, p);
              const st = statusOf(row);
              const c = CELL[st];
              return (
                <div key={p} className={`kpt-part ${isOps ? '' : 'readonly'}`} onClick={(e) => openMenu(e, selectedBoat.boat_id, p, false)}>
                  <span className="kpt-part-main">
                    <span className="kpt-part-name">{p}</span>
                    {row.description && <span className="kpt-part-spec">{row.description}</span>}
                  </span>
                  <span className="kpt-part-right">
                    {!row.na && row.order_asap && st !== 'Received' && <span className="kpt-asap">ORDER ASAP</span>}
                    {!row.na && <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} size={14} />}
                    <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}{dateLabel(row) ? ` • ${dateLabel(row)}` : ''}</span>
                  </span>
                </div>
              );
            })}
            <h3 style={{ marginTop: 20 }}>Custom Parts (Extras)</h3>
            {isOps && !isMobile ? (
              <div className="kpt-transfer">
                <div className="kpt-tbox">
                  <div className="kpt-tbox-title">All custom parts</div>
                  <div className="kpt-tbox-list">
                    {availableForBoat(selectedBoat.boat_id).map(n => (
                      <div key={n} className={`kpt-titem ${customSel?.side === 'all' && customSel.name === n ? 'sel' : ''}`}
                        onClick={() => setCustomSel({ side: 'all', name: n })} onDoubleClick={() => moveToBoat(n)}>
                        <span className="kpt-titem-name">{n}</span>
                        <button className="kpt-titem-del" title={`Delete "${n}" from the list`} onClick={(e) => { e.stopPropagation(); deleteCustomName(n); }}>✕</button>
                      </div>
                    ))}
                    {availableForBoat(selectedBoat.boat_id).length === 0 && <div className="kpt-tempty">All added to this boat.</div>}
                  </div>
                  <div className="kpt-tadd">
                    <SmartInput storeKey="custom-names" options={customNames} placeholder="Add a new custom part..." value={newCustom} onChange={setNewCustom} onEnter={addNewCustomName} />
                    <button onClick={addNewCustomName}>+ Add</button>
                  </div>
                </div>
                <div className="kpt-arrows">
                  <button className="kpt-arrow primary" title="Add to boat" disabled={customSel?.side !== 'all'} onClick={() => customSel?.side === 'all' && moveToBoat(customSel.name)}>→</button>
                  <button className="kpt-arrow" title="Remove from boat" disabled={customSel?.side !== 'boat'} onClick={() => customSel?.side === 'boat' && removeFromBoat(selectedBoat.boat_id, customSel.name)}>←</button>
                </div>
                <div className="kpt-tbox">
                  <div className="kpt-tbox-title">On this boat</div>
                  <div className="kpt-tbox-list">
                    {sortedCustom(selectedBoat.boat_id).map(row => {
                      const st = statusOf(row);
                      const c = CELL[st];
                      return (
                        <div key={row.part_name} className={`kpt-titem ${customSel?.side === 'boat' && customSel.name === row.part_name ? 'sel' : ''}`} onClick={() => setCustomSel({ side: 'boat', name: row.part_name })}>
                          <span className="kpt-titem-name">{row.part_name}{row.description ? ' 📝' : ''}</span>
                          <span className="kpt-titem-right">
                            {!row.na && <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} size={12} />}
                            <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}</span>
                            <button className="kpt-titem-edit" onClick={(e) => { e.stopPropagation(); openMenu(e, selectedBoat.boat_id, row.part_name, true); }}>Edit</button>
                          </span>
                        </div>
                      );
                    })}
                    {sortedCustom(selectedBoat.boat_id).length === 0 && <div className="kpt-tempty">None yet — pick from the left.</div>}
                  </div>
                </div>
              </div>
            ) : (
              sortedCustom(selectedBoat.boat_id).map(row => {
                const st = statusOf(row);
                const c = CELL[st];
                return (
                  <div key={row.part_name} className="kpt-part readonly">
                    <span className="kpt-part-main"><span className="kpt-part-name">{row.part_name}</span>{row.description && <span className="kpt-part-spec">{row.description}</span>}</span>
                    <span className="kpt-part-right">
                      {!row.na && row.order_asap && st !== 'Received' && <span className="kpt-asap">ORDER ASAP</span>}
                      {!row.na && <FlagIcons flags={effFlags(row)} defs={KEYPARTS_FLAGS} size={14} />}
                      <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}{dateLabel(row) ? ` • ${dateLabel(row)}` : ''}</span>
                    </span>
                  </div>
                );
              })
            )}
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
    <div className="kpt-legend">
      <div className="kpt-legend-title">Status</div>
      <div className="kpt-legend-row">
        {[...STATUSES, NA].map(s => (
          <span key={s} className="kpt-legend-item"><i className="kpt-legend-sw" style={{ background: CELL[s].bg }} />{s}</span>
        ))}
      </div>
      <div className="kpt-legend-title" style={{ marginTop: 11 }}>Flags</div>
      <div className="kpt-legend-row">
        <span className="kpt-legend-item"><span className="kpt-asap">ORDER ASAP</span> Priority to order — set it, clears once Ordered</span>
        {KEYPARTS_FLAGS.map(f => (
          <span key={f.key} className="kpt-legend-item"><FlagIcons flags={{ [f.key]: true }} defs={[f]} size={14} />{f.label}</span>
        ))}
      </div>
      <div className="kpt-legend-note">Cell color = status. Cells read: “—” not ordered · “→ exp M/D” on order, expected date · “✓ M/D” received on that date · “N/A” not applicable (excluded from counts). Hover (or tap) a cell for full detail incl. the order date. Late auto-flags once past the expected date. Ops-only editing.</div>
    </div>
  );
}

export default KeyPartsTracker;
