import { useState, useRef, useEffect } from 'react';
import './SmartInput.css';

// A text box with a remembered-suggestions dropdown where each suggestion has an ✕
// to remove it. Removing only hides the suggestion (stored per-browser in localStorage,
// grouped by storeKey) — it NEVER changes a value already saved on a boat.
// Drop-in for the old <input list=...> + <datalist> combos. onChange gives a STRING.

const HIDE_PREFIX = 'bw_hidden_';
const readHidden = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(HIDE_PREFIX + key) || '[]')); }
  catch { return new Set(); }
};
const writeHidden = (key, set) => localStorage.setItem(HIDE_PREFIX + key, JSON.stringify([...set]));

function SmartInput({ value, onChange, options = [], storeKey, placeholder, className, onEnter, onBlur, name }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => readHidden(storeKey));
  const wrapRef = useRef(null);

  useEffect(() => { setHidden(readHidden(storeKey)); }, [storeKey]);
  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const val = value || '';
  const shown = options.filter(o =>
    o && !hidden.has(o) && o !== val &&
    (!val || o.toLowerCase().includes(val.toLowerCase()))
  );

  const hide = (opt, e) => {
    e.stopPropagation();
    const next = new Set(hidden); next.add(opt); writeHidden(storeKey, next); setHidden(next);
  };
  const pick = (opt) => { onChange(opt); setOpen(false); };

  return (
    <div className="smartinput" ref={wrapRef}>
      <input
        className={className} name={name} value={val} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (onBlur) setTimeout(onBlur, 120); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { setOpen(false); if (onEnter) onEnter(); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && shown.length > 0 && (
        <div className="smartinput-menu">
          {shown.map((opt) => (
            <div key={opt} className="smartinput-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(opt)}>
              <span className="smartinput-label">{opt}</span>
              <button type="button" className="smartinput-x" title="Remove from suggestions" onClick={(e) => hide(opt, e)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SmartInput;
