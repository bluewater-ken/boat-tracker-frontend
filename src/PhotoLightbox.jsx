import { useEffect } from 'react';
import './PhotoLightbox.css';

// Shared full-size CompanyCam photo viewer — prev/next, arrow keys, Esc to close.
// Used by the Shop Feed (photos for a completed task) and the Assembly board
// (photos per checklist item / whole work center).
// `photos`: [{ thumb_url, web_url, full_url, captured_at, creator_name, task_title }]
function PhotoLightbox({ photos, index, onIndex, onClose, caption }) {
  const p = photos[index];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length);
      else if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onIndex, onClose]);

  if (!p) return null;
  const when = (() => { try { return new Date(p.captured_at).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } })();

  return (
    <div className="plb" onClick={onClose}>
      <button className="plb-x" onClick={onClose} aria-label="Close">✕</button>
      {photos.length > 1 && (
        <button className="plb-nav prev" onClick={e => { e.stopPropagation(); onIndex((index - 1 + photos.length) % photos.length); }} aria-label="Previous">‹</button>
      )}
      <figure className="plb-figure" onClick={e => e.stopPropagation()}>
        <img src={p.full_url || p.web_url} alt="" />
        <figcaption>
          {caption || p.task_title || ''}
          {(caption || p.task_title) && ' · '}
          {p.creator_name ? `${p.creator_name} · ` : ''}{when}
          {photos.length > 1 ? ` · ${index + 1}/${photos.length}` : ''}
        </figcaption>
      </figure>
      {photos.length > 1 && (
        <button className="plb-nav next" onClick={e => { e.stopPropagation(); onIndex((index + 1) % photos.length); }} aria-label="Next">›</button>
      )}
    </div>
  );
}

export default PhotoLightbox;
