import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import './TimelineAdmin.css';

// Admin → Timeline: what the scheduling engine believes (learned stage norms per model),
// shop blackout dates (holidays, boat shows), and the workload-adjustment knobs.
// Reads the same /api/timeline payload the Gantt uses.

const STAGE_ORDER = ['Glass Shop', 'Back Line', 'Front Line', 'QC'];
const MODEL_ORDER = ['23T', '25T', '2850', '36'];

function TimelineAdmin() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nb, setNb] = useState({ start: '', end: '', label: '' }); // new blackout
  const [knobs, setKnobs] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { init(); }, []);
  const init = async () => {
    try {
      setLoading(true);
      const r = await apiFetch('/api/timeline').catch(() => null);
      const d = r && r.ok ? await r.json() : null;
      setData(d);
      if (d?.settings) setKnobs({ per: d.settings.tl_workload_per_items ?? 5, cap: d.settings.tl_workload_cap ?? 10 });
    } finally { setLoading(false); }
  };

  const addBlackout = async () => {
    if (!nb.start || !nb.end) return;
    try {
      const r = await apiFetch('/api/timeline/blackouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: nb.start, end_date: nb.end, label: nb.label || null }),
      });
      if (!r.ok) throw new Error();
      setNb({ start: '', end: '', label: '' });
      init();
    } catch { alert('Failed to add blackout.'); }
  };
  const delBlackout = async (id) => {
    try {
      const r = await apiFetch(`/api/timeline/blackouts/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      init();
    } catch { alert('Failed to remove.'); }
  };
  const saveKnobs = async () => {
    try {
      const r = await apiFetch('/api/timeline/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tl_workload_per_items: Math.max(1, +knobs.per || 5), tl_workload_cap: Math.max(0, +knobs.cap || 10) }),
      });
      if (!r.ok) throw new Error();
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch { alert('Failed to save.'); }
  };

  if (loading) return <div className="loading">Loading timeline settings...</div>;
  if (!data) {
    return <div className="tla"><p className="tla-empty">Timeline backend isn't set up yet — run <b>BACKEND_TIMELINE_BRIEF.md</b> on the server first.</p></div>;
  }

  const norms = data.norms || [];
  const models = MODEL_ORDER.filter(m => norms.some(n => n.model === m))
    .concat([...new Set(norms.map(n => n.model))].filter(m => !MODEL_ORDER.includes(m)));
  const norm = (m, s) => norms.find(n => n.model === m && n.stage === s);

  return (
    <div className="tla">
      <div className="tla-section">
        <h3>What the engine believes (stage norms, calendar days)</h3>
        <p className="tla-hint">Learned from real history per model (median of the last 8). Until 3+ real samples exist, it uses the seeded values from your monday plan (36 = 21 days flat). These update themselves — nothing to maintain.</p>
        <table className="tla-table">
          <thead><tr><th>Model</th>{STAGE_ORDER.map(s => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>
            {models.map(m => (
              <tr key={m}>
                <td className="tla-model">{m}</td>
                {STAGE_ORDER.map(s => {
                  const n = norm(m, s);
                  return (
                    <td key={s}>
                      {n ? (
                        <>
                          <b>{n.days}d</b>
                          <span className={`tla-src tla-src-${n.source}`}>{n.source === 'history' ? `from ${n.samples} boats` : n.source === 'seed' ? 'seeded' : 'default'}</span>
                        </>
                      ) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tla-section">
        <h3>Workload adjustment</h3>
        <div className="tla-knobs">
          <span>Add/remove <input className="tla-num" type="number" min="1" value={knobs?.per ?? 5} onChange={e => setKnobs(k => ({ ...k, per: e.target.value }))} /> day per that many checklist items above/below the model's normal,</span>
          <span>capped at ± <input className="tla-num" type="number" min="0" value={knobs?.cap ?? 10} onChange={e => setKnobs(k => ({ ...k, cap: e.target.value }))} /> days.</span>
          <button className="tla-save" onClick={saveKnobs}>Save</button>
          {saved && <span className="tla-saved">Saved ✓</span>}
        </div>
      </div>

      <div className="tla-section">
        <h3>Shop blackout dates</h3>
        <p className="tla-hint">Closed stretches (holidays, boat shows). The projector schedules nothing inside them and the learning ignores them.</p>
        {(data.blackouts || []).map(b => (
          <div key={b.id} className="tla-blk">
            <span className="tla-blk-dates">{String(b.start_date).slice(0, 10)} → {String(b.end_date).slice(0, 10)}</span>
            <span className="tla-blk-label">{b.label || ''}</span>
            <button className="tla-blk-del" onClick={() => delBlackout(b.id)}>✕</button>
          </div>
        ))}
        {(data.blackouts || []).length === 0 && <div className="tla-quiet">None yet.</div>}
        <div className="tla-blk-add">
          <input type="date" value={nb.start} onChange={e => setNb(p => ({ ...p, start: e.target.value }))} />
          <span>→</span>
          <input type="date" value={nb.end} onChange={e => setNb(p => ({ ...p, end: e.target.value }))} />
          <input className="tla-blk-labelinput" placeholder="Label (e.g. Christmas week)" value={nb.label} onChange={e => setNb(p => ({ ...p, label: e.target.value }))} />
          <button className="tla-save" onClick={addBlackout} disabled={!nb.start || !nb.end}>+ Add</button>
        </div>
      </div>
    </div>
  );
}

export default TimelineAdmin;
