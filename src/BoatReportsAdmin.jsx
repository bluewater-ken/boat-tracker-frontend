import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import BoatReport from './BoatReport';
import './BoatReportsAdmin.css';

// Admin → Boat Reports. Pick any set of boats (or all) and open a printable
// status report — one page per boat — for the assembly-shop wall.

function BoatReportsAdmin() {
  const [boats, setBoats] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [reportIds, setReportIds] = useState(null);

  useEffect(() => {
    apiFetch('/api/boats')
      .then(r => r.ok ? r.json() : [])
      .then(list => setBoats(
        list.filter(b => b.global_status !== 'Delivered')
          .sort((a, b) => (a.sequence_number || 999) - (b.sequence_number || 999))))
      .catch(() => setBoats([]));
  }, []);

  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allIds = (boats || []).map(b => b.boat_id);
  const allSelected = allIds.length > 0 && allIds.every(id => sel.has(id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(allIds));

  if (!boats) return <div className="loading">Loading boats…</div>;

  const ordered = allIds.filter(id => sel.has(id)); // print in sequence order

  return (
    <div className="bra">
      <p className="bra-intro">
        Pick the boats to include, then print. Each boat gets its own page — a full status
        dashboard with the deep assembly checklist, built to hang on the shop wall.
      </p>

      <div className="bra-actions">
        <label className="bra-all"><input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all ({allIds.length})</label>
        <div className="bra-buttons">
          <button className="bra-print" disabled={!sel.size} onClick={() => setReportIds(ordered)}>
            📄 Open {sel.size ? `${sel.size} selected` : 'selected'}
          </button>
          <button className="bra-print-all" onClick={() => setReportIds(allIds)}>Open all ({allIds.length})</button>
        </div>
      </div>

      <div className="bra-grid">
        {boats.map(b => (
          <label key={b.boat_id} className={`bra-boat ${sel.has(b.boat_id) ? 'on' : ''}`}>
            <input type="checkbox" checked={sel.has(b.boat_id)} onChange={() => toggle(b.boat_id)} />
            <div className="bra-boat-main">
              <div className="bra-boat-id">
                {b.sequence_number ? `${b.sequence_number}. ` : ''}{b.boat_id}
                {b.is_spare && <span className="spare-tag">SPARE</span>}
              </div>
              <div className="bra-boat-sub">{b.customer_name} · {b.boat_model} · {b.global_status}</div>
            </div>
          </label>
        ))}
      </div>

      {reportIds && <BoatReport boatIds={reportIds} onClose={() => setReportIds(null)} />}
    </div>
  );
}

export default BoatReportsAdmin;
