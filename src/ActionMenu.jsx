// Tap-to-open action menu (BRD §7a). A centered modal card with a backdrop —
// works on desktop and touch, closes on backdrop click or Esc. Generic
// container; each tracker passes its own labeled controls as children.
import { useEffect } from 'react';
import './ActionMenu.css';

function ActionMenu({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="action-menu-backdrop" onClick={onClose}>
      <div className="action-menu" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="action-menu-header">
          <div>
            <div className="action-menu-title">{title}</div>
            {subtitle && <div className="action-menu-subtitle">{subtitle}</div>}
          </div>
          <button className="action-menu-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="action-menu-body">{children}</div>
      </div>
    </div>
  );
}

export default ActionMenu;
