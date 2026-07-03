import { useState, useEffect, useRef } from 'react';
import { apiFetch } from './api';
import './AskBoss.css';

// Ask B.O.S.S — natural-language questions over the tracker's data.
// Frontend just sends the question; the backend gathers the production data,
// asks Claude (model set server-side in .env ASK_MODEL), and returns the answer.
// Read-only by design: it can summarize and answer, never change anything.

const EXAMPLES = [
  'Where do I stand on the Oksas boat?',
  'Which parts are overdue right now?',
  'What got done today?',
  'What are the open issues on 28224?',
];

function AskBoss({ onClose }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]); // { q, a, error }
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [items]);

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setBusy(true);
    setQ('');
    setItems(prev => [...prev, { q: question, a: null }]);
    try {
      const r = await apiFetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!r.ok) throw new Error(r.status === 404 ? 'notsetup' : 'fail');
      const data = await r.json();
      setItems(prev => prev.map((it, i) => i === prev.length - 1 ? { ...it, a: data.answer || '(no answer)' } : it));
    } catch (e) {
      const msg = e.message === 'notsetup'
        ? "The Ask backend isn't set up yet — it arrives with the next server update."
        : 'Something went wrong — try again in a moment.';
      setItems(prev => prev.map((it, i) => i === prev.length - 1 ? { ...it, a: msg, error: true } : it));
    } finally { setBusy(false); }
  };

  return (
    <div className="ask-backdrop" onClick={onClose}>
      <div className="ask-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ask-head">
          <span className="ask-title">Ask <i>B.O.S.S</i></span>
          <button className="ask-close" onClick={onClose}>✕</button>
        </div>
        <div className="ask-body" ref={bodyRef}>
          {items.length === 0 && (
            <div className="ask-empty">
              <p>Ask anything about your boats, parts, or shop — answered from live tracker data.</p>
              <div className="ask-examples">
                {EXAMPLES.map(ex => (
                  <button key={ex} className="ask-example" onClick={() => ask(ex)}>{ex}</button>
                ))}
              </div>
            </div>
          )}
          {items.map((it, i) => (
            <div key={i} className="ask-item">
              <div className="ask-q">{it.q}</div>
              {it.a === null
                ? <div className="ask-a ask-thinking">Looking through the tracker…</div>
                : <div className={`ask-a ${it.error ? 'ask-err' : ''}`}>{it.a}</div>}
            </div>
          ))}
        </div>
        <div className="ask-inputrow">
          <input className="ask-input" placeholder="Type a question..." value={q} autoFocus
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ask(); }} />
          <button className="ask-send" disabled={busy || !q.trim()} onClick={() => ask()}>Ask</button>
        </div>
        <div className="ask-foot">Answers come from tracker data only — it can read everything, change nothing.</div>
      </div>
    </div>
  );
}

export default AskBoss;
