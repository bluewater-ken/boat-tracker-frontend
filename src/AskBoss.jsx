import { useState, useEffect, useRef } from 'react';
import { apiFetch } from './api';
import { renderAnswer, answerToHtml, escapeHtml } from './markdown';
import './AskBoss.css';

// Ask B.O.S.S — natural-language questions over the tracker's data.
// Frontend just sends the question; the backend gathers the production data,
// asks Claude (model set server-side in .env ASK_MODEL), and returns the answer.
// Read-only by design: it can summarize and answer, never change anything.

// Default chips shown in the empty state. `q` is sent as-is; a `fill` chip instead drops
// a starter into the input and focuses it, so Ken can name the boat before sending.
const EXAMPLES = [
  { label: 'Give me a full shop status', q: 'Give me a full shop status — where every active boat stands.' },
  { label: 'Status of a specific boat…', q: 'What is the status of ', fill: true },
  { label: 'What parts do we need ASAP?', q: 'Which parts do we need most urgently right now, and on which boats?' },
  { label: 'What are the open issues right now?', q: 'What are the open issues right now, across all boats?' },
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


// Open one Q&A in its own browser tab — a clean standalone page that survives
// closing the panel (and prints nicely). Built from escaped HTML; must be called
// from a click handler so the browser allows the new tab.
function popOut(it) {
  const w = window.open('', '_blank');
  if (!w) return; // popup blocked
  const when = new Date().toLocaleString([], { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>B.O.S.S — ${escapeHtml(it.q).slice(0, 80)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1c1c; background: #fff; margin: 0; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 28px 24px 48px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #173A5E; padding-bottom: 8px; margin-bottom: 18px; }
  .brand { font-size: 15px; font-weight: 700; color: #173A5E; }
  .when { font-size: 12px; color: #8A969E; }
  .q { display: inline-block; background: #2E92D6; color: #fff; font-size: 14px; line-height: 1.5; padding: 9px 14px; border-radius: 12px 12px 3px 12px; margin-bottom: 14px; }
  .a { font-size: 14px; line-height: 1.65; }
  .a p { margin: 0 0 8px; } .a ul, .a ol { margin: 0 0 10px; padding-left: 22px; } .a li { margin: 2px 0; }
  .a h3 { font-size: 14px; margin: 12px 0 6px; color: #173A5E; }
  .a code { background: #f0f2f4; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  .foot { margin-top: 28px; padding-top: 10px; border-top: 1px solid #E6E9EC; font-size: 11px; color: #8A969E; }
  @media print { .wrap { padding: 0; } }
</style></head><body><div class="wrap">
  <div class="head"><span class="brand">Ask the B.O.S.S</span><span class="when">${escapeHtml(when)}</span></div>
  <div class="q">${escapeHtml(it.q)}</div>
  <div class="a">${answerToHtml(it.a)}</div>
  <div class="foot">Bluewater B.O.S.S · answer from live tracker data at the time asked</div>
</div></body></html>`);
  w.document.close();
}

function AskBoss({ onClose }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]); // { q, a, error }
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const recRef = useRef(null);

  // A chip either sends immediately, or (fill) primes the input so Ken names the boat first.
  const onExample = (ex) => {
    if (ex.fill) { setQ(ex.q); inputRef.current?.focus(); }
    else ask(ex.q);
  };

  // Voice input via the browser's built-in speech recognition (Brave/Chrome/Safari).
  // The button hides itself where unsupported; dictation fills the text box, then Ask sends it.
  const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const toggleMic = () => {
    if (!SpeechRec) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setQ(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
    inputRef.current?.focus();
  };
  useEffect(() => () => recRef.current?.stop(), []); // stop mic if the panel closes

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
                  <button key={ex.label} className="ask-example" onClick={() => onExample(ex)}>{ex.label}</button>
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
              {it.a !== null && !it.error && (
                <div className="ask-poprow">
                  <button className="ask-pop" onClick={() => popOut(it)} title="Open this answer in a new browser tab so it isn't lost">↗ Keep in new tab</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="ask-inputrow">
          {SpeechRec && (
            <button className={`ask-mic ${listening ? 'on' : ''}`} onClick={toggleMic}
              title={listening ? 'Stop listening' : 'Speak your question'} aria-label="Speak your question">🎤</button>
          )}
          <input ref={inputRef} className="ask-input" placeholder={listening ? 'Listening…' : 'Type a question...'} value={q} autoFocus
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
