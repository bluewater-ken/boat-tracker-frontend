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
      const debug = [];
      let withTask = 0;
      const push = (ph, b, item) => {
        const entry = { ...ph, gi: flat.length, boat_id: b.boat_id, customer: b.customer_name, model: b.boat_model, motor: motorOf(b.boat_id), item };
        flat.push(entry); return entry;
      };
      for (const b of matched) {
        // Work-center rows on this boat that carry a name-matching checklist item.
        const matchRows = (asmRows || [])
          .filter(r => r.boat_id === b.boat_id)
          .map(r => ({
            wcId: r.work_center_id, wcName: r.work_center_name || r.work_center_id,
            items: (r.items || []).filter(it => !tk || clean(it.name).toLowerCase().includes(tk)),
          }))
          .filter(m => m.items.length);
        if (!matchRows.length) continue;
        withTask++;
        const seen = new Set();
        const boatPhotos = [];
        const dbg = { boat: b.boat_id, cust: b.customer_name, lines: [`motor spec read: "${motorOf(b.boat_id) || '(none)'}"`] };
        // 1) Photos attached directly to the matching checklist item.
        for (const m of matchRows) for (const it of m.items) {
          const nm = clean(it.name);
          if (!it.item_id) { dbg.lines.push(`item "${nm}": no item_id`); continue; }
          let n = 0;
          try {
            const r = await apiFetch(`/api/assembly/item/${it.item_id}/photos`);
            const list = r.ok ? await r.json() : [];
            n = list.length;
            for (const ph of list) { const k = ph.full_url || ph.web_url || ph.thumb_url; if (k && !seen.has(k)) { seen.add(k); boatPhotos.push(push(ph, b, nm)); } }
          } catch { n = -1; }
          dbg.lines.push(`item "${nm}" (photo_count=${it.photo_count ?? '?'}): ${n} photo(s)`);
        }
        // 2) Fallback: photos on the whole work center, kept if their caption/title
        //    mentions the task (catches photos added to the project, not the item).
        for (const m of matchRows) {
          let total = 0, kept = 0;
          try {
            const r = await apiFetch(`/api/assembly/${b.boat_id}/${encodeURIComponent(m.wcId)}/photos`);
            const list = r.ok ? await r.json() : [];
            total = list.length;
            for (const ph of list) {
              const title = clean(ph.task_title || '').toLowerCase();
              if (tk && !title.includes(tk)) continue;
              const k = ph.full_url || ph.web_url || ph.thumb_url;
              if (k && !seen.has(k)) { seen.add(k); kept++; boatPhotos.push(push(ph, b, ph.task_title || task)); }
            }
          } catch { total = -1; }
          dbg.lines.push(`work center "${m.wcName}": ${total} photo(s) total, ${kept} tagged "${tk}"`);
        }
        byBoat.push({ boat: b, motor: motorOf(b.boat_id), photos: boatPhotos });
        debug.push(dbg);
      }
      setResults({ byBoat, flat, debug, stats: { matched: matched.length, withTask, photos: flat.length } });
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
          <div>No photos came back for those filters. Check the task wording (try just “prop”), the motor text, or the model.
          {results.stats.matched > 0 && results.stats.withTask === 0 && ' None of the matching boats have a checklist item with that name yet.'}</div>
          {results.debug && results.debug.length > 0 && (
            <details className="pex-debug" open>
              <summary>Diagnostics — what was checked</summary>
              {results.debug.map(d => (
                <div key={d.boat} className="pex-dbg-boat">
                  <b>{d.boat}{d.cust ? ` · ${d.cust}` : ''}</b>
                  <ul>{d.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>
              ))}
            </details>
          )}
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
