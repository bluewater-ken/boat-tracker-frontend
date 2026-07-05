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

// Broader set shown in the ⓘ hover, so guidance is always available (not just the empty state).
const TIP_EXAMPLES = [
  'Where do I stand on the Oksas boat?',
  'Which parts are overdue, and on which boats?',
  'What got done today? This week?',
  'What are the open issues on 28224?',
  'Which boats are in Glass Shop right now?',
  'Which Suzuki-powered boats are behind on lamination?',
  'What is 25T047 waiting on before it can move to QC?',
];

// Minimal, safe markdown → React nodes for the answer (bold, italic, code, bullet/
// numbered lists, headers, blank lines). Returns JSX so React escapes all text — no XSS,
// no dependency. Emojis pass straight through as ordinary text.
function inline(text, base) {
  const nodes = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={`${base}-${i}`}>{m[2]}</strong>);
    else if (m[3] != null || m[4] != null) nodes.push(<em key={`${base}-${i}`}>{m[3] ?? m[4]}</em>);
    else if (m[5] != null) nodes.push(<code key={`${base}-${i}`}>{m[5]}</code>);
    last = re.lastIndex; i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
function renderAnswer(text) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let list = null;
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  lines.forEach((raw) => {
    const line = raw.replace(/\s+$/, '');
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const num = line.match(/^\s*\d+\.\s+(.*)/);
    const head = line.match(/^#{1,6}\s+(.*)/);
    if (bullet) { if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [] }; } list.items.push(bullet[1]); }
    else if (num) { if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', items: [] }; } list.items.push(num[1]); }
    else { flush(); if (head) blocks.push({ type: 'h', text: head[1] }); else if (line === '') blocks.push({ type: 'sp' }); else blocks.push({ type: 'p', text: line }); }
  });
  flush();
  return blocks.map((b, i) => {
    if (b.type === 'ul') return <ul key={i} className="ask-md-list">{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ul>;
    if (b.type === 'ol') return <ol key={i} className="ask-md-list">{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ol>;
    if (b.type === 'h') return <div key={i} className="ask-md-h">{inline(b.text, i)}</div>;
    if (b.type === 'sp') return <div key={i} className="ask-md-sp" />;
    return <p key={i} className="ask-md-p">{inline(b.text, i)}</p>;
  });
}

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
          <span className="ask-title">Ask the <i>B.O.S.S</i></span>
          <span className="ask-info" tabIndex={0} aria-label="Examples of what to ask">
            ⓘ
            <span className="ask-tip">
              <b>Ask in plain English</b> about your active boats — status, parts, timing, issues. For example:
              <ul>{TIP_EXAMPLES.map((ex, i) => <li key={i}>{ex}</li>)}</ul>
              <span className="ask-tip-note">Answers come from live tracker data only — it reads everything, changes nothing.</span>
            </span>
          </span>
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
                : <div className={`ask-a ${it.error ? 'ask-err' : ''}`}>{renderAnswer(it.a)}</div>}
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
