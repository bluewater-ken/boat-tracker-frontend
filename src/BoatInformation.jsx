import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { colorOptions } from './colors';
import SmartInput from './SmartInput';
import './BoatInformation.css';

const EMPTY = { boat_id:'', customer_name:'', customer_phone:'', customer_email:'', customer_address:'', boat_model:'', engine_brand_1:'', engine_choice_1:'', engine_brand_2:'', engine_choice_2:'', engine_brand_3:'', engine_choice_3:'', hull_color:'', is_spare:false };

function BoatInformation({ refreshTrigger, onRefresh }) {
  const [boats, setBoats] = useState([]);
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewBoat, setIsNewBoat] = useState(false);
  const [formData, setFormData] = useState(EMPTY);

  useEffect(() => { fetchBoats(); }, [refreshTrigger]);

  const fetchBoats = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/boats');
      const data = await res.json();
      setBoats(data);
      if (data.length > 0 && !selectedBoat) selectBoat(data[data.length - 1]);
    } catch (e) { alert('Failed to load boats'); }
    finally { setLoading(false); }
  };

  const selectBoat = (boat) => { setSelectedBoat(boat); setFormData(boat); setIsNewBoat(false); };
  const handleNewBoat = () => { setSelectedBoat(null); setFormData(EMPTY); setIsNewBoat(true); };
  const handleChange = (e) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    // Spare-parts orders don't need a model/hull color — just ID + customer.
    const needsBoatFields = !formData.is_spare;
    if (!formData.boat_id || !formData.customer_name || (needsBoatFields && (!formData.boat_model || !formData.hull_color))) {
      alert(needsBoatFields ? 'Please fill in all required fields' : 'A spare-parts order still needs an ID and customer.');
      return;
    }
    try {
      if (isNewBoat) {
        const r = await apiFetch('/api/boats', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(formData) });
        if (!r.ok) throw new Error();
      } else {
        const r = await apiFetch(`/api/boats/${formData.boat_id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(formData) });
        if (!r.ok) throw new Error();
      }
      fetchBoats(); setIsNewBoat(false); onRefresh();
      alert(isNewBoat ? 'Boat created successfully' : 'Boat updated successfully');
    } catch (e) { alert('Failed to save boat'); }
  };

  // Permanent, cascading delete — guarded by retyping the boat ID.
  const handleDelete = async () => {
    const id = formData.boat_id;
    if (!id) return;
    const typed = window.prompt(`This permanently deletes boat ${id} and ALL its tracking data (schedule, key parts, lamination, finishing).\n\nType the boat ID to confirm:`);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== id.toLowerCase()) { alert('Boat ID did not match — nothing was deleted.'); return; }
    try {
      const r = await apiFetch(`/api/boats/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      setBoats(bs => bs.filter(b => b.boat_id !== id));
      setSelectedBoat(null); setFormData(EMPTY); setIsNewBoat(false);
      fetchBoats(); onRefresh();
    } catch (e) { alert('Failed to delete — the boat-delete endpoint may not be on the server yet.'); }
  };

  const filtered = boats.filter(b =>
    b.boat_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.boat_model?.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => (a.boat_id || '').localeCompare(b.boat_id || '', undefined, { numeric: true }));

  if (loading) return <div className="loading">Loading boat information...</div>;

  return (
    <div className="boat-information">
      <div className="boats-list-panel">
        <h2>Boats ({boats.length})</h2>
        <input className="search-input" placeholder="Search by ID, customer, or model..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <button onClick={handleNewBoat} className="btn-new-boat">+ New Boat</button>
        <div className="boats-list">
          {filtered.map(boat => (
            <div key={boat.boat_id} className={`boat-list-item ${selectedBoat?.boat_id === boat.boat_id ? 'selected' : ''}`} onClick={() => selectBoat(boat)}>
              <div className="list-item-id">{boat.boat_id} {boat.is_spare && <span className="spare-tag">SPARE / REFIT / SERVICE</span>}</div>
              <div className="list-item-customer">{boat.customer_name}</div>
              <div className="list-item-details">{boat.boat_model} • {boat.hull_color}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="boat-form-panel">
        <h2>{isNewBoat ? 'New Boat' : `${formData.boat_id} - ${formData.customer_name}`}</h2>
        <div className="form-section">
          <div className="form-group"><label>Boat ID *</label><input name="boat_id" value={formData.boat_id} onChange={handleChange} disabled={!isNewBoat} placeholder="e.g., 28227" /></div>
          <div className="form-group"><label>Customer Name *</label><input name="customer_name" value={formData.customer_name} onChange={handleChange} placeholder="e.g., 7Sports" /></div>
          <div className="form-group"><label>Phone</label><input name="customer_phone" value={formData.customer_phone} onChange={handleChange} placeholder="(305) 555-0147" /></div>
          <div className="form-group"><label>Email</label><input name="customer_email" value={formData.customer_email} onChange={handleChange} placeholder="info@example.com" /></div>
          <div className="form-group"><label>Address</label><input name="customer_address" value={formData.customer_address} onChange={handleChange} placeholder="Street, City, State, ZIP" /></div>
          <div className="form-group"><label>Boat Model *</label>
            <select name="boat_model" value={formData.boat_model} onChange={handleChange}>
              <option value="">Select Model</option><option value="2850">2850</option><option value="25T">25T</option><option value="23T">23T</option><option value="36">36</option>
            </select>
          </div>
          <div className="form-group"><label>Hull Color *</label>
            <SmartInput storeKey="colors" options={colorOptions(boats)} value={formData.hull_color} onChange={v => setFormData(p => ({ ...p, hull_color: v }))} placeholder="Pick a color or type a new one..." />
            <div className="form-hint">This is how boats are identified on the shop floor. The same color list is shared with Key Parts.</div>
          </div>
          <div className="form-group form-check">
            <label><input type="checkbox" name="is_spare" checked={!!formData.is_spare} onChange={e => setFormData(p => ({ ...p, is_spare: e.target.checked }))} /> Spare Parts / Refit / Service (non-production)</label>
            <div className="form-hint">Tags this as non-production work — a spare-parts order, refit, or service job — so it’s marked apart from normal boat builds. It still flows through the shop tabs; mark the parts/tasks it doesn’t need as N/A.</div>
          </div>
          <div className="form-actions">
            <button onClick={handleSave} className="btn-save">Save Boat</button>
            {!isNewBoat && formData.boat_id && (
              <button onClick={handleDelete} className="btn-delete-boat">Delete Boat…</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BoatInformation;