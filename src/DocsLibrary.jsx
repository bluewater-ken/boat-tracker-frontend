import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import './DocsLibrary.css';

// Reference document library. Everyone browses/searches/views; Ops upload, tag, delete.
// Files live on the backend (see BACKEND_DOCS_BRIEF.md) — /api/docs list + :id/file stream.

const DIMS = [
  { key: 'suppliers', label: 'Supplier' },
  { key: 'motors', label: 'Motor' },
  { key: 'models', label: 'Model' },
  { key: 'categories', label: 'Category' },
];
const fmtSize = (b) => !b ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);

function DocsLibrary() {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ suppliers: '', motors: '', models: '', categories: '' });
  const [q, setQ] = useState('');
  const [viewer, setViewer] = useState(null); // { url, title, mime, filename }
  const [upOpen, setUpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await apiFetch('/api/docs'); const d = r.ok ? await r.json() : []; setDocs(Array.isArray(d) ? d : (d.documents || [])); }
    catch { setDocs([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (viewer?.url) URL.revokeObjectURL(viewer.url); }, [viewer]);

  const allOptions = useMemo(() => {
    const o = { suppliers: new Set(), motors: new Set(), models: new Set(), categories: new Set() };
    for (const d of docs) for (const dim of DIMS) for (const v of arr(d[dim.key])) o[dim.key].add(v);
    return Object.fromEntries(DIMS.map(dim => [dim.key, [...o[dim.key]].sort()]));
  }, [docs]);

  const shown = docs.filter(d =>
    DIMS.every(dim => !filters[dim.key] || arr(d[dim.key]).includes(filters[dim.key])) &&
    (!q || `${d.title} ${DIMS.flatMap(dim => arr(d[dim.key])).join(' ')} ${d.note || ''}`.toLowerCase().includes(q.toLowerCase()))
  );

  const fetchBlob = async (d) => {
    const r = await apiFetch(`/api/docs/${d.id}/file`);
    if (!r.ok) throw new Error();
    return r.blob();
  };
  const view = async (d) => {
    try { const blob = await fetchBlob(d); setViewer({ url: URL.createObjectURL(blob), title: d.title, mime: d.mime_type || blob.type, filename: d.filename }); }
    catch { alert('Could not open the file.'); }
  };
  const download = async (d) => {
    try {
      const blob = await fetchBlob(d);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = d.filename || d.title || 'document';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { alert('Could not download the file.'); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Remove "${d.title}" from the library?`)) return;
    try { const r = await apiFetch(`/api/docs/${d.id}`, { method: 'DELETE' }); if (!r.ok) throw new Error(); load(); }
    catch { alert('Could not remove the document.'); }
  };

  const clearFilters = () => { setFilters({ suppliers: '', motors: '', models: '', categories: '' }); setQ(''); };
  const anyFilter = q || DIMS.some(d => filters[d.key]);

  return (
    <div className="docs">
      <div className="docs-head">
        <h2>Reference Library</h2>
        {isOps && <button className="docs-add" onClick={() => setUpOpen(true)}>+ Add document</button>}
      </div>

      <div className="docs-filters">
        {DIMS.map(dim => (
          <label key={dim.key} className="docs-fld">
            <span>{dim.label}</span>
            <select value={filters[dim.key]} onChange={e => setFilters(f => ({ ...f, [dim.key]: e.target.value }))}>
              <option value="">All</option>
              {allOptions[dim.key].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ))}
        <label className="docs-fld docs-grow">
          <span>Search</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Title, tag, or note…" />
        </label>
        {anyFilter && <button className="docs-clear" onClick={clearFilters}>Clear</button>}
      </div>

      {loading ? <div className="loading">Loading documents…</div> : (
        <>
          <div className="docs-count">{shown.length} document{shown.length === 1 ? '' : 's'}{anyFilter ? ` of ${docs.length}` : ''}</div>
          <div className="docs-list">
            {shown.map(d => (
              <div key={d.id} className="docs-card">
                <div className="docs-card-main" onClick={() => view(d)}>
                  <div className="docs-icon">{(d.mime_type || '').includes('pdf') ? 'PDF' : (d.mime_type || '').startsWith('image') ? 'IMG' : 'DOC'}</div>
                  <div className="docs-card-body">
                    <div className="docs-title">{d.title}</div>
                    <div className="docs-tags">
                      {DIMS.flatMap(dim => arr(d[dim.key]).map(v => <span key={dim.key + v} className={`docs-tag ${dim.key}`}>{v}</span>))}
                    </div>
                    {d.note && <div className="docs-note">{d.note}</div>}
                    <div className="docs-meta">{fmtSize(d.size_bytes)}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}{d.uploaded_at ? ` · ${fmtDate(d.uploaded_at)}` : ''}</div>
                  </div>
                </div>
                <div className="docs-card-actions">
                  <button onClick={() => view(d)} title="View">View</button>
                  <button onClick={() => download(d)} title="Download">⬇</button>
                  {isOps && <button className="docs-del" onClick={() => remove(d)} title="Remove">✕</button>}
                </div>
              </div>
            ))}
            {shown.length === 0 && (
              <div className="docs-empty">
                {docs.length === 0 ? 'No documents yet.' : 'No documents match those filters.'}
                {isOps && docs.length === 0 && ' Click “+ Add document” to upload the first one.'}
              </div>
            )}
          </div>
        </>
      )}

      {viewer && (
        <div className="docs-viewer" onClick={() => setViewer(null)}>
          <div className="docs-viewer-card" onClick={e => e.stopPropagation()}>
            <div className="docs-viewer-head">
              <span className="docs-viewer-title">{viewer.title}</span>
              <a className="docs-viewer-dl" href={viewer.url} download={viewer.filename || viewer.title}>⬇ Download</a>
              <button className="docs-viewer-x" onClick={() => setViewer(null)}>✕</button>
            </div>
            <div className="docs-viewer-body">
              {(viewer.mime || '').startsWith('image')
                ? <img src={viewer.url} alt={viewer.title} />
                : <iframe title={viewer.title} src={viewer.url} />}
            </div>
          </div>
        </div>
      )}

      {upOpen && <UploadModal existing={allOptions} busy={busy} setBusy={setBusy} onClose={() => setUpOpen(false)} onDone={() => { setUpOpen(false); load(); }} />}
    </div>
  );
}

function UploadModal({ existing, busy, setBusy, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState({ suppliers: '', motors: '', models: '', categories: '' });
  const [note, setNote] = useState('');

  const pickFile = (f) => { setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); };
  const submit = async () => {
    if (!file || !title.trim()) { alert('Pick a file and give it a title.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      fd.append('note', note.trim());
      DIMS.forEach(d => fd.append(d.key, tags[d.key].trim())); // comma-separated; backend splits
      const r = await apiFetch('/api/docs', { method: 'POST', body: fd });
      if (!r.ok) throw new Error();
      onDone();
    } catch { alert('Upload failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="docs-modal" onClick={onClose}>
      <div className="docs-modal-card" onClick={e => e.stopPropagation()}>
        <div className="docs-modal-head"><span>Add document</span><button onClick={onClose}>✕</button></div>
        <div className="docs-modal-body">
          <label className="docs-up-file">
            <input type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={e => pickFile(e.target.files?.[0] || null)} />
            {file ? <span>{file.name} · {fmtSize(file.size)}</span> : <span className="docs-up-hint">Choose a file (PDF, image, or office doc)</span>}
          </label>
          <label className="docs-up-fld"><span>Title</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. O360 Joystick Tuning" /></label>
          {DIMS.map(d => (
            <label key={d.key} className="docs-up-fld">
              <span>{d.label}{d.key === 'suppliers' ? '' : 's'} <em>(comma-separated)</em></span>
              <input list={`opt-${d.key}`} value={tags[d.key]} onChange={e => setTags(t => ({ ...t, [d.key]: e.target.value }))} placeholder={`e.g. ${d.key === 'suppliers' ? 'Mercury' : d.key === 'motors' ? 'O360 Joystick, Verado 350' : d.key === 'models' ? '30 Sport, 36 Center' : 'Joystick, Rigging'}`} />
              <datalist id={`opt-${d.key}`}>{existing[d.key].map(v => <option key={v} value={v} />)}</datalist>
            </label>
          ))}
          <label className="docs-up-fld"><span>Note <em>(optional)</em></span><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Anything worth remembering about this doc" /></label>
        </div>
        <div className="docs-modal-foot">
          <button className="docs-modal-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="docs-modal-save" onClick={submit} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </div>
    </div>
  );
}

export default DocsLibrary;
