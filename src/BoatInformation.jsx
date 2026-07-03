import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { colorOptions } from './colors';
import './BoatInformation.css';

const EMPTY = { boat_id:'', customer_name:'', customer_phone:'', customer_email:'', customer_address:'', boat_model:'', engine_brand_1:'', engine_choice_1:'', engine_brand_2:'', engine_choice_2:'', engine_brand_3:'', engine_choice_3:'', hull_color:'' };

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
    if (!formData.boat_id || !formData.customer_name || !formData.boat_model || !formData.hull_color) { alert('Please fill in all required fields'); return; }
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
              <div className="list-item-id">{boat.boat_id}</div>
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
            <input name="hull_color" list="boat-color-opts" value={formData.hull_color} onChange={handleChange} placeholder="Pick a color or type a new one..." />
            <datalist id="boat-color-opts">
              {colorOptions(boats).map(c => <option key={c} value={c} />)}
            </datalist>
            <div className="form-hint">This is how boats are identified on the shop floor. The same color list is shared with Key Parts.</div>
          </div>
          <button onClick={handleSave} className="btn-save">Save Boat</button>
        </div>
      </div>
    </div>
  );
}

export default BoatInformation;