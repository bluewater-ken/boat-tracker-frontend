import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import './ProductionSchedule.css';

const STATUSES = ['Backlog','Pre-Production','Glass Shop','Back Line','Front Line','QC','Delivered'];
const STATUS_COLORS = {'Backlog':'#E1F5EE','Pre-Production':'#FFF3E0','Glass Shop':'#E3F2FD','Back Line':'#F3E5F5','Front Line':'#FCE4EC','QC':'#E8F5E9','Delivered':'#C8E6C9'};
const STATUS_TEXT = {'Backlog':'#00695C','Pre-Production':'#E65100','Glass Shop':'#01579B','Back Line':'#4A148C','Front Line':'#880E4F','QC':'#1B5E20','Delivered':'#2E7D32'};

function ProductionSchedule({ refreshTrigger, onRefresh }) {
  const [boats, setBoats] = useState([]);
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState(null);

  useEffect(() => { fetchBoats(); }, [refreshTrigger]);

  const fetchBoats = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/boats');
      const data = await res.json();
      setBoats(data);
      if (data.length > 0) { setSelectedBoat(data[0]); fetchHistory(data[0].boat_id); }
    } catch (e) { alert('Failed to load boats. Check backend connection.'); }
    finally { setLoading(false); }
  };

  const fetchHistory = async (id) => {
    try { const r = await apiFetch(`/api/boats/${id}/history`); if (r.ok) setStatusHistory(await r.json()); }
    catch (e) {}
  };

  const handleDrop = async (targetIndex) => {
    if (draggedIndex === null || draggedIndex === targetIndex) { setDraggedIndex(null); return; }
    const newBoats = [...boats];
    const [dragged] = newBoats.splice(draggedIndex, 1);
    newBoats.splice(targetIndex, 0, dragged);
    const updated = newBoats.map((b, i) => ({ ...b, sequence_number: i + 1 }));
    setBoats(updated);
    setSelectedBoat(updated[targetIndex]);
    setDraggedIndex(null);
    try {
      await apiFetch('/api/schedule/reorder', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ boats: updated.map(b => ({ boat_id: b.boat_id, sequence_number: b.sequence_number })) }) });
    } catch (e) { alert('Failed to reorder'); }
  };

  const moveBoat = (dir) => {
    const i = boats.findIndex(b => b.boat_id === selectedBoat.boat_id);
    if ((dir === 'up' && i > 0) || (dir === 'down' && i < boats.length - 1)) {
      setDraggedIndex(i);
      handleDrop(dir === 'up' ? i - 1 : i + 1);
    }
  };

  const advanceStatus = async () => {
    const i = STATUSES.indexOf(selectedBoat.global_status);
    if (i === -1 || i === STATUSES.length - 1) return;
    const next = STATUSES[i + 1];
    try {
      await apiFetch(`/api/schedule/${selectedBoat.boat_id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ global_status: next }) });
      setBoats(boats.map(b => b.boat_id === selectedBoat.boat_id ? { ...b, global_status: next } : b));
      setSelectedBoat({ ...selectedBoat, global_status: next });
      fetchHistory(selectedBoat.boat_id);
      onRefresh();
    } catch (e) { alert('Failed to update status'); }
  };

  if (loading) return <div className="loading">Loading production schedule...</div>;

  return (
    <div className="production-schedule">
      <div className="schedule-list">
        <h2>Production Schedule</h2>
        <div className="boats-list">
          {boats.map((boat, idx) => (
            <div key={boat.boat_id} draggable
              onDragStart={() => setDraggedIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              onClick={() => { setSelectedBoat(boat); fetchHistory(boat.boat_id); }}
              className={`boat-row ${selectedBoat?.boat_id === boat.boat_id ? 'selected' : ''}`}
              style={{ opacity: draggedIndex === idx ? 0.6 : 1 }}>
              <div className="boat-sequence" style={{ backgroundColor: STATUS_COLORS[boat.global_status], color: STATUS_TEXT[boat.global_status] }}>{boat.sequence_number || idx + 1}</div>
              <div className="boat-info">
                <div className="boat-id">{boat.boat_id} - {boat.customer_name}</div>
                <div className="boat-details">{boat.hull_color} {boat.boat_model}</div>
              </div>
              <div className="boat-status" style={{ backgroundColor: STATUS_COLORS[boat.global_status], color: STATUS_TEXT[boat.global_status] }}>{boat.global_status}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="boat-details-panel">
        {selectedBoat ? (
          <>
            <h2>{selectedBoat.boat_id} - {selectedBoat.customer_name}</h2>
            <div className="detail-group"><label>Hull Color</label><div className="detail-value">{selectedBoat.hull_color}</div></div>
            <div className="detail-group"><label>Model</label><div className="detail-value">{selectedBoat.boat_model}</div></div>
            <div className="detail-group"><label>Engine</label><div className="detail-value">{selectedBoat.engine_brand_1} {selectedBoat.engine_choice_1}</div></div>
            <div className="detail-group"><label>Est. Completion</label><div className="detail-value">{selectedBoat.estimated_completion_date || 'Not set'}</div></div>
            <div className="button-group">
              <button onClick={() => moveBoat('up')} className="btn-small">↑ Move Up</button>
              <button onClick={() => moveBoat('down')} className="btn-small">↓ Move Down</button>
            </div>
            <button onClick={advanceStatus} disabled={selectedBoat.global_status === 'Delivered'} className="btn-advance">
              {selectedBoat.global_status === 'Delivered' ? 'Complete' : `Advance to ${STATUSES[STATUSES.indexOf(selectedBoat.global_status) + 1]}`}
            </button>
            <div className="status-history">
              <h3>Status History</h3>
              {statusHistory.map((e, i) => (
                <div key={i} className="history-entry">
                  <div className="history-status">{e.status}</div>
                  <div className="history-date">{new Date(e.actual_timestamp).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </>
        ) : <p>Select a boat to view details</p>}
      </div>
    </div>
  );
}

export default ProductionSchedule;