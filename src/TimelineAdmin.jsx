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
  const [seeds, setSeeds] = useState({});     // `${model}|${stage}` -> editable starting number
  const [savedCell, setSavedCell] = useState(null);

  useEffect(() => { init(); }, []);
  const init = async () => {
    try {
      setLoading(true);
      const r = await apiFetch('/api/timeline').catch(() => null);
      const d = r && r.ok ? await r.json() : null;
      setData(d);
      if (d?.settings) setKnobs({ per: d.settings.tl_workload_per_items ?? 5, cap: d.settings.tl_workload_cap ?? 10 });
      const sMap = {}; for (const n of (d?.norms || [])) sMap[`${n.model}|${n.stage}`] = n.seed_days ?? n.days;
      setSeeds(sMap);
    } finally { setLoading(false); }
  };

  // Persist an edited starting number (seed) for a model×stage.
  const saveSeed = async (model, stage) => {
    const key = `${model}|${stage}`;
    const days = Math.max(1, Math.round(+seeds[key] || 0));
    try {
      const r = await apiFetch('/api/timeline/norms', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stage, days }),
      });
      if (!r.ok) throw new Error();
      setSavedCell(key); setTimeout(() => setSavedCell(k => (k === key ? null : k)), 1500);
      init();
    } catch { alert('Failed to save the starting number — the edit-seed endpoint may not be enabled on the server yet.'); init(); }
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
        <h3>Stage duration rules (calendar days)</h3>
        <p className="tla-hint">Set <b>your starting number</b> per stage (from your monday plan — editable, just type and click away).
        As real boats finish a stage, the engine measures the <b>actual</b> median and, once 3+ have completed, switches to it on its own.
        Until then it uses your start. The highlighted number is what the engine is using now. (36 starts seeded at 21 days.)</p>
        <table className="tla-table tla-normtable">
          <thead><tr><th>Model</th>{STAGE_ORDER.map(s => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>
            {models.map(m => (
              <tr key={m}>
                <td className="tla-model">{m}</td>
                {STAGE_ORDER.map(s => {
                  const n = norm(m, s);
                  if (!n) return <td key={s} className="tla-cell tla-cell-empty">—</td>;
                  const key = `${m}|${s}`;
                  const usingLearned = n.using === 'learned';
                  return (
                    <td key={s} className="tla-cell">
                      <div className={`tla-line tla-seed ${usingLearned ? '' : 'active'}`}>
                        <span className="tla-lbl">start</span>
                        <input className="tla-seedin" type="number" min="1"
                          value={seeds[key] ?? n.seed_days ?? n.days}
                          onChange={e => setSeeds(p => ({ ...p, [key]: e.target.value }))}
                          onBlur={() => saveSeed(m, s)} />
                        <span className="tla-d">d</span>
                        {savedCell === key && <span className="tla-cellsaved">✓</span>}
                      </div>
                      <div className={`tla-line tla-actual ${usingLearned ? 'active' : ''}`}>
                        <span className="tla-lbl">actual</span>
                        <span className="tla-actval">{n.learned_days != null ? `${n.learned_days}d` : '—'}</span>
                        <span className="tla-samples">{n.samples} boat{n.samples === 1 ? '' : 's'}</span>
                      </div>
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
