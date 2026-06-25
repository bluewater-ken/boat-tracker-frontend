import { useState, useEffect } from 'react';
import './KeyPartsTracker.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const NEXT = { 'Not Ordered': 'Ordered', 'Ordered': 'Received', 'Received': 'Not Ordered' };
const CELL = {
  'Received': { bg: '#E8F5E9', fg: '#1B5E20' },
  'Ordered': { bg: '#FFF3E0', fg: '#E65100' },
  'Not Ordered': { bg: '#F5F5F5', fg: '#666' },
};
const fmt = (t) => t ? new Date(t).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '';

function KeyPartsTracker() {
  const [boats, setBoats] = useState([]);
  const [standardParts, setStandardParts] = useState([]);
  const [partData, setPartData] = useState({});
  const [customNames, setCustomNames] = useState([]);
  const [view, setView] = useState('boat');
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [search, setSearch] = useState('');
  const [newCustom, setNewCustom] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setLoading(true);
      const [b, sp, all, cn] = await Promise.all([
        fetch(`${API_URL}/api/boats`).then(r => r.json()),
        fetch(`${API_URL}/api/parts/standard`).then(r => r.json()),
        fetch(`${API_URL}/api/parts`).then(r => r.json()),
        fetch(`${API_URL}/api/parts/custom-names`).then(r => r.json()),
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

  const getStatus = (boatId, partName) => partData[boatId]?.[partName]?.status || 'Not Ordered';
  const getRow = (boatId, partName) => partData[boatId]?.[partName] || {};

  const cycle = async (boatId, partName, isCustom = false) => {
    const current = getStatus(boatId, partName);
    const next = NEXT[current];
    const optimistic = { ...partData };
    if (!optimistic[boatId]) optimistic[boatId] = {};
    const now = new Date().toISOString();
    const prev = optimistic[boatId][partName] || {};
    optimistic[boatId][partName] = {
      part_name: partName, is_custom: isCustom, status: next,
      ordered_at: next === 'Ordered' ? now : (next === 'Received' ? prev.ordered_at : null),
      received_at: next === 'Received' ? now : null,
    };
    setPartData(optimistic);
    try {
      await fetch(`${API_URL}/api/parts/${boatId}/${encodeURIComponent(partName)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, is_custom: isCustom }),
      });
    } catch (e) { alert('Failed to update'); init(); }
  };

  const addCustom = async () => {
    const name = newCustom.trim();
    if (!name || !selectedBoat) return;
    setNewCustom('');
    await fetch(`${API_URL}/api/parts/${selectedBoat.boat_id}/${encodeURIComponent(name)}`, {
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
                    const st = getStatus(boat.boat_id, p);
                    const row = getRow(boat.boat_id, p);
                    const c = CELL[st];
                    const date = st === 'Received' ? fmt(row.received_at) : st === 'Ordered' ? fmt(row.ordered_at) : '';
                    return (
                      <td key={p} className="kpt-cell" style={{ background: c.bg, color: c.fg }} onClick={() => cycle(boat.boat_id, p)}>
                        <div className="kpt-cell-status">{st === 'Not Ordered' ? '—' : st}</div>
                        {date && <div className="kpt-cell-date">{date}</div>}
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
            <h3>Standard Parts ({standardParts.length})</h3>
            {standardParts.map(p => {
              const st = getStatus(selectedBoat.boat_id, p);
              const row = getRow(selectedBoat.boat_id, p);
              const c = CELL[st];
              const date = st === 'Received' ? fmt(row.received_at) : st === 'Ordered' ? fmt(row.ordered_at) : '';
              return (
                <div key={p} className="kpt-part" onClick={() => cycle(selectedBoat.boat_id, p)}>
                  <span className="kpt-part-name">{p}</span>
                  <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}{date ? ` • ${date}` : ''}</span>
                </div>
              );
            })}
            <h3 style={{ marginTop: 20 }}>Custom Parts (Extras)</h3>
            <div className="kpt-add">
              <input list="custom-suggestions" placeholder="Add custom part..." value={newCustom} onChange={e => setNewCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustom()} />
              <datalist id="custom-suggestions">
                {customNames.map(n => <option key={n} value={n} />)}
              </datalist>
              <button onClick={addCustom}>+ Add</button>
            </div>
            {customForBoat(selectedBoat.boat_id).map(row => {
              const st = row.status;
              const c = CELL[st];
              const date = st === 'Received' ? fmt(row.received_at) : st === 'Ordered' ? fmt(row.ordered_at) : '';
              return (
                <div key={row.part_name} className="kpt-part" onClick={() => cycle(selectedBoat.boat_id, row.part_name, true)}>
                  <span className="kpt-part-name">{row.part_name}</span>
                  <span className="kpt-badge" style={{ background: c.bg, color: c.fg }}>{st}{date ? ` • ${date}` : ''}</span>
                </div>
              );
            })}
          </>
        ) : <p>Select a boat</p>}
      </div>
    </div>
  );
}

export default KeyPartsTracker;