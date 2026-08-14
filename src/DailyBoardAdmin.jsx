// Daily Board manager (ops+): post notices to the shop-floor wall — a line of
// text with an optional photo — and manage the AI daily production briefing.
// The wall (KioskView "Today at Bluewater") reads /api/announcements and
// /api/daily-briefing; this is where those get created and refreshed.
import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import './DailyBoardAdmin.css';

const EXPIRY = [
  { k: 'keep', label: 'Until I remove it' },
  { k: 'today', label: 'End of today' },
  { k: '3d', label: 'For 3 days' },
  { k: '7d', label: 'For 7 days' },
];
function expiryToIso(k) {
  if (k === 'keep') return null;
  const d = new Date();
  if (k === 'today') { d.setHours(23, 59, 59, 0); return d.toISOString(); }
  d.setDate(d.getDate() + (k === '3d' ? 3 : 7));
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

// Downscale a chosen photo to a modest JPEG data URL so it fits in the DB and
// loads fast on the wall — no separate upload/serving pipeline needed.
function fileToDataUrl(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s); height = Math.round(height * s);
        }
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtWhen(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function DailyBoardAdmin() {
  const [notes, setNotes] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);   // data URL
  const [expiry, setExpiry] = useState('keep');
  const [posting, setPosting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  const loadNotes = async () => {
    try { const r = await apiFetch('/api/announcements'); if (r.ok) setNotes(await r.json()); } catch { /* keep */ }
  };
  const loadBriefing = async () => {
    try { const r = await apiFetch('/api/daily-briefing'); if (r.ok) setBriefing(await r.json()); } catch { /* keep */ }
  };
  useEffect(() => { loadNotes(); loadBriefing(); }, []);

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try { setImage(await fileToDataUrl(file)); }
    catch { setErr('Could not read that image.'); }
  };

  const post = async () => {
    if (!body.trim() && !image) return;
    setPosting(true); setErr('');
    try {
      const r = await apiFetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), image_url: image || null, expires_at: expiryToIso(expiry) }),
      });
      if (!r.ok) throw new Error();
      setBody(''); setImage(null); setExpiry('keep');
      await loadNotes();
    } catch { setErr('Could not post that notice.'); }
    finally { setPosting(false); }
  };

  const remove = async (id) => {
    try {
      const r = await apiFetch(`/api/announcements/${id}`, { method: 'DELETE' });
      if (r.ok) setNotes(n => n.filter(x => x.id !== id));
    } catch { /* ignore */ }
  };

  const refreshBriefing = async () => {
    setRefreshing(true); setErr('');
    try {
      const r = await apiFetch('/api/daily-briefing/refresh', { method: 'POST' });
      if (r.ok) setBriefing(await r.json());
      else throw new Error();
    } catch { setErr('Could not refresh the briefing.'); }
    finally { setRefreshing(false); }
  };

  return (
    <div className="dba">
      <div className="dba-head">
        <h2>Daily Board</h2>
        <p>Post notices to the shop-floor wall and manage the AI daily briefing. The wall shows these on the “Today at Bluewater” screen.</p>
      </div>

      {err && <div className="dba-err">{err}</div>}

      <div className="dba-grid">
        <section className="dba-card">
          <h3>Post a notice</h3>
          <textarea
            className="dba-text"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Team lunch today at noon · Customer visit 2:00 PM · Safety meeting Friday 7:30 AM…"
            rows={3}
          />
          <div className="dba-controls">
            <label className="dba-photo">
              <input type="file" accept="image/*" onChange={pickImage} hidden />
              📷 {image ? 'Change photo' : 'Add photo'}
            </label>
            {image && (
              <span className="dba-thumb">
                <img src={image} alt="" />
                <button className="dba-thumb-x" onClick={() => setImage(null)} aria-label="Remove photo">✕</button>
              </span>
            )}
            <label className="dba-expiry">
              Show
              <select value={expiry} onChange={e => setExpiry(e.target.value)}>
                {EXPIRY.map(x => <option key={x.k} value={x.k}>{x.label}</option>)}
              </select>
            </label>
            <button className="dba-post" onClick={post} disabled={posting || (!body.trim() && !image)}>
              {posting ? 'Posting…' : 'Post to wall'}
            </button>
          </div>

          <h3 className="dba-sub">On the wall now ({notes.length})</h3>
          {notes.length === 0 ? (
            <div className="dba-empty">No notices posted. Anything you post shows up on the shop TV.</div>
          ) : (
            <ul className="dba-list">
              {notes.map(a => (
                <li key={a.id} className="dba-item">
                  {a.image_url && <img className="dba-item-img" src={a.image_url} alt="" />}
                  <div className="dba-item-body">
                    <div className="dba-item-text">{a.body}</div>
                    <div className="dba-item-meta">
                      {a.author_name || 'Shop'} · {fmtWhen(a.created_at)}
                      {a.expires_at && <span className="dba-until"> · until {fmtWhen(a.expires_at)}</span>}
                    </div>
                  </div>
                  <button className="dba-del" onClick={() => remove(a.id)} aria-label="Remove notice">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dba-card">
          <div className="dba-brief-head">
            <h3>AI daily briefing</h3>
            <button className="dba-refresh" onClick={refreshBriefing} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : '↻ Refresh now'}
            </button>
          </div>
          <p className="dba-brief-note">
            Generated automatically each morning. It writes a short status line for every boat in production, and shows on the wall next to your notices.
          </p>
          {briefing?.generated_at && <div className="dba-brief-when">Last generated {fmtWhen(briefing.generated_at)}</div>}
          <div className="dba-brief-body">
            {briefing?.text
              ? briefing.text.split('\n').map((l, i) => l.trim() && <p key={i}>{l}</p>)
              : <div className="dba-empty">No briefing yet — it generates each morning, or hit “Refresh now”.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
