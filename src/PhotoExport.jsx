import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from './api';
import PhotoLightbox from './PhotoLightbox';
import './PhotoExport.css';

// Admin → Photo Export. Pull CompanyCam photos across boats by filter: boat model,
// motor spec, and a checklist-task name. Built for "gather the 'take a picture of
// prop' photos for every 25T with a Suzuki motor" style jobs. Read-only (GET only).

const isMotor = (n) => /^motors?$/i.test(String(n || '').trim());
const clean = (s) => String(s || '').replace(/\*\*|__/g, '').replace(/🛑/g, '').trim();

function PhotoExport() {
  const [boats, setBoats] = useState([]);
  const [parts, setParts] = useState([]);
  const [asmRows, setAsmRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [model, setModel] = useState('25T');
  const [motor, setMotor] = useState('Suzuki');
  const [task, setTask] = useState('prop');

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null); // { byBoat, flat, stats }
  const [lightbox, setLightbox] = useState(null); // { index }

  useEffect(() => {
    (async () => {
      try {
        const [b, p, a] = await Promise.all([
          apiFetch('/api/boats').then(r => (r.ok ? r.json() : [])).catch(() => []),
          apiFetch('/api/parts').then(r => (r.ok ? r.json() : [])).catch(() => []),
          apiFetch('/api/assembly').then(r => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        setBoats(b || []); setParts(p || []); setAsmRows(a?.rows || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const models = useMemo(
    () => [...new Set((boats || []).map(b => b.boat_model).filter(Boolean))].sort(),
    [boats]
  );
  const motorOf = (boatId) => (parts.find(p => p.boat_id === boatId && isMotor(p.part_name))?.description || '');

  const run = async () => {
    setRunning(true); setResults(null); setLightbox(null);
    try {
      const ml = model.trim().toLowerCase();
      const mo = motor.trim().toLowerCase();
      const tk = task.trim().toLowerCase();
      const matched = (boats || []).filter(b =>
        (!ml || String(b.boat_model || '').toLowerCase().includes(ml)) &&
        (!mo || motorOf(b.boat_id).toLowerCase().includes(mo))
      );
      const flat = [];
      const byBoat = [];
      let withTask = 0;
      for (const b of matched) {
        // Items on this boat whose checklist name matches the task filter.
        const items = [];
        for (const r of asmRows) {
          if (r.boat_id !== b.boat_id) continue;
          for (const it of (r.items || [])) {
            if (!tk || clean(it.name).toLowerCase().includes(tk)) {
              items.push({ ...it, wc: r.work_center_name || r.work_center_id });
            }
          }
        }
        if (!items.length) continue;
        withTask++;
        const boatPhotos = [];
        for (const it of items) {
          if (!it.item_id || it.photo_count === 0) continue;
          try {
            const r = await apiFetch(`/api/assembly/item/${it.item_id}/photos`);
            const list = r.ok ? await r.json() : [];
            for (const ph of list) {
              const entry = {
                ...ph, gi: flat.length,
                boat_id: b.boat_id, customer: b.customer_name, model: b.boat_model,
                motor: motorOf(b.boat_id), item: clean(it.name),
              };
              flat.push(entry); boatPhotos.push(entry);
            }
          } catch { /* skip an item that fails to load */ }
        }
        byBoat.push({ boat: b, motor: motorOf(b.boat_id), tasks: [...new Set(items.map(i => clean(i.name)))], photos: boatPhotos });
      }
      setResults({ byBoat, flat, stats: { matched: matched.length, withTask, photos: flat.length } });
    } finally { setRunning(false); }
  };

  const copyLinks = async () => {
    const urls = (results?.flat || []).map(p => p.full_url || p.web_url).filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(urls); alert(`Copied ${results.flat.length} image link(s) to the clipboard.`); }
    catch { alert('Could not copy to clipboard.'); }
  };

  if (loading) return <div className="loading">Loading boats & checklists…</div>;

  return (
    <div className="pex">
      <div className="pex-intro">
        <h2>Photo Export</h2>
        <p>Pull CompanyCam photos across boats by model, motor, and a checklist task — e.g. the “take a picture of prop” photo for every 25T with a Suzuki motor.</p>
      </div>

      <div className="pex-filters">
        <label className="pex-field">
          <span>Model</span>
          <select value={model} onChange={e => setModel(e.target.value)}>
            <option value="">All models</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="pex-field">
          <span>Motor contains</span>
          <input value={motor} onChange={e => setMotor(e.target.value)} placeholder="e.g. Suzuki" />
        </label>
        <label className="pex-field pex-grow">
          <span>Checklist task contains</span>
          <input value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. prop" />
        </label>
        <button className="pex-run" onClick={run} disabled={running}>{running ? 'Searching…' : 'Find photos'}</button>
      </div>

      {results && (
        <div className="pex-summary">
          <b>{results.stats.photos}</b> photo{results.stats.photos === 1 ? '' : 's'} ·
          {' '}<b>{results.stats.withTask}</b> boat{results.stats.withTask === 1 ? '' : 's'} with the task
          {' '}(of {results.stats.matched} matching model + motor)
          {results.stats.photos > 0 && <button className="pex-copy" onClick={copyLinks}>Copy all image links</button>}
        </div>
      )}

      {results && results.stats.photos === 0 && (
        <div className="pex-empty">
          No photos found for those filters. Check the task wording (try just “prop”), the motor text, or the model.
          {results.stats.matched > 0 && results.stats.withTask === 0 && ' None of the matching boats have a checklist item with that name yet.'}
        </div>
      )}

      {results && results.byBoat.filter(g => g.photos.length).map(g => (
        <div key={g.boat.boat_id} className="pex-boat">
          <div className="pex-boat-head">
            <span className="pex-boat-id">{g.boat.boat_id}</span>
            <span className="pex-boat-cust">{g.boat.customer_name || '—'}</span>
            <span className="pex-boat-meta">{g.boat.boat_model}{g.motor ? ` · ${g.motor}` : ''}</span>
            <span className="pex-boat-count">{g.photos.length} photo{g.photos.length === 1 ? '' : 's'}</span>
          </div>
          <div className="pex-grid">
            {g.photos.map(ph => (
              <div key={ph.gi} className="pex-thumb">
                <img src={ph.thumb_url || ph.web_url || ph.full_url} alt={ph.item} loading="lazy" onClick={() => setLightbox({ index: ph.gi })} />
                <a className="pex-dl" href={ph.full_url || ph.web_url} target="_blank" rel="noreferrer" title="Open full size">⬇</a>
              </div>
            ))}
          </div>
        </div>
      ))}

      {lightbox && results && (
        <PhotoLightbox
          photos={results.flat}
          index={lightbox.index}
          caption={`${results.flat[lightbox.index]?.boat_id} · ${results.flat[lightbox.index]?.item}`}
          onIndex={(i) => setLightbox({ index: i })}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

export default PhotoExport;
