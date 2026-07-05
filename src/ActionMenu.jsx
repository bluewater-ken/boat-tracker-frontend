// Tap-to-open action menu (BRD §7a), styled to match BluewaterDemo.jsx: a small
// popover anchored at the click point. Closes on outside click or Esc.
// Exposes MenuBtn / MenuLabel / MenuToggle / MenuNote building blocks so each
// tracker composes its own controls.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './ActionMenu.css';

const NAVY = '#173A5E';
const SPLASH = '#2E92D6';

function ActionMenu({ anchor, title, subtitle, onClose, children, className = '' }) {
  const ref = useRef(null);
  // Position is set after measuring the popup so it always fits on screen
  // (nudges up/left when near an edge instead of clipping). Hidden until measured.
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(8, Math.min(anchor?.x ?? vw / 2, vw - w - 8));
      const top = Math.max(8, Math.min(anchor?.y ?? vh / 2, vh - h - 8));
      setPos((p) => (p.ready && p.left === left && p.top === top) ? p : { left, top, ready: true });
    };
    place();
    // Reposition if the menu's height changes (e.g. status change reveals date fields).
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [anchor?.x, anchor?.y]);

  return (
    <>
      <div className="am-overlay" onClick={onClose} />
      <div ref={ref} className={`am-pop ${className}`} style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="am-pop-head">
          <span className="am-pop-title" style={{ color: NAVY }}>{title}</span>
          <span className="am-pop-close" onClick={onClose} aria-label="Close">×</span>
        </div>
        {subtitle && <div className="am-pop-sub">{subtitle}</div>}
        {children}
      </div>
    </>
  );
}

export function MenuBtn({ label, primary, disabled, onClick }) {
  return (
    <button className="am-btn" disabled={disabled} onClick={onClick}
      style={{
        fontWeight: primary ? 700 : 400,
        border: primary ? 'none' : '1px solid #D6DBE0',
        background: primary ? SPLASH : '#fff',
        color: primary ? '#fff' : '#33424C',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}>
      {label}
    </button>
  );
}

export function MenuLabel({ children }) {
  return <div className="am-menu-label">{children}</div>;
}

export function MenuToggle({ label, color, active, onClick }) {
  return (
    <button className="am-toggle" onClick={onClick}
      style={{
        border: active ? `1.5px solid ${color}` : '1px solid #E2E6EA',
        background: active ? color + '14' : '#fff',
        fontWeight: active ? 700 : 400,
      }}>
      <span className="am-toggle-dot" style={{ background: color, opacity: active ? 1 : 0.35 }} />
      {label}{active ? ' ✓' : ''}
    </button>
  );
}

export function MenuNote({ children }) {
  return <div className="am-menu-note">{children}</div>;
}

export default ActionMenu;
